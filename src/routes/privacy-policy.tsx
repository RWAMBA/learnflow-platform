import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { getPageContent } from "@/lib/public-content.functions";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — LearnFlow" },
      {
        name: "description",
        content:
          "How LearnFlow collects, uses, stores and deletes personal data for families, learners, instructors and schools, and the rights you can exercise.",
      },
      { property: "og:title", content: "LearnFlow privacy policy" },
      {
        property: "og:description",
        content: "How LearnFlow handles personal data and the rights you can exercise.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "privacy-policy" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Privacy policy" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Legal"
        title="Privacy policy"
        intro="What personal data we hold, why we hold it, how long we keep it, and how to ask us to change or delete it."
      />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
    </PublicLayout>
  );
}
