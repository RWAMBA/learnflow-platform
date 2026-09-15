/**
 * Double opt-in newsletter signup.
 *
 * The response is deliberately uniform: subscribing an address that already
 * exists looks exactly like subscribing a new one, so the form cannot be used
 * to discover who is on the list.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  FormField,
  Honeypot,
  SubmissionStatus,
  SubmitButton,
  usePublicSubmission,
} from "./public-form";
import { Turnstile } from "./turnstile";

export function NewsletterSignup() {
  const renderedAt = useMemo(() => Date.now(), []);
  const { state, submit } = usePublicSubmission<{ reference?: string }>(
    "/api/public/newsletter/subscribe",
  );
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const fieldErrors = state.kind === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.kind === "success") {
    return (
      <p className="text-sm" role="status">
        If that address can receive our updates, a confirmation email is on its way. Please click
        the link in it to complete your subscription.
      </p>
    );
  }

  return (
    <form
      className="relative space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          email,
          consent: consent as true,
          turnstileToken: token ?? "",
          website: honeypot,
          renderedAt,
        });
      }}
    >
      <Honeypot value={honeypot} onChange={setHoneypot} />

      <FormField id="newsletter-email" label="Email address" required error={fieldErrors["email"]}>
        {(props) => (
          <Input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox
          id="newsletter-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
        />
        <Label htmlFor="newsletter-consent" className="text-sm font-normal leading-snug">
          I agree to receive LearnFlow updates by email and understand I can unsubscribe at any
          time.
        </Label>
      </div>

      <Turnstile onToken={setToken} />
      <SubmissionStatus state={state} />
      <SubmitButton state={state} disabled={!token || !consent}>
        Subscribe
      </SubmitButton>
    </form>
  );
}
