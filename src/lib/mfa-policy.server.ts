/**
 * SEC-006 — server-only MFA policy, audit and administrator recovery helpers.
 *
 * Diagnostic logging in this module is strictly redacted: it may contain a
 * stable operation label and a coarse reason code only. Never user ids, target
 * ids, factor ids, emails, OTPs, TOTP secrets, QR payloads, access/refresh
 * tokens, service-role keys or complete database records.
 */
import {
  DEFAULT_ORGANIZATION_MFA_POLICY,
  MFA_UNAVAILABLE_MESSAGE,
  requiresAal2,
  type OrganizationMfaPolicy,
  type PrincipalRole,
} from "@/features/security/mfa";

export const MFA_FORBIDDEN_MESSAGE =
  "This action requires two-factor verification. Verify a code from your authenticator app and try again.";

export class MfaServiceUnavailableError extends Error {
  constructor() {
    super(MFA_UNAVAILABLE_MESSAGE);
    this.name = "MfaServiceUnavailableError";
  }
}

export class MfaAssuranceError extends Error {
  constructor(message = MFA_FORBIDDEN_MESSAGE) {
    super(message);
    this.name = "MfaAssuranceError";
  }
}

export function logMfaDiagnostic(operation: string, reason: string): void {
  console.error(`[mfa-policy] operation=${operation} reason=${reason}`);
}

export function assertMfaServiceConfigured(
  env: {
    SUPABASE_URL?: string | undefined;
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  } = process.env,
): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    logMfaDiagnostic("configuration-check", "admin-configuration-incomplete");
    throw new MfaServiceUnavailableError();
  }
}

/**
 * Server-observed assurance level, read from verified JWT claims. Missing,
 * null, malformed and non-string claims all resolve to `false` (fail closed).
 */
export function claimsHaveAal2(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const value = (claims as Record<string, unknown>)["aal"];
  return typeof value === "string" && value === "aal2";
}

export function assertAal2(claims: unknown): void {
  if (!claimsHaveAal2(claims)) {
    logMfaDiagnostic("assurance-check", "aal2-required");
    throw new MfaAssuranceError();
  }
}

// SEC-006 Gate 5: a generic `enforcePrivilegedAssurance()` helper used to live
// here. It was wired to nothing, so it represented protection that did not
// exist. It is intentionally removed until stage two introduces the mapped,
// tested enforcement for application mutations. The only server-side AAL2
// enforcement that is active today is `assertAal2()` on administrator-assisted
// factor reset, which additionally requires active Platform Administrator
// status verified as the caller.

type AdminClient = {
  from: (table: string) => any;
  auth: {
    admin: {
      mfa: {
        listFactors: (params: { userId: string }) => Promise<{ data: any; error: any }>;
        deleteFactor: (params: { id: string; userId: string }) => Promise<{ data: any; error: any }>;
      };
    };
  };
};

export type MfaSecurityEventType =
  | "mfa_enroll_started"
  | "mfa_factor_verified"
  | "mfa_challenge_failed"
  | "mfa_unenroll"
  | "mfa_admin_factor_reset"
  | "mfa_enforcement_activated";

/**
 * Writes a structured record to public.security_events through the service
 * role. Investigation-grade identifiers are allowed HERE (and only here);
 * secrets and credentials never are.
 */
export async function recordMfaSecurityEvent(
  admin: Pick<AdminClient, "from">,
  event: {
    eventType: MfaSecurityEventType;
    severity?: "info" | "warning" | "critical";
    actorUserId: string | null;
    organizationId?: string | null;
    details?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const { error } = await admin.from("security_events").insert({
    event_type: event.eventType,
    severity: event.severity ?? "info",
    actor_user_id: event.actorUserId,
    organization_id: event.organizationId ?? null,
    details: event.details ?? {},
  });
  if (error) {
    logMfaDiagnostic("security-event-write", "security-event-persistence-failure");
  }
}

/**
 * Active-Platform-Administrator check performed AS THE CALLER (RLS applies),
 * never with the service role — an admin client must not be used to decide
 * whether the caller is an admin.
 */
export async function isActivePlatformAdmin(
  client: Pick<AdminClient, "from">,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logMfaDiagnostic("platform-admin-check", "platform-admin-read-failure");
    return false;
  }
  return Boolean(data);
}

/** Reads the organization MFA policy; absence means Teacher/Tutor optional. */
export async function readOrganizationMfaPolicy(
  client: Pick<AdminClient, "from">,
  organizationId: string,
): Promise<OrganizationMfaPolicy> {
  const { data, error } = await client
    .from("organization_security_settings")
    .select("teacher_mfa_required, tutor_mfa_required")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    logMfaDiagnostic("read-org-policy", "policy-read-failure");
    throw new MfaServiceUnavailableError();
  }
  if (!data) return DEFAULT_ORGANIZATION_MFA_POLICY;
  return {
    teacherMfaRequired: data.teacher_mfa_required === true,
    tutorMfaRequired: data.tutor_mfa_required === true,
  };
}

/** Counts active Platform Administrators and how many hold a verified factor. */
export async function readPlatformAdminEnrollment(
  admin: AdminClient,
): Promise<{ activePlatformAdmins: number; enrolledPlatformAdmins: number }> {
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("status", "active");
  if (error) {
    logMfaDiagnostic("read-admin-enrollment", "platform-admin-read-failure");
    throw new MfaServiceUnavailableError();
  }
  const ids: string[] = (data ?? []).map((row: { user_id: string }) => row.user_id);
  let enrolled = 0;
  for (const id of ids) {
    const { data: factorData, error: factorError } = await admin.auth.admin.mfa.listFactors({
      userId: id,
    });
    if (factorError) {
      logMfaDiagnostic("read-admin-enrollment", "factor-list-failure");
      throw new MfaServiceUnavailableError();
    }
    const factors: Array<{ status?: string }> = factorData?.factors ?? [];
    if (factors.some((factor) => factor.status === "verified")) enrolled += 1;
  }
  return { activePlatformAdmins: ids.length, enrolledPlatformAdmins: enrolled };
}

/**
 * Bounded administrator-assisted factor reset. The caller MUST already be
 * authorized (active Platform Administrator with server-observed AAL2) and
 * must not be the target: there is no self-service reset.
 */
export async function adminResetTargetFactors(
  admin: AdminClient,
  input: { actorUserId: string; targetUserId: string },
): Promise<{ removedFactorCount: number }> {
  if (input.actorUserId === input.targetUserId) {
    logMfaDiagnostic("admin-factor-reset", "self-reset-denied");
    throw new MfaAssuranceError("Administrators cannot reset their own factors.");
  }

  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: input.targetUserId });
  if (error) {
    logMfaDiagnostic("admin-factor-reset", "factor-list-failure");
    throw new MfaServiceUnavailableError();
  }

  const factors: Array<{ id: string }> = data?.factors ?? [];
  let removed = 0;
  for (const factor of factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: input.targetUserId,
    });
    if (deleteError) {
      logMfaDiagnostic("admin-factor-reset", "factor-delete-failure");
      throw new MfaServiceUnavailableError();
    }
    removed += 1;
    await recordMfaSecurityEvent(admin, {
      eventType: "mfa_admin_factor_reset",
      severity: "critical",
      actorUserId: input.actorUserId,
      details: {
        target_user_id: input.targetUserId,
        factor_id: factor.id,
        outcome: "removed",
      },
    });
  }
  return { removedFactorCount: removed };
}