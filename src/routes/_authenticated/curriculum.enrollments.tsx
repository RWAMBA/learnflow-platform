import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EnrollStudentDialog,
  TransferEnrollmentDialog,
} from "@/features/curriculum/components/enrollment-dialogs";
import {
  ALLOWED_ENROLLMENT_TRANSITIONS,
  enrollmentKeys,
  getLearnerReconciliation,
  listAcademicPeriods,
  listCurriculumEnrollments,
  type EnrollmentStatus,
} from "@/features/curriculum/enrollment-api";
import { changeEnrollmentStatus } from "@/lib/enrollment.functions";
import { listStudents, studentKeys } from "@/features/students/api";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/curriculum/enrollments")({
  head: () => ({
    meta: [
      { title: "Curriculum enrollments — LearnFlow" },
      {
        name: "description",
        content:
          "Place learners on a curriculum, move them between levels and reconcile existing records.",
      },
      { property: "og:title", content: "Curriculum enrollments — LearnFlow" },
      {
        property: "og:description",
        content: "Enrollment lifecycle, transfers and legacy placement reconciliation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnrollmentsPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  active: "default",
  completed: "secondary",
  transferred: "secondary",
  withdrawn: "destructive",
  archived: "secondary",
};

function EnrollmentsPage() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const mayManage =
    activeRole?.roleCode === "org_admin" ||
    activeRole?.roleCode === "teacher" ||
    activeRole?.roleCode === "tutor" ||
    activeRole?.roleCode === "parent_guardian";
  const queryClient = useQueryClient();

  const enrollments = useQuery({
    queryKey: enrollmentKeys.enrollments(organizationId, null),
    queryFn: () => listCurriculumEnrollments({ organizationId, studentId: null }),
  });
  const students = useQuery({
    queryKey: studentKeys.list(organizationId ?? ""),
    queryFn: () => listStudents(organizationId ?? ""),
    enabled: Boolean(organizationId),
  });
  const periods = useQuery({
    queryKey: enrollmentKeys.periods(organizationId),
    queryFn: () => listAcademicPeriods(organizationId),
    enabled: Boolean(organizationId),
  });
  const reconciliation = useQuery({
    queryKey: enrollmentKeys.reconciliation(organizationId),
    queryFn: () => getLearnerReconciliation(organizationId),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["enrollment"] });

  const change = useServerFn(changeEnrollmentStatus);
  const statusMutation = useMutation({
    mutationFn: (input: { enrollmentId: string; status: EnrollmentStatus }) =>
      change({ data: input }),
    onSuccess: () => {
      toast.success("Enrollment updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Curriculum enrollments"
        description="A learner's placement on a curriculum version, academic level and track — with full history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/organization/periods">Academic periods</Link>
            </Button>
            {mayManage ? (
              <EnrollStudentDialog
                students={students.data ?? []}
                periods={periods.data ?? []}
                onSaved={refresh}
                trigger={
                  <Button>
                    <Plus aria-hidden="true" className="size-4" /> Enrol learner
                  </Button>
                }
              />
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="enrollments">
        <TabsList className="mb-4">
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="enrollments">
          <QueryState
            isPending={enrollments.isPending}
            error={enrollments.error}
            data={enrollments.data}
            onRetry={() => void enrollments.refetch()}
            skeleton={<ListSkeleton rows={4} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                icon={GraduationCap}
                title="No enrollments yet"
                description="Enrol a learner once a curriculum has been reviewed and activated."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y rounded-md border">
                {rows.map((row) => {
                  const nextStates =
                    ALLOWED_ENROLLMENT_TRANSITIONS[row.status as EnrollmentStatus] ?? [];
                  return (
                    <li key={row.id} className="space-y-2 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {row.student
                              ? `${row.student.first_name} ${row.student.last_name}`
                              : "Learner"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {row.version?.curriculum?.name ?? "Curriculum"} ·{" "}
                            {row.academic_level?.name ?? "Level"}
                            {row.track?.name ? ` · ${row.track.name}` : ""}
                            {row.period?.name ? ` · ${row.period.name}` : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {row.enrollment_category === "primary" ? "Primary" : "Supplementary"}
                            {row.enrolled_at ? ` · enrolled ${formatDate(row.enrolled_at)}` : ""}
                            {row.transferred_from_enrollment_id ? " · transferred in" : ""}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                          {row.status}
                        </Badge>
                      </div>
                      {mayManage ? (
                        <div className="flex flex-wrap gap-2">
                          {nextStates.map((next) => (
                            <Button
                              key={next}
                              size="sm"
                              variant={next === "active" ? "default" : "outline"}
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({ enrollmentId: row.id, status: next })
                              }
                            >
                              Mark {next}
                            </Button>
                          ))}
                          {row.status === "active" ? (
                            <TransferEnrollmentDialog
                              enrollment={row}
                              periods={periods.data ?? []}
                              onSaved={refresh}
                              trigger={
                                <Button size="sm" variant="ghost">
                                  Transfer
                                </Button>
                              }
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="reconciliation">
          <QueryState
            isPending={reconciliation.isPending}
            error={reconciliation.error}
            data={reconciliation.data}
            onRetry={() => void reconciliation.refetch()}
            skeleton={<ListSkeleton rows={3} />}
          >
            {(report) => (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Existing learner reconciliation</CardTitle>
                    <CardDescription>
                      Compares each learner&apos;s original grade and pathway with their curriculum
                      enrollment. Nothing is changed automatically — placements stay as they are
                      until someone enrols the learner.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-2xl font-semibold">{report.reconciled}</p>
                      <p className="text-sm text-muted-foreground">Reconciled</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{report.outstanding}</p>
                      <p className="text-sm text-muted-foreground">Awaiting enrollment</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{report.mismatched}</p>
                      <p className="text-sm text-muted-foreground">Mismatched placement</p>
                    </div>
                  </CardContent>
                </Card>

                {report.rows.length === 0 ? (
                  <EmptyState title="No learners yet" description="Add learners to see this report." />
                ) : (
                  <ul className="divide-y rounded-md border">
                    {report.rows.map((row) => (
                      <li
                        key={row.studentId}
                        className="flex flex-wrap items-center justify-between gap-2 p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{row.studentName}</p>
                          <p className="text-sm text-muted-foreground">
                            Original placement: {row.legacyLevelName ?? "none"}
                            {row.legacyTrackName ? ` · ${row.legacyTrackName}` : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            row.mismatched
                              ? "destructive"
                              : row.hasPrimaryEnrollment
                                ? "default"
                                : "outline"
                          }
                        >
                          {row.mismatched
                            ? "Mismatched"
                            : row.hasPrimaryEnrollment
                              ? "Enrolled"
                              : "Not enrolled"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </QueryState>
        </TabsContent>
      </Tabs>
    </div>
  );
}
