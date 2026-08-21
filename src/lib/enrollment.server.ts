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
 * The prior enrollment is closed as `transferred` and the new record keeps a
 * pointer back to it, so placement history is never overwritten.
 */
export async function transferEnrollment(
  context: Ctx,
  input: z.infer<typeof enrollmentTransferSchema>,
) {
  await assertVersionAvailable(context, input.curriculumVersionId);

  const existing = await context.supabase
    .from("curriculum_enrollments")
    .select("id, student_id, enrollment_category, status")
    .eq("id", input.enrollmentId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("That enrollment no longer exists");
  if (existing.data.status !== "active") {
    throw new Error("Only an active enrollment can be transferred");
  }

  const closed = await context.supabase
    .from("curriculum_enrollments")
    .update({ status: "transferred", ended_at: new Date().toISOString() })
    .eq("id", input.enrollmentId);
  if (closed.error) throw new Error(closed.error.message);

  const created = await context.supabase
    .from("curriculum_enrollments")
    .insert({
      student_id: existing.data.student_id,
      curriculum_version_id: input.curriculumVersionId,
      academic_level_id: input.academicLevelId,
      track_id: input.trackId ?? null,
      academic_period_id: input.academicPeriodId ?? null,
      enrollment_category: existing.data.enrollment_category,
      status: "active",
      enrolled_at: new Date().toISOString(),
      transferred_from_enrollment_id: input.enrollmentId,
    })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return { id: created.data.id };
}
