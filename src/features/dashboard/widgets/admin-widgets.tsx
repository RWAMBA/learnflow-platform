import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { listOrganizationMembers, relationshipKeys } from "@/features/relationships/api";
import { listStudents, studentKeys } from "@/features/students/api";
import { getOrganizationSubscription, subscriptionKeys } from "@/features/subscription/api";
import { ROLE_LABELS, type RoleCode } from "@/features/roles/types";
import { formatCurrency } from "@/lib/format";
import { WidgetCard } from "./widget-card";

export function OrganizationOverviewWidget({ organizationId }: { organizationId: string }) {
  const students = useQuery({
    queryKey: studentKeys.list(organizationId),
    queryFn: () => listStudents(organizationId),
  });
  const members = useQuery({
    queryKey: relationshipKeys.orgMembers(organizationId),
    queryFn: () => listOrganizationMembers(organizationId),
  });

  const counts = (members.data ?? []).reduce<Record<string, number>>((acc, member) => {
    const code = member.role?.code ?? "unknown";
    acc[code] = (acc[code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <WidgetCard
      title="Organization at a glance"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/organization">Settings</Link>
        </Button>
      }
    >
      <QueryState
        isPending={students.isPending || members.isPending}
        error={students.error ?? members.error}
        data={students.data}
        onRetry={() => {
          void students.refetch();
          void members.refetch();
        }}
        skeleton={<ListSkeleton rows={2} />}
      >
        {(studentRows) => (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Students</dt>
              <dd className="text-2xl font-semibold">{studentRows.length}</dd>
            </div>
            {Object.entries(counts).map(([code, count]) => (
              <div key={code}>
                <dt className="text-sm text-muted-foreground">
                  {ROLE_LABELS[code as RoleCode] ?? code}
                </dt>
                <dd className="text-2xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </QueryState>
    </WidgetCard>
  );
}

export function SubscriptionWidget({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: subscriptionKeys.forOrganization(organizationId),
    queryFn: () => getOrganizationSubscription(organizationId),
  });

  return (
    <WidgetCard
      title="Plan"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/organization/billing">Manage</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => !data}
        empty={<EmptyState icon={Building2} title="No active plan" description="Choose a plan to unlock more seats." />}
      >
        {(subscription) => (
          <div>
            <p className="text-2xl font-semibold">{subscription?.plan?.name}</p>
            <p className="text-sm text-muted-foreground">
              {subscription?.status} ·{" "}
              {formatCurrency(
                subscription?.plan?.price_amount,
                subscription?.plan?.price_currency ?? "KES",
              )}
            </p>
          </div>
        )}
      </QueryState>
    </WidgetCard>
  );
}
