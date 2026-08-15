import { describe, expect, it } from "vitest";
import {
  canRemoveFactor,
  deriveMfaStatus,
  enforcementReadiness,
  isGuardExempt,
  MFA_ENFORCEMENT_ENABLED,
  requiresAal2,
  requiresAal2ForAny,
  resolveMfaGuard,
  sanitizeRedirect,
} from "./mfa";
import { normalizeMfaError } from "./mfa-client";

const okAssurance = { currentLevel: "aal1", nextLevel: "aal2" };
const totp = (id: string, status: string) => ({
  id,
  status,
  factor_type: "totp",
  friendly_name: "Phone",
});

describe("deriveMfaStatus", () => {
  it("derives verified factors and step-up availability", () => {
    const status = deriveMfaStatus({
      factors: { all: [totp("f1", "verified"), totp("f2", "unverified")] },
      assurance: okAssurance,
    });
    expect(status.unavailable).toBe(false);
    expect(status.verifiedFactors.map((f) => f.id)).toEqual(["f1"]);
    expect(status.unverifiedFactors.map((f) => f.id)).toEqual(["f2"]);
    expect(status.hasVerifiedFactor).toBe(true);
    expect(status.stepUpAvailable).toBe(true);
  });

  it("ignores non-TOTP factors", () => {
    const status = deriveMfaStatus({
      factors: { all: [{ id: "p1", status: "verified", factor_type: "phone" }] },
      assurance: okAssurance,
    });
    expect(status.factors).toHaveLength(0);
    expect(status.hasVerifiedFactor).toBe(false);
  });

  it.each([
    ["factors error", { factorsError: new Error("x"), assurance: okAssurance }],
    ["assurance error", { factors: { all: [] }, assuranceError: new Error("x") }],
    ["malformed factors", { factors: { all: "nope" }, assurance: okAssurance }],
    ["missing assurance", { factors: { all: [] }, assurance: null }],
    ["malformed aal", { factors: { all: [] }, assurance: { currentLevel: 2 } }],
  ])("fails closed on %s", (_label, input) => {
    expect(deriveMfaStatus(input as never).unavailable).toBe(true);
  });

  it("marks an expired session distinctly and still unavailable", () => {
    const status = deriveMfaStatus({ sessionExpired: true });
    expect(status.unavailable).toBe(true);
    expect(status.sessionExpired).toBe(true);
  });
});

describe("sanitizeRedirect", () => {
  it.each(["/dashboard", "/organization/settings?tab=security"])("keeps %s", (value) => {
    expect(sanitizeRedirect(value)).toBe(value);
  });

  it.each([
    "https://evil.test/x",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/\u0000dashboard",
    "dashboard",
    "",
    42,
    null,
  ])("rejects %s", (value) => {
    expect(sanitizeRedirect(value as never)).toBeNull();
  });
});

describe("requiresAal2", () => {
  const policy = { teacherMfaRequired: true, tutorMfaRequired: false };

  it("always requires AAL2 for administrators", () => {
    expect(requiresAal2("platform_admin")).toBe(true);
    expect(requiresAal2("org_admin")).toBe(true);
  });

  it("applies organization policy to teacher and tutor only", () => {
    expect(requiresAal2("teacher", policy)).toBe(true);
    expect(requiresAal2("tutor", policy)).toBe(false);
    expect(requiresAal2("teacher")).toBe(false);
  });

  it("never mandates AAL2 for parents or students", () => {
    expect(requiresAal2("parent", policy)).toBe(false);
    expect(requiresAal2("student", policy)).toBe(false);
  });

  it("fails closed for an unknown role", () => {
    expect(requiresAal2("hacker" as never)).toBe(true);
  });

  it("takes the strictest role in a multi-role principal", () => {
    expect(requiresAal2ForAny(["parent", "org_admin"])).toBe(true);
    expect(requiresAal2ForAny(["parent", "student"])).toBe(false);
  });
});

describe("canRemoveFactor", () => {
  it("requires a freshly verified AAL2 session", () => {
    expect(
      canRemoveFactor({ mandatory: false, verifiedFactorCount: 2, currentLevel: "aal1" }).allowed,
    ).toBe(false);
    expect(
      canRemoveFactor({ mandatory: false, verifiedFactorCount: 2, currentLevel: null }).allowed,
    ).toBe(false);
  });

  it("blocks dropping the last factor under mandatory MFA", () => {
    const result = canRemoveFactor({
      mandatory: true,
      verifiedFactorCount: 1,
      currentLevel: "aal2",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/replacement/i);
  });

  it("allows removing a spare factor at AAL2", () => {
    expect(
      canRemoveFactor({ mandatory: true, verifiedFactorCount: 2, currentLevel: "aal2" }).allowed,
    ).toBe(true);
  });
});

describe("enforcementReadiness", () => {
  it("blocks activation below the administrator floor", () => {
    const result = enforcementReadiness({ enrolledPlatformAdmins: 1, activePlatformAdmins: 3 });
    expect(result.ready).toBe(false);
    expect(result.reasons).toHaveLength(1);
  });

  it("is ready when enough administrators are enrolled", () => {
    expect(enforcementReadiness({ enrolledPlatformAdmins: 2, activePlatformAdmins: 2 }).ready).toBe(
      true,
    );
  });
});

describe("resolveMfaGuard", () => {
  const base = { enforcementEnabled: true, mandatory: true };
  const aal2 = { hasVerifiedFactor: true, currentLevel: "aal2" as const, unavailable: false };
  const aal1 = { hasVerifiedFactor: true, currentLevel: "aal1" as const, unavailable: false };
  const none = { hasVerifiedFactor: false, currentLevel: "aal1" as const, unavailable: false };

  it("ships with enforcement disabled", () => {
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
    expect(
      resolveMfaGuard({ ...base, enforcementEnabled: false, pathname: "/dashboard", status: none })
        .action,
    ).toBe("allow");
  });

  it("allows non-mandatory principals through", () => {
    expect(
      resolveMfaGuard({ ...base, mandatory: false, pathname: "/dashboard", status: none }).action,
    ).toBe("allow");
  });

  it("sends an unenrolled admin to enrollment", () => {
    expect(resolveMfaGuard({ ...base, pathname: "/dashboard", status: none })).toEqual({
      action: "redirect",
      to: "/account/mfa",
    });
  });

  it("sends an AAL1 admin to the challenge with the destination preserved", () => {
    expect(resolveMfaGuard({ ...base, pathname: "/organization/members", status: aal1 })).toEqual({
      action: "redirect",
      to: "/mfa/challenge",
      redirect: "/organization/members",
    });
  });

  it("fails closed to enrollment when status is unavailable", () => {
    const decision = resolveMfaGuard({
      ...base,
      pathname: "/dashboard",
      status: { hasVerifiedFactor: false, currentLevel: null, unavailable: true },
    });
    expect(decision).toEqual({ action: "redirect", to: "/account/mfa" });
  });

  it("allows an AAL2 admin", () => {
    expect(resolveMfaGuard({ ...base, pathname: "/dashboard", status: aal2 }).action).toBe("allow");
  });

  it.each(["/auth", "/reset-password", "/mfa/challenge", "/account/mfa"])(
    "never redirects away from the exempt path %s",
    (pathname) => {
      expect(isGuardExempt(pathname)).toBe(true);
      expect(resolveMfaGuard({ ...base, pathname, status: none }).action).toBe("allow");
      expect(resolveMfaGuard({ ...base, pathname, status: aal1 }).action).toBe("allow");
    },
  );

  it("proves no self-redirect: every redirect target is exempt", () => {
    for (const status of [none, aal1]) {
      const decision = resolveMfaGuard({ ...base, pathname: "/dashboard", status });
      if (decision.action !== "redirect") throw new Error("expected redirect");
      expect(isGuardExempt(decision.to)).toBe(true);
      expect(resolveMfaGuard({ ...base, pathname: decision.to, status }).action).toBe("allow");
    }
  });
});

describe("normalizeMfaError", () => {
  it("maps provider errors to safe copy without leaking internals", () => {
    expect(normalizeMfaError("Token has expired")).toMatch(/expired/i);
    expect(normalizeMfaError("Invalid TOTP code entered")).toMatch(/not correct/i);
    expect(normalizeMfaError("Rate limit exceeded")).toMatch(/Too many attempts/i);
    expect(normalizeMfaError(undefined)).toMatch(/could not verify/i);
    expect(normalizeMfaError("pg: relation auth.mfa_factors")).not.toMatch(/auth\.mfa_factors/);
  });
});
