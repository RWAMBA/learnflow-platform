import { EnvPreflightBanner } from "@/components/shared/env-preflight-banner";
import { ConsentProvider } from "@/components/public/consent";
import { PublicLayout, PublicPageHeader } from "@/components/public/public-layout";

export function HarnessPage() {
  return (
    <ConsentProvider>
      <PublicLayout>
        <PublicPageHeader
          eyebrow="Public website"
          title="LearnFlow"
          intro="A responsive public-information surface for families, instructors and schools."
        />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16" id="main-content">
          <EnvPreflightBanner />
          <section aria-labelledby="harness-services" className="mt-8">
            <h2 id="harness-services" className="text-2xl font-semibold">
              Learning that fits
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {["Full-time homeschooling", "Part-time tuition", "Extracurricular programmes"].map(
                (title) => (
                  <article key={title} className="min-w-0 rounded-lg border p-5">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Clear information and a straightforward next step on every screen size.
                    </p>
                  </article>
                ),
              )}
            </div>
          </section>
        </main>
      </PublicLayout>
    </ConsentProvider>
  );
}
