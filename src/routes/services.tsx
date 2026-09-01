import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { Button } from "@/components/ui/button";
import { getPageContent } from "@/lib/public-content.functions";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services — LearnFlow for homeschools, tutors and schools" },
      {
        name: "description",
        content:
          "Full-time homeschooling, part-time tuition and extracurricular programmes managed with curriculum-aligned records and reporting.",
      },
      { property: "og:title", content: "LearnFlow services" },
      {
        property: "og:description",
        content:
          "Full-time homeschooling, part-time tuition and extracurricular programme management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "services" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Services" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  component: ServicesPage,
});

function ServicesPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Services"
        title="Support for full-time, part-time and enrichment learning"
        intro="Every learner is placed on a curriculum pathway, and everything else — teaching, assessment, progress and reporting — follows from that placement."
      />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
      <section aria-labelledby="services-cta" className="mx-auto w-full max-w-3xl px-4 pb-16">
        <div className="rounded-lg border p-6">
          <h2 id="services-cta" className="text-lg font-semibold">
            Not sure which fits your family or school?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Book a consultation and we will talk through your situation before you commit to
            anything.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link to="/consultation">Book a consultation</Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
