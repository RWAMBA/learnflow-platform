import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { listGrades, listAllSubjects, curriculumKeys } from "@/features/curriculum/api";
import { listStrands, hierarchyKeys } from "@/features/curriculum/hierarchy-api";
import { assessmentKeys, listAssessmentTypes, listRubrics } from "../api";
import { ASSESSMENT_STATUSES, ASSESSMENT_STATUS_LABELS } from "../constants";
import { assessmentInputSchema, type AssessmentInput } from "../schemas";
import { saveAssessment } from "@/lib/assessments.functions";

const NONE = "none";
const toNull = (value: string) => (value === NONE || value === "" ? null : value);
const toLocal = (value: string | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);

export type AssessmentFormValues = Partial<AssessmentInput>;

/** The shared assessment builder used by both the create and edit routes. */
export function AssessmentForm({
  organizationId,
  initial,
  onSaved,
}: {
  organizationId: string;
  initial?: AssessmentFormValues;
  onSaved: (assessmentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveAssessment);

  const [values, setValues] = useState<AssessmentFormValues>({
    title: "",
    status: "draft",
    maxScore: 100,
    weighting: 1,
    attemptsAllowed: 1,
    randomizeQuestions: false,
    randomizeOptions: false,
    lateSubmissionAllowed: true,
    latePenaltyPercent: 0,
    parentVisible: true,
    allowReview: true,
    autoGrade: true,
    isTemplate: false,
    competencyIds: [],
    learningOutcomeIds: [],
    ...initial,
  });

  const set = <K extends keyof AssessmentFormValues>(key: K, value: AssessmentFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const types = useQuery({
    queryKey: assessmentKeys.types(organizationId),
    queryFn: () => listAssessmentTypes(organizationId),
  });
  const grades = useQuery({ queryKey: curriculumKeys.grades(null), queryFn: () => listGrades(null) });
  const subjects = useQuery({ queryKey: curriculumKeys.allSubjects(), queryFn: listAllSubjects });
  const rubrics = useQuery({
    queryKey: assessmentKeys.rubrics(organizationId),
    queryFn: () => listRubrics(organizationId),
  });
  const strands = useQuery({
    queryKey: hierarchyKeys.strands(values.subjectId ?? "none"),
    enabled: Boolean(values.subjectId),
    queryFn: () => listStrands(values.subjectId!),
  });

  const subStrands = useMemo(
    () =>
      (strands.data ?? [])
        .filter((strand) => !values.strandId || strand.id === values.strandId)
        .flatMap((strand) => strand.sub_strands ?? []),
    [strands.data, values.strandId],
  );

  const outcomes = useMemo(
    () =>
      subStrands
        .filter((sub) => !values.subStrandId || sub.id === values.subStrandId)
        .flatMap((sub) => sub.learning_outcomes ?? []),
    [subStrands, values.subStrandId],
  );

  const competencies = useMemo(() => {
    const map = new Map<string, string>();
    outcomes.forEach((outcome) => {
      if (outcome.competency) map.set(outcome.competency.id, outcome.competency.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [outcomes]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = assessmentInputSchema.parse({ ...values, organizationId });
      return save({ data: parsed });
    },
    onSuccess: (result) => {
      toast.success("Assessment saved");
      void queryClient.invalidateQueries({ queryKey: ["assessments"] });
      onSaved(result.assessmentId);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this assessment"),
  });

  const toggleIn = (key: "competencyIds" | "learningOutcomeIds", id: string, checked: boolean) => {
    const current = values[key] ?? [];
    set(key, checked ? [...current, id] : current.filter((value) => value !== id));
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              maxLength={200}
              value={values.title ?? ""}
              onChange={(event) => set("title", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="type">Assessment type</Label>
            <Select
              value={values.assessmentTypeId ?? NONE}
              onValueChange={(value) => set("assessmentTypeId", toNull(value))}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unspecified</SelectItem>
                {(types.data ?? []).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status">Lifecycle status</Label>
            <Select
              value={values.status ?? "draft"}
              onValueChange={(value) => set("status", value as AssessmentInput["status"])}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ASSESSMENT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={values.description ?? ""}
              onChange={(event) => set("description", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={values.instructions ?? ""}
              onChange={(event) => set("instructions", event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="studentInstructions">Student instructions</Label>
            <Textarea
              id="studentInstructions"
              value={values.studentInstructions ?? ""}
              onChange={(event) => set("studentInstructions", event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="teacherNotes">Teacher notes (never shown to learners)</Label>
            <Textarea
              id="teacherNotes"
              value={values.teacherNotes ?? ""}
              onChange={(event) => set("teacherNotes", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curriculum linkage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="grade">Grade</Label>
            <Select value={values.gradeId ?? NONE} onValueChange={(value) => set("gradeId", toNull(value))}>
              <SelectTrigger id="grade">
                <SelectValue placeholder="All grades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All grades</SelectItem>
                {(grades.data ?? []).map((grade) => (
                  <SelectItem key={grade.id} value={grade.id}>
                    {grade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Select
              value={values.subjectId ?? NONE}
              onValueChange={(value) => {
                set("subjectId", toNull(value));
                set("strandId", null);
                set("subStrandId", null);
              }}
            >
              <SelectTrigger id="subject">
                <SelectValue placeholder="Choose a subject" />
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
            <Label htmlFor="strand">Strand</Label>
            <Select
              value={values.strandId ?? NONE}
              onValueChange={(value) => {
                set("strandId", toNull(value));
                set("subStrandId", null);
              }}
            >
              <SelectTrigger id="strand">
                <SelectValue placeholder="Unspecified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unspecified</SelectItem>
                {(strands.data ?? []).map((strand) => (
                  <SelectItem key={strand.id} value={strand.id}>
                    {strand.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subStrand">Sub-strand</Label>
            <Select
              value={values.subStrandId ?? NONE}
              onValueChange={(value) => set("subStrandId", toNull(value))}
            >
              <SelectTrigger id="subStrand">
                <SelectValue placeholder="Unspecified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unspecified</SelectItem>
                {subStrands.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Learning outcomes</legend>
            {outcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Choose a subject to link learning outcomes.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {outcomes.map((outcome) => (
                  <label key={outcome.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={(values.learningOutcomeIds ?? []).includes(outcome.id)}
                      onCheckedChange={(checked) =>
                        toggleIn("learningOutcomeIds", outcome.id, checked === true)
                      }
                    />
                    <span>{outcome.description}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Competencies</legend>
            {competencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Competencies appear once linked learning outcomes are available.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {competencies.map((competency) => (
                  <label key={competency.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={(values.competencyIds ?? []).includes(competency.id)}
                      onCheckedChange={(checked) =>
                        toggleIn("competencyIds", competency.id, checked === true)
                      }
                    />
                    <span>{competency.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scoring and scheduling</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="maxScore">Maximum score</Label>
            <Input
              id="maxScore"
              type="number"
              min={1}
              value={values.maxScore ?? 100}
              onChange={(event) => set("maxScore", Number(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="passingScore">Passing score</Label>
            <Input
              id="passingScore"
              type="number"
              min={0}
              value={values.passingScore ?? ""}
              onChange={(event) =>
                set("passingScore", event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="weighting">Weighting</Label>
            <Input
              id="weighting"
              type="number"
              step="0.1"
              min={0}
              value={values.weighting ?? 1}
              onChange={(event) => set("weighting", Number(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="estimatedMinutes">Estimated duration (minutes)</Label>
            <Input
              id="estimatedMinutes"
              type="number"
              min={0}
              value={values.estimatedMinutes ?? ""}
              onChange={(event) =>
                set("estimatedMinutes", event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="timeLimit">Time limit (minutes)</Label>
            <Input
              id="timeLimit"
              type="number"
              min={0}
              value={values.timeLimitMinutes ?? ""}
              onChange={(event) =>
                set("timeLimitMinutes", event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="attempts">Attempts allowed</Label>
            <Input
              id="attempts"
              type="number"
              min={1}
              value={values.attemptsAllowed ?? 1}
              onChange={(event) => set("attemptsAllowed", Number(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="dueAt">Due date</Label>
            <Input
              id="dueAt"
              type="datetime-local"
              value={toLocal(values.dueAt)}
              onChange={(event) => set("dueAt", toIso(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="availableFrom">Available from</Label>
            <Input
              id="availableFrom"
              type="datetime-local"
              value={toLocal(values.availableFrom)}
              onChange={(event) => set("availableFrom", toIso(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="availableUntil">Available until</Label>
            <Input
              id="availableUntil"
              type="datetime-local"
              value={toLocal(values.availableUntil)}
              onChange={(event) => set("availableUntil", toIso(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="latePenalty">Late penalty (%)</Label>
            <Input
              id="latePenalty"
              type="number"
              min={0}
              max={100}
              value={values.latePenaltyPercent ?? 0}
              onChange={(event) => set("latePenaltyPercent", Number(event.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="rubric">Rubric</Label>
            <Select value={values.rubricId ?? NONE} onValueChange={(value) => set("rubricId", toNull(value))}>
              <SelectTrigger id="rubric">
                <SelectValue placeholder="No rubric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No rubric</SelectItem>
                {(rubrics.data ?? []).map((rubric) => (
                  <SelectItem key={rubric.id} value={rubric.id}>
                    {rubric.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery options</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["randomizeQuestions", "Randomize question order"],
              ["randomizeOptions", "Randomize answer options"],
              ["lateSubmissionAllowed", "Allow late submissions"],
              ["parentVisible", "Visible to parents and guardians"],
              ["allowReview", "Learners may review completed work"],
              ["autoGrade", "Auto-grade objective questions"],
              ["isTemplate", "Save as reusable template"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor={key} className="font-normal">
                {label}
              </Label>
              <Switch
                id={key}
                checked={Boolean(values[key])}
                onCheckedChange={(checked) => set(key, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save assessment"}
        </Button>
      </div>
    </form>
  );
}