import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/assignments/")({
  head: () => ({
    meta: [
      { title: "Assignments — the Platform" },
      { name: "description", content: "Track assigned work, submissions and grading." },
      { property: "og:title", content: "Assignments — the Platform" },
      { property: "og:description", content: "Track assigned work, submissions and grading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Assignments" description="Track assigned work, submissions and grading." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
