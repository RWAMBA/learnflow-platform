import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/organization/")({
  head: () => ({
    meta: [
      { title: "Organization — the Platform" },
      { name: "description", content: "Members, roles and organization settings." },
      { property: "og:title", content: "Organization — the Platform" },
      { property: "og:description", content: "Members, roles and organization settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Organization" description="Members, roles and organization settings." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
