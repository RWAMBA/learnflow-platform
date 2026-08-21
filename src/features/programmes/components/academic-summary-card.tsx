import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import {
  enrollmentKeys,
  listCurriculumEnrollments,
} from "@/features/curriculum/enrollment-api";
import { summarizeAcademicProgrammes } from "../academic-summary";

/**
 * Academic programme summary. Reads the existing curriculum_enrollments rows
 * the caller is authorized to see — no separate academic-programme entity.
 */
export function AcademicSummaryCard({ organizationId }: { organizationId: string | null }) {
  const enrollments = useQuery({
    queryKey: enrollmentKeys.enrollments(organizationId, null),
    queryFn: () => listCurriculumEnrollments({ organizationId, studentId: null }),
    enabled: Boolean(organizationId),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Academic programmes</CardTitle>
        <CardDescription>
          Read from curriculum enrollments you are authorized to see.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <QueryState
          isPending={enrollments.isPending}
          error={enrollments.error}
          data={enrollments.data ?? []}
          onRetry={() => void enrollments.refetch()}
          skeleton={<ListSkeleton rows={2} />}
        >
          {(rows) => (
            <dl className="grid gap-3 sm:grid-cols-2">
              {summarizeAcademicProgrammes(
                rows.map((row) => ({
                  student_id: row.student_id,
                  enrollment_category: row.enrollment_category,
                  status: row.status,
                })),
              ).map((summary) => (
                <div key={summary.category} className="rounded-md border p-3">
                  <dt className="text-sm font-medium">{summary.label}</dt>
                  <dd className="text-sm text-muted-foreground">
                    {summary.activeLearners} active{" "}
                    {summary.activeLearners === 1 ? "learner" : "learners"} ·{" "}
                    {summary.totalEnrollments} enrollment
                    {summary.totalEnrollments === 1 ? "" : "s"} on record
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
