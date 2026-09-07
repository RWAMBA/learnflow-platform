import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public/public-layout";
import { SectionError } from "@/components/public/cms-blocks";
import { SafeMarkdown } from "@/components/public/safe-markdown";
import { getGuideArticle } from "@/lib/public-content.functions";

export const Route = createFileRoute("/guide/$slug")({
  loader: async ({ params }) => {
    const result = await getGuideArticle({ data: { slug: params.slug } });
    if (!result.article) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.article) {
      return {
        meta: [
          { title: "Article unavailable — LearnFlow Guide" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { title, summary, seo_description } = loaderData.article;
    const description = seo_description ?? summary ?? "An article from the LearnFlow Guide.";
    return {
      meta: [
        { title: `${title} — LearnFlow Guide` },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: GuideNotFound,
  errorComponent: () => (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <SectionError message="This article could not be loaded. Please try again shortly." />
      </div>
    </PublicLayout>
  ),
  component: GuideArticlePage,
});

function GuideNotFound() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Article not found</h1>
        <p className="mt-2 text-muted-foreground">
          This article may have been unpublished or the address may be wrong.
        </p>
        <Link to="/guide" className="mt-6 inline-flex min-h-11 items-center underline">
          Back to the Guide
        </Link>
      </div>
    </PublicLayout>
  );
}

function GuideArticlePage() {
  const { article, fetchedAt } = Route.useLoaderData();
  if (!article) return <GuideNotFound />;

  return (
    <PublicLayout>
      {/* AAA-contrast educational reading surface. */}
      <article className="mx-auto w-full max-w-3xl px-4 py-10 text-neutral-950 dark:text-neutral-50 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <Link to="/guide" className="underline underline-offset-4 hover:no-underline">
            Guide
          </Link>
        </nav>
        {article.category ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {article.category}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>
        {article.summary ? <p className="mt-3 text-lg">{article.summary}</p> : null}
        {article.reading_minutes ? (
          <p className="mt-2 text-sm text-muted-foreground">
            About {article.reading_minutes} min read
          </p>
        ) : null}
        <SafeMarkdown
          source={article.body_markdown}
          className="mt-8 space-y-5 text-lg leading-relaxed"
        />
        <p className="mt-10 text-xs text-muted-foreground">
          Loaded {new Date(fetchedAt).toLocaleString()}.
        </p>
      </article>
    </PublicLayout>
  );
}
