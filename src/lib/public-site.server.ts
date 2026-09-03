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
import { createHmac, randomBytes, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PUBLIC_ERROR, RATE_LIMITS, type RateLimitPurpose } from "./public-site.constants";

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

export function publicSiteConfigStatus(): PublicSiteConfigStatus {
  return {
    turnstile: Boolean(process.env["TURNSTILE_SECRET_KEY"]),
    ipSalt: Boolean(process.env["PUBLIC_IP_HASH_SALT"]),
    fingerprintSalt: Boolean(process.env["PUBLIC_FINGERPRINT_SALT"]),
    newsletterSalt: Boolean(process.env["NEWSLETTER_TOKEN_SALT"]),
    emailProvider: Boolean(process.env["RESEND_API_KEY"]),
    malwareScanner: Boolean(process.env["MALWARE_SCANNER_PROVIDER"]),
    trustedProxyHeader: Boolean(process.env["TRUSTED_CLIENT_IP_HEADER"]),
  };
}

export function missingPublicSiteConfig(keys: Array<keyof PublicSiteConfigStatus>): string[] {
  const status = publicSiteConfigStatus();
  return keys.filter((k) => !status[k]);
}

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new PublicBoundaryError(
      PUBLIC_ERROR.notConfigured,
      "This form is temporarily unavailable. Please try again later.",
      503,
    );
  }
  return value;
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
 * Reads the client IP from the header the hosting proxy is configured to set.
 * When TRUSTED_CLIENT_IP_HEADER is not set, fall back to the edge-injected
 * headers the platform itself controls, in order of trustworthiness. An
 * arbitrary X-Forwarded-For entry beyond the first hop is still ignored.
 */
function clientIp(request: Request): string | null {
  const configured = process.env["TRUSTED_CLIENT_IP_HEADER"];
  const candidates = configured
    ? [configured]
    : ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"];
  for (const header of candidates) {
    const raw = request.headers.get(header);
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return null;
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
