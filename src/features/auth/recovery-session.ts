/**
 * SEC-006 (Gate 3) — pure recovery-session state logic.
 *
 * A Supabase password-recovery link produces an ordinary AAL1 session. The
 * session alone is therefore NOT evidence of a recovery flow: an already
 * signed-in user navigating to /reset-password has an identical session.
 * The only supported evidence available to the application is
 *   1. a recovery marker in the URL delivered by the link, and
 *   2. the `PASSWORD_RECOVERY` event emitted by `onAuthStateChange` when the
 *      Supabase client consumes that link.
 * Everything here fails closed.
 */

export type RecoveryPhase =
  | "pending" // marker present, waiting for the PASSWORD_RECOVERY event
  | "ready" // recovery flow verified
  | "denied" // ordinary session, no recovery evidence
  | "expired" // marker present but never confirmed, or link error
  | "consumed"; // password already replaced in this flow

/** How long we wait for the PASSWORD_RECOVERY event before failing closed. */
export const RECOVERY_CONFIRMATION_TIMEOUT_MS = 8000;

export const RECOVERY_DENIED_MESSAGE =
  "Open this page from the password-reset link in your email to choose a new password.";
export const RECOVERY_EXPIRED_MESSAGE =
  "This password-reset link is no longer valid. Request a new reset email and try again.";
export const RECOVERY_CONSUMED_MESSAGE =
  "This reset link has already been used. Sign in with your new password.";

/**
 * Detects the recovery marker Supabase places on the redirect URL, for both
 * the implicit hash flow (`#type=recovery`) and the PKCE query flow
 * (`?code=` / `?token_hash=&type=recovery`). Error markers are treated as
 * expired links, never as an ordinary session.
 */
export function detectRecoveryMarker(input: { hash?: string; search?: string }): {
  present: boolean;
  errored: boolean;
} {
  const hash = stripLeading(input.hash ?? "", "#");
  const search = stripLeading(input.search ?? "", "?");
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);

  const errored =
    hashParams.has("error") ||
    hashParams.has("error_code") ||
    searchParams.has("error") ||
    searchParams.has("error_code");

  const present =
    hashParams.get("type") === "recovery" ||
    searchParams.get("type") === "recovery" ||
    hashParams.has("access_token") ||
    searchParams.has("code") ||
    searchParams.has("token_hash");

  return { present: present || errored, errored };
}

export function resolveRecoveryPhase(input: {
  markerPresent: boolean;
  markerErrored: boolean;
  recoveryEventSeen: boolean;
  confirmationTimedOut: boolean;
  consumed: boolean;
}): RecoveryPhase {
  if (input.consumed) return "consumed";
  if (input.recoveryEventSeen) return "ready";
  if (input.markerErrored) return "expired";
  if (!input.markerPresent) return "denied";
  return input.confirmationTimedOut ? "expired" : "pending";
}

export type PasswordUpdateGate =
  { allowed: true } | { allowed: false; reason: string; requiresChallenge?: boolean };

/**
 * Final gate immediately before `updateUser`. Recovery validity is rechecked
 * first, then assurance: an MFA-enabled account must reach AAL2 inside the
 * recovery flow, otherwise the reset link alone would bypass mandatory MFA.
 */
export function canReplacePassword(input: {
  phase: RecoveryPhase;
  mfa: { unavailable: boolean; hasVerifiedFactor: boolean; currentLevel: "aal1" | "aal2" | null };
}): PasswordUpdateGate {
  if (input.phase !== "ready") {
    return {
      allowed: false,
      reason:
        input.phase === "consumed"
          ? RECOVERY_CONSUMED_MESSAGE
          : input.phase === "expired"
            ? RECOVERY_EXPIRED_MESSAGE
            : RECOVERY_DENIED_MESSAGE,
    };
  }
  if (input.mfa.unavailable) {
    return {
      allowed: false,
      reason:
        "Two-factor security verification is temporarily unavailable. Please try again later.",
    };
  }
  if (input.mfa.hasVerifiedFactor && input.mfa.currentLevel !== "aal2") {
    return {
      allowed: false,
      requiresChallenge: true,
      reason: "Verify a code from your authenticator app before setting a new password.",
    };
  }
  return { allowed: true };
}

function stripLeading(value: string, char: string): string {
  return value.startsWith(char) ? value.slice(1) : value;
}
