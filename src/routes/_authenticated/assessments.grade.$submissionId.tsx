import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRoleContext } from "@/features/roles/role-context";
import { canGradeAssessments } from "@/features/roles/permissions";
import { assessmentKeys, getSubmission } from "@/features/assessments/api";
import { SubmissionStatusBadge } from "@/features/assessments/components/status-badge";
import { gradeSubmission } from "@/lib/assessment-delivery.functions";

const TITLE = "Grade submission — the Platform";
const DESCRIPTION = "Award marks, leave feedback and record competency mastery.";

export const Route = createFileRoute("/_authenticated/assessments/grade/$submissionId")({
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
  component: Page,
});

function Page() {
  const { submissionId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: assessmentKeys.submission(submissionId),
    queryFn: () => getSubmission(submissionId),
  });

  const [marks, setMarks] = useState<Record<string, number> | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");

  const currentMarks = useMemo(() => {
    if (marks) return marks;
    const seed: Record<string, number> = {};
    (query.data?.answers ?? []).forEach((row) => {
      seed[row.question_id] = row.awarded_points ?? 0;
    });
    return seed;
  }, [marks, query.data]);

  const grade = useServerFn(gradeSubmission);
  const mutation = useMutation({
    mutationFn: (status: "graded" | "reviewed") =>
      grade({
        data: {
          submissionId,
          status,
          feedback: feedback || null,
          answers: (query.data?.answers ?? []).map((row) => ({
            questionId: row.question_id,
            awardedPoints: currentMarks[row.question_id] ?? 0,
            feedback: comments[row.question_id] || null,
          })),
          rubricScores: [],
          competencyIds: [],
        },
      }),
    onSuccess: () => {
      toast.success("Grading saved");
      void navigate({ to: "/assessments" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this grading"),
  });

  if (!activeRole || !canGradeAssessments(activeRole.roleCode)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Not available for this role"
        description="Grading is limited to teachers, tutors and administrators."
      />
    );
  }

  return (
    <QueryState
      isPending={query.isPending}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
    >
      {(data) =>
        !data.submission ? (
          <EmptyState
            icon={ClipboardList}
            title="Submission not found"
            description="This attempt is unavailable."
          />
        ) : (
          <div className="space-y-6">
            <PageHeader
              title={`${data.submission.student?.first_name ?? ""} ${
                data.submission.student?.last_name ?? ""
              }`.trim()}
              description={`${data.submission.assessment?.title ?? "Assessment"} · ${DESCRIPTION}`}
              actions={
                <>
                  <Button
                    variant="outline"
                    onClick={() => mutation.mutate("graded")}
                    disabled={mutation.isPending}
                  >
                    Save grading
                  </Button>
                  <Button onClick={() => mutation.mutate("reviewed")} disabled={mutation.isPending}>
                    Approve and release
                  </Button>
                </>
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              <SubmissionStatusBadge status={data.submission.status} />
              <Badge variant="outline">
                Max score {data.submission.assessment?.max_score ?? "—"}
              </Badge>
              {data.submission.percentage != null ? (
                <Badge variant="outline">{data.submission.percentage}%</Badge>
              ) : null}
              {data.submission.is_late ? <Badge variant="outline">Late</Badge> : null}
            </div>

            <ol className="space-y-4">
              {data.answers.map((row, index) => (
                <li key={row.id}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {index + 1}. {row.question?.prompt}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <pre className="whitespace-pre-wrap rounded-md bg-muted p-3">
                        {JSON.stringify(row.answer ?? {}, null, 2)}
                      </pre>
                      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                        <div>
                          <Label htmlFor={`marks-${row.id}`}>
                            Marks / {row.question?.points ?? 0}
                          </Label>
                          <Input
                            id={`marks-${row.id}`}
                            type="number"
                            min={0}
                            value={currentMarks[row.question_id] ?? 0}
                            onChange={(event) =>
                              setMarks({
                                ...currentMarks,
                                [row.question_id]: Number(event.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor={`comment-${row.id}`}>Comment</Label>
                          <Textarea
                            id={`comment-${row.id}`}
                            value={comments[row.question_id] ?? row.feedback ?? ""}
                            onChange={(event) =>
                              setComments({ ...comments, [row.question_id]: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>

            <Card>
              <CardHeader>
                <CardTitle>Overall feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  aria-label="Overall feedback"
                  value={feedback || (data.submission.feedback ?? "")}
                  onChange={(event) => setFeedback(event.target.value)}
                />
              </CardContent>
            </Card>
          </div>
        )
      }
    </QueryState>
  );
}