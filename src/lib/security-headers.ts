/**
 * Block 7/8 — response security headers for the TanStack Start / Nitro
 * (Cloudflare Worker) pipeline.
 *
 *  - Framing: production hosts get `frame-ancestors 'none'` plus the legacy
 *    `X-Frame-Options: DENY`. Verified preview hosts (see `isPreviewHost`)
 *    keep the Lovable editor iframe working and never receive X-Frame-Options.
 *    Production protection is never weakened to accommodate preview.
 *  - CSP: this module emits the *fallback* policy (no nonce). Document
 *    responses get a stronger nonce-bearing policy set during SSR by
 *    `src/lib/csp-request.server.ts`; the merge below never overwrites it.
 *  - HSTS is emitted only for https requests, so local http development and
 *    the sandbox preview are unaffected.
 */
import { buildContentSecurityPolicy, isPreviewHost, supabaseConnectOrigins } from "./csp";

export const NO_STORE = "no-store, no-cache, must-revalidate, private";

/** Paths whose responses must never be cached by shared or browser caches. */
export const SENSITIVE_PATH_PREFIXES = [
  "/account",
  "/admin",
  "/dashboard",
  "/mfa",
  "/reset-password",
  "/auth",
  "/api",
  "/_serverFn",
] as const;

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function buildSecurityHeaders(input: { url: string }): Record<string, string> {
  let pathname = "/";
  let secure = false;
  let preview = false;
  try {
    const parsed = new URL(input.url);
    pathname = parsed.pathname;
    secure = parsed.protocol === "https:";
    preview = isPreviewHost(parsed.hostname);
  } catch {
    // Malformed URL: fall back to the strictest safe defaults.
    secure = false;
    preview = false;
  }

  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
    "cross-origin-opener-policy": "same-origin",
  };

  // Fallback policy for responses that carry no document (server functions,
  // API routes, error pages). Script/style directives are handled by the
  // nonce-bearing SSR policy; here only the framing and injection guards
  // apply, which is why `enforceScriptPolicy` is false.
  headers["content-security-policy"] = buildContentSecurityPolicy({
    preview,
    secure,
    enforceScriptPolicy: false,
    connectOrigins: supabaseConnectOrigins(
      import.meta.env["VITE_SUPABASE_URL"] as string | undefined,
    ),
  });
  if (!preview) headers["x-frame-options"] = "DENY";

  if (secure) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }
  if (isSensitivePath(pathname)) {
    headers["cache-control"] = NO_STORE;
    headers["pragma"] = "no-cache";
  }
  return headers;
}

/** Applies the headers without overwriting anything the app already set. */
export function withSecurityHeaders(response: Response, url: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(buildSecurityHeaders({ url }))) {
    if (key === "cache-control" || !headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
