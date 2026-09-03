import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/newsletter/confirm")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Confirm your LearnFlow newsletter subscription" },
      {
        name: "description",
        content: "Complete your double opt-in and start receiving LearnFlow updates by email.",
      },
      { property: "og:title", content: "Confirm your newsletter subscription" },
      { property: "og:description", content: "Complete your LearnFlow newsletter opt-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewsletterConfirmPage,
});

function NewsletterConfirmPage() {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<"working" | "confirmed" | "invalid" | "failed">("working");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      setStatus("invalid");
      return;
    }
    void fetch("/api/public/newsletter/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const body = (await response.json()) as { outcome?: string };
        setStatus(body.outcome === "confirmed" ? "confirmed" : "invalid");
      })
      .catch(() => setStatus("failed"));
  }, [token]);

  const copy = {
    working: "Confirming your subscription…",
    confirmed: "You are subscribed. Thank you — you can unsubscribe from any email we send.",
    invalid: "This confirmation link is no longer valid. Please subscribe again to get a new link.",
    failed: "We could not confirm your subscription just now. Please try the link again shortly.",
  }[status];

  return (
    <PublicLayout>
      <PublicPageHeader eyebrow="Newsletter" title="Confirm your subscription" />
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <p className="text-base" role="status" aria-live="polite">
          {copy}
        </p>
      </div>
    </PublicLayout>
  );
}
