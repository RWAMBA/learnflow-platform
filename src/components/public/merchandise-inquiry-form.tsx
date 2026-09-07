/**
 * Merchandise enquiry form.
 *
 * There is no cart and no checkout in Stage 3: this sends an enquiry and
 * waits for a committed server result before showing success.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormField,
  Honeypot,
  SubmissionStatus,
  SubmitButton,
  SuccessPanel,
  usePublicSubmission,
} from "./public-form";
import { Turnstile } from "./turnstile";

export function MerchandiseInquiryForm({ itemId, itemName }: { itemId: string; itemName: string }) {
  const renderedAt = useMemo(() => Date.now(), []);
  const { state, submit } = usePublicSubmission<{ reference?: string }>("/api/public/inquiries");
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    quantity: "1",
    message: "",
  });

  const fieldErrors = state.kind === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.kind === "success") {
    return (
      <SuccessPanel
        title="Enquiry sent"
        description={`We have received your enquiry about ${itemName} and will reply by email.`}
        reference={state.reference}
      />
    );
  }

  return (
    <form
      className="relative space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit({
          type: "merchandise",
          payload: {
            fullName: form.fullName,
            email: form.email,
            phone: form.phone ? form.phone : null,
            merchandiseId: itemId,
            quantity: Number(form.quantity) || 1,
            message: form.message,
            turnstileToken: token ?? "",
            website: honeypot,
            renderedAt,
          },
        });
      }}
    >
      <Honeypot value={honeypot} onChange={setHoneypot} />

      <FormField id="merch-name" label="Your name" required error={fieldErrors["fullName"]}>
        {(props) => (
          <Input
            {...props}
            value={form.fullName}
            autoComplete="name"
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
        )}
      </FormField>

      <FormField id="merch-email" label="Email address" required error={fieldErrors["email"]}>
        {(props) => (
          <Input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        )}
      </FormField>

      <FormField
        id="merch-phone"
        label="Phone number"
        hint="Optional. Include the country code, for example +254712345678."
        error={fieldErrors["phone"]}
      >
        {(props) => (
          <Input
            {...props}
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        )}
      </FormField>

      <FormField id="merch-qty" label="Quantity" required error={fieldErrors["quantity"]}>
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            max={500}
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        )}
      </FormField>

      <FormField id="merch-message" label="Message" required error={fieldErrors["message"]}>
        {(props) => (
          <Textarea
            {...props}
            rows={5}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
        )}
      </FormField>

      <Turnstile onToken={setToken} />
      <SubmissionStatus state={state} />
      <SubmitButton state={state} disabled={!token}>
        Send enquiry
      </SubmitButton>
    </form>
  );
}
