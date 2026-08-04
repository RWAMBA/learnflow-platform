import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList } from "lucide-react";
import { useRoleContext } from "@/features/roles/role-context";
import { canAuthorAssessments, canGradeAssessments } from "@/features/roles/permissions";
import {
  assessmentKeys,
  getAssessment,
  listQuestionBank,
  listSubmissionsForAssessment,
} from "@/features/assessments/api";
import {
  AssessmentStatusBadge,
  SubmissionStatusBadge,
} from "@/features/assessments/components/status-badge";
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_TRANSITIONS,
  QUESTION_TYPE_LABELS,
  type AssessmentStatus,
  type QuestionType,
} from "@/features/assessments/constants";
import {
  duplicateAssessment,
  setAssessmentQuestions,
  setAssessmentStatus,
} from "@/lib/assessments.functions";
import { formatDateTime } from "@/lib/format";

const TITLE = "Assessment detail — the Platform";
const DESCRIPTION = "Manage questions, lifecycle and submissions for one assessment.";

export const Route = createFileRoute("/_authenticated/assessments/$assessmentId")({
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
  const { assessmentId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mayAuthor = canAuthorAssessments(activeRole?.roleCode);
  const mayGrade = canGradeAssessments(activeRole?.roleCode);

  const query = useQuery({
    queryKey: assessmentKeys.detail(assessmentId),
    queryFn: () => getAssessment(assessmentId),
  });

  const submissions = useQuery({
    queryKey: assessmentKeys.submissions(assessmentId),
    enabled: mayGrade,
    queryFn: () => listSubmissionsForAssessment(assessmentId),
  });

  const bank = useQuery({
    queryKey: assessmentKeys.bank(activeRole?.organizationId ?? "none", { status: "published" }),
    enabled: mayAuthor && Boolean(activeRole?.organizationId),
    queryFn: () => listQuestionBank(activeRole!.organizationId, {}),
  });

  const changeStatus = useServerFn(setAssessmentStatus);
  const saveQuestions = useServerFn(setAssessmentQuestions);
  const duplicate = useServerFn(duplicateAssessment);

  const [selected, setSelected] = useState<string[] | null>(null);
  const currentIds = useMemo(
    () => (query.data?.questions ?? []).map((row) => row.question?.id).filter(Boolean) as string[],
    [query.data],
  );
  const chosen = selected ?? currentIds;

  const statusMutation = useMutation({
    mutationFn: (status: AssessmentStatus) =>
      changeStatus({ data: { assessmentIds: [assessmentId], status } }),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(assessmentId) });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update the status"),
  });

  const questionsMutation = useMutation({
    mutationFn: () =>
      saveQuestions({
        data: {
          assessmentId,
          questions: chosen.map((questionId, index) => ({
            questionId,
            sequenceOrder: index,
            pointsOverride: null,
            required: true,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Questions saved");
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(assessmentId) });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save the question set"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (asTemplate: boolean) =>
      duplicate({ data: { assessmentId, title: null, asTemplate } }),
    onSuccess: (result) => {
      toast.success("Assessment duplicated");
      void navigate({
        to: "/assessments/$assessmentId",
        params: { assessmentId: result.assessmentId },
      });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not duplicate this assessment"),
  });

  return (
    <QueryState
      isPending={query.isPending}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
    >
      {(data) =>
        !data.assessment ? (
          <EmptyState
            icon={ClipboardList}
            title="Assessment not found"
            description="It may have been archived or belongs to another organization."
          />
        ) : (
          <div className="space-y-6">
            <PageHeader
              title={data.assessment.title}
              description={`${data.assessment.type?.name ?? "Assessment"} · ${
                data.assessment.subject?.name ?? "No subject"
              } · Due ${formatDateTime(data.assessment.due_at)}`}
              actions={
                mayAuthor ? (
                  <>
                    <Select
                      value=""
                      onValueChange={(value) => statusMutation.mutate(value as AssessmentStatus)}
                    >
                      <SelectTrigger className="w-52" aria-label="Change lifecycle status">
                        <SelectValue placeholder="Change status" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          ASSESSMENT_TRANSITIONS[data.assessment.status as AssessmentStatus] ?? []
                        ).map((status) => (
                          <SelectItem key={status} value={status}>
                            {ASSESSMENT_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => duplicateMutation.mutate(false)}>
                      Duplicate
                    </Button>
                    <Button variant="outline" onClick={() => duplicateMutation.mutate(true)}>
                      Save as template
                    </Button>
                  </>
                ) : null
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              <AssessmentStatusBadge status={data.assessment.status} />
              <Badge variant="outline">Max score {data.assessment.max_score}</Badge>
              {data.assessment.passing_score != null ? (
                <Badge variant="outline">Pass {data.assessment.passing_score}</Badge>
              ) : null}
              {data.assessment.time_limit_minutes ? (
                <Badge variant="outline">{data.assessment.time_limit_minutes} min limit</Badge>
              ) : null}
              <Badge variant="outline">{data.assessment.attempts_allowed} attempt(s)</Badge>
            </div>

            {data.assessment.instructions ? (
              <Card>
                <CardHeader>
                  <CardTitle>Instructions</CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">
                  {data.assessment.instructions}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Curriculum coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  {data.assessment.strand?.title ?? "No strand"} ·{" "}
                  {data.assessment.sub_strand?.title ?? "No sub-strand"} ·{" "}
                  {data.assessment.grade?.name ?? "All grades"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.competencies.map((row) => (
                    <Badge key={row.id} variant="secondary">
                      {row.competency?.name}
                    </Badge>
                  ))}
                </div>
                <ul className="list-inside list-disc text-muted-foreground">
                  {data.outcomes.map((row) => (
                    <li key={row.id}>{row.learning_outcome?.description}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Questions ({data.questions.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-2">
                  {data.questions.map((row, index) => (
                    <li key={row.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {index + 1}. {row.question?.prompt}
                      </p>
                      <p className="text-muted-foreground">
                        {QUESTION_TYPE_LABELS[row.question?.question_type as QuestionType] ??
                          row.question?.question_type}{" "}
                        · {row.points_override ?? row.question?.points} point(s)
                      </p>
                    </li>
                  ))}
                </ol>

                {mayAuthor ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Question bank</p>
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                      {(bank.data ?? []).map((question) => (
                        <label key={question.id} className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={chosen.includes(question.id)}
                            onCheckedChange={(checked) =>
                              setSelected(
                                checked === true
                                  ? [...chosen, question.id]
                                  : chosen.filter((id) => id !== question.id),
                              )
                            }
                          />
                          <span>
                            {question.prompt}
                            <span className="block text-xs text-muted-foreground">
                              {QUESTION_TYPE_LABELS[question.question_type as QuestionType]} ·{" "}
                              {question.difficulty} · {question.points} point(s)
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline">
                        <Link to="/assessments/bank">Manage bank</Link>
                      </Button>
                      <Button
                        onClick={() => questionsMutation.mutate()}
                        disabled={questionsMutation.isPending}
                      >
                        Save question set
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {mayGrade ? (
              <Card>
                <CardHeader>
                  <CardTitle>Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                  {(submissions.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attempts yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(submissions.data ?? []).map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                        >
                          <div>
                            <Link
                              to="/assessments/grade/$submissionId"
                              params={{ submissionId: row.id }}
                              className="font-medium hover:underline"
                            >
                              {row.student?.first_name} {row.student?.last_name}
                            </Link>
                            <p className="text-muted-foreground">
                              Attempt {row.attempt_number} · Submitted{" "}
                              {formatDateTime(row.submitted_at)}
                              {row.percentage != null ? ` · ${row.percentage}%` : ""}
                            </p>
                          </div>
                          <SubmissionStatusBadge status={row.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        )
      }
    </QueryState>
  );
}