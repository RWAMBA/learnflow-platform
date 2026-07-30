import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — the Platform" },
      { name: "description", content: "Conversations with the people connected to your students." },
      { property: "og:title", content: "Messages — the Platform" },
      { property: "og:description", content: "Conversations with the people connected to your students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Messages" description="Conversations with the people connected to your students." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
