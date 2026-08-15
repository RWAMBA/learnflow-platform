/**
 * SEC-006 — pure, framework-free MFA policy and status logic.
 *
 * Everything in this module is deterministic and side-effect free so it can be
 * unit tested without a Supabase session. No secrets, OTPs, QR payloads or
 * tokens may be passed through, stored or returned by these helpers.
 */

/**
 * Master switch for MANDATORY MFA. Enforcement stays disabled until the
 * activation prerequisites in `enforcementReadiness()` are met and the
 * SEC-006 enforcement migration has been applied and reviewed.
 */
export const MFA_ENFORCEMENT_ENABLED = false;

/** Minimum number of active Platform Administrators with a verified factor. */
export const MIN_ENROLLED_PLATFORM_ADMINS = 2;

export const MFA_UNAVAILABLE_MESSAGE =
  "Two-factor security verification is temporarily unavailable. Please try again later.";

export type AssuranceLevel = "aal1" | "aal2";

export type FactorSummary = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
};

export type MfaStatus = {
  factors: FactorSummary[];
  verifiedFactors: FactorSummary[];
  unverifiedFactors: FactorSummary[];
  hasVerifiedFactor: boolean;
  currentLevel: AssuranceLevel | null;
  nextLevel: AssuranceLevel | null;
  /** True when the session can and should be stepped up to aal2. */
  stepUpAvailable: boolean;
  /** True when the status could not be established — always fail closed. */
  unavailable: boolean;
  /** True when the session is gone/expired rather than merely unreadable. */
  sessionExpired: boolean;
};

export const UNAVAILABLE_STATUS: MfaStatus = {
  factors: [],
  verifiedFactors: [],
  unverifiedFactors: [],
  hasVerifiedFactor: false,
  currentLevel: null,
  nextLevel: null,
  stepUpAvailable: false,
  unavailable: true,
  sessionExpired: false,
};

type RawFactor = {
  id?: unknown;
  friendly_name?: unknown;
  status?: unknown;
  factor_type?: unknown;
};

function normalizeLevel(value: unknown): AssuranceLevel | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

/**
 * Derives the status shown to the user from the raw `listFactors()` and
 * `getAuthenticatorAssuranceLevel()` payloads. Any malformed, missing or
 * errored input yields an `unavailable` status (fail closed).
 */
export function deriveMfaStatus(input: {
  factors?: { all?: unknown } | null;
  factorsError?: unknown;
  assurance?: { currentLevel?: unknown; nextLevel?: unknown } | null;
  assuranceError?: unknown;
  sessionExpired?: boolean;
}): MfaStatus {
  if (input.sessionExpired) {
    return { ...UNAVAILABLE_STATUS, sessionExpired: true };
  }
  if (input.factorsError || input.assuranceError) return UNAVAILABLE_STATUS;

  const raw = input.factors?.all;
  if (!Array.isArray(raw)) return UNAVAILABLE_STATUS;

  const factors: FactorSummary[] = [];
  for (const entry of raw as RawFactor[]) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0) continue;
    // Only TOTP is in scope for SEC-006; phone/webauthn are out of scope.
    if (entry.factor_type !== undefined && entry.factor_type !== "totp") continue;
    const status = entry.status === "verified" ? "verified" : "unverified";
    factors.push({
      id: entry.id,
      friendlyName: typeof entry.friendly_name === "string" ? entry.friendly_name : null,
      status,
    });
  }

  const currentLevel = normalizeLevel(input.assurance?.currentLevel);
  const nextLevel = normalizeLevel(input.assurance?.nextLevel);
  if (currentLevel === null) return UNAVAILABLE_STATUS;

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");
  return {
    factors,
    verifiedFactors,
    unverifiedFactors: factors.filter((factor) => factor.status === "unverified"),
    hasVerifiedFactor: verifiedFactors.length > 0,
    currentLevel,
    nextLevel,
    stepUpAvailable: currentLevel === "aal1" && nextLevel === "aal2",
    unavailable: false,
    sessionExpired: false,
  };
}

/**
 * Only same-origin absolute paths survive. Absolute URLs, protocol-relative
 * URLs, backslash tricks and control characters are rejected.
 */
export function sanitizeRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 512) return null;
  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return null;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(candidate)) return null;
  return candidate;
}

export type PrincipalRole =
  | "platform_admin"
  | "org_admin"
  | "teacher"
  | "tutor"
  | "parent"
  | "student";

export type OrganizationMfaPolicy = {
  teacherMfaRequired: boolean;
  tutorMfaRequired: boolean;
};

/** Absence of a policy row means optional MFA for Teacher/Tutor only. */
export const DEFAULT_ORGANIZATION_MFA_POLICY: OrganizationMfaPolicy = {
  teacherMfaRequired: false,
  tutorMfaRequired: false,
};

/**
 * The single authoritative policy evaluator. Platform and Organization
 * Administrators always require AAL2; Teacher/Tutor only under organization
 * policy; Parent/Guardian and Student never gain a mandatory rule.
 */
export function requiresAal2(
  role: PrincipalRole,
  policy: OrganizationMfaPolicy = DEFAULT_ORGANIZATION_MFA_POLICY,
): boolean {
  switch (role) {
    case "platform_admin":
    case "org_admin":
      return true;
    case "teacher":
      return policy.teacherMfaRequired === true;
    case "tutor":
      return policy.tutorMfaRequired === true;
    case "parent":
    case "student":
      return false;
    default:
      // Unknown role: fail closed for privileged evaluation.
      return true;
  }
}

/** True when any of the caller's roles demands AAL2 for a privileged write. */
export function requiresAal2ForAny(
  roles: readonly PrincipalRole[],
  policy: OrganizationMfaPolicy = DEFAULT_ORGANIZATION_MFA_POLICY,
): boolean {
  return roles.some((role) => requiresAal2(role, policy));
}

/**
 * UX-level rule: a principal under mandatory MFA should not drop below one
 * verified factor. This is NOT an authoritative security boundary — the
 * browser can call the Supabase SDK directly, and Supabase's own AAL2
 * requirement on unenroll is what actually protects removal. The authoritative
 * consequence is that a mandatory principal with no verified factor is
 * restricted to enrollment-only access once enforcement is enabled
 * (`resolveMfaGuard` redirects everything except the exempt routes to
 * /account/mfa).
 */
export function canRemoveFactor(input: {
  mandatory: boolean;
  verifiedFactorCount: number;
  currentLevel: AssuranceLevel | null;
}): { allowed: boolean; reason?: string } {
  if (input.currentLevel !== "aal2") {
    return { allowed: false, reason: "Verify a code from your authenticator app before removing a factor." };
  }
  if (input.mandatory && input.verifiedFactorCount <= 1) {
    return {
      allowed: false,
      reason:
        "Two-factor authentication is required for your role. Add and verify a replacement authenticator before removing this one.",
    };
  }
  return { allowed: true };
}

/** Activation prerequisites for turning mandatory enforcement on. */
export function enforcementReadiness(input: {
  enrolledPlatformAdmins: number;
  activePlatformAdmins: number;
}): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.activePlatformAdmins < MIN_ENROLLED_PLATFORM_ADMINS) {
    reasons.push(
      `At least ${MIN_ENROLLED_PLATFORM_ADMINS} active Platform Administrators are required (found ${input.activePlatformAdmins}).`,
    );
  }
  if (input.enrolledPlatformAdmins < MIN_ENROLLED_PLATFORM_ADMINS) {
    reasons.push(
      `At least ${MIN_ENROLLED_PLATFORM_ADMINS} Platform Administrators must have a verified factor (found ${input.enrolledPlatformAdmins}).`,
    );
  }
  return { ready: reasons.length === 0, reasons };
}

/** Routes that must never be gated by the mandatory-MFA guard. */
export const MFA_GUARD_EXEMPT_PATHS = [
  "/auth",
  "/reset-password",
  "/mfa/challenge",
  "/account/mfa",
] as const;

export function isGuardExempt(pathname: string): boolean {
  return MFA_GUARD_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export type GuardDecision =
  | { action: "allow" }
  | { action: "redirect"; to: "/mfa/challenge" | "/account/mfa"; redirect?: string };

/**
 * Resolves the authenticated-layout guard for MFA. Exempt paths always pass,
 * which is what makes the enrollment and challenge routes reachable and proves
 * no route can redirect to itself.
 */
export function resolveMfaGuard(input: {
  enforcementEnabled: boolean;
  mandatory: boolean;
  pathname: string;
  status: Pick<MfaStatus, "hasVerifiedFactor" | "currentLevel" | "unavailable">;
}): GuardDecision {
  if (!input.enforcementEnabled || !input.mandatory) return { action: "allow" };
  if (isGuardExempt(input.pathname)) return { action: "allow" };
  if (input.status.unavailable) return { action: "redirect", to: "/account/mfa" };
  if (!input.status.hasVerifiedFactor) return { action: "redirect", to: "/account/mfa" };
  if (input.status.currentLevel !== "aal2") {
    return { action: "redirect", to: "/mfa/challenge", redirect: sanitizeRedirect(input.pathname) ?? "/dashboard" };
  }
  return { action: "allow" };
}