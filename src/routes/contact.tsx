import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import {
  FormField,
  Honeypot,
  SubmissionStatus,
  SubmitButton,
  SuccessPanel,
  usePublicSubmission,
} from "@/components/public/public-form";
import { Turnstile } from "@/components/public/turnstile";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact LearnFlow — Ask us anything" },
      {
        name: "description",
        content:
          "Send LearnFlow a message about homeschooling, tutoring, school administration or your account. We reply by email.",
      },
      { property: "og:title", content: "Contact LearnFlow" },
      { property: "og:description", content: "Send us a message and we will reply by email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const renderedAt = useMemo(() => Date.now(), []);
  const { state, submit } = usePublicSubmission<{ reference?: string }>("/api/public/inquiries");
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const fieldErrors = state.kind === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Contact"
        title="Get in touch"
        intro="Tell us what you need and we will reply by email. Please do not include sensitive personal details in this form."
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        {state.kind === "success" ? (
          <SuccessPanel
            title="Message sent"
            description="Thank you — we have received your message and will reply by email."
            reference={state.reference}
          />
        ) : (
          <form
            className="relative space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit({
                type: "contact",
                payload: {
                  fullName: form.fullName,
                  email: form.email,
                  phone: form.phone ? form.phone : null,
                  subject: form.subject,
                  message: form.message,
                  turnstileToken: token ?? "",
                  website: honeypot,
                  renderedAt,
                },
              });
            }}
          >
            <Honeypot value={honeypot} onChange={setHoneypot} />

            <FormField id="contact-name" label="Your name" required error={fieldErrors["fullName"]}>
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              )}
            </FormField>

            <FormField
              id="contact-email"
              label="Email address"
              required
              error={fieldErrors["email"]}
            >
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
              id="contact-phone"
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

            <FormField id="contact-subject" label="Subject" required error={fieldErrors["subject"]}>
              {(props) => (
                <Input
                  {...props}
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              )}
            </FormField>

            <FormField id="contact-message" label="Message" required error={fieldErrors["message"]}>
              {(props) => (
                <Textarea
                  {...props}
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              )}
            </FormField>

            <Turnstile onToken={setToken} />
            <SubmissionStatus state={state} />
            <SubmitButton state={state} disabled={!token}>
              Send message
            </SubmitButton>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
