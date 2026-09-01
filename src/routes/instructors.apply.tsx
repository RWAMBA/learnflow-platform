import { useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UPLOAD_LIMITS } from "@/lib/public-site.constants";

const ACCEPTED = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
} as const;

interface UploadedDoc {
  name: string;
  path: string;
}

export const Route = createFileRoute("/instructors/apply")({
  head: () => ({
    meta: [
      { title: "Teach with LearnFlow — Instructor application" },
      {
        name: "description",
        content:
          "Apply to teach or tutor with LearnFlow. Share your subjects, experience and qualifications, and attach supporting documents securely.",
      },
      { property: "og:title", content: "Teach with LearnFlow" },
      {
        property: "og:description",
        content: "Apply to join LearnFlow as a teacher or tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstructorApplyPage,
});

function InstructorApplyPage() {
  const renderedAt = useMemo(() => Date.now(), []);
  const { state, submit } = usePublicSubmission<{ reference?: string }>("/api/public/inquiries");
  const [token, setToken] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    subjects: "",
    yearsExperience: "0",
    qualificationsSummary: "",
    portfolioUrl: "",
    message: "",
  });
  const fieldErrors = state.kind === "error" ? (state.fieldErrors ?? {}) : {};

  async function handleFile(file: File) {
    setUploadError(null);
    if (!(file.type in ACCEPTED)) {
      setUploadError("Only PDF and DOCX documents are accepted.");
      return;
    }
    if (file.size > UPLOAD_LIMITS.maxFileBytes) {
      setUploadError("That file is larger than 5 MB.");
      return;
    }
    if (docs.length >= UPLOAD_LIMITS.maxFiles) {
      setUploadError(`You can attach up to ${UPLOAD_LIMITS.maxFiles} documents.`);
      return;
    }
    if (!token) {
      setUploadError("Complete the verification check before attaching documents.");
      return;
    }

    setUploading(true);
    try {
      const ticketResponse = await fetch("/api/public/upload-ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          turnstileToken: token,
        }),
      });
      if (!ticketResponse.ok) throw new Error("ticket");
      const ticket = (await ticketResponse.json()) as { signedUrl: string; path: string };

      const upload = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("upload");

      setDocs((current) => [...current, { name: file.name, path: ticket.path }]);
    } catch {
      setUploadError("That document could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Teach with us"
        title="Instructor application"
        intro="Tell us what you teach and how you teach it. Documents you attach are stored privately and are visible only to our admissions team."
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        {state.kind === "success" ? (
          <SuccessPanel
            title="Application received"
            description="Thank you for applying. We review every application and will be in touch by email."
            reference={state.reference}
          />
        ) : (
          <form
            className="relative space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit({
                type: "instructor_application",
                payload: {
                  fullName: form.fullName,
                  email: form.email,
                  phone: form.phone,
                  subjects: form.subjects
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  yearsExperience: Number(form.yearsExperience) || 0,
                  qualificationsSummary: form.qualificationsSummary,
                  portfolioUrl: form.portfolioUrl ? form.portfolioUrl : null,
                  message: form.message,
                  documentPaths: docs.map((d) => d.path),
                  turnstileToken: token ?? "",
                  website: honeypot,
                  renderedAt,
                },
              });
            }}
          >
            <Honeypot value={honeypot} onChange={setHoneypot} />

            <FormField id="apply-name" label="Full name" required error={fieldErrors["fullName"]}>
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              )}
            </FormField>

            <FormField id="apply-email" label="Email address" required error={fieldErrors["email"]}>
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
              id="apply-phone"
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
              id="apply-subjects"
              label="Subjects you teach"
              required
              hint="Separate subjects with commas, for example Mathematics, Physics."
              error={fieldErrors["subjects"]}
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.subjects}
                  onChange={(e) => setForm((f) => ({ ...f, subjects: e.target.value }))}
                />
              )}
            </FormField>

            <FormField
              id="apply-years"
              label="Years of teaching experience"
              required
              error={fieldErrors["yearsExperience"]}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  max={60}
                  value={form.yearsExperience}
                  onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
                />
              )}
            </FormField>

            <FormField
              id="apply-quals"
              label="Qualifications summary"
              required
              error={fieldErrors["qualificationsSummary"]}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={5}
                  value={form.qualificationsSummary}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, qualificationsSummary: e.target.value }))
                  }
                />
              )}
            </FormField>

            <FormField
              id="apply-portfolio"
              label="Portfolio or profile link"
              hint="Optional. Must start with https://"
              error={fieldErrors["portfolioUrl"]}
            >
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  inputMode="url"
                  value={form.portfolioUrl}
                  onChange={(e) => setForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
                />
              )}
            </FormField>

            <FormField
              id="apply-message"
              label="Why LearnFlow?"
              required
              error={fieldErrors["message"]}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              )}
            </FormField>

            <div className="space-y-2">
              <Label htmlFor="apply-doc">
                Supporting documents (optional, up to {UPLOAD_LIMITS.maxFiles})
              </Label>
              <input
                ref={fileInput}
                id="apply-doc"
                type="file"
                accept={Object.values(ACCEPTED).join(",")}
                className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-input file:bg-background file:px-4 file:text-sm"
                disabled={uploading || docs.length >= UPLOAD_LIMITS.maxFiles}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <p className="text-sm text-muted-foreground">
                PDF or DOCX, up to 5 MB each. Stored privately, never published.
              </p>
              {uploading ? (
                <p className="text-sm" role="status">
                  Uploading…
                </p>
              ) : null}
              {uploadError ? (
                <p className="text-sm text-destructive" role="alert">
                  {uploadError}
                </p>
              ) : null}
              {docs.length > 0 ? (
                <ul className="space-y-2">
                  {docs.map((doc) => (
                    <li
                      key={doc.path}
                      className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                    >
                      <span className="truncate">{doc.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11"
                        onClick={() => setDocs((c) => c.filter((d) => d.path !== doc.path))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <Turnstile onToken={setToken} />
            <SubmissionStatus state={state} />
            <SubmitButton state={state} disabled={!token || uploading}>
              Submit application
            </SubmitButton>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
