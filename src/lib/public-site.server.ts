/**
 * Stage 3 — the anonymous public server boundary.
 *
 * This module never reaches the browser. It owns every private value the
 * public website depends on: the service-role Supabase client, the Turnstile
 * secret, and the three HMAC salts used to derive fingerprints, IP hashes and
 * newsletter tokens. Raw IP addresses are hashed and discarded; nothing here
 * returns a secret, a stack trace or a database error to a caller.
 *
 * Everything fails closed. A missing salt or a missing Turnstile secret makes
 * the dependent journey unavailable rather than silently unprotected.
 */
import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  PUBLIC_ERROR,
  RATE_LIMITS,
  UPLOAD_LIMITS,
  type RateLimitPurpose,
} from "./public-site.constants";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class PublicBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "PublicBoundaryError";
  }
}

export function jsonError(error: PublicBoundaryError): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (error.retryAfterSeconds != null) headers["retry-after"] = String(error.retryAfterSeconds);
  return new Response(
    JSON.stringify({
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.retryAfterSeconds != null ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    }),
    { status: error.status, headers },
  );
}

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...(body as object) }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/* ------------------------------------------------------------------ *
 * Configuration (server-only, fail closed)
 * ------------------------------------------------------------------ */

export interface PublicSiteConfigStatus {
  turnstile: boolean;
  ipSalt: boolean;
  fingerprintSalt: boolean;
  newsletterSalt: boolean;
  emailProvider: boolean;
  malwareScanner: boolean;
  trustedProxyHeader: boolean;
}

type PublicEmailEnvironment = Record<string, string | undefined>;

/** Newsletter delivery is usable only when every value needed to send a link exists. */
export function isEmailProviderConfigured(env: PublicEmailEnvironment = process.env): boolean {
  return Boolean(env["RESEND_API_KEY"] && env["RESEND_FROM_EMAIL"] && env["VITE_APP_URL"]);
}

/** The upload capability is advertised only for the scanner contract we implement. */
export function isMalwareScannerConfigured(env: PublicEmailEnvironment = process.env): boolean {
  if (env["MALWARE_SCANNER_PROVIDER"] !== "http-json-v1") return false;
  if (!env["MALWARE_SCANNER_API_KEY"]) return false;
  try {
    const url = new URL(env["MALWARE_SCANNER_URL"] ?? "");
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function publicSiteConfigStatus(): PublicSiteConfigStatus {
  return {
    turnstile: Boolean(process.env["TURNSTILE_SECRET_KEY"]),
    ipSalt: Boolean(process.env["PUBLIC_IP_HASH_SALT"]),
    fingerprintSalt: Boolean(process.env["PUBLIC_FINGERPRINT_SALT"]),
    newsletterSalt: Boolean(process.env["NEWSLETTER_TOKEN_SALT"]),
    emailProvider: isEmailProviderConfigured(),
    malwareScanner: isMalwareScannerConfigured(),
    trustedProxyHeader: Boolean(process.env["TRUSTED_CLIENT_IP_HEADER"]),
  };
}

export function missingPublicSiteConfig(keys: Array<keyof PublicSiteConfigStatus>): string[] {
  const status = publicSiteConfigStatus();
  return keys.filter((k) => !status[k]);
}

/** Public, non-secret feature availability derived from the server configuration. */
export function publicSiteCapabilityFlags(status: PublicSiteConfigStatus) {
  const formsEnabled = status.turnstile && status.ipSalt && status.fingerprintSalt;
  return {
    formsEnabled,
    newsletterEnabled: formsEnabled && status.newsletterSalt && status.emailProvider,
    uploadsEnabled: status.malwareScanner,
  };
}

/* ------------------------------------------------------------------ *
 * Published-content resilience
 * ------------------------------------------------------------------ */

const PUBLISHED_FRESH_MS = 60 * 1000;
const PUBLISHED_STALE_MS = 24 * 60 * 60 * 1000;
interface PublishedCacheEntry {
  value: unknown;
  loadedAt: number;
  refresh?: Promise<void>;
}
const publishedContentCache = new Map<string, PublishedCacheEntry>();

/**
 * Small server-side stale-while-revalidate cache. Published rows remain
 * governed by anon RLS at load time; this retains only a last-known-good
 * response and never substitutes draft content.
 */
export async function readPublishedContent<T>(
  key: string,
  loader: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const cached = publishedContentCache.get(key);
  if (!cached) {
    const value = await loader();
    publishedContentCache.set(key, { value, loadedAt: now });
    return value;
  }

  const age = Math.max(0, now - cached.loadedAt);
  if (age <= PUBLISHED_FRESH_MS) return cached.value as T;

  if (age <= PUBLISHED_STALE_MS) {
    if (!cached.refresh) {
      cached.refresh = loader()
        .then((value) => {
          publishedContentCache.set(key, { value, loadedAt: now });
        })
        .catch(() => {
          // Keep the last-known-good value for the bounded stale window.
        })
        .finally(() => {
          const current = publishedContentCache.get(key);
          if (current === cached) delete cached.refresh;
        });
    }
    return cached.value as T;
  }

  const value = await loader();
  publishedContentCache.set(key, { value, loadedAt: now });
  return value;
}

function requireConfiguredValue(name: string, env: PublicEmailEnvironment = process.env): string {
  const value = env[name];
  if (!value) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.notConfigured,
      "This form is temporarily unavailable. Please try again later.",
      503,
    );
  }
  return value;
}

function requireSecret(name: string): string {
  return requireConfiguredValue(name);
}

/* ------------------------------------------------------------------ *
 * Clients
 * ------------------------------------------------------------------ */

let adminClient: SupabaseClient<Database> | undefined;

/** Service role. Never returned to a caller, never used to decide authority. */
export function serviceClient(): SupabaseClient<Database> {
  if (!adminClient) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key) {
      throw new PublicBoundaryError(
        PUBLIC_ERROR.unavailable,
        "The service is temporarily unavailable.",
        503,
      );
    }
    adminClient = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

let publicClient: SupabaseClient<Database> | undefined;

/** Publishable key, no session: reads published content as `anon` under RLS. */
export function publishableClient(): SupabaseClient<Database> {
  if (!publicClient) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) {
      throw new PublicBoundaryError(
        PUBLIC_ERROR.unavailable,
        "The service is temporarily unavailable.",
        503,
      );
    }
    publicClient = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
  }
  return publicClient;
}

/* ------------------------------------------------------------------ *
 * Request identity — derived, never trusted from the browser
 * ------------------------------------------------------------------ */

function hmacHex(salt: string, value: string): string {
  return createHmac("sha256", salt).update(value).digest("hex");
}

/**
 * Reads the client IP only from the single header the hosting proxy is
 * configured to set. An arbitrary X-Forwarded-For is ignored, so a caller
 * cannot mint unlimited rate-limit buckets by spoofing headers.
 */
function clientIp(request: Request): string | null {
  const header = process.env["TRUSTED_CLIENT_IP_HEADER"];
  if (!header) return null;
  const raw = request.headers.get(header);
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : null;
}

export interface RequestIdentity {
  ipHash: string;
  fingerprint: string;
  userAgentFamily: string | null;
}

/**
 * Derives the stored identifiers. No raw IP is ever persisted or logged; only
 * a salted HMAC is kept, and the salt lives solely on the server.
 */
export function deriveRequestIdentity(request: Request, scope: string): RequestIdentity {
  const ipSalt = requireSecret("PUBLIC_IP_HASH_SALT");
  const fpSalt = requireSecret("PUBLIC_FINGERPRINT_SALT");

  const ip = clientIp(request);
  if (!ip) {
    // Fail closed: without a trusted network identifier we cannot rate-limit.
    throw new PublicBoundaryError(
      PUBLIC_ERROR.notConfigured,
      "This form is temporarily unavailable. Please try again later.",
      503,
    );
  }

  const ua = request.headers.get("user-agent") ?? "";
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const family = uaFamily(ua);

  return {
    ipHash: hmacHex(ipSalt, ip),
    fingerprint: hmacHex(fpSalt, `${scope}|${ip}|${family}|${acceptLanguage.slice(0, 40)}`),
    userAgentFamily: family,
  };
}

function uaFamily(ua: string): string | null {
  if (!ua) return null;
  const known = ["Edg", "OPR", "Chrome", "Firefox", "Safari"];
  for (const name of known) if (ua.includes(name)) return name;
  return "other";
}

export function rateLimitBucket(scope: string, value: string): string {
  const salt = requireSecret("PUBLIC_FINGERPRINT_SALT");
  return hmacHex(salt, `bucket|${scope}|${value}`);
}

/* ------------------------------------------------------------------ *
 * Origin / CSRF
 * ------------------------------------------------------------------ */

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) throw new PublicBoundaryError(PUBLIC_ERROR.validation, "Request rejected.", 403);

  const candidate = origin ?? referer;
  if (!candidate) {
    // No origin signal at all: fail closed rather than assume same-origin.
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "Request rejected.", 403);
  }
  let candidateHost: string;
  try {
    candidateHost = new URL(candidate).host;
  } catch {
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "Request rejected.", 403);
  }
  if (candidateHost !== host) {
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "Request rejected.", 403);
  }
}

/* ------------------------------------------------------------------ *
 * Rate limiting — durable, atomic, shared
 * ------------------------------------------------------------------ */

export async function enforceRateLimit(
  purpose: RateLimitPurpose,
  bucketValue: string,
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[purpose];
  const bucketKey = rateLimitBucket(purpose, bucketValue);

  const { data, error } = await serviceClient().rpc("consume_rate_limit", {
    p_purpose: purpose,
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // A throttle failure must never become an unlimited surface.
    throw new PublicBoundaryError(
      PUBLIC_ERROR.rateLimited,
      "Too many requests. Please try again shortly.",
      429,
      windowSeconds,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const allowed = (row as { allowed?: boolean } | null)?.allowed;
  const retry = (row as { retry_after_seconds?: number } | null)?.retry_after_seconds;
  if (allowed !== true) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.rateLimited,
      "Too many requests. Please wait before trying again.",
      429,
      Math.min(Math.max(retry ?? windowSeconds, 1), windowSeconds),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Bot mitigation
 * ------------------------------------------------------------------ */

/** Server-side Turnstile verification. Absent configuration fails closed. */
export async function verifyTurnstile(token: string, request: Request): Promise<void> {
  const secret = requireSecret("TURNSTILE_SECRET_KEY");
  const body = new URLSearchParams({ secret, response: token });
  const ip = clientIp(request);
  if (ip) body.set("remoteip", ip);

  let payload: { success?: boolean };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    payload = (await response.json()) as { success?: boolean };
  } catch {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.botCheck,
      "We could not verify that you are human. Please try again.",
      503,
    );
  }
  if (payload.success !== true) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.botCheck,
      "We could not verify that you are human. Please try again.",
      400,
    );
  }
}

export function assertHumanTiming(renderedAt: number, minMs: number): void {
  const elapsed = Date.now() - renderedAt;
  if (!Number.isFinite(elapsed) || elapsed < minMs) {
    // Generic message: never reveal which control rejected the submission.
    throw new PublicBoundaryError(
      PUBLIC_ERROR.validation,
      "We could not accept this submission. Please try again.",
      400,
    );
  }
}

export function assertHoneypotEmpty(value: string | undefined): void {
  if (value && value.length > 0) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.validation,
      "We could not accept this submission. Please try again.",
      400,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Newsletter tokens
 * ------------------------------------------------------------------ */

export function newTokenPair(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashNewsletterToken(token) };
}

export function hashNewsletterToken(token: string): string {
  const salt = requireSecret("NEWSLETTER_TOKEN_SALT");
  return createHmac("sha256", salt).update(token).digest("hex");
}

interface NewsletterConfirmationEmail {
  email: string;
  token: string;
}

/**
 * Delivers the only copy of the raw double-opt-in token. The database stores
 * its HMAC, never this value. Provider responses are deliberately discarded
 * so identifiers and provider diagnostics cannot leak through the API.
 */
export async function sendNewsletterConfirmationEmail(
  input: NewsletterConfirmationEmail,
  dependencies: {
    env?: PublicEmailEnvironment;
    fetcher?: typeof fetch;
  } = {},
): Promise<void> {
  const env = dependencies.env ?? process.env;
  const fetcher = dependencies.fetcher ?? fetch;
  const apiKey = requireConfiguredValue("RESEND_API_KEY", env);
  const from = requireConfiguredValue("RESEND_FROM_EMAIL", env);
  const appUrl = requireConfiguredValue("VITE_APP_URL", env);

  let confirmationUrl: URL;
  try {
    confirmationUrl = new URL("/newsletter/confirm", appUrl);
    if (!["http:", "https:"].includes(confirmationUrl.protocol))
      throw new Error("invalid protocol");
  } catch {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.notConfigured,
      "Newsletter sign-up is temporarily unavailable.",
      503,
    );
  }
  confirmationUrl.searchParams.set("token", input.token);
  const link = confirmationUrl.toString();
  const escapedLink = link
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: "Confirm your LearnFlow newsletter subscription",
        text: `Confirm your LearnFlow newsletter subscription: ${link}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Confirm your LearnFlow newsletter subscription:</p><p><a href="${escapedLink}">Confirm subscription</a></p><p>If you did not request this, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.unavailable,
      "Newsletter sign-up is temporarily unavailable.",
      503,
    );
  }

  if (!response.ok) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.unavailable,
      "Newsletter sign-up is temporarily unavailable.",
      503,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Body handling
 * ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 64 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "That request was too large.", 413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "That request was too large.", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PublicBoundaryError(PUBLIC_ERROR.validation, "That request was not valid.", 400);
  }
}

/** Turns a Zod failure into field messages without leaking internals. */
export function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

export function generateUploadPath(applicationRef: string, extension: string): string {
  return `applications/${applicationRef}/${randomBytes(16).toString("hex")}.${extension}`;
}

const UPLOAD_CLAIM_TTL_MS = 15 * 60 * 1000;
const UPLOAD_PATH = /^applications\/[0-9a-f-]{36}\/[a-z0-9]{32}\.(pdf|docx)$/;

export interface UploadClaimPayload {
  path: string;
  contentType: (typeof UPLOAD_LIMITS.allowed)[number]["mime"];
  sizeBytes: number;
  requesterFingerprint: string;
  expiresAt: number;
}

type NewUploadClaim = Omit<UploadClaimPayload, "expiresAt">;

/** Signs the exact destination, declaration and requester into an opaque claim. */
export function createUploadClaim(
  input: NewUploadClaim,
  secret = requireSecret("PUBLIC_FINGERPRINT_SALT"),
  now = Date.now(),
): string {
  const payload: UploadClaimPayload = { ...input, expiresAt: now + UPLOAD_CLAIM_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`learnflow-upload-v1.${encoded}`)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

/** Returns null for malformed, expired, tampered or differently-owned claims. */
export function parseUploadClaim(
  claim: string,
  requesterFingerprint: string,
  secret = requireSecret("PUBLIC_FINGERPRINT_SALT"),
  now = Date.now(),
): UploadClaimPayload | null {
  try {
    const [encoded, supplied, extra] = claim.split(".");
    if (!encoded || !supplied || extra) return null;
    const expected = createHmac("sha256", secret).update(`learnflow-upload-v1.${encoded}`).digest();
    const actual = Buffer.from(supplied, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<UploadClaimPayload>;
    const allowed = UPLOAD_LIMITS.allowed.some((item) => item.mime === value.contentType);
    if (
      typeof value.path !== "string" ||
      !UPLOAD_PATH.test(value.path) ||
      !allowed ||
      !Number.isInteger(value.sizeBytes) ||
      (value.sizeBytes ?? 0) < 1 ||
      (value.sizeBytes ?? 0) > UPLOAD_LIMITS.maxFileBytes ||
      value.requesterFingerprint !== requesterFingerprint ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt < now ||
      value.expiresAt > now + UPLOAD_CLAIM_TTL_MS
    ) {
      return null;
    }
    return value as UploadClaimPayload;
  } catch {
    return null;
  }
}

/** Structural check: the declared type must match the leading bytes. */
export function magicBytesMatch(head: Uint8Array, expected: string): boolean {
  const bytes = new TextEncoder().encode(expected);
  if (head.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) if (head[i] !== bytes[i]) return false;
  return true;
}

export function checksum(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Scanner adapter contract: POST raw bytes and receive JSON `{ "clean": true }`.
 * Timeouts, transport failures, malformed responses and non-clean verdicts all
 * fail closed. The API credential is never sent to the browser.
 */
export async function assertMalwareScanClean(
  data: Uint8Array,
  contentType: string,
  env: PublicEmailEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isMalwareScannerConfigured(env)) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.notConfigured,
      "Document uploads are temporarily unavailable.",
      503,
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(env["MALWARE_SCANNER_URL"]!, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env["MALWARE_SCANNER_API_KEY"]}`,
        "content-type": contentType,
        "x-content-sha256": checksum(data),
      },
      body: Buffer.from(data),
      signal: controller.signal,
    });
    const verdict = response.ok ? ((await response.json()) as { clean?: unknown }) : null;
    if (verdict?.clean !== true) throw new Error("unclean");
  } catch {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.validation,
      "That document could not be accepted.",
      400,
    );
  } finally {
    clearTimeout(timeout);
  }
}
