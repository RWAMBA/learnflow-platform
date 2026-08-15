/**
 * SSR-only half of the CSP implementation.
 *
 * Reached exclusively through the `.server()` branch of the isomorphic
 * function in `src/router.tsx`, so `@tanstack/react-start/server` never enters
 * the client graph. It mints one nonce per rendered document and installs the
 * matching Content-Security-Policy on that same response, which is why the
 * nonce can never be static and never encodes a secret.
 */
import { getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";

import { buildContentSecurityPolicy, createCspNonce, isPreviewHost, supabaseConnectOrigins } from "./csp";

/**
 * Only the production bundle has a fully enumerated inline-script graph; the
 * development bundle is served through Vite, which injects its own un-nonced
 * inline preamble.
 */
const ENFORCE_SCRIPT_POLICY = import.meta.env.PROD;

/** Returns the nonce for this response, or undefined outside a request scope. */
export function installDocumentCsp(): string | undefined {
  let url: URL;
  try {
    url = getRequestUrl();
  } catch {
    // Rendered outside an HTTP request scope (tests, prerender warm-up).
    return undefined;
  }

  const nonce = ENFORCE_SCRIPT_POLICY ? createCspNonce() : undefined;

  try {
    setResponseHeader(
      "content-security-policy",
      buildContentSecurityPolicy({
        nonce,
        preview: isPreviewHost(url.hostname),
        secure: url.protocol === "https:",
        enforceScriptPolicy: ENFORCE_SCRIPT_POLICY,
        connectOrigins: supabaseConnectOrigins(
          import.meta.env["VITE_SUPABASE_URL"] as string | undefined,
        ),
      }),
    );
    if (!isPreviewHost(url.hostname)) setResponseHeader("x-frame-options", "DENY");
  } catch {
    // Header could not be attached: fall back to the worker-level policy in
    // src/lib/security-headers.ts rather than emitting a nonce nothing honours.
    return undefined;
  }

  return nonce;
}
