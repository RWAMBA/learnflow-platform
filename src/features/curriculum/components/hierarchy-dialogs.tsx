import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cloneCurriculumVersion,
  duplicateSubject,
  saveCurriculumResource,
  saveCurriculumVersion,
  saveLearningOutcome,
  saveStrand,
  saveSubStrand,
  updateLessonDetails,
} from "@/lib/curriculum-hierarchy.functions";
import {
  CURRICULUM_STATUSES,
  RESOURCE_TYPES,
  uploadResourceFile,
  type ResourceEntity,
  type ResourceType,
} from "@/features/curriculum/hierarchy-api";

const statusEnum = z.enum(CURRICULUM_STATUSES);

// Shared across differently-typed forms.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusSelect({ control }: { control: any }) {
  return (
    <FormField
      control={control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Lifecycle status</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="draft">Draft — work in progress</SelectItem>
              <SelectItem value="review">In review — awaiting approval</SelectItem>
              <SelectItem value="published">Published — visible to learners</SelectItem>
              <SelectItem value="archived">Archived — hidden from learners</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function Shell({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------- strand */

const strandSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  description: z.string().trim().max(2000).optional(),
  sequenceOrder: z.coerce.number().int().min(1).max(999),
  status: statusEnum,
});

export function StrandFormDialog({
  organizationId,
  subjectId,
  strand,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subjectId: string;
  strand?: {
    id: string;
    title: string;
    description: string | null;
    sequence_order: number;
    status: string;
  };
  nextOrder: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveStrand);
  const form = useForm<z.infer<typeof strandSchema>>({
    resolver: zodResolver(strandSchema),
    defaultValues: {
      title: strand?.title ?? "",
      description: strand?.description ?? "",
      sequenceOrder: strand?.sequence_order ?? nextOrder,
      status: (strand?.status as z.infer<typeof statusEnum>) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof strandSchema>) =>
      save({
        data: {
          id: strand?.id,
          organizationId,
          subjectId,
          title: values.title,
          description: values.description || null,
          sequenceOrder: values.sequenceOrder,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(strand ? "Strand updated" : "Strand created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={strand ? "Edit strand" : "New strand"}
      description="Strands group the sub-strands and learning outcomes of a subject."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Strand title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Numbers" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sequenceOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={1} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusSelect control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save strand"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ----------------------------------------------------------- sub-strand */

export function SubStrandFormDialog({
  organizationId,
  strandId,
  subStrand,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  strandId: string;
  subStrand?: {
    id: string;
    title: string;
    description: string | null;
    sequence_order: number;
    status: string;
  };
  nextOrder: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveSubStrand);
  const form = useForm<z.infer<typeof strandSchema>>({
    resolver: zodResolver(strandSchema),
    defaultValues: {
      title: subStrand?.title ?? "",
      description: subStrand?.description ?? "",
      sequenceOrder: subStrand?.sequence_order ?? nextOrder,
      status: (subStrand?.status as z.infer<typeof statusEnum>) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof strandSchema>) =>
      save({
        data: {
          id: subStrand?.id,
          organizationId,
          strandId,
          title: values.title,
          description: values.description || null,
          sequenceOrder: values.sequenceOrder,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(subStrand ? "Sub-strand updated" : "Sub-strand created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={subStrand ? "Edit sub-strand" : "New sub-strand"}
      description="Sub-strands hold the learning outcomes learners are assessed against."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sub-strand title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Whole numbers" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sequenceOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={1} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusSelect control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save sub-strand"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ------------------------------------------------------ learning outcome */

const outcomeSchema = z.object({
  description: z.string().trim().min(3, "Describe the outcome").max(1000),
  competencyId: z.string().optional(),
  sequenceOrder: z.coerce.number().int().min(1).max(999),
  status: statusEnum,
});

export function LearningOutcomeFormDialog({
  organizationId,
  subStrandId,
  competencies,
  outcome,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subStrandId: string;
  competencies: { id: string; name: string }[];
  outcome?: {
    id: string;
    description: string;
    sequence_order: number;
    status: string;
    competency_id: string | null;
  };
  nextOrder: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveLearningOutcome);
  const form = useForm<z.infer<typeof outcomeSchema>>({
    resolver: zodResolver(outcomeSchema),
    defaultValues: {
      description: outcome?.description ?? "",
      competencyId: outcome?.competency_id ?? "none",
      sequenceOrder: outcome?.sequence_order ?? nextOrder,
      status: (outcome?.status as z.infer<typeof statusEnum>) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof outcomeSchema>) =>
      save({
        data: {
          id: outcome?.id,
          organizationId,
          subStrandId,
          competencyId:
            values.competencyId && values.competencyId !== "none" ? values.competencyId : null,
          description: values.description,
          sequenceOrder: values.sequenceOrder,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(outcome ? "Learning outcome updated" : "Learning outcome added");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={outcome ? "Edit learning outcome" : "New learning outcome"}
      description="Learning outcomes describe what a learner should be able to do."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Outcome</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} placeholder="Count numbers up to 1000…" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="competencyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Linked competency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No competency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No competency</SelectItem>
                    {competencies.map((competency) => (
                      <SelectItem key={competency.id} value={competency.id}>
                        {competency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sequenceOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={1} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusSelect control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save outcome"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ------------------------------------------------------------ resources */

const resourceSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  description: z.string().trim().max(1000).optional(),
  resourceType: z.enum(RESOURCE_TYPES),
  url: z.string().trim().max(2000).optional(),
});

export function ResourceFormDialog({
  organizationId,
  entityType,
  entityId,
  trigger,
  onSaved,
}: {
  organizationId: string;
  entityType: ResourceEntity;
  entityId: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const save = useServerFn(saveCurriculumResource);
  const form = useForm<z.infer<typeof resourceSchema>>({
    resolver: zodResolver(resourceSchema),
    defaultValues: { title: "", description: "", resourceType: "link" as ResourceType, url: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof resourceSchema>) => {
      const storagePath = file ? await uploadResourceFile(organizationId, file) : null;
      if (!storagePath && !values.url) {
        throw new Error("Add a link or choose a file to upload.");
      }
      return save({
        data: {
          organizationId,
          entityType,
          entityId,
          resourceType: values.resourceType,
          title: values.title,
          description: values.description || null,
          url: values.url || null,
          storagePath,
        },
      });
    },
    onSuccess: () => {
      toast.success("Resource added");
      setFile(null);
      form.reset();
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Add learning resource"
      description="Attach a PDF, video, image, audio file, document or external link."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Worksheet 1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="resourceType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {RESOURCE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>External link</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://…" />
                </FormControl>
                <FormDescription>Leave empty when uploading a file instead.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="resource-file">
              Upload file
            </label>
            <Input
              id="resource-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Files are stored privately and scoped to your organization.
            </p>
          </div>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Add resource"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* -------------------------------------------------------- lesson detail */

const lessonDetailSchema = z.object({
  summary: z.string().trim().max(2000).optional(),
  estimatedMinutes: z.string().trim().optional(),
  prerequisiteLessonId: z.string().optional(),
});

export function LessonPlanningDialog({
  organizationId,
  lessonId,
  lesson,
  siblingLessons,
  currentPrerequisiteId,
  trigger,
  onSaved,
}: {
  organizationId: string;
  lessonId: string;
  lesson: { summary: string | null; estimated_minutes: number | null };
  siblingLessons: { id: string; title: string }[];
  currentPrerequisiteId: string | null;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(updateLessonDetails);
  const form = useForm<z.infer<typeof lessonDetailSchema>>({
    resolver: zodResolver(lessonDetailSchema),
    defaultValues: {
      summary: lesson.summary ?? "",
      estimatedMinutes: lesson.estimated_minutes ? String(lesson.estimated_minutes) : "",
      prerequisiteLessonId: currentPrerequisiteId ?? "none",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof lessonDetailSchema>) =>
      save({
        data: {
          organizationId,
          lessonId,
          summary: values.summary || null,
          estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
          prerequisiteLessonIds:
            values.prerequisiteLessonId && values.prerequisiteLessonId !== "none"
              ? [values.prerequisiteLessonId]
              : [],
        },
      }),
    onSuccess: () => {
      toast.success("Lesson plan updated");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Lesson planning"
      description="Summary, estimated completion time and prerequisite lesson."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="summary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lesson summary</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="estimatedMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated completion time (minutes)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={1} placeholder="40" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="prerequisiteLessonId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prerequisite lesson</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No prerequisite" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No prerequisite</SelectItem>
                    {siblingLessons
                      .filter((item) => item.id !== lessonId)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Learners see this lesson as locked until the prerequisite is mastered.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save plan"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* --------------------------------------------------------- versions */

const versionSchema = z.object({
  curriculumId: z.string().uuid("Choose a curriculum"),
  label: z.string().trim().min(1, "Label is required").max(60),
  notes: z.string().trim().max(2000).optional(),
  status: statusEnum,
});

export function CurriculumVersionDialog({
  organizationId,
  curricula,
  trigger,
  onSaved,
}: {
  organizationId: string;
  curricula: { id: string; name: string }[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveCurriculumVersion);
  const form = useForm<z.infer<typeof versionSchema>>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      curriculumId: curricula[0]?.id ?? "",
      label: "",
      notes: "",
      status: "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof versionSchema>) =>
      save({
        data: {
          organizationId,
          curriculumId: values.curriculumId,
          label: values.label,
          notes: values.notes || null,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success("Version created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="New curriculum version"
      description="Versions keep published curriculum intact while you prepare changes."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="curriculumId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Curriculum framework</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select curriculum" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {curricula.map((curriculum) => (
                      <SelectItem key={curriculum.id} value={curriculum.id}>
                        {curriculum.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Version label</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="2026 revision" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusSelect control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create version"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

const cloneSchema = z.object({ label: z.string().trim().min(1, "Label is required").max(60) });

export function CloneVersionDialog({
  organizationId,
  versionId,
  trigger,
  onSaved,
}: {
  organizationId: string;
  versionId: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const clone = useServerFn(cloneCurriculumVersion);
  const form = useForm<z.infer<typeof cloneSchema>>({
    resolver: zodResolver(cloneSchema),
    defaultValues: { label: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof cloneSchema>) =>
      clone({ data: { organizationId, versionId, label: values.label } }),
    onSuccess: () => {
      toast.success("Version cloned as a new draft");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Clone version"
      description="Creates a draft copy — the published version stays untouched."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New version label</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="2026 revision (copy)" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Cloning…" : "Clone version"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* --------------------------------------------------- duplicate subject */

const duplicateSchema = z.object({ name: z.string().trim().min(2, "Name is required").max(120) });

export function DuplicateSubjectDialog({
  organizationId,
  subjectId,
  defaultName,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subjectId: string;
  defaultName: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const duplicate = useServerFn(duplicateSubject);
  const form = useForm<z.infer<typeof duplicateSchema>>({
    resolver: zodResolver(duplicateSchema),
    defaultValues: { name: `${defaultName} (copy)` },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof duplicateSchema>) =>
      duplicate({ data: { organizationId, subjectId, name: values.name } }),
    onSuccess: () => {
      toast.success("Subject duplicated as a draft");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Duplicate subject"
      description="Copies topics and lessons into a new draft subject you can reuse."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New subject name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}
