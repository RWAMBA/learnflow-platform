import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { listRosterForEducator } from "@/features/students/api";
import { assignmentKeys, listAssignmentsForStudents } from "@/features/assignments/api";
import { AssignmentStatusBadge } from "@/features/assignments/components/status-badge";
import { formatDate } from "@/lib/format";
import { WidgetCard } from "./widget-card";

export function RosterWidget({ userId, kind }: { userId: string; kind: "teacher" | "tutor" }) {
  const query = useQuery({
    queryKey: ["roster", userId, kind],
    queryFn: () => listRosterForEducator(userId, kind),
  });

  return (
    <WidgetCard
      title="Your roster"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/roster">Open roster</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={2} />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title="No students assigned"
            description="A guardian or administrator connects students to you."
          />
        }
      >
        {(rows) => (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: row.student!.id }}
                  className="block rounded-lg border p-3 transition-colors duration-200 hover:bg-accent"
                >
                  <span className="block font-medium">
                    {row.student?.first_name} {row.student?.last_name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {row.subject?.name ?? "All subjects"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}

export function GradingQueueWidget({ studentIds }: { studentIds: string[] }) {
  const query = useQuery({
    queryKey: assignmentKeys.list(`grading:${studentIds.join(",")}`),
    queryFn: () => listAssignmentsForStudents(studentIds),
    enabled: studentIds.length > 0,
  });

  const pending = (query.data ?? []).filter((assignment) => assignment.status === "submitted");

  return (
    <WidgetCard
      title="Awaiting grading"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/assignments">All assignments</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending && studentIds.length > 0}
        error={query.error}
        data={query.data ?? []}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={2} />}
        isEmpty={() => pending.length === 0}
        empty={<EmptyState icon={ClipboardList} title="Nothing to grade" description="Submitted work appears here." />}
      >
        {() => (
          <ul className="space-y-3">
            {pending.slice(0, 6).map((assignment) => (
              <li key={assignment.id} className="flex items-center justify-between gap-3">
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: assignment.id }}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate font-medium">{assignment.lesson?.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {assignment.student?.first_name} {assignment.student?.last_name} · due{" "}
                    {formatDate(assignment.due_at)}
                  </span>
                </Link>
                <AssignmentStatusBadge status={assignment.status} dueAt={assignment.due_at} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}
