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
import { curriculumKeys, listAllSubjects } from "@/features/curriculum/api";
import { saveRubric } from "@/lib/assessments.functions";
import { rubricInputSchema, type RubricInput } from "../schemas";

const NONE = "none";

type Criterion = RubricInput["criteria"][number];

const DEFAULT_LEVELS: Criterion["levels"] = [
  { label: "Below expectation", descriptor: null, points: 1 },
  { label: "Approaching expectation", descriptor: null, points: 2 },
  { label: "Meeting expectation", descriptor: null, points: 3 },
  { label: "Exceeding expectation", descriptor: null, points: 4 },
];

/** Build a reusable rubric of criteria and performance levels. */
export function RubricDialog({
  organizationId,
  open,
  onOpenChange,
  initial,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<RubricInput>;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRubric);

  const [values, setValues] = useState<Partial<RubricInput>>({
    title: "",
    status: "draft",
    isTemplate: false,
    criteria: [{ title: "", description: null, maxPoints: 4, levels: DEFAULT_LEVELS }],
    ...initial,
  });

  const subjects = useQuery({ queryKey: curriculumKeys.allSubjects(), queryFn: listAllSubjects });
  const criteria = values.criteria ?? [];

  const setCriteria = (next: Criterion[]) =>
    setValues((current) => ({ ...current, criteria: next }));

  const mutation = useMutation({
    mutationFn: async () => save({ data: rubricInputSchema.parse({ ...values, organizationId }) }),
    onSuccess: () => {
      toast.success("Rubric saved");
      void queryClient.invalidateQueries({ queryKey: ["rubrics"] });
      onOpenChange(false);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this rubric"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial?.rubricId ? "Edit rubric" : "New rubric"}</DialogTitle>
          <DialogDescription>
            Criteria may be mapped to competencies and learning outcomes during grading.
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
              <Label htmlFor="rubricTitle">Title</Label>
              <Input
                id="rubricTitle"
                required
                value={values.title ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="rubricSubject">Subject</Label>
              <Select
                value={values.subjectId ?? NONE}
                onValueChange={(value) =>
                  setValues((current) => ({
                    ...current,
                    subjectId: value === NONE ? null : value,
                  }))
                }
              >
                <SelectTrigger id="rubricSubject">
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
            <div className="sm:col-span-2">
              <Label htmlFor="rubricDescription">Description</Label>
              <Textarea
                id="rubricDescription"
                value={values.description ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <Label htmlFor="rubricTemplate" className="font-normal">
                Share as an organization template
              </Label>
              <Switch
                id="rubricTemplate"
                checked={Boolean(values.isTemplate)}
                onCheckedChange={(checked) =>
                  setValues((current) => ({ ...current, isTemplate: checked }))
                }
              />
            </div>
          </div>

          <div className="space-y-4">
            {criteria.map((criterion, index) => (
              <fieldset key={index} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Criterion ${index + 1} title`}
                    placeholder="Criterion"
                    value={criterion.title}
                    onChange={(event) =>
                      setCriteria(
                        criteria.map((item, position) =>
                          position === index ? { ...item, title: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Criterion ${index + 1} maximum points`}
                    type="number"
                    min={0}
                    className="w-28"
                    value={criterion.maxPoints}
                    onChange={(event) =>
                      setCriteria(
                        criteria.map((item, position) =>
                          position === index
                            ? { ...item, maxPoints: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove criterion"
                    onClick={() =>
                      setCriteria(criteria.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {criterion.levels.map((level, levelIndex) => (
                    <div key={levelIndex} className="flex items-center gap-2">
                      <Input
                        aria-label={`Level ${levelIndex + 1} label`}
                        value={level.label}
                        onChange={(event) =>
                          setCriteria(
                            criteria.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    levels: item.levels.map((current, current_index) =>
                                      current_index === levelIndex
                                        ? { ...current, label: event.target.value }
                                        : current,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label={`Level ${levelIndex + 1} points`}
                        type="number"
                        min={0}
                        className="w-24"
                        value={level.points}
                        onChange={(event) =>
                          setCriteria(
                            criteria.map((item, position) =>
                              position === index
                                ? {
                                    ...item,
                                    levels: item.levels.map((current, current_index) =>
                                      current_index === levelIndex
                                        ? { ...current, points: Number(event.target.value) }
                                        : current,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCriteria([
                  ...criteria,
                  { title: "", description: null, maxPoints: 4, levels: DEFAULT_LEVELS },
                ])
              }
            >
              <Plus className="mr-1 size-4" /> Add criterion
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save rubric"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
