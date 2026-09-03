import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { SectionEmpty, SectionError, StaleNotice } from "@/components/public/cms-blocks";
import { SafeMarkdown } from "@/components/public/safe-markdown";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { listFaqs } from "@/lib/public-content.functions";

export const Route = createFileRoute("/faqs")({
  head: () => ({
    meta: [
      { title: "FAQs — Common questions about LearnFlow" },
      {
        name: "description",
        content:
          "Answers to common questions about curricula, learner records, roles, pricing and getting started with LearnFlow.",
      },
      { property: "og:title", content: "LearnFlow FAQs" },
      { property: "og:description", content: "Answers to common questions about using LearnFlow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => listFaqs(),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Frequently asked questions" />
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <SectionError />
      </div>
    </PublicLayout>
  ),
  component: FaqsPage,
});

function FaqsPage() {
  const { faqs, fetchedAt } = Route.useLoaderData();

  // JSON-LD is produced from a serialized object, never from a template
  // string, so no answer text can break out of the script context.
  const jsonLd =
    faqs.length > 0
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.slice(0, 50).map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer_markdown },
          })),
        }).replace(/</g, "\\u003c")
      : null;

  return (
    <PublicLayout>
      {jsonLd ? <script type="application/ld+json">{jsonLd}</script> : null}
      <PublicPageHeader
        eyebrow="FAQs"
        title="Frequently asked questions"
        intro="If your question is not answered here, contact us and we will reply directly."
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        {faqs.length === 0 ? (
          <SectionEmpty
            title="No questions published yet"
            description="We publish answers as questions come in. In the meantime, please use the contact form."
          />
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="min-h-11 text-left">{faq.question}</AccordionTrigger>
                <AccordionContent>
                  <SafeMarkdown source={faq.answer_markdown} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        <StaleNotice fetchedAt={fetchedAt} />
      </div>
    </PublicLayout>
  );
}
