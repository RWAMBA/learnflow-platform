import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import {
  assignmentKeys,
  listAssignmentsForStudents,
  listProgressForStudent,
} from "@/features/assignments/api";
import {
  AssignmentStatusBadge,
  MasteryBadge,
} from "@/features/assignments/components/status-badge";
import { curriculumKeys, getGradeWithContent } from "@/features/curriculum/api";
import { formatDate } from "@/lib/format";
import { WidgetCard } from "./widget-card";

export function DueTodayWidget({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: assignmentKeys.forStudent(studentId),
    queryFn: () => listAssignmentsForStudents([studentId]),
  });

  return (
    <WidgetCard
      title="Due next"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/assignments">All work</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={2} />}
        isEmpty={(data) => data.filter((item) => item.status !== "graded").length === 0}
        empty={
          <EmptyState
            icon={CalendarClock}
            title="Nothing due"
            description="You're all caught up."
          />
        }
      >
        {(assignments) => (
          <ul className="learning-surface space-y-3 rounded-md">
            {assignments
              .filter((assignment) => assignment.status !== "graded")
              .slice(0, 5)
              .map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-3">
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: assignment.id }}
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate font-medium">{assignment.lesson?.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      Due {formatDate(assignment.due_at)}
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

export function SubjectGridWidget({ gradeId }: { gradeId: string | null }) {
  const query = useQuery({
    queryKey: curriculumKeys.grade(gradeId ?? "none"),
    queryFn: () => getGradeWithContent(gradeId!),
    enabled: Boolean(gradeId),
  });

  if (!gradeId) {
    return (
      <WidgetCard title="Your subjects">
        <EmptyState
          icon={BookOpen}
          title="No grade set"
          description="An administrator or guardian can set your grade."
        />
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      title="Your subjects"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/curriculum">Browse</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => data.subjects.length === 0}
        empty={<EmptyState icon={BookOpen} title="No subjects yet" />}
      >
        {(data) => (
          <ul className="learning-surface grid gap-2 rounded-md sm:grid-cols-2">
            {data.subjects.map((subject) => (
              <li key={subject.id}>
                <Link
                  to="/curriculum/subjects/$subjectId"
                  params={{ subjectId: subject.id }}
                  className="block rounded-md border p-3 font-medium transition-colors duration-200 hover:bg-accent"
                >
                  {subject.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}

export function ProgressSummaryWidget({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["progress", studentId],
    queryFn: () => listProgressForStudent(studentId),
  });

  return (
    <WidgetCard title="Recent progress">
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={2} />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            title="No progress recorded yet"
            description="Mastery appears here after work is graded."
          />
        }
      >
        {(records) => (
          <ul className="learning-surface space-y-3 rounded-md">
            {records.slice(0, 5).map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{record.competency?.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {record.competency?.subject?.name}
                  </span>
                </span>
                <MasteryBadge level={record.mastery_level} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}
