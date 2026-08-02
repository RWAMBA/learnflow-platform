import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignmentKeys,
  getAssignment,
  listCompetenciesForSubject,
} from "@/features/assignments/api";
import {
  AssignmentStatusBadge,
  MasteryBadge,
} from "@/features/assignments/components/status-badge";
import { useRoleContext } from "@/features/roles/role-context";
import { can } from "@/features/roles/permissions";
import { gradeAssignment, submitAssignment } from "@/lib/assignments.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment — the Platform" },
      { name: "description", content: "Assignment detail, submission and grading." },
      { property: "og:title", content: "Assignment — the Platform" },
      { property: "og:description", content: "Assignment detail, submission and grading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const MASTERY = ["emerging", "developing", "proficient", "advanced"] as const;

function Page() {
  const { assignmentId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const isStudent = activeRole?.roleCode === "student";
  const mayGrade = can.gradeAssignments(activeRole?.roleCode);

  const query = useQuery({
    queryKey: assignmentKeys.detail(assignmentId),
    queryFn: () => getAssignment(assignmentId),
  });
  const assignment = query.data;
  const subjectId = assignment?.lesson?.subject?.id ?? null;

  const competencies = useQuery({
    queryKey: ["competencies", subjectId],
    enabled: Boolean(subjectId) && mayGrade,
    queryFn: () => listCompetenciesForSubject(subjectId),
  });

  const submitFn = useServerFn(submitAssignment);
  const gradeFn = useServerFn(gradeAssignment);

  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [masteryLevel, setMasteryLevel] = useState<(typeof MASTERY)[number]>("proficient");
  const [competencyIds, setCompetencyIds] = useState<string[]>([]);

  const refresh = () => void query.refetch();

  const statusMutation = useMutation({
    mutationFn: (status: "in_progress" | "submitted") =>
      submitFn({ data: { assignmentId, status } }),
    onSuccess: (_data, status) => {
      toast.success(status === "submitted" ? "Work submitted" : "Marked as in progress");
      refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update this assignment"),
  });

  const gradeMutation = useMutation({
    mutationFn: () =>
      gradeFn({
        data: {
          assignmentId,
          gradedByUserRoleId: activeRole!.userRoleId,
          score: score.trim() ? Number(score) : undefined,
          feedback: feedback.trim() ? feedback.trim() : undefined,
          masteryLevel,
          competencyIds,
        },
      }),
    onSuccess: () => {
      toast.success("Assignment graded");
      setScore("");
      setFeedback("");
      setCompetencyIds([]);
      refresh();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this grade"),
  });

  return (
    <div>
      <PageHeader
        title="Assignment"
        description="Assignment detail, submission and grading."
        actions={
          <Button asChild variant="outline">
            <Link to="/assignments">Back to assignments</Link>
          </Button>
        }
      />

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={assignment}
        onRetry={refresh}
        isEmpty={(data) => !data}
        empty={<EmptyState title="Assignment not found" />}
      >
        {(data) => (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>{data.lesson?.title ?? "Lesson"}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.student?.first_name} {data.student?.last_name} ·{" "}
                    {data.lesson?.subject?.name ?? "—"}
                  </p>
                </div>
                <AssignmentStatusBadge status={data.status} dueAt={data.due_at} />
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-muted-foreground">Due</dt>
                    <dd>{formatDateTime(data.due_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Assigned</dt>
                    <dd>{formatDateTime(data.created_at)}</dd>
                  </div>
                </dl>
                {data.instructions ? (
                  <div>
                    <h2 className="text-sm font-medium">Instructions</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{data.instructions}</p>
                  </div>
                ) : null}
                {data.lesson?.id ? (
                  <Button asChild variant="outline">
                    <Link to="/curriculum/lessons/$lessonId" params={{ lessonId: data.lesson.id }}>
                      Open lesson
                    </Link>
                  </Button>
                ) : null}

                {isStudent && data.status !== "graded" ? (
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      disabled={statusMutation.isPending || data.status === "in_progress"}
                      onClick={() => statusMutation.mutate("in_progress")}
                    >
                      Start work
                    </Button>
                    <Button
                      disabled={statusMutation.isPending || data.status === "submitted"}
                      onClick={() => statusMutation.mutate("submitted")}
                    >
                      {data.status === "submitted" ? "Submitted" : "Submit work"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.assessments?.length ? (
                    data.assessments.map((assessment) => {
                      const result = (assessment.result ?? {}) as {
                        score?: number | null;
                        feedback?: string | null;
                        mastery_level?: string | null;
                      };
                      return (
                        <div key={assessment.id} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {result.score == null ? "No score" : `${result.score}%`}
                            </span>
                            {result.mastery_level ? (
                              <MasteryBadge level={result.mastery_level} />
                            ) : null}
                          </div>
                          {result.feedback ? (
                            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                              {result.feedback}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatDateTime(assessment.graded_at)}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyState title="Not graded yet" />
                  )}
                </CardContent>
              </Card>

              {mayGrade ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Grade this work</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="score">Score (%)</Label>
                      <Input
                        id="score"
                        type="number"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(event) => setScore(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mastery">Mastery level</Label>
                      <Select
                        value={masteryLevel}
                        onValueChange={(value) => setMasteryLevel(value as typeof masteryLevel)}
                      >
                        <SelectTrigger id="mastery">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MASTERY.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {competencies.data?.length ? (
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Rubric — competencies met</legend>
                        {competencies.data.map((competency) => (
                          <label key={competency.id} className="flex items-start gap-2 text-sm">
                            <Checkbox
                              checked={competencyIds.includes(competency.id)}
                              onCheckedChange={(value) =>
                                setCompetencyIds((previous) =>
                                  value
                                    ? [...previous, competency.id]
                                    : previous.filter((id) => id !== competency.id),
                                )
                              }
                            />
                            <span>{competency.name}</span>
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="feedback">Feedback</Label>
                      <Textarea
                        id="feedback"
                        rows={4}
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={gradeMutation.isPending || !activeRole}
                      onClick={() => gradeMutation.mutate()}
                    >
                      {gradeMutation.isPending ? "Saving…" : "Save grade"}
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
