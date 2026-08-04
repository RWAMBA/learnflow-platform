import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { curriculumKeys, listAllSubjects, listGrades } from "@/features/curriculum/api";
import { saveQuestion } from "@/lib/assessments.functions";
import {
  DIFFICULTIES,
  OPTION_TYPES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "../constants";
import { questionInputSchema, type QuestionInput } from "../schemas";

const NONE = "none";
const toNull = (value: string) => (value === NONE || value === "" ? null : value);

export type QuestionDialogValues = Partial<QuestionInput>;

/** Create or edit one reusable question-bank item. */
export function QuestionDialog({
  organizationId,
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: QuestionDialogValues;
  onSaved?: (questionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveQuestion);

  const [values, setValues] = useState<QuestionDialogValues>({
    questionType: "multiple_choice",
    prompt: "",
    points: 1,
    difficulty: "medium",
    status: "draft",
    tags: [],
    body: { options: [] },
    answerKey: { choices: [] },
    createVersion: false,
    ...initial,
  });

  const set = <K extends keyof QuestionDialogValues>(key: K, value: QuestionDialogValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const subjects = useQuery({ queryKey: curriculumKeys.allSubjects(), queryFn: listAllSubjects });
  const grades = useQuery({ queryKey: curriculumKeys.grades(null), queryFn: () => listGrades(null) });

  const type = (values.questionType ?? "multiple_choice") as QuestionType;
  const options = values.body?.options ?? [];
  const usesOptions = OPTION_TYPES.includes(type);

  const setOptions = (next: { id: string; text: string }[]) =>
    set("body", { ...(values.body ?? { options: [] }), options: next });

  const mutation = useMutation({
    mutationFn: async () => save({ data: questionInputSchema.parse({ ...values, organizationId }) }),
    onSuccess: (result) => {
      toast.success("Question saved");
      void queryClient.invalidateQueries({ queryKey: ["question-bank"] });
      onSaved?.(result.questionId);
      onOpenChange(false);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this question"),
  });

  const toggleChoice = (optionId: string, checked: boolean) => {
    const current = values.answerKey?.choices ?? [];
    const next =
      type === "multiple_response"
        ? checked
          ? [...current, optionId]
          : current.filter((value) => value !== optionId)
        : [optionId];
    set("answerKey", { ...(values.answerKey ?? {}), choices: next });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.questionId ? "Edit question" : "New question"}</DialogTitle>
          <DialogDescription>
            Questions live in the organization question bank and can be reused across assessments.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="questionType">Question type</Label>
              <Select
                value={type}
                onValueChange={(value) => set("questionType", value as QuestionType)}
              >
                <SelectTrigger id="questionType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {QUESTION_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                type="number"
                min={0}
                value={values.points ?? 1}
                onChange={(event) => set("points", Number(event.target.value))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              required
              value={values.prompt ?? ""}
              onChange={(event) => set("prompt", event.target.value)}
            />
          </div>

          {usesOptions ? (
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Options and answer key</legend>
              {options.map((option, index) => (
                <div key={option.id} className="flex items-center gap-2">
                  <Checkbox
                    aria-label="Correct answer"
                    checked={(values.answerKey?.choices ?? []).includes(option.id)}
                    onCheckedChange={(checked) => toggleChoice(option.id, checked === true)}
                  />
                  <Input
                    aria-label={`Option ${index + 1}`}
                    value={option.text}
                    onChange={(event) =>
                      setOptions(
                        options.map((item) =>
                          item.id === option.id ? { ...item, text: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove option"
                    onClick={() => setOptions(options.filter((item) => item.id !== option.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setOptions([
                    ...options,
                    { id: `opt-${options.length + 1}-${Date.now()}`, text: "" },
                  ])
                }
              >
                <Plus className="mr-1 size-4" /> Add option
              </Button>
            </fieldset>
          ) : null}

          {type === "short_answer" || type === "fill_blank" ? (
            <div>
              <Label htmlFor="answerText">Expected answer</Label>
              <Input
                id="answerText"
                value={values.answerKey?.text ?? ""}
                onChange={(event) =>
                  set("answerKey", { ...(values.answerKey ?? {}), text: event.target.value })
                }
              />
            </div>
          ) : null}

          {type === "numeric" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="answerValue">Expected value</Label>
                <Input
                  id="answerValue"
                  type="number"
                  value={values.answerKey?.value ?? ""}
                  onChange={(event) =>
                    set("answerKey", {
                      ...(values.answerKey ?? {}),
                      value: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="tolerance">Tolerance</Label>
                <Input
                  id="tolerance"
                  type="number"
                  min={0}
                  step="0.01"
                  value={values.answerKey?.tolerance ?? 0}
                  onChange={(event) =>
                    set("answerKey", {
                      ...(values.answerKey ?? {}),
                      tolerance: Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          <div>
            <Label htmlFor="explanation">Explanation shown after grading</Label>
            <Textarea
              id="explanation"
              value={values.explanation ?? ""}
              onChange={(event) => set("explanation", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={values.difficulty ?? "medium"}
                onValueChange={(value) => set("difficulty", value as QuestionInput["difficulty"])}
              >
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="questionStatus">Status</Label>
              <Select
                value={values.status ?? "draft"}
                onValueChange={(value) => set("status", value as QuestionInput["status"])}
              >
                <SelectTrigger id="questionStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="questionSubject">Subject</Label>
              <Select
                value={values.subjectId ?? NONE}
                onValueChange={(value) => set("subjectId", toNull(value))}
              >
                <SelectTrigger id="questionSubject">
                  <SelectValue placeholder="Unspecified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unspecified</SelectItem>
                  {(subjects.data ?? []).map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="questionGrade">Grade</Label>
              <Select
                value={values.gradeId ?? NONE}
                onValueChange={(value) => set("gradeId", toNull(value))}
              >
                <SelectTrigger id="questionGrade">
                  <SelectValue placeholder="Unspecified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unspecified</SelectItem>
                  {(grades.data ?? []).map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={values.category ?? ""}
                onChange={(event) => set("category", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={(values.tags ?? []).join(", ")}
                onChange={(event) =>
                  set(
                    "tags",
                    event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  )
                }
              />
            </div>
          </div>

          {initial?.questionId ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="createVersion" className="font-normal">
                Keep the current question and save this as a new version
              </Label>
              <Switch
                id="createVersion"
                checked={Boolean(values.createVersion)}
                onCheckedChange={(checked) => set("createVersion", checked)}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}