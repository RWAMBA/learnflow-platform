import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { newPasswordSchema, type NewPasswordValues } from "@/features/auth/schemas";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";
import {
  canReplacePassword,
  detectRecoveryMarker,
  RECOVERY_CONFIRMATION_TIMEOUT_MS,
  RECOVERY_CONSUMED_MESSAGE,
  RECOVERY_DENIED_MESSAGE,
  RECOVERY_EXPIRED_MESSAGE,
  resolveRecoveryPhase,
  type RecoveryPhase,
} from "@/features/auth/recovery-session";
import { MFA_UNAVAILABLE_MESSAGE, type MfaStatus } from "@/features/security/mfa";
import { readMfaStatus, verifyTotpCode } from "@/features/security/mfa-client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — the Platform" },
      { name: "description", content: "Choose a new password for your Platform account." },
      { property: "og:title", content: "Set a new password — the Platform" },
      { property: "og:description", content: "Choose a new password for your Platform account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  // SEC-006 Gate 3: an ordinary authenticated session is NOT a recovery
  // session. Password replacement is unlocked only by the PASSWORD_RECOVERY
  // event raised for a valid reset link, and an MFA-enabled account must
  // additionally reach AAL2 (a recovery session is AAL1 by itself).
  const [marker] = useState(() =>
    detectRecoveryMarker({
      hash: typeof window === "undefined" ? "" : window.location.hash,
      search: typeof window === "undefined" ? "" : window.location.search,
    }),
  );
  const [recoveryEventSeen, setRecoveryEventSeen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const otpRef = useRef<HTMLDivElement | null>(null);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });
  const passwordValue = form.watch("password");

  const phase: RecoveryPhase = resolveRecoveryPhase({
    markerPresent: marker.present,
    markerErrored: marker.errored,
    recoveryEventSeen,
    confirmationTimedOut: timedOut,
    consumed,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryEventSeen(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!marker.present || marker.errored) return;
    const timer = window.setTimeout(() => setTimedOut(true), RECOVERY_CONFIRMATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [marker]);

  useEffect(() => {
    if (phase !== "ready") return;
    void readMfaStatus().then(setStatus);
  }, [phase]);

  const stepUpRequired =
    phase === "ready" &&
    status !== null &&
    !status.unavailable &&
    status.hasVerifiedFactor &&
    status.currentLevel !== "aal2";

  const submitCode = async (value: string) => {
    const factor = status?.verifiedFactors[0];
    if (!factor || busy) return;
    setBusy(true);
    setChallengeError(null);
    const { ok, message } = await verifyTotpCode(factor.id, value);
    if (!ok) {
      setBusy(false);
      setCode("");
      setChallengeError(message);
      otpRef.current?.querySelector("input")?.focus();
      return;
    }
    const next = await readMfaStatus();
    setBusy(false);
    setStatus(next);
    if (next.currentLevel !== "aal2") setChallengeError(MFA_UNAVAILABLE_MESSAGE);
  };

  const onSubmit = async (values: NewPasswordValues) => {
    // Recheck recovery validity AND assurance immediately before the update.
    const fresh = await readMfaStatus();
    setStatus(fresh);
    const gate = canReplacePassword({
      phase: resolveRecoveryPhase({
        markerPresent: marker.present,
        markerErrored: marker.errored,
        recoveryEventSeen,
        confirmationTimedOut: timedOut,
        consumed,
      }),
      mfa: fresh,
    });
    if (!gate.allowed) {
      toast.error(gate.reason);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast.error(error.message);
      return;
    }
    // Burn the recovery state and drop the AAL1 recovery session, rather than
    // walking straight into an authenticated privileged page.
    setConsumed(true);
    form.reset({ password: "", confirmPassword: "" });
    await supabase.auth.signOut();
    toast.success("Password updated. Sign in with your new password.");
    await navigate({ to: "/auth" });
  };

  const blockedMessage =
    phase === "denied"
      ? RECOVERY_DENIED_MESSAGE
      : phase === "expired"
        ? RECOVERY_EXPIRED_MESSAGE
        : phase === "consumed"
          ? RECOVERY_CONSUMED_MESSAGE
          : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Open this page from the reset link in your email, then choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blockedMessage ? (
            <div className="space-y-4">
              <Alert variant="destructive" role="alert">
                <AlertTriangle className="size-4" aria-hidden />
                <AlertTitle>Password reset unavailable</AlertTitle>
                <AlertDescription>{blockedMessage}</AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => void navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          ) : phase === "pending" ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Checking your reset link…
            </p>
          ) : stepUpRequired ? (
            <div className="space-y-4">
              {challengeError ? (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertTitle>Verification failed</AlertTitle>
                  <AlertDescription>{challengeError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="recovery-code">Authentication code</Label>
                <div ref={otpRef}>
                  <InputOTP
                    id="recovery-code"
                    maxLength={6}
                    value={code}
                    disabled={busy}
                    onChange={(next) => {
                      setCode(next);
                      if (next.length === 6) void submitCode(next);
                    }}
                    aria-describedby="recovery-code-hint"
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p id="recovery-code-hint" className="text-sm text-muted-foreground">
                  This account uses two-factor authentication. Enter the current code from your
                  authenticator app before choosing a new password.
                </p>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <PasswordStrengthMeter value={passwordValue ?? ""} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm new password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  Update password
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
