import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { PublicRouteNotFound } from "@/components/public/public-route-state";
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
  notFoundComponent: PublicRouteNotFound,
  component: ServicesPage,
});

function ServicesPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader eyebrow="Services" title="Services" />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
    </PublicLayout>
  );
}
