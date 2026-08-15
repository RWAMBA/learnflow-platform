import { describe, expect, it } from "vitest";
import {
  canReplacePassword,
  detectRecoveryMarker,
  RECOVERY_CONSUMED_MESSAGE,
  RECOVERY_DENIED_MESSAGE,
  RECOVERY_EXPIRED_MESSAGE,
  resolveRecoveryPhase,
} from "./recovery-session";

const aal1 = { unavailable: false, hasVerifiedFactor: false, currentLevel: "aal1" as const };

describe("detectRecoveryMarker", () => {
  it("detects the implicit hash flow", () => {
    expect(detectRecoveryMarker({ hash: "#access_token=x&type=recovery" })).toEqual({
      present: true,
      errored: false,
    });
  });

  it("detects the PKCE query flow", () => {
    expect(detectRecoveryMarker({ search: "?code=abc" }).present).toBe(true);
    expect(detectRecoveryMarker({ search: "?token_hash=abc&type=recovery" }).present).toBe(true);
  });

  it("treats an error marker as an expired link, not an ordinary session", () => {
    const marker = detectRecoveryMarker({ hash: "#error=access_denied&error_code=otp_expired" });
    expect(marker).toEqual({ present: true, errored: true });
  });

  it("reports no marker for ordinary navigation", () => {
    expect(detectRecoveryMarker({ hash: "", search: "" })).toEqual({
      present: false,
      errored: false,
    });
  });
});

describe("resolveRecoveryPhase", () => {
  const base = {
    markerPresent: false,
    markerErrored: false,
    recoveryEventSeen: false,
    confirmationTimedOut: false,
    consumed: false,
  };

  it("denies an ordinary signed-in session with no recovery evidence", () => {
    expect(resolveRecoveryPhase(base)).toBe("denied");
  });

  it("stays pending while waiting for PASSWORD_RECOVERY", () => {
    expect(resolveRecoveryPhase({ ...base, markerPresent: true })).toBe("pending");
  });

  it("is ready once the PASSWORD_RECOVERY event is observed", () => {
    expect(resolveRecoveryPhase({ ...base, markerPresent: true, recoveryEventSeen: true })).toBe(
      "ready",
    );
  });

  it("expires an unconfirmed marker", () => {
    expect(resolveRecoveryPhase({ ...base, markerPresent: true, confirmationTimedOut: true })).toBe(
      "expired",
    );
  });

  it("expires an errored link", () => {
    expect(resolveRecoveryPhase({ ...base, markerPresent: true, markerErrored: true })).toBe(
      "expired",
    );
  });

  it("reports a consumed flow even after a successful event", () => {
    expect(
      resolveRecoveryPhase({
        ...base,
        markerPresent: true,
        recoveryEventSeen: true,
        consumed: true,
      }),
    ).toBe("consumed");
  });
});

describe("canReplacePassword", () => {
  it("refuses an ordinary session", () => {
    const gate = canReplacePassword({ phase: "denied", mfa: aal1 });
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.reason).toBe(RECOVERY_DENIED_MESSAGE);
  });

  it("refuses an expired recovery flow", () => {
    const gate = canReplacePassword({ phase: "expired", mfa: aal1 });
    expect(gate.allowed === false && gate.reason).toBe(RECOVERY_EXPIRED_MESSAGE);
  });

  it("refuses a consumed recovery flow", () => {
    const gate = canReplacePassword({ phase: "consumed", mfa: aal1 });
    expect(gate.allowed === false && gate.reason).toBe(RECOVERY_CONSUMED_MESSAGE);
  });

  it("refuses while the recovery flow is still pending", () => {
    expect(canReplacePassword({ phase: "pending", mfa: aal1 }).allowed).toBe(false);
  });

  it("allows a valid non-MFA recovery flow", () => {
    expect(canReplacePassword({ phase: "ready", mfa: aal1 }).allowed).toBe(true);
  });

  it("requires a challenge for an MFA account still at aal1", () => {
    const gate = canReplacePassword({
      phase: "ready",
      mfa: { unavailable: false, hasVerifiedFactor: true, currentLevel: "aal1" },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.requiresChallenge).toBe(true);
  });

  it("allows an MFA account that reached aal2", () => {
    expect(
      canReplacePassword({
        phase: "ready",
        mfa: { unavailable: false, hasVerifiedFactor: true, currentLevel: "aal2" },
      }).allowed,
    ).toBe(true);
  });

  it("fails closed when MFA status is unavailable", () => {
    expect(
      canReplacePassword({
        phase: "ready",
        mfa: { unavailable: true, hasVerifiedFactor: false, currentLevel: null },
      }).allowed,
    ).toBe(false);
  });
});
