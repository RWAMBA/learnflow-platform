import { createFileRoute, Link } from "@tanstack/react-router";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { PublicRouteNotFound } from "@/components/public/public-route-state";
import { Button } from "@/components/ui/button";
import { getPageContent } from "@/lib/public-content.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LearnFlow — Homeschooling, tuition and learning management" },
      {
        name: "description",
        content:
          "LearnFlow supports homeschooling, part-time tuition and structured learning management for families, tutors and schools.",
      },
      { property: "og:title", content: "LearnFlow" },
      {
        property: "og:description",
        content: "Curriculum, teaching and administration in one secure learning platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "home" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="LearnFlow" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  notFoundComponent: PublicRouteNotFound,
  component: HomePage,
});

function HomePage() {
  const { blocks, fetchedAt } = Route.useLoaderData();

  return (
    <PublicLayout>
      <PublicPageHeader title="LearnFlow" />
      <CmsBlocks
        blocks={blocks}
        fetchedAt={fetchedAt}
        emptyTitle="Homepage content has not been published yet"
        emptyDescription="You can still explore LearnFlow, request a consultation or sign in."
      />
      <section aria-label="Get started" className="mx-auto w-full max-w-3xl px-4 pb-16">
        <div className="flex flex-wrap gap-3 rounded-lg border p-6">
          <Button asChild className="min-h-11">
            <Link to="/consultation">Book a consultation</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
