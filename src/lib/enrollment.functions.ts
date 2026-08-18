import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  academicPeriodSchema,
  enrollmentSchema,
  enrollmentStatusSchema,
  enrollmentTransferSchema,
  idSchema,
} from "./enrollment.schemas";
import {
  createEnrollment,
  deleteAcademicPeriod,
  setEnrollmentStatus,
  transferEnrollment,
  upsertAcademicPeriod,
} from "./enrollment.server";

export const saveAcademicPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => academicPeriodSchema.parse(data))
  .handler(({ data, context }) => upsertAcademicPeriod(context, data));

export const removeAcademicPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(({ data, context }) => deleteAcademicPeriod(context, data.id));

export const enrollStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => enrollmentSchema.parse(data))
  .handler(({ data, context }) => createEnrollment(context, data));

export const changeEnrollmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => enrollmentStatusSchema.parse(data))
  .handler(({ data, context }) => setEnrollmentStatus(context, data));

export const transferStudentEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => enrollmentTransferSchema.parse(data))
  .handler(({ data, context }) => transferEnrollment(context, data));
