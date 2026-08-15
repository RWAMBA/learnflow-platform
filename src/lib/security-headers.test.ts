import { describe, expect, it } from "vitest";
import {
  NO_STORE,
  buildSecurityHeaders,
  isSensitivePath,
  withSecurityHeaders,
} from "./security-headers";

describe("security headers", () => {
  it("always sets nosniff, referrer and permissions policy", () => {
    const h = buildSecurityHeaders({ url: "http://localhost:8080/" });
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  });

  it("emits HSTS only over https", () => {
    expect(buildSecurityHeaders({ url: "http://x.test/" })["strict-transport-security"]).toBeUndefined();
    expect(buildSecurityHeaders({ url: "https://x.test/" })["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("marks authenticated and recovery paths as no-store", () => {
    for (const path of ["/account/mfa", "/dashboard", "/reset-password", "/mfa/challenge", "/auth"]) {
      expect(isSensitivePath(path)).toBe(true);
      expect(buildSecurityHeaders({ url: `https://x.test${path}` })["cache-control"]).toBe(NO_STORE);
    }
    expect(isSensitivePath("/")).toBe(false);
    expect(buildSecurityHeaders({ url: "https://x.test/" })["cache-control"]).toBeUndefined();
  });

  it("emits the fallback framing CSP and denies framing on production hosts", () => {
    const h = buildSecurityHeaders({ url: "https://x.test/" });
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    // Script directives belong to the nonce-bearing SSR policy only.
    expect(h["content-security-policy"]).not.toContain("script-src");
    expect(h["x-frame-options"]).toBe("DENY");
  });

  it("keeps the Lovable editor iframe working on preview hosts", () => {
    const h = buildSecurityHeaders({ url: "https://id-preview--abc.lovable.app/" });
    expect(h["content-security-policy"]).toContain("frame-ancestors 'self' https://lovable.dev");
    expect(h["x-frame-options"]).toBeUndefined();
  });

  it("overrides cache-control but preserves other app-set headers", () => {
    const original = new Response("ok", {
      headers: { "cache-control": "public, max-age=600", "referrer-policy": "no-referrer" },
    });
    const out = withSecurityHeaders(original, "https://x.test/account/security");
    expect(out.headers.get("cache-control")).toBe(NO_STORE);
    expect(out.headers.get("referrer-policy")).toBe("no-referrer");
    expect(out.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
