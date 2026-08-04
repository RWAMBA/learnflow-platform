import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoleContext } from "@/features/roles/role-context";
import { canViewAssessmentAnalytics } from "@/features/roles/permissions";
import {
  assessmentKeys,
  getAssessmentAnalytics,
  isGradedStatus,
  summarizeScores,
} from "@/features/assessments/api";

const TITLE = "Assessment analytics — the Platform";
const DESCRIPTION = "Completion, score distribution and grading workload across the organization.";

export const Route = createFileRoute("/_authenticated/assessments/analytics")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function Page() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;

  const query = useQuery({
    queryKey: assessmentKeys.analytics(organizationId ?? "none"),
    enabled: Boolean(organizationId) && canViewAssessmentAnalytics(activeRole?.roleCode),
    queryFn: () => getAssessmentAnalytics(organizationId!),
  });

  const summary = useMemo(() => {
    const submissions = query.data?.submissions ?? [];
    const graded = submissions.filter((row) => isGradedStatus(row.status));
    const percentages = graded
      .map((row) => row.percentage)
      .filter((value): value is number => value != null);
    const scores = summarizeScores(percentages);
    const passed = percentages.filter((value) => value >= 50).length;
    return {
      scores,
      submissions: submissions.length,
      pending: submissions.filter((row) => row.status === "submitted" || row.status === "grading")
        .length,
      passRate: percentages.length ? Math.round((passed / percentages.length) * 100) : 0,
    };
  }, [query.data]);

  if (!activeRole || !canViewAssessmentAnalytics(activeRole.roleCode)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Not available for this role"
        description="Assessment analytics are available to educators and administrators."
      />
    );
  }

  return (
    <div>
      <PageHeader title="Assessment analytics" description={DESCRIPTION} />
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
      >
        {(data) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Assessments" value={data.assessments.length} />
              <Metric label="Attempts" value={summary.submissions} />
              <Metric label="Awaiting grading" value={summary.pending} />
              <Metric label="Pass rate" value={`${summary.passRate}%`} />
              <Metric label="Average score" value={`${summary.scores.average}%`} />
              <Metric label="Median score" value={`${summary.scores.median}%`} />
              <Metric label="Highest score" value={`${summary.scores.highest}%`} />
              <Metric label="Lowest score" value={`${summary.scores.lowest}%`} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Per assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.assessments.map((assessment) => {
                    const rows = data.submissions.filter(
                      (row) => row.assessment_id === assessment.id,
                    );
                    const stats = summarizeScores(
                      rows
                        .map((row) => row.percentage)
                        .filter((value): value is number => value != null),
                    );
                    return (
                      <li
                        key={assessment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                      >
                        <span className="font-medium">{assessment.title}</span>
                        <span className="text-muted-foreground">
                          {rows.length} attempt(s) · average {stats.average}% · highest{" "}
                          {stats.highest}% · lowest {stats.lowest}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}