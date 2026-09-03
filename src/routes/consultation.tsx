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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/consultation")({
  head: () => ({
    meta: [
      { title: "Book a consultation — LearnFlow" },
      {
        name: "description",
        content:
          "Request a consultation about full-time homeschooling or part-time tuition. Tell us about your learners and we will get back to you.",
      },
      { property: "og:title", content: "Book a LearnFlow consultation" },
      {
        property: "og:description",
        content: "Request a consultation about full-time homeschooling or part-time tuition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsultationPage,
});

function ConsultationPage() {
  const renderedAt = useMemo(() => Date.now(), []);
  const { state, submit } = usePublicSubmission<{ reference?: string }>("/api/public/inquiries");
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    learnerCount: "1",
    preferredContact: "email" as "email" | "phone",
    interest: "undecided" as "full_time" | "part_time" | "undecided",
    message: "",
  });
  const fieldErrors = state.kind === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Consultation"
        title="Book a consultation"
        intro="A short conversation before you commit to anything. Tell us who is learning and what you are trying to achieve."
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        {state.kind === "success" ? (
          <SuccessPanel
            title="Consultation request received"
            description="We have your request and will contact you using the method you chose."
            reference={state.reference}
          />
        ) : (
          <form
            className="relative space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit({
                type: "consultation",
                payload: {
                  fullName: form.fullName,
                  email: form.email,
                  phone: form.phone,
                  learnerCount: Number(form.learnerCount) || 1,
                  preferredContact: form.preferredContact,
                  interest: form.interest,
                  message: form.message,
                  turnstileToken: token ?? "",
                  website: honeypot,
                  renderedAt,
                },
              });
            }}
          >
            <Honeypot value={honeypot} onChange={setHoneypot} />

            <FormField id="cons-name" label="Your name" required error={fieldErrors["fullName"]}>
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              )}
            </FormField>

            <FormField id="cons-email" label="Email address" required error={fieldErrors["email"]}>
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
              id="cons-phone"
              label="Phone number"
              required
              hint="Include the country code, for example +254712345678."
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

            <FormField
              id="cons-learners"
              label="How many learners?"
              required
              error={fieldErrors["learnerCount"]}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  max={20}
                  value={form.learnerCount}
                  onChange={(e) => setForm((f) => ({ ...f, learnerCount: e.target.value }))}
                />
              )}
            </FormField>

            <div className="space-y-2">
              <Label htmlFor="cons-interest">What are you interested in?</Label>
              <Select
                value={form.interest}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, interest: v as typeof form.interest }))
                }
              >
                <SelectTrigger id="cons-interest" className="min-h-11">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time homeschooling</SelectItem>
                  <SelectItem value="part_time">Part-time tuition</SelectItem>
                  <SelectItem value="undecided">Still deciding</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">How should we contact you?</legend>
              <RadioGroup
                value={form.preferredContact}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, preferredContact: v as typeof form.preferredContact }))
                }
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="email" id="contact-by-email" />
                  <Label htmlFor="contact-by-email">Email</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="phone" id="contact-by-phone" />
                  <Label htmlFor="contact-by-phone">Phone</Label>
                </div>
              </RadioGroup>
            </fieldset>

            <FormField
              id="cons-message"
              label="Tell us more"
              required
              error={fieldErrors["message"]}
            >
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
              Request consultation
            </SubmitButton>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
