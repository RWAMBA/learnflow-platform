import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useRoleContext } from "@/features/roles/role-context";
import { assignmentKeys, listAssignableLessons } from "@/features/assignments/api";
import { listStudents, studentKeys } from "@/features/students/api";
import { createAssignments } from "@/lib/assignments.functions";

export const Route = createFileRoute("/_authenticated/assignments/new")({
  head: () => ({
    meta: [
      { title: "Assign work — the Platform" },
      { name: "description", content: "Assign a lesson to a student." },
      { property: "og:title", content: "Assign work — the Platform" },
      { property: "og:description", content: "Assign a lesson to a student." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const formSchema = z.object({
  lessonId: z.string().uuid("Choose a lesson"),
  studentIds: z.array(z.string().uuid()).min(1, "Select at least one student"),
  dueAt: z.string().optional(),
  instructions: z.string().max(4000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function Page() {
  const navigate = useNavigate();
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const create = useServerFn(createAssignments);

  const lessons = useQuery({
    queryKey: assignmentKeys.lessons("published"),
    queryFn: listAssignableLessons,
  });

  const students = useQuery({
    queryKey: studentKeys.list(organizationId ?? "none"),
    enabled: Boolean(organizationId),
    queryFn: () => listStudents(organizationId!),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { lessonId: "", studentIds: [], dueAt: "", instructions: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      create({
        data: {
          lessonId: values.lessonId,
          studentIds: values.studentIds,
          createdByUserRoleId: activeRole!.userRoleId,
          dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
          instructions: values.instructions?.trim() ? values.instructions.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Work assigned");
      void navigate({ to: "/assignments" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not assign this work"),
  });

  return (
    <div>
      <PageHeader title="Assign work" description="Assign a lesson to a student." />
      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            >
              <FormField
                control={form.control}
                name="lessonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lesson</FormLabel>
                    <QueryState
                      isPending={lessons.isPending}
                      error={lessons.error}
                      data={lessons.data}
                      onRetry={() => void lessons.refetch()}
                      isEmpty={(data) => data.length === 0}
                      empty={
                        <EmptyState
                          title="No published lessons"
                          description="Publish a lesson in Curriculum before assigning it."
                        />
                      }
                    >
                      {(data) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a lesson" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {data.map((lesson) => (
                              <SelectItem key={lesson.id} value={lesson.id}>
                                {lesson.title} — {lesson.subject?.name ?? "Subject"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </QueryState>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="studentIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Students</FormLabel>
                    <QueryState
                      isPending={students.isPending}
                      error={students.error}
                      data={students.data}
                      onRetry={() => void students.refetch()}
                      isEmpty={(data) => data.length === 0}
                      empty={<EmptyState title="No students yet" />}
                    >
                      {(data) => (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {data.map((student) => {
                            const checked = field.value.includes(student.id);
                            return (
                              <label
                                key={student.id}
                                className="flex items-center gap-2 rounded-md border p-3 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) =>
                                    field.onChange(
                                      value
                                        ? [...field.value, student.id]
                                        : field.value.filter((id) => id !== student.id),
                                    )
                                  }
                                />
                                {student.first_name} {student.last_name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </QueryState>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructions</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder="What should the learner do?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={mutation.isPending || !activeRole}>
                  {mutation.isPending ? "Assigning…" : "Assign work"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void navigate({ to: "/assignments" })}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
