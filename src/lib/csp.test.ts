import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  createCspNonce,
  isPreviewHost,
  supabaseConnectOrigins,
} from "./csp";
import { isOriginExemptPath, requiresOriginValidation } from "./origin-policy";

const PROD = {
  preview: false,
  secure: true,
  enforceScriptPolicy: true,
  nonce: "abc123",
} as const;

describe("isPreviewHost", () => {
  it("treats sandbox and local hosts as preview", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "id-preview--f140a695.lovable.app",
      "project--x-dev.lovable.app",
      "foo.lovableproject.com",
    ]) {
      expect(isPreviewHost(host), host).toBe(true);
    }
  });

  it("treats published and custom domains as production", () => {
    for (const host of [
      "learnflow.co.ke",
      "app.learnflow.co.ke",
      "learnflow.lovable.app",
      "evil-id-preview--x.attacker.com",
      "lovable.app.attacker.com",
    ]) {
      expect(isPreviewHost(host), host).toBe(false);
    }
  });
});

describe("buildContentSecurityPolicy", () => {
  it("denies all framing in production", () => {
    expect(buildContentSecurityPolicy(PROD)).toContain("frame-ancestors 'none'");
  });

  it("allows only Lovable editor origins to frame preview hosts", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, preview: true });
    expect(policy).toContain("frame-ancestors 'self' https://lovable.dev");
    expect(policy).not.toContain("frame-ancestors 'none'");
  });

  it("never emits unsafe-eval, and unsafe-inline only for style attributes", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(policy).not.toContain("unsafe-eval");
    expect(policy.match(/'unsafe-inline'/g)).toHaveLength(1);
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-abc123'");
  });

  it("keeps injection guards but drops script directives without a script policy", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, enforceScriptPolicy: false });
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("script-src");
  });

  it("omits nonce sources when no nonce is available rather than falling back to unsafe-inline", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, nonce: undefined });
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("nonce-");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("upgrades mixed content only over https", () => {
    expect(buildContentSecurityPolicy(PROD)).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ ...PROD, secure: false })).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("allows the configured Supabase REST and realtime origins only", () => {
    const origins = supabaseConnectOrigins("https://abc.supabase.co");
    expect(origins).toEqual(["https://abc.supabase.co", "wss://abc.supabase.co"]);
    expect(supabaseConnectOrigins(undefined)).toEqual([]);
    expect(supabaseConnectOrigins("not a url")).toEqual([]);
    expect(buildContentSecurityPolicy({ ...PROD, connectOrigins: origins })).toContain(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co",
    );
  });
});

describe("createCspNonce", () => {
  it("is unique per call and long enough to resist guessing", () => {
    const values = new Set(Array.from({ length: 200 }, () => createCspNonce()));
    expect(values.size).toBe(200);
    for (const value of values) expect(value.length).toBeGreaterThanOrEqual(20);
  });
});

describe("requiresOriginValidation", () => {
  it("always validates server functions, including reads", () => {
    expect(
      requiresOriginValidation({ handlerType: "serverFn", method: "GET", pathname: "/_serverFn" }),
    ).toBe(true);
  });

  it("validates state-changing server routes", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(
        requiresOriginValidation({ handlerType: "router", method, pathname: "/account/mfa" }),
      ).toBe(true);
    }
  });

  it("skips safe server-route methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        requiresOriginValidation({ handlerType: "router", method, pathname: "/dashboard" }),
      ).toBe(false);
    }
  });

  it("exempts only the documented external-caller surfaces", () => {
    expect(isOriginExemptPath("/mcp")).toBe(true);
    expect(isOriginExemptPath("/api/public/webhook")).toBe(true);
    expect(isOriginExemptPath("/.well-known/oauth-protected-resource")).toBe(true);
    expect(isOriginExemptPath("/api/env-preflight")).toBe(false);
    expect(isOriginExemptPath("/mcp-admin-console")).toBe(false);
    expect(isOriginExemptPath("/account/security")).toBe(false);
  });
});
