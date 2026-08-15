/**
 * SEC-006 — browser-side MFA operations.
 *
 * Lifecycle rule for enrollment material: the TOTP secret and QR enrollment
 * payload may be returned to the authenticated browser for one-time display.
 * They must not be sent to application server functions, stored in application
 * tables or browser persistence, logged, included in analytics/error reporting,
 * or retained after the enrollment UI is closed.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  deriveMfaStatus,
  requiresAal2ForAny,
  UNAVAILABLE_STATUS,
  type MfaStatus,
  type PrincipalRole,
} from "./mfa";

/** Reads factors + assurance level, failing closed on any error. */
export async function readMfaStatus(): Promise<MfaStatus> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return { ...UNAVAILABLE_STATUS, sessionExpired: true };
    }
    const [{ data: factors, error: factorsError }, assurance] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      Promise.resolve(supabase.auth.mfa.getAuthenticatorAssuranceLevel()),
    ]);
    const resolved = await assurance;
    return deriveMfaStatus({
      factors,
      factorsError,
      assurance: resolved.data,
      assuranceError: resolved.error,
    });
  } catch {
    return UNAVAILABLE_STATUS;
  }
}

export type EnrollmentMaterial = {
  factorId: string;
  /** One-time display only — never persisted or transmitted onward. */
  qrCodeSvg: string;
  secret: string;
};

export async function startTotpEnrollment(
  friendlyName: string,
): Promise<{ material: EnrollmentMaterial | null; message: string | null }> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error || !data) {
    return { material: null, message: error?.message ?? "Could not start enrollment." };
  }
  return {
    material: {
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    },
    message: null,
  };
}

/** Challenge + verify in one step. Returns the refreshed status on success. */
export async function verifyTotpCode(
  factorId: string,
  code: string,
): Promise<{ ok: boolean; message: string | null }> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { ok: false, message: normalizeMfaError(error.message) };
  }
  return { ok: true, message: null };
}

/** Removes an unverified factor left behind by an abandoned enrollment. */
export async function cleanupUnverifiedFactor(factorId: string): Promise<void> {
  try {
    await supabase.auth.mfa.unenroll({ factorId });
  } catch {
    // Non-blocking: an orphaned unverified factor is re-offered for cleanup
    // the next time the enrollment page loads.
  }
}

export async function unenrollFactor(
  factorId: string,
): Promise<{ ok: boolean; message: string | null }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, message: normalizeMfaError(error.message) };
  return { ok: true, message: null };
}

/** Maps provider errors to user-facing text without leaking internals. */
export function normalizeMfaError(message: string | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("expired")) {
    return "That verification window expired. Enter a fresh code from your authenticator app.";
  }
  if (text.includes("invalid") || text.includes("incorrect")) {
    return "That code is not correct. Check your authenticator app and try the current code.";
  }
  if (text.includes("rate") || text.includes("too many")) {
    return "Too many attempts. Wait a moment and try again with a fresh code.";
  }
  return "We could not verify that code. Try again with the current code from your authenticator app.";
}
/**
 * Resolves whether MANDATORY MFA applies to the signed-in principal, from the
 * roles the caller can actually read under RLS.
 *
 * This is a UX/routing input only. The authoritative requirement is the
 * stage-two RLS conjunction (`app_private.has_aal2()`), prepared in
 * docs/sec-006-stage-two-enforcement.sql. Read failures fail closed to
 * `mandatory: true`, which under `resolveMfaGuard` routes the principal to
 * enrollment rather than granting anything.
 */
export async function readMandatoryMfa(userId: string): Promise<boolean> {
  try {
    const [adminResult, rolesResult] = await Promise.all([
      supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("organization_id, role:roles(code)")
        .eq("user_id", userId)
        .eq("status", "active"),
    ]);
    if (adminResult.error || rolesResult.error) return true;
    if (adminResult.data) return true;

    const rows = (rolesResult.data ?? []).filter(
      (row): row is { organization_id: string; role: { code: string } } =>
        Boolean(row.role) && typeof row.organization_id === "string",
    );
    if (rows.some((row) => mapRoleCode(row.role.code) === "org_admin")) return true;

    const conditional = rows.filter((row) => {
      const role = mapRoleCode(row.role.code);
      return role === "teacher" || role === "tutor";
    });
    if (conditional.length === 0) return false;

    const organizationIds = Array.from(new Set(conditional.map((row) => row.organization_id)));
    const { data: settings, error: settingsError } = await supabase
      .from("organization_security_settings")
      .select("organization_id, teacher_mfa_required, tutor_mfa_required")
      .in("organization_id", organizationIds);
    if (settingsError) return true;

    return conditional.some((row) => {
      const setting = (settings ?? []).find((s) => s.organization_id === row.organization_id);
      const policy = setting
        ? {
            teacherMfaRequired: setting.teacher_mfa_required === true,
            tutorMfaRequired: setting.tutor_mfa_required === true,
          }
        : { teacherMfaRequired: false, tutorMfaRequired: false };
      return requiresAal2ForAny([mapRoleCode(row.role.code)], policy);
    });
  } catch {
    return true;
  }
}

/** Maps database role codes onto the policy evaluator's principal roles. */
export function mapRoleCode(code: string): import("./mfa").PrincipalRole {
  switch (code) {
    case "org_admin":
    case "organization_admin":
      return "org_admin";
    case "teacher":
      return "teacher";
    case "tutor":
      return "tutor";
    case "parent_guardian":
    case "parent":
      return "parent";
    case "student":
      return "student";
    default:
      // Unknown code: treated as privileged by requiresAal2()'s fail-closed default.
      return "platform_admin";
  }
}
