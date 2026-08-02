import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const gradeSchema = z.object({
  assignmentId: z.string().uuid(),
  gradedByUserRoleId: z.string().uuid(),
  score: z.number().min(0).max(100).optional(),
  feedback: z.string().trim().max(2000).optional(),
  masteryLevel: z.enum(["emerging", "developing", "proficient", "advanced"]),
  competencyIds: z.array(z.string().uuid()).default([]),
});

const createSchema = z.object({
  lessonId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1, "Select at least one student"),
  createdByUserRoleId: z.string().uuid(),
  dueAt: z.string().datetime().nullable().default(null),
  instructions: z.string().trim().max(4000).nullable().default(null),
});

/**
 * Distribution: one assignment row per selected student, plus a notification
 * for every student that has an independent login.
 */
export const createAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rows, error } = await supabase
      .from("assignments")
      .insert(
        data.studentIds.map((studentId) => ({
          lesson_id: data.lessonId,
          student_id: studentId,
          created_by_user_role_id: data.createdByUserRoleId,
          due_at: data.dueAt,
          instructions: data.instructions,
        })),
      )
      .select("id, student_id, student:students(id, organization_id, user_role_id)");
    if (error) throw new Error(error.message);

    const recipients = (rows ?? [])
      .map((row) => ({ roleId: row.student?.user_role_id, assignmentId: row.id }))
      .filter((row): row is { roleId: string; assignmentId: string } => Boolean(row.roleId));

    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map((row) => ({
          recipient_user_role_id: row.roleId,
          type: "assignment_due",
          payload: { assignment_id: row.assignmentId, due_at: data.dueAt },
        })),
      );
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: rows?.[0]?.student?.organization_id ?? null,
      action: "assignment.created",
      entity_type: "assignments",
      after_state: { lesson_id: data.lessonId, student_ids: data.studentIds },
    });

    return { assignmentIds: (rows ?? []).map((row) => row.id) };
  });

const submitSchema = z.object({
  assignmentId: z.string().uuid(),
  status: z.enum(["in_progress", "submitted"]),
});

/** Learner-side workflow: start work or hand it in, notifying the author. */
export const submitAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: assignment, error } = await supabase
      .from("assignments")
      .update({ status: data.status })
      .eq("id", data.assignmentId)
      .select("id, created_by_user_role_id, student:students(organization_id)")
      .single();
    if (error) throw new Error(error.message);

    if (data.status === "submitted") {
      await supabase.from("notifications").insert({
        recipient_user_role_id: assignment.created_by_user_role_id,
        type: "assignment_submitted",
        payload: { assignment_id: data.assignmentId },
      });
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: assignment.student?.organization_id ?? null,
      action: `assignment.${data.status}`,
      entity_type: "assignments",
      entity_id: data.assignmentId,
      after_state: { status: data.status },
    });

    return { ok: true };
  });

/**
 * Multi-step: grading writes an assessment, the progress records for each
 * covered competency, moves the assignment to `graded`, and notifies the
 * student and their guardians.
 */
export const gradeAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gradeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, student_id, student:students(id, organization_id, user_role_id)")
      .eq("id", data.assignmentId)
      .single();
    if (assignmentError) throw new Error(assignmentError.message);

    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert({
        assignment_id: data.assignmentId,
        graded_by_user_role_id: data.gradedByUserRoleId,
        graded_at: new Date().toISOString(),
        result: {
          score: data.score ?? null,
          feedback: data.feedback ?? null,
          mastery_level: data.masteryLevel,
        },
      })
      .select("id")
      .single();
    if (assessmentError) throw new Error(assessmentError.message);

    if (data.competencyIds.length > 0) {
      const { error: progressError } = await supabase.from("progress_records").insert(
        data.competencyIds.map((competencyId) => ({
          student_id: assignment.student_id,
          competency_id: competencyId,
          assessment_id: assessment.id,
          mastery_level: data.masteryLevel,
        })),
      );
      if (progressError) throw new Error(progressError.message);
    }

    const { error: statusError } = await supabase
      .from("assignments")
      .update({ status: "graded" })
      .eq("id", data.assignmentId);
    if (statusError) throw new Error(statusError.message);

    const recipients = new Set<string>();
    if (assignment.student?.user_role_id) recipients.add(assignment.student.user_role_id);

    const { data: guardians } = await supabase
      .from("parent_student_relationships")
      .select("parent_id")
      .eq("student_id", assignment.student_id)
      .eq("status", "active");

    if (guardians?.length) {
      const { data: guardianRoles } = await supabase
        .from("user_roles")
        .select("id, user_id, role:roles!inner(code)")
        .in(
          "user_id",
          guardians.map((row) => row.parent_id),
        )
        .eq("status", "active")
        .eq("roles.code", "parent_guardian");
      guardianRoles?.forEach((row) => recipients.add(row.id));
    }

    if (recipients.size > 0) {
      await supabase.from("notifications").insert(
        Array.from(recipients).map((roleId) => ({
          recipient_user_role_id: roleId,
          type: "assignment_graded",
          payload: { assignment_id: data.assignmentId, mastery_level: data.masteryLevel },
        })),
      );
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: assignment.student?.organization_id ?? null,
      action: "assignment.graded",
      entity_type: "assignments",
      entity_id: data.assignmentId,
      after_state: { mastery_level: data.masteryLevel, score: data.score ?? null },
    });

    return { assessmentId: assessment.id };
  });
