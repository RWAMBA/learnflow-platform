import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { SectionEmpty, SectionError, StaleNotice } from "@/components/public/cms-blocks";
import { listGuideArticles } from "@/lib/public-content.functions";

export const Route = createFileRoute("/guide/")({
  head: () => ({
    meta: [
      { title: "The LearnFlow Guide — Practical homeschooling articles" },
      {
        name: "description",
        content:
          "Practical articles on planning, curriculum choice, records, assessment and day-to-day homeschooling with LearnFlow.",
      },
      { property: "og:title", content: "The LearnFlow Guide" },
      {
        property: "og:description",
        content: "Practical articles on planning, curriculum choice, records and assessment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => listGuideArticles(),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="The Guide" />
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <SectionError />
      </div>
    </PublicLayout>
  ),
  component: GuideIndexPage,
});

function GuideIndexPage() {
  const { articles, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Guide"
        title="The LearnFlow Guide"
        intro="Practical, plainly written articles for families and educators. Educational reading surfaces use our highest contrast setting."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        {articles.length === 0 ? (
          <SectionEmpty
            title="No articles published yet"
            description="The first Guide articles will appear here once they are published."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {articles.map((article) => (
              <li key={article.id}>
                <article className="flex h-full flex-col rounded-lg border p-5">
                  {article.category ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {article.category}
                    </p>
                  ) : null}
                  <h2 className="mt-1 text-lg font-semibold">
                    <Link
                      to="/guide/$slug"
                      params={{ slug: article.slug }}
                      className="hover:underline"
                    >
                      {article.title}
                    </Link>
                  </h2>
                  {article.summary ? (
                    <p className="mt-2 flex-1 text-sm text-muted-foreground">{article.summary}</p>
                  ) : null}
                  {article.reading_minutes ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      About {article.reading_minutes} min read
                    </p>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}
        <StaleNotice fetchedAt={fetchedAt} />
      </div>
    </PublicLayout>
  );
}
