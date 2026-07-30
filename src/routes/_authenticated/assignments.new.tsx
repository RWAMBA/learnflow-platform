import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/assignments/new")({
  head: () => ({
    meta: [
      { title: "Assign work — the Platform" },
      { name: "description", content: "Assign a lesson to a student." },
      { property: "og:title", content: "Assign work — the Platform" },
      { property: "og:description", content: "Assign a lesson to a student." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Assign work" description="Assign a lesson to a student." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
