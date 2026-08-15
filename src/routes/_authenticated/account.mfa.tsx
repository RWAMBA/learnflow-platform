import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  canRemoveFactor,
  MFA_ENFORCEMENT_ENABLED,
  MFA_UNAVAILABLE_MESSAGE,
  type MfaStatus,
} from "@/features/security/mfa";
import {
  cleanupUnverifiedFactor,
  readMfaStatus,
  startTotpEnrollment,
  unenrollFactor,
  verifyTotpCode,
  type EnrollmentMaterial,
} from "@/features/security/mfa-client";
import { recordMfaEvent } from "@/lib/mfa-policy.functions";

export const Route = createFileRoute("/_authenticated/account/mfa")({
  head: () => ({
    meta: [
      { title: "Two-factor authentication — the Platform" },
      {
        name: "description",
        content:
          "Set up an authenticator app and manage two-factor security for your Platform account.",
      },
      { property: "og:title", content: "Two-factor authentication — the Platform" },
      {
        property: "og:description",
        content:
          "Set up an authenticator app and manage two-factor security for your Platform account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountMfaPage,
});

function AccountMfaPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [material, setMaterial] = useState<EnrollmentMaterial | null>(null);
  const [friendlyName, setFriendlyName] = useState("Authenticator app");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [removalCode, setRemovalCode] = useState("");
  const otpRef = useRef<HTMLDivElement | null>(null);
  const removalOtpRef = useRef<HTMLDivElement | null>(null);
  const logEvent = useServerFn(recordMfaEvent);

  const refresh = useCallback(async () => {
    const next = await readMfaStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enrollment material is display-only: drop it as soon as the page unmounts.
  useEffect(() => () => setMaterial(null), []);

  const record = useCallback(
    (
      event: "mfa_enroll_started" | "mfa_factor_verified" | "mfa_challenge_failed" | "mfa_unenroll",
      outcome?: string,
    ) => {
      void logEvent({ data: { event, outcome } }).catch(() => {
        // Audit is best-effort from the browser; the server owns the record.
      });
    },
    [logEvent],
  );

  const beginEnrollment = async () => {
    setBusy(true);
    setError(null);
    const name = friendlyName.trim() || "Authenticator app";
    const { material: next, message } = await startTotpEnrollment(name);
    setBusy(false);
    if (!next) {
      setError(message ?? MFA_UNAVAILABLE_MESSAGE);
      setAnnouncement("Could not start setup.");
      return;
    }
    setMaterial(next);
    setCode("");
    record("mfa_enroll_started");
    setAnnouncement("Scan the QR code, then enter the six-digit code.");
    window.setTimeout(() => otpRef.current?.querySelector("input")?.focus(), 50);
  };

  const cancelEnrollment = async () => {
    if (!material) return;
    const factorId = material.factorId;
    setMaterial(null);
    setCode("");
    await cleanupUnverifiedFactor(factorId);
    await refresh();
    setAnnouncement("Setup cancelled.");
  };

  const submitCode = async (value: string) => {
    if (!material || busy) return;
    setBusy(true);
    setError(null);
    const { ok, message } = await verifyTotpCode(material.factorId, value);
    setBusy(false);
    if (!ok) {
      record("mfa_challenge_failed", "verify");
      setError(message);
      setAnnouncement(message ?? "That code was not accepted.");
      setCode("");
      otpRef.current?.querySelector("input")?.focus();
      return;
    }
    record("mfa_factor_verified");
    setMaterial(null);
    setCode("");
    await refresh();
    setAnnouncement("Two-factor authentication is now on.");
    toast.success("Two-factor authentication is on.");
  };

  // SEC-006 Gate 4: this is a UX guard, not a security boundary. Supabase's
  // own AAL2 requirement on `unenroll` is the authoritative control, and a
  // user can always call the SDK directly. What must hold is that a mandatory
  // principal without a verified factor keeps no privileged access once
  // enforcement is enabled (the guard then allows enrollment routes only).
  const beginRemoval = (factorId: string) => {
    if (!status) return;
    const decision = canRemoveFactor({
      mandatory: MFA_ENFORCEMENT_ENABLED,
      verifiedFactorCount: status.verifiedFactors.length,
      currentLevel: "aal2",
    });
    if (!decision.allowed) {
      setError(decision.reason ?? MFA_UNAVAILABLE_MESSAGE);
      setAnnouncement(decision.reason ?? "");
      return;
    }
    setError(null);
    setRemovalCode("");
    setPendingRemovalId(factorId);
    setAnnouncement("Enter a fresh code from your authenticator app to confirm removal.");
    window.setTimeout(() => removalOtpRef.current?.querySelector("input")?.focus(), 50);
  };

  const confirmRemoval = async (factorId: string, value: string) => {
    if (!status) return;
    setBusy(true);
    setError(null);
    // Fresh challenge, then an immediate AAL re-read: a stale page must not act.
    const challenge = await verifyTotpCode(factorId, value);
    if (!challenge.ok) {
      setBusy(false);
      setRemovalCode("");
      record("mfa_challenge_failed", "remove");
      setError(challenge.message);
      setAnnouncement(challenge.message ?? "That code was not accepted.");
      removalOtpRef.current?.querySelector("input")?.focus();
      return;
    }
    const fresh = await readMfaStatus();
    if (fresh.unavailable || fresh.currentLevel !== "aal2") {
      setBusy(false);
      setStatus(fresh);
      setError("Verify a fresh code from your authenticator app before removing a factor.");
      return;
    }
    const decision = canRemoveFactor({
      mandatory: MFA_ENFORCEMENT_ENABLED,
      verifiedFactorCount: fresh.verifiedFactors.length,
      currentLevel: fresh.currentLevel,
    });
    if (!decision.allowed) {
      setBusy(false);
      setStatus(fresh);
      setPendingRemovalId(null);
      setError(decision.reason ?? MFA_UNAVAILABLE_MESSAGE);
      return;
    }
    const { ok, message } = await unenrollFactor(factorId);
    setBusy(false);
    if (!ok) {
      setError(message ?? MFA_UNAVAILABLE_MESSAGE);
      return;
    }
    record("mfa_unenroll");
    // Drop cached factor/AAL state before re-reading it from the provider.
    setPendingRemovalId(null);
    setRemovalCode("");
    setStatus(null);
    await refresh();
    setAnnouncement("Authenticator removed.");
    toast.success("Authenticator removed.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Two-factor authentication"
        description="Add an authenticator app so a stolen password alone cannot reach your account."
      />
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {status?.unavailable ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>Two-factor status unavailable</AlertTitle>
          <AlertDescription>{MFA_UNAVAILABLE_MESSAGE}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>We could not complete that</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Authenticator app
            {status && !status.unavailable ? (
              <Badge variant={status.hasVerifiedFactor ? "default" : "secondary"}>
                {status.hasVerifiedFactor ? (
                  <>
                    <ShieldCheck className="mr-1 size-3" aria-hidden /> On
                  </>
                ) : (
                  <>
                    <ShieldAlert className="mr-1 size-3" aria-hidden /> Off
                  </>
                )}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Use any TOTP app (for example Google Authenticator, 1Password or Aegis). Codes change
            every 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {status?.verifiedFactors.length ? (
            <ul className="space-y-3">
              {status.verifiedFactors.map((factor) => (
                <li key={factor.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {factor.friendlyName ?? "Authenticator app"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => beginRemoval(factor.id)}
                    >
                      Remove
                    </Button>
                  </div>
                  {pendingRemovalId === factor.id ? (
                    <div className="space-y-2">
                      <Label htmlFor={`remove-code-${factor.id}`}>
                        Confirm with a fresh authentication code
                      </Label>
                      <div ref={removalOtpRef}>
                        <InputOTP
                          id={`remove-code-${factor.id}`}
                          maxLength={6}
                          value={removalCode}
                          disabled={busy}
                          onChange={(next) => {
                            setRemovalCode(next);
                            if (next.length === 6) void confirmRemoval(factor.id, next);
                          }}
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => {
                          setPendingRemovalId(null);
                          setRemovalCode("");
                        }}
                      >
                        Cancel removal
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {material ? (
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <img
                  src={`data:image/svg+xml;utf-8,${encodeURIComponent(material.qrCodeSvg)}`}
                  alt="QR code for setting up your authenticator app. If you cannot scan it, use the setup key shown below."
                  className="mx-auto h-40 w-40"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mfa-secret">Setup key (if you cannot scan)</Label>
                <Input
                  id="mfa-secret"
                  readOnly
                  value={material.secret}
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Six-digit code from your app</Label>
                <div ref={otpRef}>
                  <InputOTP
                    id="mfa-code"
                    maxLength={6}
                    value={code}
                    onChange={(next) => {
                      setCode(next);
                      if (next.length === 6) void submitCode(next);
                    }}
                    aria-describedby="mfa-code-hint"
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p id="mfa-code-hint" className="text-sm text-muted-foreground">
                  Enter the code currently shown in your authenticator app. It is checked as soon as
                  all six digits are entered.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || code.length !== 6} onClick={() => void submitCode(code)}>
                  Verify and turn on
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void cancelEnrollment()}>
                  Cancel setup
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="mfa-name">Name this authenticator</Label>
                <Input
                  id="mfa-name"
                  value={friendlyName}
                  maxLength={60}
                  onChange={(event) => setFriendlyName(event.target.value)}
                />
              </div>
              <Button disabled={busy || status?.unavailable} onClick={() => void beginEnrollment()}>
                {status?.hasVerifiedFactor
                  ? "Add another authenticator"
                  : "Set up authenticator app"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
