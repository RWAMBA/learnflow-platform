import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format");

export const academicPeriodSchema = z
  .object({
    id: uuid.optional(),
    organizationId: uuid,
    parentPeriodId: uuid.nullable().optional(),
    name: z.string().trim().min(2).max(120),
    periodType: z.enum(["year", "term", "semester", "quarter"]),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((value) => value.endDate > value.startDate, {
    message: "The end date must fall after the start date",
    path: ["endDate"],
  });

export const enrollmentSchema = z.object({
  studentId: uuid,
  curriculumVersionId: uuid,
  academicLevelId: uuid,
  trackId: uuid.nullable().optional(),
  academicPeriodId: uuid.nullable().optional(),
  enrollmentCategory: z.enum(["primary", "supplementary"]),
});

export const enrollmentStatusSchema = z.object({
  enrollmentId: uuid,
  status: z.enum(["pending", "active", "completed", "transferred", "withdrawn", "archived"]),
});

export const enrollmentTransferSchema = z.object({
  enrollmentId: uuid,
  curriculumVersionId: uuid,
  academicLevelId: uuid,
  trackId: uuid.nullable().optional(),
  academicPeriodId: uuid.nullable().optional(),
});

export const idSchema = z.object({ id: uuid });
