import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  assignSubjectToStudents,
  saveLearningObjective,
  saveLesson,
  saveSubject,
  saveTopic,
} from "@/lib/curriculum.functions";
import { listStudents, studentKeys } from "@/features/students/api";

const statusValues = ["draft", "published", "archived"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyControl = import("react-hook-form").Control<any>;

function StatusField({ control }: { control: AnyControl }) {
  return (
    <FormField
      control={control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Publishing status</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="draft">Draft — only your organization can see it</SelectItem>
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

function DialogShell({
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

/* ------------------------------------------------------------------ subject */

const subjectSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
  pathwayId: z.string().optional(),
  status: z.enum(statusValues),
});

export function SubjectFormDialog({
  organizationId,
  gradeId,
  pathways,
  subject,
  trigger,
  onSaved,
}: {
  organizationId: string;
  gradeId: string;
  pathways: { id: string; name: string }[];
  subject?: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    status: string;
    pathway_id: string | null;
  };
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveSubject);
  const form = useForm<z.infer<typeof subjectSchema>>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      name: subject?.name ?? "",
      code: subject?.code ?? "",
      description: subject?.description ?? "",
      pathwayId: subject?.pathway_id ?? "none",
      status: (subject?.status as (typeof statusValues)[number]) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof subjectSchema>) =>
      save({
        data: {
          id: subject?.id,
          organizationId,
          gradeId,
          pathwayId: values.pathwayId && values.pathwayId !== "none" ? values.pathwayId : null,
          name: values.name,
          code: values.code || null,
          description: values.description || null,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(subject ? "Subject updated" : "Subject created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={subject ? "Edit subject" : "New subject"}
      description="Subjects group topics and lessons inside a grade."
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
                <FormLabel>Subject name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Mathematics" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="MATH-7" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {pathways.length > 0 ? (
            <FormField
              control={form.control}
              name="pathwayId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pathway</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="All pathways" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">All pathways</SelectItem>
                      {pathways.map((pathway) => (
                        <SelectItem key={pathway.id} value={pathway.id}>
                          {pathway.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusField control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save subject"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogShell>
  );
}

/* -------------------------------------------------------------------- topic */

const topicSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  description: z.string().trim().max(2000).optional(),
  sequenceOrder: z.coerce.number().int().min(1).max(999),
  status: z.enum(statusValues),
});

export function TopicFormDialog({
  organizationId,
  subjectId,
  topic,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subjectId: string;
  topic?: {
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
  const save = useServerFn(saveTopic);
  const form = useForm<z.infer<typeof topicSchema>>({
    resolver: zodResolver(topicSchema),
    defaultValues: {
      title: topic?.title ?? "",
      description: topic?.description ?? "",
      sequenceOrder: topic?.sequence_order ?? nextOrder,
      status: (topic?.status as (typeof statusValues)[number]) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof topicSchema>) =>
      save({
        data: {
          id: topic?.id,
          organizationId,
          subjectId,
          title: values.title,
          description: values.description || null,
          sequenceOrder: values.sequenceOrder,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(topic ? "Topic updated" : "Topic created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={topic ? "Edit topic" : "New topic"}
      description="Topics sequence the lessons inside a subject."
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
                <FormLabel>Topic title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Fractions" />
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
                  <Textarea rows={3} {...field} />
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
                  <Input type="number" min={1} max={999} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusField control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save topic"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogShell>
  );
}

/* ------------------------------------------------------------------- lesson */

const lessonSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  topicId: z.string().optional(),
  sequenceOrder: z.coerce.number().int().min(1).max(999),
  contentType: z.enum(["text", "video", "document", "link", "quiz"]),
  contentBody: z.string().trim().max(20000).optional(),
  status: z.enum(statusValues),
});

export function LessonFormDialog({
  organizationId,
  subjectId,
  topics,
  lesson,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subjectId: string;
  topics: { id: string; title: string }[];
  lesson?: {
    id: string;
    title: string;
    topic_id: string | null;
    sequence_order: number;
    content_type: string;
    status: string;
    content_body?: unknown;
  };
  nextOrder: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveLesson);
  const existingBody =
    lesson?.content_body && typeof lesson.content_body === "object"
      ? ((lesson.content_body as { body?: string }).body ?? "")
      : "";
  const form = useForm<z.infer<typeof lessonSchema>>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      title: lesson?.title ?? "",
      topicId: lesson?.topic_id ?? "none",
      sequenceOrder: lesson?.sequence_order ?? nextOrder,
      contentType: (lesson?.content_type as "text") ?? "text",
      contentBody: existingBody,
      status: (lesson?.status as (typeof statusValues)[number]) ?? "draft",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof lessonSchema>) =>
      save({
        data: {
          id: lesson?.id,
          organizationId,
          subjectId,
          topicId: values.topicId && values.topicId !== "none" ? values.topicId : null,
          title: values.title,
          sequenceOrder: values.sequenceOrder,
          contentType: values.contentType,
          contentBody: values.contentBody || null,
          status: values.status,
        },
      }),
    onSuccess: () => {
      toast.success(lesson ? "Lesson updated" : "Lesson created");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={lesson ? "Edit lesson" : "New lesson"}
      description="Lessons hold the learning content students work through."
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
                <FormLabel>Lesson title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Adding fractions" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="topicId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Topic</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Unsorted" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Unsorted</SelectItem>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
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
            name="contentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Content type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {["text", "video", "document", "link", "quiz"].map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
            name="contentBody"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Content</FormLabel>
                <FormControl>
                  <Textarea rows={5} {...field} placeholder="Lesson text, video URL or notes" />
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
                  <Input type="number" min={1} max={999} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <StatusField control={form.control} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save lesson"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogShell>
  );
}

/* ---------------------------------------------------------------- objective */

const objectiveSchema = z.object({
  description: z.string().trim().min(3, "Describe the objective").max(500),
  competencyId: z.string().optional(),
  sequenceOrder: z.coerce.number().int().min(1).max(999),
});

export function ObjectiveFormDialog({
  organizationId,
  lessonId,
  competencies,
  objective,
  nextOrder,
  trigger,
  onSaved,
}: {
  organizationId: string;
  lessonId: string;
  competencies: { id: string; name: string }[];
  objective?: {
    id: string;
    description: string;
    competency_id: string | null;
    sequence_order: number;
  };
  nextOrder: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveLearningObjective);
  const form = useForm<z.infer<typeof objectiveSchema>>({
    resolver: zodResolver(objectiveSchema),
    defaultValues: {
      description: objective?.description ?? "",
      competencyId: objective?.competency_id ?? "none",
      sequenceOrder: objective?.sequence_order ?? nextOrder,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof objectiveSchema>) =>
      save({
        data: {
          id: objective?.id,
          organizationId,
          lessonId,
          competencyId:
            values.competencyId && values.competencyId !== "none" ? values.competencyId : null,
          description: values.description,
          sequenceOrder: values.sequenceOrder,
        },
      }),
    onSuccess: () => {
      toast.success(objective ? "Objective updated" : "Objective added");
      setOpen(false);
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={objective ? "Edit learning objective" : "Add learning objective"}
      description="Objectives are what the learner should be able to do after the lesson."
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
                <FormLabel>Objective</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    {...field}
                    placeholder="Add fractions with unlike denominators"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {competencies.length > 0 ? (
            <FormField
              control={form.control}
              name="competencyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Linked competency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
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
          ) : null}
          <FormField
            control={form.control}
            name="sequenceOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={999} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save objective"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogShell>
  );
}

/* --------------------------------------------------- assign to students */

export function AssignSubjectDialog({
  organizationId,
  subjectId,
  trigger,
  onSaved,
}: {
  organizationId: string;
  subjectId: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const assign = useServerFn(assignSubjectToStudents);

  const students = useQuery({
    queryKey: studentKeys.list(organizationId),
    enabled: open && Boolean(organizationId),
    queryFn: () => listStudents(organizationId),
  });

  const mutation = useMutation({
    mutationFn: () => assign({ data: { organizationId, subjectId, studentIds: selected } }),
    onSuccess: (result) => {
      toast.success(`Assigned to ${result.assigned} student${result.assigned === 1 ? "" : "s"}`);
      setSelected([]);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["curriculum"] });
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Assign subject to students"
      description="Selected students will see this subject in their curriculum."
    >
      <div className="space-y-3">
        {students.isPending ? (
          <p className="text-sm text-muted-foreground">Loading students…</p>
        ) : null}
        {students.error ? (
          <p className="text-sm text-destructive">We couldn't load your students.</p>
        ) : null}
        {students.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this organization yet.</p>
        ) : null}
        <ul className="space-y-2">
          {students.data?.map((student) => {
            const checked = selected.includes(student.id);
            return (
              <li key={student.id} className="flex items-center gap-3 rounded-md border p-3">
                <Checkbox
                  id={`assign-${student.id}`}
                  checked={checked}
                  onCheckedChange={(value) =>
                    setSelected((prev) =>
                      value === true
                        ? [...prev, student.id]
                        : prev.filter((id) => id !== student.id),
                    )
                  }
                />
                <label htmlFor={`assign-${student.id}`} className="text-sm">
                  {student.first_name} {student.last_name}
                  <span className="ml-2 text-muted-foreground">
                    {student.grade?.name ?? "No grade"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      <DialogFooter>
        <Button
          type="button"
          disabled={selected.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Assigning…" : `Assign ${selected.length || ""}`.trim()}
        </Button>
      </DialogFooter>
    </DialogShell>
  );
}
