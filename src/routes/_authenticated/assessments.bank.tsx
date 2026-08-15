import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Library, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoleContext } from "@/features/roles/role-context";
import { canAuthorAssessments } from "@/features/roles/permissions";
import { assessmentKeys, listQuestionBank, listRubrics } from "@/features/assessments/api";
import {
  QuestionDialog,
  type QuestionDialogValues,
} from "@/features/assessments/components/question-dialog";
import { RubricDialog } from "@/features/assessments/components/rubric-dialog";
import {
  DIFFICULTIES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@/features/assessments/constants";
import { archiveQuestions, importQuestions } from "@/lib/assessments.functions";

const TITLE = "Question bank — the Platform";
const DESCRIPTION = "A shared, tenant-scoped library of reusable assessment questions.";

export const Route = createFileRoute("/_authenticated/assessments/bank")({
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
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const organizationId = activeRole?.organizationId ?? null;

  const [term, setTerm] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [status, setStatus] = useState("all");
  const [questionType, setQuestionType] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<QuestionDialogValues | null>(null);
  const [rubricOpen, setRubricOpen] = useState(false);

  const filters = { term, difficulty, status, questionType };
  const query = useQuery({
    queryKey: assessmentKeys.bank(organizationId ?? "none", filters),
    enabled: Boolean(organizationId),
    queryFn: () => listQuestionBank(organizationId!, filters as never),
  });
  const rubrics = useQuery({
    queryKey: assessmentKeys.rubrics(organizationId ?? "none"),
    enabled: Boolean(organizationId),
    queryFn: () => listRubrics(organizationId!),
  });

  const archive = useServerFn(archiveQuestions);
  const importer = useServerFn(importQuestions);

  const archiveMutation = useMutation({
    mutationFn: () => archive({ data: { questionIds: selected } }),
    onSuccess: () => {
      toast.success("Questions archived");
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["question-bank"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not archive these questions"),
  });

  const importMutation = useMutation({
    mutationFn: (questions: unknown[]) =>
      importer({ data: { organizationId: organizationId!, questions: questions as never } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} question(s)`);
      void queryClient.invalidateQueries({ queryKey: ["question-bank"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  if (!activeRole || !canAuthorAssessments(activeRole.roleCode)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Not available for this role"
        description="The question bank is available to teachers, tutors and administrators."
      />
    );
  }

  const exportSelected = () => {
    const rows = (query.data ?? []).filter((row) => selected.includes(row.id));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "question-bank.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Question bank"
        description={DESCRIPTION}
        actions={
          <>
            <Button variant="outline" onClick={() => setRubricOpen(true)}>
              New rubric
            </Button>
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                Import
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const parsed = JSON.parse(await file.text());
                      importMutation.mutate(Array.isArray(parsed) ? parsed : [parsed]);
                    } catch {
                      toast.error("That file is not valid JSON");
                    }
                  }}
                />
              </label>
            </Button>
            <Button onClick={() => setEditing({})}>New question</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input
          aria-label="Search questions"
          placeholder="Search prompts"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <Select value={questionType} onValueChange={setQuestionType}>
          <SelectTrigger aria-label="Filter by question type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {QUESTION_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {QUESTION_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger aria-label="Filter by difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All difficulties</SelectItem>
            {DIFFICULTIES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {QUESTION_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border p-3">
          <span className="text-sm">{selected.length} selected</span>
          <Button size="sm" variant="outline" onClick={exportSelected}>
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            Archive
          </Button>
        </div>
      ) : null}

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={Library}
            title="The bank is empty"
            description="Add your first reusable question to get started."
          />
        }
      >
        {(data) => (
          <ul className="space-y-3">
            {data.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        aria-label={`Select question ${row.prompt}`}
                        checked={selected.includes(row.id)}
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked === true
                              ? [...selected, row.id]
                              : selected.filter((id) => id !== row.id),
                          )
                        }
                      />
                      <div>
                        <p className="font-medium">{row.prompt}</p>
                        <p className="text-sm text-muted-foreground">
                          {QUESTION_TYPE_LABELS[row.question_type as QuestionType]} ·{" "}
                          {row.subject?.name ?? "No subject"} · {row.difficulty} · v{row.version}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(row.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{row.status}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            questionId: row.id,
                            prompt: row.prompt,
                            questionType: row.question_type as QuestionType,
                            points: row.points,
                            difficulty: row.difficulty as never,
                            status: row.status as never,
                            category: row.category,
                            tags: row.tags ?? [],
                            subjectId: row.subject_id,
                            gradeId: row.grade_id,
                            body: (row.body ?? { options: [] }) as never,
                            answerKey: (row.answer_key ?? null) as never,
                            explanation: row.explanation,
                          })
                        }
                      >
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {rubrics.data && rubrics.data.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Rubrics</h2>
          <ul className="space-y-2">
            {rubrics.data.map((rubric) => (
              <li key={rubric.id} className="rounded-md border p-3 text-sm">
                <span className="font-medium">{rubric.title}</span>
                <span className="text-muted-foreground"> · {rubric.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <QuestionDialog
          organizationId={activeRole.organizationId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={editing}
        />
      ) : null}

      <RubricDialog
        organizationId={activeRole.organizationId}
        open={rubricOpen}
        onOpenChange={setRubricOpen}
      />
    </div>
  );
}
