import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public/public-layout";
import { SectionError } from "@/components/public/cms-blocks";
import { SafeMarkdown } from "@/components/public/safe-markdown";
import { MerchandiseInquiryForm } from "@/components/public/merchandise-inquiry-form";
import { formatMoney } from "@/lib/public-site.constants";
import { getMerchandiseItem } from "@/lib/public-content.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/merchandise/$slug")({
  loader: async ({ params }) => {
    const result = await getMerchandiseItem({ data: { slug: params.slug } });
    if (!result.item) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.item) {
      return {
        meta: [{ title: "Item unavailable — LearnFlow" }, { name: "robots", content: "noindex" }],
      };
    }
    const { name, summary } = loaderData.item;
    const description = summary ?? `${name} from LearnFlow. Enquire for availability.`;
    return {
      meta: [
        { title: `${name} — LearnFlow merchandise` },
        { name: "description", content: description },
        { property: "og:title", content: name },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: ItemNotFound,
  errorComponent: () => (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <SectionError message="This item could not be loaded. Please try again shortly." />
      </div>
    </PublicLayout>
  ),
  component: MerchandiseDetailPage,
});

function ItemNotFound() {
  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Item not found</h1>
        <p className="mt-2 text-muted-foreground">
          This item may have been unpublished or the address may be wrong.
        </p>
        <Link to="/merchandise" className="mt-6 inline-flex min-h-11 items-center underline">
          Back to merchandise
        </Link>
      </div>
    </PublicLayout>
  );
}

function MerchandiseDetailPage() {
  const { item } = Route.useLoaderData();
  const [showForm, setShowForm] = useState(false);
  if (!item) return <ItemNotFound />;

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <Link to="/merchandise" className="underline underline-offset-4 hover:no-underline">
            Merchandise
          </Link>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight">{item.name}</h1>
        <p className="mt-3 text-lg font-medium">
          {formatMoney(item.price_amount, item.price_currency)}
        </p>
        {item.availability_note ? (
          <p className="mt-1 text-sm text-muted-foreground">{item.availability_note}</p>
        ) : null}
        {item.summary ? <p className="mt-4 text-base">{item.summary}</p> : null}
        {item.description_markdown ? (
          <SafeMarkdown source={item.description_markdown} className="mt-6 space-y-4 text-base" />
        ) : null}

        <section aria-labelledby="merch-enquiry" className="mt-10 rounded-lg border p-6">
          <h2 id="merch-enquiry" className="text-lg font-semibold">
            Enquire about this item
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            There is no online checkout. Send us a message and we will reply with availability and
            payment options.
          </p>
          {showForm ? (
            <div className="mt-6">
              <MerchandiseInquiryForm itemId={item.id} itemName={item.name} />
            </div>
          ) : (
            <Button className="mt-4 min-h-11" onClick={() => setShowForm(true)}>
              Enquire about {item.name}
            </Button>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
