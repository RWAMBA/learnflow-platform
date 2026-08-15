import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Server-observed assurance + enforcement readiness for the current caller. */
export const getMfaEnforcementContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./mfa-policy.server");
    const { MFA_ENFORCEMENT_ENABLED } = await import("@/features/security/mfa");
    return {
      enforcementEnabled: MFA_ENFORCEMENT_ENABLED,
      serverObservedAal2: mod.claimsHaveAal2(context.claims),
    };
  });

/** Records an MFA lifecycle event. Never accepts secrets, OTPs or QR payloads. */
export const recordMfaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event: string; factorId?: string; outcome?: string }) => {
    const allowed = [
      "mfa_enroll_started",
      "mfa_factor_verified",
      "mfa_challenge_failed",
      "mfa_unenroll",
    ] as const;
    if (!allowed.includes(input.event as (typeof allowed)[number])) {
      throw new Error("Unsupported security event");
    }
    return {
      event: input.event as (typeof allowed)[number],
      factorId: typeof input.factorId === "string" ? input.factorId.slice(0, 64) : undefined,
      outcome: typeof input.outcome === "string" ? input.outcome.slice(0, 32) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const mod = await import("./mfa-policy.server");
    mod.assertMfaServiceConfigured();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await mod.recordMfaSecurityEvent(supabaseAdmin as never, {
        eventType: data.event,
        severity: data.event === "mfa_challenge_failed" ? "warning" : "info",
        actorUserId: context.userId,
        details: {
          ...(data.factorId ? { factor_id: data.factorId } : {}),
          ...(data.outcome ? { outcome: data.outcome } : {}),
        },
      });
      return { recorded: true };
    } catch (error) {
      if (error instanceof mod.MfaServiceUnavailableError) throw error;
      mod.logMfaDiagnostic("record-mfa-event", "admin-client-unavailable");
      throw new mod.MfaServiceUnavailableError();
    }
  });

/** Platform-admin view of activation readiness. Requires AAL2 when available. */
export const getMfaActivationReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./mfa-policy.server");
    const { enforcementReadiness } = await import("@/features/security/mfa");
    mod.assertMfaServiceConfigured();

    const isAdmin = await mod.isActivePlatformAdmin(context.supabase as never, context.userId);
    if (!isAdmin) {
      mod.logMfaDiagnostic("activation-readiness", "not-platform-admin");
      throw new mod.MfaAssuranceError(
        "Only Platform Administrators can read activation readiness.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counts = await mod.readPlatformAdminEnrollment(supabaseAdmin as never);
    return { ...counts, ...enforcementReadiness(counts) };
  });

/** Bounded administrator-assisted factor reset. No self-service reset. */
export const adminResetUserMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetUserId: string }) => {
    if (typeof input?.targetUserId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.targetUserId)) {
      throw new Error("Invalid target");
    }
    return { targetUserId: input.targetUserId };
  })
  .handler(async ({ data, context }) => {
    const mod = await import("./mfa-policy.server");
    mod.assertMfaServiceConfigured();

    // 1. Caller must be an active Platform Administrator (checked as the user).
    const isAdmin = await mod.isActivePlatformAdmin(context.supabase as never, context.userId);
    if (!isAdmin) {
      mod.logMfaDiagnostic("admin-factor-reset", "not-platform-admin");
      throw new mod.MfaAssuranceError(
        "Only Platform Administrators can reset another user's factors.",
      );
    }
    // 2. Caller must have server-observed AAL2.
    mod.assertAal2(context.claims);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await mod.adminResetTargetFactors(supabaseAdmin as never, {
        actorUserId: context.userId,
        targetUserId: data.targetUserId,
      });
    } catch (error) {
      if (
        error instanceof mod.MfaAssuranceError ||
        error instanceof mod.MfaServiceUnavailableError
      ) {
        throw error;
      }
      mod.logMfaDiagnostic("admin-factor-reset", "unexpected-failure");
      throw new mod.MfaServiceUnavailableError();
    }
  });
