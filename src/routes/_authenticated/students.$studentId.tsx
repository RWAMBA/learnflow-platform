import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStudent, studentKeys } from "@/features/students/api";
import {
  assignmentKeys,
  listAssignmentsForStudents,
  listProgressForStudent,
} from "@/features/assignments/api";
import { AssignmentStatusBadge, MasteryBadge } from "@/features/assignments/components/status-badge";
import {
  listOrganizationMembers,
  listRelationshipsForStudent,
  relationshipKeys,
} from "@/features/relationships/api";
import { inviteRelationship } from "@/lib/relationships.functions";
import { useRoleContext } from "@/features/roles/role-context";
import { can } from "@/features/roles/permissions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/students/$studentId")({
  head: () => ({
    meta: [
      { title: "Student profile — the Platform" },
      { name: "description", content: "Assignments, mastery progress and connected adults for this student." },
      { property: "og:title", content: "Student profile — the Platform" },
      { property: "og:description", content: "Assignments, progress and connected adults." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const { activeRole } = useRoleContext();

  const studentQuery = useQuery({
    queryKey: studentKeys.detail(studentId),
    queryFn: () => getStudent(studentId),
  });

  if (studentQuery.isPending) return <ListSkeleton />;
  if (studentQuery.error) return <ErrorState onRetry={() => void studentQuery.refetch()} />;
  if (!studentQuery.data) {
    return (
      <EmptyState
        title="Student not found"
        description="You may not have access to this student, or the record was removed."
        action={
          <Button asChild size="sm">
            <Link to="/students">Back to students</Link>
          </Button>
        }
      />
    );
  }

  const student = studentQuery.data;

  return (
    <div>
      <PageHeader
        title={`${student.first_name} ${student.last_name}`}
        description={`${student.grade?.name ?? "No grade set"}${student.pathway ? ` · ${student.pathway.name}` : ""}`}
        actions={
          can.createAssignments(activeRole?.roleCode) ? (
            <Button asChild>
              <Link to="/assignments/new" search={{ studentId }}>
                Assign work
              </Link>
            </Button>
          ) : null
        }
      />

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="people">Connected adults</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="pt-4">
          <StudentAssignments studentId={studentId} />
        </TabsContent>
        <TabsContent value="progress" className="pt-4">
          <StudentProgress studentId={studentId} />
        </TabsContent>
        <TabsContent value="people" className="pt-4">
          <StudentRelationships studentId={studentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StudentAssignments({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: assignmentKeys.forStudent(studentId),
    queryFn: () => listAssignmentsForStudents([studentId]),
  });

  return (
    <QueryState
      isPending={query.isPending}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
      isEmpty={(data) => data.length === 0}
      empty={<EmptyState title="No assignments yet" description="Assigned lessons will appear here." />}
    >
      {(assignments) => (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id}>
              <Link to="/assignments/$assignmentId" params={{ assignmentId: assignment.id }}>
                <Card className="transition-colors duration-200 hover:bg-accent">
                  <CardContent className="flex items-center justify-between gap-3 pt-6">
                    <span>
                      <span className="block font-medium">{assignment.lesson?.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {assignment.lesson?.subject?.name} · due {formatDate(assignment.due_at)}
                      </span>
                    </span>
                    <AssignmentStatusBadge status={assignment.status} dueAt={assignment.due_at} />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function StudentProgress({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["progress", studentId],
    queryFn: () => listProgressForStudent(studentId),
  });

  return (
    <QueryState
      isPending={query.isPending}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
      isEmpty={(data) => data.length === 0}
      empty={<EmptyState title="No progress recorded" description="Mastery is recorded when work is graded." />}
    >
      {(records) => (
        <ul className="space-y-2">
          {records.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
              <span>
                <span className="block font-medium">{record.competency?.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {record.competency?.subject?.name} · {formatDate(record.recorded_at)}
                </span>
              </span>
              <MasteryBadge level={record.mastery_level} />
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function StudentRelationships({ studentId }: { studentId: string }) {
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteRelationship);
  const [kind, setKind] = useState<"parent" | "teacher" | "tutor">("teacher");
  const [inviteeUserId, setInviteeUserId] = useState<string>("");

  const relationships = useQuery({
    queryKey: relationshipKeys.forStudent(studentId),
    queryFn: () => listRelationshipsForStudent(studentId),
  });

  const members = useQuery({
    queryKey: relationshipKeys.orgMembers(activeRole?.organizationId ?? ""),
    queryFn: () => listOrganizationMembers(activeRole!.organizationId),
    enabled: Boolean(activeRole),
  });

  const mutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          kind,
          organizationId: activeRole!.organizationId,
          studentId,
          inviteeUserId,
        },
      }),
    onSuccess: async () => {
      setInviteeUserId("");
      await queryClient.invalidateQueries({ queryKey: relationshipKeys.forStudent(studentId) });
      toast.success("Invitation sent.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected adults</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            isPending={relationships.isPending}
            error={relationships.error}
            data={relationships.data}
            onRetry={() => void relationships.refetch()}
            isEmpty={(data) => data.parents.length + data.teachers.length + data.tutors.length === 0}
            empty={<EmptyState title="Nobody connected yet" description="Invite a teacher, tutor or co-guardian." />}
          >
            {(data) => (
              <ul className="space-y-2">
                {data.parents.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <span>
                      <span className="block font-medium">{row.parent?.full_name ?? "Invited guardian"}</span>
                      <span className="block text-sm text-muted-foreground">
                        Guardian · {row.permission_level}
                      </span>
                    </span>
                    <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
                {data.teachers.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <span>
                      <span className="block font-medium">{row.teacher?.full_name ?? "Invited teacher"}</span>
                      <span className="block text-sm text-muted-foreground">
                        Teacher · {row.subject?.name ?? "All subjects"}
                      </span>
                    </span>
                    <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
                {data.tutors.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                    <span>
                      <span className="block font-medium">{row.tutor?.full_name ?? "Invited tutor"}</span>
                      <span className="block text-sm text-muted-foreground">
                        Tutor · {row.subject?.name ?? "All subjects"}
                      </span>
                    </span>
                    <Badge variant="outline">{row.status.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>

      {can.createRelationships(activeRole?.roleCode) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite someone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="invite-kind">
                Relationship
              </label>
              <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                <SelectTrigger id="invite-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="tutor">Tutor</SelectItem>
                  <SelectItem value="parent">Parent/Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="invite-person">
                Person
              </label>
              <Select value={inviteeUserId} onValueChange={setInviteeUserId}>
                <SelectTrigger id="invite-person">
                  <SelectValue placeholder="Choose an organization member" />
                </SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.user_id}>
                      {member.profile?.full_name ?? "Member"} · {member.role?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!inviteeUserId || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
