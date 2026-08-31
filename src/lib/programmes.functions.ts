import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assignInstructorSchema,
  endInstructorSchema,
  enrollLearnerSchema,
  programmeEnrollmentStatusSchema,
  programmeSchema,
  programmeStatusSchema,
} from "./programmes.schemas";
import {
  assignProgrammeInstructor,
  endProgrammeInstructor,
  enrollLearnerInProgramme,
  setProgrammeEnrollmentStatus,
  setProgrammeStatus,
  upsertProgramme,
} from "./programmes.server";

export const saveProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => programmeSchema.parse(input))
  .handler(async ({ data, context }) => upsertProgramme(context, data));

export const changeProgrammeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => programmeStatusSchema.parse(input))
  .handler(async ({ data, context }) => setProgrammeStatus(context, data));

export const addProgrammeInstructor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignInstructorSchema.parse(input))
  .handler(async ({ data, context }) => assignProgrammeInstructor(context, data));

export const removeProgrammeInstructor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => endInstructorSchema.parse(input))
  .handler(async ({ data, context }) => endProgrammeInstructor(context, data));

export const enrollLearner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enrollLearnerSchema.parse(input))
  .handler(async ({ data, context }) => enrollLearnerInProgramme(context, data));

export const changeProgrammeEnrollmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => programmeEnrollmentStatusSchema.parse(input))
  .handler(async ({ data, context }) => setProgrammeEnrollmentStatus(context, data));
