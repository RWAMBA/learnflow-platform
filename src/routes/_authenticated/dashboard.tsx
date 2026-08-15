import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import { MessagesPreviewWidget } from "@/features/dashboard/widgets/messages-preview-widget";
import {
  DueTodayWidget,
  ProgressSummaryWidget,
  SubjectGridWidget,
} from "@/features/dashboard/widgets/student-widgets";
import {
  ChildrenWidget,
  PendingInvitationsWidget,
} from "@/features/dashboard/widgets/parent-widgets";
import { GradingQueueWidget, RosterWidget } from "@/features/dashboard/widgets/educator-widgets";
import {
  OrganizationOverviewWidget,
  SubscriptionWidget,
} from "@/features/dashboard/widgets/admin-widgets";
import { useRoleContext } from "@/features/roles/role-context";
import { usesMergedFamilyDashboard } from "@/features/roles/permissions";
import {
  listLinkedStudentsForParent,
  listRosterForEducator,
  studentKeys,
} from "@/features/students/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — the Platform" },
      {
        name: "description",
        content: "Your learning dashboard: work due, progress, roster and messages.",
      },
      { property: "og:title", content: "Dashboard — the Platform" },
      {
        property: "og:description",
        content: "Work due, progress, roster and messages in one view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { viewer, activeRole } = useRoleContext();

  if (!activeRole) return <Navigate to="/onboarding" />;

  const greeting = viewer.fullName
    ? `Welcome back, ${viewer.fullName.split(" ")[0]}`
    : "Welcome back";

  return (
    <div>
      <PageHeader
        title={greeting}
        description={`${activeRole.roleName} · ${activeRole.organizationName}`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {activeRole.roleCode === "student" ? <StudentDashboard /> : null}
        {activeRole.roleCode === "parent_guardian" ? (
          <ParentDashboard userId={viewer.userId} />
        ) : null}
        {activeRole.roleCode === "teacher" || activeRole.roleCode === "tutor" ? (
          <EducatorDashboard
            userId={viewer.userId}
            kind={activeRole.roleCode === "teacher" ? "teacher" : "tutor"}
          />
        ) : null}
        {activeRole.roleCode === "org_admin" ? (
          <AdminDashboard organizationId={activeRole.organizationId} userId={viewer.userId} />
        ) : null}
        <MessagesPreviewWidget />
      </div>
    </div>
  );
}

function StudentDashboard() {
  const { data: student, isPending } = useCurrentStudent();

  if (isPending) return null;
  if (!student) {
    return (
      <p className="text-muted-foreground">
        Your student profile isn't linked yet. Ask your guardian or administrator to finish setup.
      </p>
    );
  }

  return (
    <>
      <DueTodayWidget studentId={student.id} />
      <SubjectGridWidget gradeId={student.grade?.id ?? null} />
      <ProgressSummaryWidget studentId={student.id} />
    </>
  );
}

function ParentDashboard({ userId }: { userId: string }) {
  const linked = useQuery({
    queryKey: studentKeys.forViewer(userId),
    queryFn: () => listLinkedStudentsForParent(userId),
  });
  const studentIds = (linked.data ?? [])
    .map((row) => row.student?.id)
    .filter((id): id is string => Boolean(id));

  return (
    <>
      <ChildrenWidget userId={userId} />
      <PendingInvitationsWidget userId={userId} />
      {studentIds.map((studentId) => (
        <DueTodayWidget key={studentId} studentId={studentId} />
      ))}
    </>
  );
}

function EducatorDashboard({ userId, kind }: { userId: string; kind: "teacher" | "tutor" }) {
  const roster = useQuery({
    queryKey: ["roster", userId, kind],
    queryFn: () => listRosterForEducator(userId, kind),
  });
  const studentIds = (roster.data ?? [])
    .map((row) => row.student?.id)
    .filter((id): id is string => Boolean(id));

  return (
    <>
      <RosterWidget userId={userId} kind={kind} />
      <GradingQueueWidget studentIds={studentIds} />
      <PendingInvitationsWidget userId={userId} />
    </>
  );
}

function AdminDashboard({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { activeRole } = useRoleContext();
  const familyMerged = usesMergedFamilyDashboard(activeRole);

  return (
    <>
      <OrganizationOverviewWidget organizationId={organizationId} />
      <SubscriptionWidget organizationId={organizationId} />
      {familyMerged ? <ChildrenWidget userId={userId} /> : null}
      <PendingInvitationsWidget userId={userId} />
    </>
  );
}
