/**
 * Stage 2 — Programme writes.
 *
 * Everything here runs with the caller's own session, so the Stage 2 RLS
 * policies, validation triggers and lifecycle triggers stay authoritative.
 * The checks in this file fail closed early and turn a raw constraint error
 * into a sentence a user can act on — they never grant access.
 *
 * Enrollment creation deliberately goes through the SECURITY DEFINER RPC
 * public.enroll_student_in_programme, which takes a row lock on the programme
 * so a capacity check and its insert cannot interleave with a competing
 * request. The RPC re-runs the same authorization test the RLS insert policy
 * applies, so the privileged path is not a bypass.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type {
  assignInstructorSchema,
  endInstructorSchema,
  enrollLearnerSchema,
  programmeEnrollmentStatusSchema,
  programmeSchema,
  programmeStatusSchema,
} from "./programmes.schemas";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/** Postgres surfaces our trigger/RPC messages verbatim; keep them readable. */
function fail(message: string): never {
  throw new Error(message);
}

export async function upsertProgramme(context: Ctx, input: z.infer<typeof programmeSchema>) {
  const row = {
    organization_id: input.organizationId,
    author_type: "tenant" as const,
    authoring_organization_id: input.organizationId,
    name: input.name,
    description: input.description?.trim() ? input.description.trim() : null,
    category: input.category,
    subject_id: input.subjectId ?? null,
    capacity: input.capacity ?? null,
    schedule_description: input.scheduleDescription?.trim()
      ? input.scheduleDescription.trim()
      : null,
    status: input.status,
  };

  if (input.id) {
    // Ownership columns are immutable; never resend them on an update.
    const {
      organization_id: _org,
      author_type: _type,
      authoring_organization_id: _auth,
      ...patch
    } = row;
    const { data, error } = await context.supabase
      .from("programmes")
      .update(patch)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) fail(error.message);
    return { id: data.id };
  }

  const { data, error } = await context.supabase
    .from("programmes")
    .insert({ ...row, created_by: context.userId })
    .select("id")
    .single();
  if (error) fail(error.message);
  return { id: data.id };
}

export async function setProgrammeStatus(
  context: Ctx,
  input: z.infer<typeof programmeStatusSchema>,
) {
  const { error } = await context.supabase
    .from("programmes")
    .update({ status: input.status })
    .eq("id", input.programmeId);
  if (error) fail(error.message);
  return { ok: true };
}

export async function assignProgrammeInstructor(
  context: Ctx,
  input: z.infer<typeof assignInstructorSchema>,
) {
  const programme = await context.supabase
    .from("programmes")
    .select("id, organization_id")
    .eq("id", input.programmeId)
    .maybeSingle();
  if (programme.error) fail(programme.error.message);
  if (!programme.data) fail("That programme is not available to you");

  const { data, error } = await context.supabase
    .from("programme_instructors")
    .insert({
      organization_id: programme.data.organization_id,
      programme_id: input.programmeId,
      user_role_id: input.userRoleId,
      status: "active",
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      fail("That Teacher or Tutor is already an active instructor for this programme");
    }
    fail(error.message);
  }
  return { id: data.id };
}

export async function endProgrammeInstructor(
  context: Ctx,
  input: z.infer<typeof endInstructorSchema>,
) {
  const { error } = await context.supabase
    .from("programme_instructors")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", input.programmeInstructorId);
  if (error) fail(error.message);
  return { ok: true };
}

export async function enrollLearnerInProgramme(
  context: Ctx,
  input: z.infer<typeof enrollLearnerSchema>,
) {
  const { data, error } = await context.supabase.rpc("enroll_student_in_programme", {
    p_programme_id: input.programmeId,
    p_student_id: input.studentId,
  });
  if (error) fail(error.message);
  if (!data) fail("The enrollment could not be created");
  return { id: data as string };
}

export async function setProgrammeEnrollmentStatus(
  context: Ctx,
  input: z.infer<typeof programmeEnrollmentStatusSchema>,
) {
  const { error } = await context.supabase.rpc("set_programme_enrollment_status", {
    p_enrollment_id: input.enrollmentId,
    p_status: input.status,
  });
  if (error) fail(error.message);
  return { ok: true };
}
