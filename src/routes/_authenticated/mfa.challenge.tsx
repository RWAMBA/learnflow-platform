import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { MFA_UNAVAILABLE_MESSAGE, sanitizeRedirect } from "@/features/security/mfa";
import { readMfaStatus, verifyTotpCode } from "@/features/security/mfa-client";

type Search = { redirect?: string };

export const Route = createFileRoute("/_authenticated/mfa/challenge")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    redirect: sanitizeRedirect(search["redirect"]) ?? undefined,
  }),
  head: () => ({
    meta: [
      { title: "Verify it is you — the Platform" },
      {
        name: "description",
        content: "Enter the code from your authenticator app to finish signing in to the Platform.",
      },
      { property: "og:title", content: "Verify it is you — the Platform" },
      {
        property: "og:description",
        content: "Enter the code from your authenticator app to finish signing in to the Platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MfaChallengePage,
});

function MfaChallengePage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const otpRef = useRef<HTMLDivElement | null>(null);

  const destination = sanitizeRedirect(redirect) ?? "/dashboard";

  useEffect(() => {
    void (async () => {
      const status = await readMfaStatus();
      if (status.unavailable) {
        setError(MFA_UNAVAILABLE_MESSAGE);
        return;
      }
      if (status.currentLevel === "aal2") {
        void navigate({ to: destination, replace: true });
        return;
      }
      const factor = status.verifiedFactors[0];
      if (!factor) {
        void navigate({ to: "/account/mfa", replace: true });
        return;
      }
      setFactorId(factor.id);
      otpRef.current?.querySelector("input")?.focus();
    })();
  }, [destination, navigate]);

  const submit = async (value: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);
    const { ok, message } = await verifyTotpCode(factorId, value);
    if (!ok) {
      setBusy(false);
      setError(message);
      setAnnouncement(message ?? "That code was not accepted.");
      setCode("");
      otpRef.current?.querySelector("input")?.focus();
      return;
    }
    // Only navigate once the refreshed session actually reports aal2.
    const status = await readMfaStatus();
    setBusy(false);
    if (status.currentLevel !== "aal2") {
      setError(MFA_UNAVAILABLE_MESSAGE);
      return;
    }
    setAnnouncement("Verified. Taking you to your destination.");
    void navigate({ to: destination, replace: true });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify it is you</CardTitle>
          <CardDescription>
            Enter the current six-digit code from your authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p aria-live="assertive" role="status" className="sr-only">
            {announcement}
          </p>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Verification failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="challenge-code">Authentication code</Label>
            <div ref={otpRef}>
              <InputOTP
                id="challenge-code"
                maxLength={6}
                value={code}
                disabled={!factorId || busy}
                onChange={(next) => {
                  setCode(next);
                  if (next.length === 6) void submit(next);
                }}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!factorId || busy || code.length !== 6}
            onClick={() => void submit(code)}
          >
            Verify
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
