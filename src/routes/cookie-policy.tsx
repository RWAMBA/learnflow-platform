import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { CmsBlocks } from "@/components/public/cms-blocks";
import { getPageContent } from "@/lib/public-content.functions";
import { ConsentPreferencesButton } from "@/components/public/consent";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie policy — LearnFlow" },
      {
        name: "description",
        content:
          "The cookies and local storage LearnFlow uses, what each category is for, and how to change your consent at any time.",
      },
      { property: "og:title", content: "LearnFlow cookie policy" },
      {
        property: "og:description",
        content: "What LearnFlow stores on your device and how to change your consent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => getPageContent({ data: { pageSlug: "cookie-policy" } }),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Cookie policy" />
      <CmsBlocks blocks={[]} fetchedAt={null} failed />
    </PublicLayout>
  ),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  const { blocks, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Legal"
        title="Cookie policy"
        intro="Strictly necessary storage keeps you signed in and keeps forms secure. Everything else is off until you choose otherwise."
      />
      <CmsBlocks blocks={blocks} fetchedAt={fetchedAt} />
      <div className="mx-auto w-full max-w-3xl px-4 pb-14">
        <ConsentPreferencesButton />
      </div>
    </PublicLayout>
  );
}
