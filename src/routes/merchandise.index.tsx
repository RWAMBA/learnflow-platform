import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { SectionEmpty, SectionError, StaleNotice } from "@/components/public/cms-blocks";
import { formatMoney } from "@/lib/public-site.constants";
import { listMerchandise } from "@/lib/public-content.functions";

export const Route = createFileRoute("/merchandise/")({
  head: () => ({
    meta: [
      { title: "Merchandise — LearnFlow learning materials" },
      {
        name: "description",
        content:
          "Browse LearnFlow learning materials and branded items. Enquire directly — there is no online checkout.",
      },
      { property: "og:title", content: "LearnFlow merchandise" },
      { property: "og:description", content: "Browse LearnFlow learning materials and enquire directly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => listMerchandise(),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Merchandise" />
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <SectionError />
      </div>
    </PublicLayout>
  ),
  component: MerchandiseIndexPage,
});

function MerchandiseIndexPage() {
  const { items, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Merchandise"
        title="Learning materials and branded items"
        intro="There is no online checkout. Send an enquiry about anything you are interested in and we will reply with availability and payment options."
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
        {items.length === 0 ? (
          <SectionEmpty
            title="Nothing listed yet"
            description="Items appear here once they are published. Please check back soon."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <article className="flex h-full flex-col rounded-lg border p-5">
                  <h2 className="text-lg font-semibold">
                    <Link to="/merchandise/$slug" params={{ slug: item.slug }} className="hover:underline">
                      {item.name}
                    </Link>
                  </h2>
                  {item.summary ? (
                    <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.summary}</p>
                  ) : null}
                  <p className="mt-3 text-sm font-medium">
                    {formatMoney(item.price_amount, item.price_currency)}
                  </p>
                  {item.availability_note ? (
                    <p className="mt-1 text-xs text-muted-foreground">{item.availability_note}</p>
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
