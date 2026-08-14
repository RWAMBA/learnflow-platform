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
import { deriveMfaStatus, UNAVAILABLE_STATUS, type MfaStatus } from "./mfa";

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