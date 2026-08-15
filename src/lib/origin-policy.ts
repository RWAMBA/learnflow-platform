/**
 * Which requests must carry a trustworthy same-origin signal.
 *
 * Server functions are always validated: they are cookie/bearer authenticated
 * and mutate tenant data. Server *routes* are validated whenever the method is
 * state-changing, with a narrow exemption list for endpoints whose callers are
 * by design external and therefore never send a same-origin
 * `Sec-Fetch-Site`/`Origin` — those endpoints authenticate their caller
 * themselves (bearer token, signature) instead of relying on origin.
 */

/** Methods that cannot change state, per RFC 9110 — safe to leave unvalidated. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Path prefixes whose callers are external agents/services, not the browser
 * app. Exempting them is safe only because each one authenticates the caller
 * independently of the request origin.
 */
export const ORIGIN_EXEMPT_PREFIXES = [
  "/mcp", // OAuth 2.1 bearer-token authenticated MCP transport
  "/.well-known/", // static discovery documents
  "/api/public/", // documented external webhook/cron surface, self-verifying
] as const;

export function isOriginExemptPath(pathname: string): boolean {
  return ORIGIN_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

export function requiresOriginValidation(input: {
  handlerType: "serverFn" | "router";
  method: string;
  pathname: string;
}): boolean {
  if (input.handlerType === "serverFn") return true;
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false;
  return !isOriginExemptPath(input.pathname);
}
