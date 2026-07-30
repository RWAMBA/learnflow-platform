import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/curriculum/lessons/$lessonId")({
  head: () => ({
    meta: [
      { title: "Lesson — the Platform" },
      { name: "description", content: "Lesson content and materials." },
      { property: "og:title", content: "Lesson — the Platform" },
      { property: "og:description", content: "Lesson content and materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Lesson" description="Lesson content and materials." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
