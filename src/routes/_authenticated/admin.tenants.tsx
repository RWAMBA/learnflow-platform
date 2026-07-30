import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  head: () => ({
    meta: [
      { title: "Platform administration — the Platform" },
      { name: "description", content: "Tenants, plans and platform-wide activity." },
      { property: "og:title", content: "Platform administration — the Platform" },
      { property: "og:description", content: "Tenants, plans and platform-wide activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader title="Platform administration" description="Tenants, plans and platform-wide activity." />
      <EmptyState title="Coming up next" description="This section is being built in the next pass." />
    </div>
  );
}
