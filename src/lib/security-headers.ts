/**
 * Block 7 — response security headers for the TanStack Start / Nitro
 * (Cloudflare Worker) pipeline.
 *
 * Deliberate limitations, recorded rather than guessed:
 *  - No `frame-ancestors` / `X-Frame-Options` is emitted. The application is
 *    served inside the Lovable preview iframe, and the production framing
 *    origins have not been approved. Choosing one here would invent policy and
 *    break the current preview. See docs/master-learnflow-continuation-brief.md.
 *  - No script/style CSP is emitted. The Vite/TanStack Start rendering pipeline
 *    injects inline hydration and style payloads without a per-request nonce
 *    hook, so a nonce-based policy cannot be implemented today without
 *    breaking assets, and `unsafe-inline` would be security theatre.
 *  - HSTS is emitted only for https requests, so local http development and
 *    the sandbox preview are unaffected.
 */

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

export function buildSecurityHeaders(input: {
  url: string;
}): Record<string, string> {
  let pathname = "/";
  let secure = false;
  try {
    const parsed = new URL(input.url);
    pathname = parsed.pathname;
    secure = parsed.protocol === "https:";
  } catch {
    // Malformed URL: fall back to the strictest safe defaults.
    secure = false;
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
