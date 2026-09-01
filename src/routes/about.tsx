import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { getPageContent } from "@/lib/public-content.functions";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About LearnFlow — Homeschool and school management" },
      {
        name: "description",
        content:
          "Who LearnFlow is built for: families, tutors, learning centres and schools running CBC, Cambridge, Edexcel and US K-12 pathways.",
      },
      { property: "og:title", content: "About LearnFlow" },
      {
        property: "og:description",
        content: "Why LearnFlow exists and who it serves across homeschooling and school-level education.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "about" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="About LearnFlow" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  component: AboutPage,
});

function AboutPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="About"
        title="Built for the way families and schools actually teach"
        intro="LearnFlow brings curriculum, learners, teaching and administration into one place for homeschools, tutors, learning centres, academies and schools."
      />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
    </PublicLayout>
  );
}
