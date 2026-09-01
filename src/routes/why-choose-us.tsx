import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { getPageContent } from "@/lib/public-content.functions";

export const Route = createFileRoute("/why-choose-us")({
  head: () => ({
    meta: [
      { title: "Why choose LearnFlow — One system for teaching and admin" },
      {
        name: "description",
        content:
          "What sets LearnFlow apart: multi-curriculum support, real learner records, role-aware access and evidence you can audit.",
      },
      { property: "og:title", content: "Why choose LearnFlow" },
      {
        property: "og:description",
        content: "Multi-curriculum support, real learner records and auditable access control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "why-choose-us" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Why choose us" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  component: WhyChooseUsPage,
});

function WhyChooseUsPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Why choose us"
        title="One system instead of five spreadsheets"
        intro="Curriculum structure, learner placement, teaching, assessment and administration in a single, permission-aware platform."
      />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
    </PublicLayout>
  );
}
