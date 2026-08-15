import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { assessmentKeys, getSubmission } from "@/features/assessments/api";
import { AnswerField, type AnswerValue } from "@/features/assessments/components/answer-field";
import { autosaveAttempt, submitAttempt } from "@/lib/assessment-delivery.functions";

const TITLE = "Take assessment — the Platform";
const DESCRIPTION = "Answer your assessment; progress saves automatically.";

export const Route = createFileRoute("/_authenticated/assessments/take/$submissionId")({
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
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: assessmentKeys.submission(submissionId),
    queryFn: () => getSubmission(submissionId),
  });

  const [answers, setAnswers] = useState<Record<string, AnswerValue> | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);

  const autosave = useServerFn(autosaveAttempt);
  const submit = useServerFn(submitAttempt);

  const current = useMemo(() => {
    if (answers) return answers;
    const stored = (query.data?.submission?.autosave ?? {}) as Record<string, AnswerValue>;
    return stored;
  }, [answers, query.data]);

  const locked = query.data?.submission?.status !== "in_progress";

  useEffect(() => {
    if (locked) return;
    const tick = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(tick);
  }, [locked]);

  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      void autosave({ data: { submissionId, autosave: current, timeSpentSeconds: seconds } })
        .then((result) => setSavedAt(result.savedAt))
        .catch(() => undefined);
    }, 15000);
    return () => clearInterval(timer);
  }, [autosave, current, locked, seconds, submissionId]);

  const submitMutation = useMutation({
    mutationFn: () =>
      submit({ data: { submissionId, autosave: current, timeSpentSeconds: seconds } }),
    onSuccess: () => {
      toast.success("Assessment submitted");
      void navigate({ to: "/assessments" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not submit this attempt"),
  });

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
            title="Attempt not found"
            description="This attempt is unavailable."
          />
        ) : (
          <div className="space-y-6">
            <PageHeader
              title={data.submission.assessment?.title ?? "Assessment"}
              description={DESCRIPTION}
              actions={
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={locked || submitMutation.isPending}
                >
                  {locked ? "Submitted" : "Submit assessment"}
                </Button>
              }
            />

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Attempt {data.submission.attempt_number}</Badge>
              <Badge variant="outline">
                {Math.floor(seconds / 60)}m {seconds % 60}s elapsed
              </Badge>
              <span aria-live="polite">
                {savedAt
                  ? `Progress saved ${new Date(savedAt).toLocaleTimeString()}`
                  : "Autosaving"}
              </span>
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
                    <CardContent>
                      {row.question ? (
                        <AnswerField
                          question={row.question}
                          disabled={locked}
                          value={current[row.question_id] ?? {}}
                          onChange={(next) => {
                            dirty.current = true;
                            setAnswers({ ...current, [row.question_id]: next });
                          }}
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        )
      }
    </QueryState>
  );
}
