/**
 * Phase 10 Stage 1C — academic period and enrollment writes.
 *
 * Runs with the caller's session so the Stage 1C RLS policies and lifecycle
 * triggers remain authoritative. The checks here fail closed early and give the
 * user a readable reason instead of a raw constraint error.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type {
  academicPeriodSchema,
  enrollmentSchema,
  enrollmentStatusSchema,
  enrollmentTransferSchema,
} from "./enrollment.schemas";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/**
 * Refuses an enrollment into a curriculum version the database does not
 * consider available. Unverified, unauthorized or inactive curricula can never
 * be enrolled into, even if a client sends the identifier directly.
 */
async function assertVersionAvailable(context: Ctx, versionId: string) {
  const { data, error } = await context.supabase.rpc("curriculum_version_is_available", {
    p_version_id: versionId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error(
      "That curriculum version is not available for enrollment. It must be published, complete, rights-authorized and activated first.",
    );
  }
}

export async function upsertAcademicPeriod(
  context: Ctx,
  input: z.infer<typeof academicPeriodSchema>,
) {
  const row = {
    organization_id: input.organizationId,
    parent_period_id: input.parentPeriodId ?? null,
    name: input.name,
    period_type: input.periodType,
    start_date: input.startDate,
    end_date: input.endDate,
  };
  const query = input.id
    ? context.supabase.from("academic_periods").update(row).eq("id", input.id).select("id").single()
    : context.supabase.from("academic_periods").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function deleteAcademicPeriod(context: Ctx, id: string) {
  const { error } = await context.supabase.from("academic_periods").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function createEnrollment(context: Ctx, input: z.infer<typeof enrollmentSchema>) {
  await assertVersionAvailable(context, input.curriculumVersionId);
  const { data, error } = await context.supabase
    .from("curriculum_enrollments")
    .insert({
      student_id: input.studentId,
      curriculum_version_id: input.curriculumVersionId,
      academic_level_id: input.academicLevelId,
      track_id: input.trackId ?? null,
      academic_period_id: input.academicPeriodId ?? null,
      enrollment_category: input.enrollmentCategory,
      status: "pending",
      enrolled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function setEnrollmentStatus(
  context: Ctx,
  input: z.infer<typeof enrollmentStatusSchema>,
) {
  const terminal = input.status === "completed" || input.status === "withdrawn";
  const { error } = await context.supabase
    .from("curriculum_enrollments")
    .update({
      status: input.status,
      // Closure timestamps are server-assigned, never client-supplied.
      ended_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", input.enrollmentId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Transfers a learner onto a different curriculum version or academic level.
 *
 * The whole move is delegated to a single database routine so it happens in
 * one transaction. An earlier two-call implementation could close the source
 * placement and then fail before creating the replacement, leaving a learner
 * with no active placement; that failure mode is now structurally impossible.
 * The routine re-derives the learner and tenant from the source row,
 * re-checks authorization, locks the learner's placements, applies the Stage 1
 * availability gate and writes the audit trail.
 */
export async function transferEnrollment(
  context: Ctx,
  input: z.infer<typeof enrollmentTransferSchema>,
) {
  const { data, error } = await context.supabase.rpc("transfer_curriculum_enrollment", {
    p_enrollment_id: input.enrollmentId,
    p_curriculum_version_id: input.curriculumVersionId,
    p_academic_level_id: input.academicLevelId,
    p_track_id: input.trackId ?? undefined,
    p_academic_period_id: input.academicPeriodId ?? undefined,
  });
  if (error) throw new Error(error.message);
  const result = data as { enrollment_id: string } | null;
  if (!result?.enrollment_id) throw new Error("The transfer did not return a new placement");
  return { id: result.enrollment_id };
}

