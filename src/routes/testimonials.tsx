import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";
import { SectionEmpty, SectionError, StaleNotice } from "@/components/public/cms-blocks";
import { listTestimonials } from "@/lib/public-content.functions";

export const Route = createFileRoute("/testimonials")({
  head: () => ({
    meta: [
      { title: "Testimonials — What LearnFlow families and schools say" },
      {
        name: "description",
        content: "Published feedback from families, tutors and schools using LearnFlow.",
      },
      { property: "og:title", content: "LearnFlow testimonials" },
      {
        property: "og:description",
        content: "Published feedback from LearnFlow families and schools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => listTestimonials(),
  errorComponent: () => (
    <PublicLayout>
      <PublicPageHeader title="Testimonials" />
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <SectionError />
      </div>
    </PublicLayout>
  ),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const { testimonials, fetchedAt } = Route.useLoaderData();
  return (
    <PublicLayout>
      <PublicPageHeader
        eyebrow="Testimonials"
        title="In their own words"
        intro="Only feedback we have received and published appears here. Nothing on this page is illustrative."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        {testimonials.length === 0 ? (
          <SectionEmpty
            title="No testimonials published yet"
            description="We publish feedback only once we have permission to share it. Please check back soon."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {testimonials.map((item) => (
              <li key={item.id}>
                <figure className="h-full rounded-lg border p-5">
                  <blockquote className="text-base leading-relaxed">“{item.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{item.author_name}</span>
                    {item.author_role ? <span> — {item.author_role}</span> : null}
                    {item.author_location ? <span>, {item.author_location}</span> : null}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
        <StaleNotice fetchedAt={fetchedAt} />
      </div>
    </PublicLayout>
  );
}
