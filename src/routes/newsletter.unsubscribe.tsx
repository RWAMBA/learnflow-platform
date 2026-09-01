import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/newsletter/unsubscribe")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Unsubscribe from the LearnFlow newsletter" },
      {
        name: "description",
        content: "Stop receiving LearnFlow newsletter emails. Your withdrawal is recorded immediately.",
      },
      { property: "og:title", content: "Unsubscribe from LearnFlow updates" },
      { property: "og:description", content: "Stop receiving LearnFlow newsletter emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewsletterUnsubscribePage,
});

function NewsletterUnsubscribePage() {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<"working" | "withdrawn" | "failed">("working");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch("/api/public/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token ?? "" }),
    })
      .then((response) => setStatus(response.ok ? "withdrawn" : "failed"))
      .catch(() => setStatus("failed"));
  }, [token]);

  const copy = {
    working: "Processing your request…",
    withdrawn:
      "You have been unsubscribed. You will not receive further newsletter emails from LearnFlow.",
    failed: "We could not process that just now. Please try the link again shortly.",
  }[status];

  return (
    <PublicLayout>
      <PublicPageHeader eyebrow="Newsletter" title="Unsubscribe" />
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <p className="text-base" role="status" aria-live="polite">
          {copy}
        </p>
      </div>
    </PublicLayout>
  );
}
