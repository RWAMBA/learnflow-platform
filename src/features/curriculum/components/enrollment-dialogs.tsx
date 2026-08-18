import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  enrollStudent,
  saveAcademicPeriod,
  transferStudentEnrollment,
} from "@/lib/enrollment.functions";
import {
  PERIOD_TYPES,
  type AcademicPeriodRow,
  type EnrollmentRow,
} from "@/features/curriculum/enrollment-api";
import { listAvailableCurricula, listAcademicLevels, rightsKeys } from "@/features/curriculum/rights-api";
import { listPathways } from "@/features/curriculum/api";

const NONE = "__none__";

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

/* ------------------------------------------------------- academic period */

const periodForm = z
  .object({
    name: z.string().trim().min(2, "Name the period").max(120),
    periodType: z.enum(PERIOD_TYPES),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    parentPeriodId: z.string(),
  })
  .refine((value) => value.endDate > value.startDate, {
    message: "The end date must fall after the start date",
    path: ["endDate"],
  });

export function AcademicPeriodDialog({
  trigger,
  organizationId,
  periods,
  period,
  onSaved,
}: {
  trigger: ReactNode;
  organizationId: string;
  periods: AcademicPeriodRow[];
  period?: AcademicPeriodRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveAcademicPeriod);
  const form = useForm<z.infer<typeof periodForm>>({
    resolver: zodResolver(periodForm),
    defaultValues: {
      name: period?.name ?? "",
      periodType: (period?.period_type as (typeof PERIOD_TYPES)[number]) ?? "year",
      startDate: period?.start_date ?? "",
      endDate: period?.end_date ?? "",
      parentPeriodId: period?.parent_period_id ?? NONE,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof periodForm>) =>
      save({
        data: {
          ...(period?.id ? { id: period.id } : {}),
          organizationId,
          name: values.name,
          periodType: values.periodType,
          startDate: values.startDate,
          endDate: values.endDate,
          parentPeriodId: values.parentPeriodId === NONE ? null : values.parentPeriodId,
        },
      }),
    onSuccess: () => {
      toast.success(period?.id ? "Period updated" : "Period created");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parentOptions = periods.filter((row) => row.id !== period?.id);

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={period?.id ? "Edit academic period" : "New academic period"}
      description="Years contain terms, semesters or quarters. A child period must sit inside its parent's dates."
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
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="2026 Academic Year" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="periodType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PERIOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ends</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="parentPeriodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sits inside</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>No parent — top level</SelectItem>
                    {parentOptions.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The database rejects a period that falls outside its parent's dates.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save period"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ------------------------------------------------------- enrollment form */

const enrollForm = z.object({
  studentId: z.string().uuid("Choose a learner"),
  curriculumVersionId: z.string().uuid("Choose a curriculum"),
  academicLevelId: z.string().uuid("Choose an academic level"),
  trackId: z.string(),
  academicPeriodId: z.string(),
  enrollmentCategory: z.enum(["primary", "supplementary"]),
});

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

function useEnrollmentOptions(curriculumId: string | null, academicLevelId: string | null) {
  const available = useQuery({
    queryKey: rightsKeys.catalogue(),
    queryFn: listAvailableCurricula,
  });
  const levels = useQuery({
    queryKey: rightsKeys.levels(curriculumId),
    queryFn: () => listAcademicLevels(curriculumId),
    enabled: Boolean(curriculumId),
  });
  const tracks = useQuery({
    queryKey: ["curriculum", "pathways", academicLevelId],
    queryFn: () => listPathways(academicLevelId ?? ""),
    enabled: Boolean(academicLevelId),
  });
  return { available, levels, tracks };
}

export function EnrollStudentDialog({
  trigger,
  students,
  periods,
  onSaved,
}: {
  trigger: ReactNode;
  students: StudentOption[];
  periods: AcademicPeriodRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const enroll = useServerFn(enrollStudent);
  const form = useForm<z.infer<typeof enrollForm>>({
    resolver: zodResolver(enrollForm),
    defaultValues: {
      studentId: "",
      curriculumVersionId: "",
      academicLevelId: "",
      trackId: NONE,
      academicPeriodId: NONE,
      enrollmentCategory: "primary",
    },
  });

  const versionId = form.watch("curriculumVersionId");
  const levelId = form.watch("academicLevelId");
  const { available, levels, tracks } = useEnrollmentOptions(
    available_curriculumId(versionId),
    levelId || null,
  );

  function available_curriculumId(id: string) {
    const match = (available?.data ?? []).find((row) => row.id === id);
    return match?.curriculum_id ?? null;
  }

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof enrollForm>) =>
      enroll({
        data: {
          studentId: values.studentId,
          curriculumVersionId: values.curriculumVersionId,
          academicLevelId: values.academicLevelId,
          trackId: values.trackId === NONE ? null : values.trackId,
          academicPeriodId: values.academicPeriodId === NONE ? null : values.academicPeriodId,
          enrollmentCategory: values.enrollmentCategory,
        },
      }),
    onSuccess: () => {
      toast.success("Enrollment created as pending");
      setOpen(false);
      form.reset();
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const versions = available.data ?? [];

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Enrol a learner"
      description="Only published, complete, rights-authorized and activated curricula appear here."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="studentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Learner</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a learner" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
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
            name="curriculumVersionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Curriculum</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue("academicLevelId", "");
                    form.setValue("trackId", NONE);
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a curriculum" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        {version.curriculum?.name ?? "Curriculum"} · {version.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {versions.length === 0 && !available.isPending ? (
                  <FormDescription>
                    No curriculum is available for enrolment yet. A platform administrator must
                    complete the rights review and activate one first.
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="academicLevelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Academic level</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue("trackId", NONE);
                  }}
                  value={field.value}
                  disabled={!versionId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(levels.data ?? [])
                      .filter((level) => level.is_available !== false)
                      .map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.name}
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
            name="trackId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Track</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!levelId}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>No track</SelectItem>
                    {(tracks.data ?? []).map((track) => (
                      <SelectItem key={track.id} value={track.id}>
                        {track.name}
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
            name="academicPeriodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Academic period</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {periods.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
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
            name="enrollmentCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="primary">Primary placement</SelectItem>
                    <SelectItem value="supplementary">Supplementary</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  A learner has one primary placement at a time; extra curricula are supplementary.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enrolling…" : "Create enrollment"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* --------------------------------------------------------------- transfer */

const transferForm = z.object({
  curriculumVersionId: z.string().uuid("Choose a curriculum"),
  academicLevelId: z.string().uuid("Choose an academic level"),
  trackId: z.string(),
  academicPeriodId: z.string(),
});

export function TransferEnrollmentDialog({
  trigger,
  enrollment,
  periods,
  onSaved,
}: {
  trigger: ReactNode;
  enrollment: EnrollmentRow;
  periods: AcademicPeriodRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const transfer = useServerFn(transferStudentEnrollment);
  const form = useForm<z.infer<typeof transferForm>>({
    resolver: zodResolver(transferForm),
    defaultValues: {
      curriculumVersionId: enrollment.curriculum_version_id,
      academicLevelId: enrollment.academic_level_id,
      trackId: enrollment.track_id ?? NONE,
      academicPeriodId: enrollment.academic_period_id ?? NONE,
    },
  });

  const available = useQuery({ queryKey: rightsKeys.catalogue(), queryFn: listAvailableCurricula });
  const versionId = form.watch("curriculumVersionId");
  const curriculumId =
    (available.data ?? []).find((row) => row.id === versionId)?.curriculum_id ?? null;
  const levels = useQuery({
    queryKey: rightsKeys.levels(curriculumId),
    queryFn: () => listAcademicLevels(curriculumId),
    enabled: Boolean(curriculumId),
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof transferForm>) =>
      transfer({
        data: {
          enrollmentId: enrollment.id,
          curriculumVersionId: values.curriculumVersionId,
          academicLevelId: values.academicLevelId,
          trackId: values.trackId === NONE ? null : values.trackId,
          academicPeriodId: values.academicPeriodId === NONE ? null : values.academicPeriodId,
        },
      }),
    onSuccess: () => {
      toast.success("Learner transferred — the previous placement is retained in history");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Transfer placement"
      description="The current enrollment is closed as transferred and a new one is opened, so placement history is never overwritten."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="curriculumVersionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Curriculum</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a curriculum" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(available.data ?? []).map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        {version.curriculum?.name ?? "Curriculum"} · {version.label}
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
            name="academicLevelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Academic level</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(levels.data ?? [])
                      .filter((level) => level.is_available !== false)
                      .map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.name}
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
            name="academicPeriodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Academic period</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {periods.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Transferring…" : "Transfer learner"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}
