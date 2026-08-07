import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { changePasswordSchema, type ChangePasswordValues } from "@/features/auth/schemas";
import { PasswordStrengthMeter } from "@/features/auth/components/password-strength-meter";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({
    meta: [
      { title: "Account security — the Platform" },
      { name: "description", content: "Change your password and keep your Platform account secure." },
      { property: "og:title", content: "Account security — the Platform" },
      {
        property: "og:description",
        content: "Change your password and keep your Platform account secure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountSecurityPage,
});

function AccountSecurityPage() {
  const [formError, setFormError] = useState<{ title: string; description: string } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });
  const passwordValue = form.watch("password");

  useEffect(() => {
    if (cooldownUntil === null) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setCooldownUntil(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const locked = secondsLeft > 0;

  const onSubmit = async (values: ChangePasswordValues) => {
    if (locked) return;
    setFormError(null);
    setSessionExpired(false);

    const { data, error: userError } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (userError || !email) {
      setSessionExpired(true);
      setFormError({
        title: "Your session is no longer valid",
        description:
          "For your security we could not confirm who you are. Sign in again, then change your password.",
      });
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: values.currentPassword,
    });
    if (verifyError) {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      form.setError("currentPassword", { message: "That current password is incorrect" });
      form.setFocus("currentPassword");

      if (attempts >= ATTEMPTS_BEFORE_COOLDOWN) {
        const step = Math.min(attempts - ATTEMPTS_BEFORE_COOLDOWN, COOLDOWN_STEPS.length - 1);
        const wait = COOLDOWN_STEPS[step]!;
        setCooldownUntil(Date.now() + wait * 1000);
        setFormError({
          title: `Too many incorrect attempts (${attempts})`,
          description: `For your security, changing your password is paused for ${formatWait(wait)}. If you cannot recall your current password, sign out and use the "Forgot your password?" reset link instead.`,
        });
        return;
      }

      const remaining = ATTEMPTS_BEFORE_COOLDOWN - attempts;
      setFormError({
        title: "Current password is incorrect",
        description: `Re-enter the password you use to sign in today. ${remaining} more incorrect ${remaining === 1 ? "attempt" : "attempts"} will pause this form for a short while.`,
      });
      return;
    }

    setFailedAttempts(0);
    setCooldownUntil(null);

    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      const expired = /jwt|session|token|not authenticated/i.test(error.message);
      setSessionExpired(expired);
      setFormError({
        title: expired ? "Your session expired before we could save" : "We could not update your password",
        description: expired
          ? "Sign in again and retry the change — nothing was saved."
          : error.message,
      });
      return;
    }
    toast.success("Password updated.");
    setFormError(null);
    setSessionExpired(false);
    setFailedAttempts(0);
    form.reset({ currentPassword: "", password: "", confirmPassword: "" });
  };

  const handleReauthenticate = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account security"
        description="Update the password you use to sign in to the Platform."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Your new password must meet the full policy before you can save it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {formError ? (
                <Alert variant="destructive" role="alert" aria-live="assertive">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertTitle>{formError.title}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{formError.description}</p>
                    {sessionExpired ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => void handleReauthenticate()}>
                        Sign in again
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    <FormDescription>Avoid passwords you have used elsewhere.</FormDescription>
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}