import { z } from "zod";
import {
  PROGRAMME_CATEGORIES,
  PROGRAMME_ENROLLMENT_STATUSES,
  PROGRAMME_STATUSES,
} from "@/features/programmes/constants";

const uuid = z.string().uuid();

export const programmeSchema = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  name: z.string().trim().min(1, "A programme name is required").max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  category: z.enum(PROGRAMME_CATEGORIES),
  subjectId: uuid.nullable().optional(),
  capacity: z.number().int().positive().max(100_000).nullable().optional(),
  scheduleDescription: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(PROGRAMME_STATUSES).default("draft"),
});

export const programmeStatusSchema = z.object({
  programmeId: uuid,
  status: z.enum(PROGRAMME_STATUSES),
});

export const assignInstructorSchema = z.object({
  programmeId: uuid,
  userRoleId: uuid,
});

export const endInstructorSchema = z.object({
  programmeInstructorId: uuid,
});

export const enrollLearnerSchema = z.object({
  programmeId: uuid,
  studentId: uuid,
});

export const programmeEnrollmentStatusSchema = z.object({
  enrollmentId: uuid,
  // 'enrolled' is the creation state only; it is never a transition target.
  status: z.enum(PROGRAMME_ENROLLMENT_STATUSES).exclude(["enrolled"]),
});

export type ProgrammeInput = z.infer<typeof programmeSchema>;
export type EnrollLearnerInput = z.infer<typeof enrollLearnerSchema>;
