import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/organization/billing")({
  head: () => ({
    meta: [
      { title: "Plan & billing — the Platform" },
      { name: "description", content: "Your plan, entitlements and seat usage." },
      { property: "og:title", content: "Plan & billing — the Platform" },
      { property: "og:description", content: "Your plan, entitlements and seat usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Plan & billing" description="Your plan, entitlements and seat usage." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
