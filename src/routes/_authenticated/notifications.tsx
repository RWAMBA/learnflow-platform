import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — the Platform" },
      { name: "description", content: "Everything that needs your attention." },
      { property: "og:title", content: "Notifications — the Platform" },
      { property: "og:description", content: "Everything that needs your attention." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Notifications" description="Everything that needs your attention." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
