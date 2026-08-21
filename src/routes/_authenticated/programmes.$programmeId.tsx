import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Pencil, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  getProgramme,
  listProgrammeEnrollments,
  listProgrammeInstructors,
  programmeKeys,
} from "@/features/programmes/api";
import {
  AssignInstructorDialog,
  EnrollLearnerDialog,
  ProgrammeDialog,
} from "@/features/programmes/components/programme-dialogs";
import { ConfirmAction } from "@/features/programmes/components/confirm-action";
import {
  ALLOWED_PROGRAMME_ENROLLMENT_TRANSITIONS,
  ALLOWED_PROGRAMME_TRANSITIONS,
  PROGRAMME_CATEGORY_LABELS,
  PROGRAMME_ENROLLMENT_STATUS_LABELS,
  PROGRAMME_STATUS_LABELS,
  programmeIsFull,
  type ProgrammeEnrollmentStatus,
  type ProgrammeStatus,
} from "@/features/programmes/constants";
import {
  canEnrollInProgrammes,
  canManageProgrammeEnrollments,
  canManageProgrammes,
} from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";
import {
  changeProgrammeEnrollmentStatus,
  changeProgrammeStatus,
  removeProgrammeInstructor,
} from "@/lib/programmes.functions";
import { formatDate } from "@/lib/format";

const TITLE = "Programme details — LearnFlow";
const DESCRIPTION =
  "Instructors, places and learner enrollments for a single extracurricular programme.";

export const Route = createFileRoute("/_authenticated/programmes/$programmeId")({
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
  component: ProgrammeDetailPage,
});

function ProgrammeDetailPage() {
  const { programmeId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const mayManage = canManageProgrammes(activeRole?.roleCode);
  const mayEnroll = canEnrollInProgrammes(activeRole?.roleCode);
  const mayChangeEnrollment = canManageProgrammeEnrollments(activeRole?.roleCode);
  const queryClient = useQueryClient();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: programmeKeys.all });

  const programme = useQuery({
    queryKey: programmeKeys.detail(programmeId),
    queryFn: () => getProgramme(programmeId),
  });

  const instructors = useQuery({
    queryKey: programmeKeys.instructors(programmeId),
    queryFn: () => listProgrammeInstructors(programmeId),
  });

  const enrollments = useQuery({
    queryKey: programmeKeys.enrollments(programmeId),
    queryFn: () => listProgrammeEnrollments(programmeId),
  });

  const endInstructor = useServerFn(removeProgrammeInstructor);
  const endInstructorMutation = useMutation({
    mutationFn: (id: string) => endInstructor({ data: { programmeInstructorId: id } }),
    onSuccess: () => {
      toast.success("Instructor assignment ended");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeStatus = useServerFn(changeProgrammeEnrollmentStatus);
  const changeStatusMutation = useMutation({
    mutationFn: (input: { enrollmentId: string; status: ProgrammeEnrollmentStatus }) =>
      changeStatus({
        data: { enrollmentId: input.enrollmentId, status: input.status as "active" },
      }),
    onSuccess: () => {
      toast.success("Enrollment updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (programme.isPending) return <ListSkeleton rows={4} />;
  if (programme.error) {
    return (
      <ErrorState description={programme.error.message} onRetry={() => void programme.refetch()} />
    );
  }
  if (!programme.data) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Programme not available"
        description="This programme either does not exist or is not visible to your current role."
      />
    );
  }

  const record = programme.data;
  const full = programmeIsFull(record.capacity, record.occupied);
  const canAcceptLearners = record.status === "published" && !full;

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.name}
        description={record.description ?? "No description provided."}
        actions={
          <div className="flex flex-wrap gap-2">
            {mayManage && organizationId ? (
              <ProgrammeDialog
                organizationId={organizationId}
                programme={record}
                onSaved={refresh}
                trigger={
                  <Button variant="outline">
                    <Pencil aria-hidden="true" className="size-4" /> Edit
                  </Button>
                }
              />
            ) : null}
            {mayEnroll && organizationId ? (
              <EnrollLearnerDialog
                organizationId={organizationId}
                programmeId={record.id}
                disabled={!canAcceptLearners}
                trigger={
                  <Button disabled={!canAcceptLearners}>
                    <UserPlus aria-hidden="true" className="size-4" /> Enroll learner
                  </Button>
                }
              />
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={record.status === "published" ? "default" : "secondary"}>
          {PROGRAMME_STATUS_LABELS[record.status]}
        </Badge>
        <Badge variant="outline">{PROGRAMME_CATEGORY_LABELS[record.category]}</Badge>
        {full ? <Badge variant="destructive">Full</Badge> : null}
        <span className="text-sm text-muted-foreground">
          {record.capacity === null
            ? `${record.occupied} enrolled · unlimited places`
            : `${record.occupied} of ${record.capacity} places taken`}
        </span>
        {record.scheduleDescription ? (
          <span className="text-sm text-muted-foreground">· {record.scheduleDescription}</span>
        ) : null}
      </div>

      {record.status !== "published" ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          This programme is {PROGRAMME_STATUS_LABELS[record.status].toLowerCase()}. Only a published
          programme accepts new learners.
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Instructors</CardTitle>
          {mayManage && organizationId ? (
            <AssignInstructorDialog
              organizationId={organizationId}
              programmeId={record.id}
              onSaved={refresh}
              trigger={
                <Button size="sm" variant="outline">
                  <UserPlus aria-hidden="true" className="size-4" /> Assign
                </Button>
              }
            />
          ) : null}
        </CardHeader>
        <CardContent>
          <QueryState
            isPending={instructors.isPending}
            error={instructors.error}
            data={instructors.data ?? []}
            onRetry={() => void instructors.refetch()}
            skeleton={<ListSkeleton rows={2} />}
            isEmpty={(list) => list.length === 0}
            empty={
              <EmptyState
                icon={Users}
                title="No instructors assigned"
                description="An organization administrator can assign an active Teacher or Tutor."
              />
            }
          >
            {(list) => (
              <ul className="divide-y">
                {list.map((instructor) => (
                  <li
                    key={instructor.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{instructor.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {instructor.roleCode === "tutor" ? "Tutor" : "Teacher"} · assigned{" "}
                        {formatDate(instructor.assignedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={instructor.status === "active" ? "secondary" : "outline"}>
                        {instructor.status === "active" ? "Active" : "Ended"}
                      </Badge>
                      {mayManage && instructor.status === "active" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={endInstructorMutation.isPending}
                          onClick={() => endInstructorMutation.mutate(instructor.id)}
                        >
                          End assignment
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Learners</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            isPending={enrollments.isPending}
            error={enrollments.error}
            data={enrollments.data ?? []}
            onRetry={() => void enrollments.refetch()}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(list) => list.length === 0}
            empty={
              <EmptyState
                icon={GraduationCap}
                title="No learners enrolled"
                description="Enrollments you are authorized to see will appear here."
              />
            }
          >
            {(list) => (
              <ul className="divide-y">
                {list.map((enrollment) => {
                  const next = ALLOWED_PROGRAMME_ENROLLMENT_TRANSITIONS[enrollment.status];
                  return (
                    <li
                      key={enrollment.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{enrollment.studentName}</p>
                        <p className="text-sm text-muted-foreground">
                          Enrolled {formatDate(enrollment.enrolledAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {PROGRAMME_ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                        {mayChangeEnrollment
                          ? next.map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant="outline"
                                disabled={changeStatusMutation.isPending}
                                onClick={() =>
                                  changeStatusMutation.mutate({
                                    enrollmentId: enrollment.id,
                                    status,
                                  })
                                }
                              >
                                {PROGRAMME_ENROLLMENT_STATUS_LABELS[status]}
                              </Button>
                            ))
                          : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
