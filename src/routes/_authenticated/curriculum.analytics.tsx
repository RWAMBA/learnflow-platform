import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurriculumAnalytics, hierarchyKeys } from "@/features/curriculum/hierarchy-api";
import { useRoleContext } from "@/features/roles/role-context";

export const Route = createFileRoute("/_authenticated/curriculum/analytics")({
  head: () => ({
    meta: [
      { title: "Curriculum analytics — the Platform" },
      {
        name: "description",
        content: "Curriculum coverage, publishing status, lesson completion and competency mastery.",
      },
      { property: "og:title", content: "Curriculum analytics — the Platform" },
      {
        property: "og:description",
        content: "Coverage, publishing status, lesson completion and mastery roll-ups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurriculumAnalyticsPage,
});

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CurriculumAnalyticsPage() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;

  const query = useQuery({
    queryKey: hierarchyKeys.analytics(organizationId),
    queryFn: () => getCurriculumAnalytics(organizationId),
  });

  return (
    <div>
      <PageHeader
        title="Curriculum analytics"
        description="Coverage of published curriculum, authoring pipeline and learner mastery."
      />
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={4} />}
      >
        {(data) => (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Curriculum completion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div
                  className="h-3 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={data.coveragePercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Published curriculum coverage"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${data.coveragePercent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.coveragePercent}% of authored lessons are published.
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Published lessons" value={data.published} />
              <Metric label="Draft lessons" value={data.draft} />
              <Metric label="Lessons in review" value={data.review} />
              <Metric label="Archived lessons" value={data.archived} />
              <Metric label="Strands" value={data.strands} />
              <Metric label="Sub-strands" value={data.subStrands} />
              <Metric label="Learning outcomes" value={data.learningOutcomes} />
              <Metric label="Resources" value={data.resources} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Competency mastery</CardTitle>
              </CardHeader>
              <CardContent>
                {data.masteryCounts.length === 0 ? (
                  <p className="text-muted-foreground">
                    No progress has been recorded for your learners yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.masteryCounts.map((row) => (
                      <li key={row.level} className="flex items-center justify-between gap-3">
                        <span className="capitalize">{row.level.replace(/_/g, " ")}</span>
                        <span className="text-sm text-muted-foreground">{row.count} record(s)</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  {data.lessonsCompleted} lesson completion(s) recorded.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}
