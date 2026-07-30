import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  head: () => ({
    meta: [
      { title: "Conversation — the Platform" },
      { name: "description", content: "Read and reply to this conversation." },
      { property: "og:title", content: "Conversation — the Platform" },
      { property: "og:description", content: "Read and reply to this conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Conversation" description="Read and reply to this conversation." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
