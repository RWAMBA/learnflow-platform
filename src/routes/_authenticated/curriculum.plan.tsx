import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Lock, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getStudentLearningPlan,
  hierarchyKeys,
  type LessonState,
} from "@/features/curriculum/hierarchy-api";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import { listStudents, studentKeys } from "@/features/students/api";
import { useRoleContext } from "@/features/roles/role-context";

export const Route = createFileRoute("/_authenticated/curriculum/plan")({
  head: () => ({
    meta: [
      { title: "Learning plan — the Platform" },
      {
        name: "description",
        content: "Lesson progression showing completed, current, upcoming and locked lessons.",
      },
      { property: "og:title", content: "Learning plan — the Platform" },
      {
        property: "og:description",
        content: "Completed, current, upcoming and locked lessons for each assigned subject.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearningPlanPage,
});

const STATE_META: Record<LessonState, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  completed: { label: "Completed", icon: CheckCircle2, tone: "text-success" },
  current: { label: "Current lesson", icon: PlayCircle, tone: "text-primary" },
  upcoming: { label: "Upcoming", icon: CircleDashed, tone: "text-muted-foreground" },
  locked: { label: "Locked", icon: Lock, tone: "text-muted-foreground" },
};

function LearningPlanPage() {
  const { activeRole } = useRoleContext();
  const isStudent = activeRole?.roleCode === "student";
  const organizationId = activeRole?.organizationId ?? "";
  const currentStudent = useCurrentStudent();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const students = useQuery({
    queryKey: studentKeys.list(organizationId),
    enabled: !isStudent && Boolean(organizationId),
    queryFn: () => listStudents(organizationId),
  });

  const studentId = isStudent ? (currentStudent.data?.id ?? "") : selectedStudentId;

  const plan = useQuery({
    queryKey: hierarchyKeys.learningPlan(studentId),
    enabled: Boolean(studentId),
    queryFn: () => getStudentLearningPlan(studentId),
  });

  return (
    <div>
      <PageHeader
        title="Learning plan"
        description="Lesson progression with completed, current, upcoming and locked lessons."
      />

      {!isStudent ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Learner</CardTitle>
          </CardHeader>
          <CardContent className="max-w-sm">
            <Label htmlFor="plan-student">Select a learner</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger id="plan-student">
                <SelectValue placeholder="Choose a learner" />
              </SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {!studentId ? (
        <EmptyState
          title="No learner selected"
          description="Choose a learner to see their lesson progression."
        />
      ) : (
        <QueryState
          isPending={plan.isPending}
          error={plan.error}
          data={plan.data}
          onRetry={() => void plan.refetch()}
          skeleton={<ListSkeleton rows={4} />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              title="No curriculum assigned"
              description="Assign a subject to this learner to build their learning plan."
            />
          }
        >
          {(rows) => (
            <div className="space-y-6">
              {rows.map((subject) => (
                <Card key={subject.subjectId}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {subject.subjectName}
                      {subject.gradeName ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {subject.gradeName}
                        </span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Progress value={subject.percent} aria-label="Subject completion" />
                      <p className="text-sm text-muted-foreground">
                        {subject.completed} of {subject.total} lessons complete ({subject.percent}%)
                      </p>
                    </div>
                    {subject.lessons.length === 0 ? (
                      <p className="text-muted-foreground">
                        No lessons have been published for this subject yet.
                      </p>
                    ) : (
                      <ol className="divide-y rounded-md border">
                        {subject.lessons.map((lesson) => {
                          const meta = STATE_META[lesson.state];
                          const Icon = meta.icon;
                          return (
                            <li key={lesson.id} className="p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <span className="flex items-center gap-2">
                                  <Icon aria-hidden="true" className={`size-4 ${meta.tone}`} />
                                  {lesson.state === "locked" ? (
                                    <span className="text-muted-foreground">{lesson.title}</span>
                                  ) : (
                                    <Link
                                      to="/curriculum/lessons/$lessonId"
                                      params={{ lessonId: lesson.id }}
                                      className="font-medium hover:underline"
                                    >
                                      {lesson.title}
                                    </Link>
                                  )}
                                </span>
                                <span className="flex items-center gap-3 text-sm text-muted-foreground">
                                  {lesson.estimatedMinutes
                                    ? `${lesson.estimatedMinutes} min`
                                    : null}
                                  <span>{meta.label}</span>
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
