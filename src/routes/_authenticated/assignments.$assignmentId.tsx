import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment — the Platform" },
      { name: "description", content: "Assignment detail, submission and grading." },
      { property: "og:title", content: "Assignment — the Platform" },
      { property: "og:description", content: "Assignment detail, submission and grading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Assignment" description="Assignment detail, submission and grading." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
