import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoleContext } from "@/features/roles/role-context";
import { getOrganizationSubscription, subscriptionKeys } from "@/features/subscription/api";
import {
  getOrganizationUsage,
  listActivePlans,
  organizationKeys,
} from "@/features/organization/api";
import { formatCurrency, formatDate } from "@/lib/format";

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

function entitlementEntries(entitlements: unknown) {
  if (!entitlements || typeof entitlements !== "object") return [];
  return Object.entries(entitlements as Record<string, unknown>);
}

function Page() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? "";

  const subscription = useQuery({
    queryKey: subscriptionKeys.forOrganization(organizationId),
    queryFn: () => getOrganizationSubscription(organizationId),
    enabled: Boolean(organizationId),
  });

  const usage = useQuery({
    queryKey: organizationKeys.usage(organizationId),
    queryFn: () => getOrganizationUsage(organizationId),
    enabled: Boolean(organizationId),
  });

  const plans = useQuery({ queryKey: organizationKeys.plans(), queryFn: listActivePlans });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plan & billing"
        description="Your plan, entitlements and seat usage."
        actions={
          <Button asChild variant="outline">
            <Link to="/organization">Organization</Link>
          </Button>
        }
      />

      <QueryState
        isPending={subscription.isPending}
        error={subscription.error}
        data={subscription.data ?? null}
        onRetry={() => void subscription.refetch()}
      >
        {(current) => (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3">
                {current?.plan?.name ?? "No active plan"}
                {current ? <Badge>{current.status}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {current ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(
                      current.plan?.price_amount ?? null,
                      current.plan?.price_currency ?? "KES",
                    )}{" "}
                    · started {formatDate(current.started_at)}
                    {current.ended_at ? ` · ends ${formatDate(current.ended_at)}` : ""}
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {entitlementEntries(current.plan?.entitlements).map(([key, value]) => (
                      <li key={key} className="rounded-md border p-3 text-sm">
                        <span className="font-medium">{key.replace(/_/g, " ")}</span>:{" "}
                        {String(value)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This organization is not on a plan yet. Choose one below and an administrator can
                  activate it.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </QueryState>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Usage</h2>
        <QueryState
          isPending={usage.isPending}
          error={usage.error}
          data={usage.data}
          onRetry={() => void usage.refetch()}
        >
          {(data) => (
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Active members", value: data.members },
                { label: "Students", value: data.students },
                { label: "Authored lessons", value: data.lessons },
              ].map((item) => (
                <Card key={item.label}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-semibold">{item.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Available plans</h2>
        <QueryState
          isPending={plans.isPending}
          error={plans.error}
          data={plans.data}
          onRetry={() => void plans.refetch()}
        >
          {(rows) => (
            <div className="grid gap-4 sm:grid-cols-2">
              {rows
                .filter(
                  (plan) =>
                    !activeRole ||
                    plan.eligible_tenant_types.length === 0 ||
                    plan.eligible_tenant_types.includes(activeRole.tenantType),
                )
                .map((plan) => (
                  <Card key={plan.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2">
                        <span>{plan.name}</span>
                        <span className="text-base font-normal text-muted-foreground">
                          {formatCurrency(plan.price_amount, plan.price_currency)}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {entitlementEntries(plan.entitlements).map(([key, value]) => (
                          <li key={key}>
                            {key.replace(/_/g, " ")}: {String(value)}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}
