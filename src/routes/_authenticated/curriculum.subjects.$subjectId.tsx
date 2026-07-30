import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/curriculum/subjects/$subjectId")({
  head: () => ({
    meta: [
      { title: "Subject — the Platform" },
      { name: "description", content: "Lessons and competencies for this subject." },
      { property: "og:title", content: "Subject — the Platform" },
      { property: "og:description", content: "Lessons and competencies for this subject." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Subject" description="Lessons and competencies for this subject." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
