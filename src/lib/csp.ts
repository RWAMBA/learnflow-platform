/**
 * Block 8 — Content-Security-Policy construction.
 *
 * The policy is built from verified facts about the actual production bundle
 * (`bun run build` → `dist/server/index.mjs`, a Cloudflare Worker):
 *
 *  - The rendered document contains exactly two inline scripts, both emitted by
 *    TanStack Router SSR (`ssr-server.js` and `renderRouterToStream.js`). Both
 *    honour `router.options.ssr.nonce`, so a per-response nonce propagates to
 *    every inline script the framework produces.
 *  - The document contains no inline <style> elements and no third-party
 *    script/stylesheet origins; CSS ships as an external `/assets/*.css` file.
 *  - Client route chunks are loaded through module preloads and dynamic
 *    `import()` from the nonce-bearing entry, which `'strict-dynamic'` covers.
 *
 * React still renders `style="…"` attributes (inline style *attributes*, not
 * <style> blocks). Those are governed by `style-src-attr`, which therefore
 * carries the single documented `'unsafe-inline'` in this policy. No other
 * directive uses `'unsafe-inline'`, and `'unsafe-eval'` is never emitted.
 */

/** Hosts allowed to frame the app. Production framing is always denied. */
export const PREVIEW_FRAME_ANCESTORS = [
  "'self'",
  "https://lovable.dev",
  "https://*.lovable.dev",
  "https://*.lovable.app",
  "https://*.lovableproject.com",
] as const;

/**
 * Verified non-production hosts. Everything else — including every custom
 * domain — is treated as production and gets the strictest policy.
 */
export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".lovableproject.com")) return true;
  if (host.endsWith(".lovable.dev")) return true;
  if (!host.endsWith(".lovable.app")) return false;
  // *.lovable.app covers both the published production site and the preview
  // sandboxes; only the sandbox naming conventions are treated as preview.
  const label = host.slice(0, -".lovable.app".length);
  return label.startsWith("id-preview--") || label.endsWith("-dev");
}

/** Extra connect-src origins derived from the configured Supabase project. */
export function supabaseConnectOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const { origin, host } = new URL(supabaseUrl);
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

export interface CspInput {
  /** Per-response nonce. Omitted when the runtime cannot guarantee one. */
  nonce?: string | undefined;
  /** Preview hosts keep framing open for the Lovable editor iframe. */
  preview: boolean;
  /** https requests may upgrade mixed content. */
  secure: boolean;
  /** Extra origins the browser is allowed to call (Supabase REST/Realtime). */
  connectOrigins?: readonly string[];
  /**
   * Only the real production bundle has a fully enumerated script/style graph.
   * Development builds are served by Vite, which injects its own un-nonced
   * inline scripts, so script/style directives are omitted there rather than
   * shipping a policy that would break the app.
   */
  enforceScriptPolicy: boolean;
}

export function buildContentSecurityPolicy(input: CspInput): string {
  const directives: string[] = [];

  if (input.enforceScriptPolicy) {
    directives.push("default-src 'self'");
  }

  directives.push("object-src 'none'", "base-uri 'self'", "form-action 'self'");
  directives.push(
    `frame-ancestors ${input.preview ? PREVIEW_FRAME_ANCESTORS.join(" ") : "'none'"}`,
  );

  if (input.enforceScriptPolicy) {
    const scriptSources = ["'self'"];
    if (input.nonce) scriptSources.push(`'nonce-${input.nonce}'`, "'strict-dynamic'");
    directives.push(
      `script-src ${scriptSources.join(" ")}`,
      `style-src ${input.nonce ? `'self' 'nonce-${input.nonce}'` : "'self'"}`,
      // React renders style="" attributes; style-src-attr is the narrowest
      // directive that permits them and it cannot execute script.
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "frame-src 'none'",
      `connect-src ${["'self'", ...(input.connectOrigins ?? [])].join(" ")}`,
    );
  }

  if (input.secure) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

/** Cryptographically random, per-response, never derived from a secret. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/, "");
}
