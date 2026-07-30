import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { curriculumKeys, getGradeWithContent, listGrades } from "@/features/curriculum/api";
import { useRoleContext } from "@/features/roles/role-context";
import { createStudentWithGuardian } from "@/lib/students.functions";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  dateOfBirth: z.string().optional(),
  gradeId: z.string().uuid("Choose a grade"),
  pathwayId: z.string().optional(),
  roleSubtype: z.enum(["biological_parent", "legal_guardian", "foster_parent", "other_guardian"]),
});

type FormValues = z.infer<typeof formSchema>;

const SUBTYPE_LABELS: Record<FormValues["roleSubtype"], string> = {
  biological_parent: "Biological parent",
  legal_guardian: "Legal guardian",
  foster_parent: "Foster parent",
  other_guardian: "Other guardian",
};

export const Route = createFileRoute("/_authenticated/students/new")({
  head: () => ({
    meta: [
      { title: "Add a student — the Platform" },
      { name: "description", content: "Create a student record and link yourself as their guardian." },
      { property: "og:title", content: "Add a student — the Platform" },
      { property: "og:description", content: "Create a student record and link yourself as guardian." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewStudentPage,
});

function NewStudentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeRole } = useRoleContext();
  const createStudent = useServerFn(createStudentWithGuardian);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      gradeId: "",
      pathwayId: "",
      roleSubtype: "biological_parent",
    },
  });

  const gradesQuery = useQuery({
    queryKey: curriculumKeys.grades(null),
    queryFn: () => listGrades(null),
  });

  const gradeId = form.watch("gradeId");
  const gradeContent = useQuery({
    queryKey: curriculumKeys.grade(gradeId || "none"),
    queryFn: () => getGradeWithContent(gradeId),
    enabled: Boolean(gradeId),
  });
  const pathwayRequired = gradeContent.data?.grade?.pathway_required ?? false;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createStudent({
        data: {
          organizationId: activeRole!.organizationId,
          firstName: values.firstName,
          lastName: values.lastName,
          dateOfBirth: values.dateOfBirth || null,
          gradeId: values.gradeId,
          pathwayId: values.pathwayId || null,
          roleSubtype: values.roleSubtype,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      toast.success("Student added.");
      await navigate({ to: "/students/$studentId", params: { studentId: result.studentId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (values: FormValues) => {
    if (pathwayRequired && !values.pathwayId) {
      form.setError("pathwayId", { message: "This grade requires a pathway" });
      return;
    }
    mutation.mutate(values);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add a student" description="You'll be linked as their guardian with full management access." />
      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Optional, used to suggest an appropriate grade.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gradeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a grade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(gradesQuery.data ?? []).map((grade) => (
                          <SelectItem key={grade.id} value={grade.id}>
                            {grade.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {pathwayRequired ? (
                <FormField
                  control={form.control}
                  name="pathwayId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pathway</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a pathway" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(gradeContent.data?.pathways ?? []).map((pathway) => (
                            <SelectItem key={pathway.id} value={pathway.id}>
                              {pathway.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Senior secondary grades require a pathway.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="roleSubtype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your relationship to this student</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(SUBTYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Adding…" : "Add student"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
