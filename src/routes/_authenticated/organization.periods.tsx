import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AcademicPeriodDialog } from "@/features/curriculum/components/enrollment-dialogs";
import {
  buildPeriodTree,
  enrollmentKeys,
  flattenPeriodTree,
  listAcademicPeriods,
} from "@/features/curriculum/enrollment-api";
import { removeAcademicPeriod } from "@/lib/enrollment.functions";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/organization/periods")({
  head: () => ({
    meta: [
      { title: "Academic periods — LearnFlow" },
      {
        name: "description",
        content: "Define academic years, terms, semesters and quarters for your organization.",
      },
      { property: "og:title", content: "Academic periods — LearnFlow" },
      {
        property: "og:description",
        content: "Structure the school calendar that learner enrollments are anchored to.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AcademicPeriodsPage,
});

function AcademicPeriodsPage() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const mayManage = activeRole?.roleCode === "org_admin";
  const queryClient = useQueryClient();

  const periods = useQuery({
    queryKey: enrollmentKeys.periods(organizationId),
    queryFn: () => listAcademicPeriods(organizationId),
    enabled: Boolean(organizationId),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["enrollment"] });

  const remove = useServerFn(removeAcademicPeriod);
  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Period removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = periods.data ?? [];
  const ordered = flattenPeriodTree(buildPeriodTree(rows));

  return (
    <div>
      <PageHeader
        title="Academic periods"
        description="Years, terms, semesters and quarters. Learner enrollments are anchored to these periods."
        actions={
          mayManage && organizationId ? (
            <AcademicPeriodDialog
              organizationId={organizationId}
              periods={rows}
              onSaved={refresh}
              trigger={
                <Button>
                  <Plus aria-hidden="true" className="size-4" /> New period
                </Button>
              }
            />
          ) : undefined
        }
      />

      <QueryState
        isPending={periods.isPending}
        error={periods.error}
        data={ordered}
        onRetry={() => void periods.refetch()}
        skeleton={<ListSkeleton rows={3} />}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={CalendarRange}
            title="No academic periods yet"
            description={
              mayManage
                ? "Create an academic year, then add its terms or semesters."
                : "Your organization administrator has not defined the calendar yet."
            }
          />
        }
      >
        {(list) => (
          <ul className="divide-y rounded-md border">
            {list.map((node) => {
              const original = rows.find((row) => row.id === node.id);
              return (
                <li
                  key={node.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ paddingInlineStart: `${0.75 + node.depth * 1.25}rem` }}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{node.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(node.startDate)} – {formatDate(node.endDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {node.periodType}
                    </Badge>
                    {mayManage && organizationId && original ? (
                      <>
                        <AcademicPeriodDialog
                          organizationId={organizationId}
                          periods={rows}
                          period={original}
                          onSaved={refresh}
                          trigger={
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(node.id)}
                        >
                          Remove
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
