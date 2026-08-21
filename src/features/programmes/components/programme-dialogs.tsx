/**
 * Stage 2 — Programme dialogs.
 *
 * Presentation only. Every action calls a server function which in turn runs
 * under the caller's session, so RLS remains the authorization boundary.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addProgrammeInstructor,
  enrollLearner,
  saveProgramme,
} from "@/lib/programmes.functions";
import {
  PROGRAMME_CATEGORIES,
  PROGRAMME_CATEGORY_LABELS,
  PROGRAMME_STATUS_LABELS,
  type ProgrammeCategory,
  type ProgrammeStatus,
} from "../constants";
import {
  listAssignableInstructors,
  listEnrollableStudents,
  listLinkableSubjects,
  programmeKeys,
  type ProgrammeRow,
} from "../api";

const NONE = "__none__";

export function ProgrammeDialog({
  organizationId,
  programme,
  trigger,
  onSaved,
}: {
  organizationId: string;
  programme?: ProgrammeRow;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(programme?.name ?? "");
  const [description, setDescription] = useState(programme?.description ?? "");
  const [category, setCategory] = useState<ProgrammeCategory>(programme?.category ?? "enrichment");
  const [subjectId, setSubjectId] = useState<string>(programme?.subjectId ?? NONE);
  const [capacity, setCapacity] = useState<string>(
    programme?.capacity === null || programme?.capacity === undefined
      ? ""
      : String(programme.capacity),
  );
  const [schedule, setSchedule] = useState(programme?.scheduleDescription ?? "");
  const [status, setStatus] = useState<ProgrammeStatus>(programme?.status ?? "draft");

  const subjects = useQuery({
    queryKey: programmeKeys.subjects(organizationId),
    queryFn: () => listLinkableSubjects(organizationId),
    enabled: open,
  });

  const save = useServerFn(saveProgramme);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: programme?.id,
          organizationId,
          name: name.trim(),
          description: description.trim() || null,
          category,
          subjectId: subjectId === NONE ? null : subjectId,
          capacity: capacity.trim() === "" ? null : Number(capacity),
          scheduleDescription: schedule.trim() || null,
          status,
        },
      }),
    onSuccess: () => {
      toast.success(programme ? "Programme updated" : "Programme created");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const capacityInvalid =
    capacity.trim() !== "" && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{programme ? "Edit programme" : "New programme"}</DialogTitle>
          <DialogDescription>
            Extracurricular programmes sit alongside the academic curriculum. Completing one is
            recorded as a status only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="programme-name">Name</Label>
            <Input
              id="programme-name"
              value={name}
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              placeholder="Chess Club"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-category">Category</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as ProgrammeCategory)}>
              <SelectTrigger id="programme-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROGRAMME_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PROGRAMME_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-subject">Linked subject (optional)</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger id="programme-subject">
                <SelectValue placeholder="No linked subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No linked subject</SelectItem>
                {(subjects.data ?? []).map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-capacity">Capacity (leave blank for unlimited)</Label>
            <Input
              id="programme-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              placeholder="Unlimited"
              aria-invalid={capacityInvalid}
              aria-describedby="programme-capacity-hint"
            />
            <p id="programme-capacity-hint" className="text-sm text-muted-foreground">
              Counts learners who are currently enrolled or active.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-schedule">Schedule</Label>
            <Input
              id="programme-schedule"
              value={schedule}
              maxLength={1000}
              onChange={(event) => setSchedule(event.target.value)}
              placeholder="Tuesdays, 4–5pm"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-description">Description</Label>
            <Textarea
              id="programme-description"
              value={description}
              maxLength={4000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="programme-status">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ProgrammeStatus)}>
              <SelectTrigger id="programme-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{PROGRAMME_STATUS_LABELS.draft}</SelectItem>
                <SelectItem value="published">{PROGRAMME_STATUS_LABELS.published}</SelectItem>
                {programme?.status === "archived" ? (
                  <SelectItem value="archived">{PROGRAMME_STATUS_LABELS.archived}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Only a published programme accepts new learners.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || name.trim() === "" || capacityInvalid}
            onClick={() => mutation.mutate()}
          >
            {programme ? "Save changes" : "Create programme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignInstructorDialog({
  organizationId,
  programmeId,
  trigger,
  onSaved,
}: {
  organizationId: string;
  programmeId: string;
  trigger: ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userRoleId, setUserRoleId] = useState("");

  const candidates = useQuery({
    queryKey: programmeKeys.assignableInstructors(organizationId),
    queryFn: () => listAssignableInstructors(organizationId),
    enabled: open,
  });

  const assign = useServerFn(addProgrammeInstructor);
  const mutation = useMutation({
    mutationFn: () => assign({ data: { programmeId, userRoleId } }),
    onSuccess: () => {
      toast.success("Instructor assigned");
      setUserRoleId("");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign an instructor</DialogTitle>
          <DialogDescription>
            Only an active Teacher or Tutor in this organization can be assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="instructor-select">Teacher or Tutor</Label>
          <Select value={userRoleId} onValueChange={setUserRoleId}>
            <SelectTrigger id="instructor-select">
              <SelectValue placeholder="Choose an educator" />
            </SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((candidate) => (
                <SelectItem key={candidate.userRoleId} value={candidate.userRoleId}>
                  {candidate.fullName} · {candidate.roleCode === "tutor" ? "Tutor" : "Teacher"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {candidates.isSuccess && (candidates.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active Teacher or Tutor roles exist in this organization yet.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || !userRoleId} onClick={() => mutation.mutate()}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnrollLearnerDialog({
  organizationId,
  programmeId,
  disabled,
  trigger,
}: {
  organizationId: string;
  programmeId: string;
  disabled?: boolean;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const queryClient = useQueryClient();

  const students = useQuery({
    queryKey: programmeKeys.enrollableStudents(organizationId),
    queryFn: () => listEnrollableStudents(organizationId),
    enabled: open,
  });

  const enroll = useServerFn(enrollLearner);
  const mutation = useMutation({
    mutationFn: () => enroll({ data: { programmeId, studentId } }),
    onSuccess: () => {
      toast.success("Learner enrolled");
      setStudentId("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: programmeKeys.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild disabled={disabled}>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll a learner</DialogTitle>
          <DialogDescription>
            You can only enroll a learner you are already authorized to manage.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="enroll-student">Learner</Label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id="enroll-student">
              <SelectValue placeholder="Choose a learner" />
            </SelectTrigger>
            <SelectContent>
              {(students.data ?? []).map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {students.isSuccess && (students.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You do not have a learner you can enroll into this programme.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || !studentId} onClick={() => mutation.mutate()}>
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
