import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createStudentSchema = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().optional().nullable(),
  gradeId: z.string().uuid().optional().nullable(),
  pathwayId: z.string().uuid().optional().nullable(),
  roleSubtype: z.enum(["biological_parent", "legal_guardian", "foster_parent", "other_guardian"]),
});

/**
 * Multi-step: creates the student record and the creating guardian's
 * full-management relationship in one operation.
 */
export const createStudentWithGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStudentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: student, error } = await supabase
      .from("students")
      .insert({
        organization_id: data.organizationId,
        created_by: userId,
        first_name: data.firstName,
        last_name: data.lastName,
        date_of_birth: data.dateOfBirth || null,
        grade_id: data.gradeId || null,
        pathway_id: data.pathwayId || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: relationshipError } = await supabase
      .from("parent_student_relationships")
      .insert({
        organization_id: data.organizationId,
        parent_id: userId,
        student_id: student.id,
        role_subtype: data.roleSubtype,
        permission_level: "full_management",
        status: "active",
        invitation_status: "accepted",
        created_by: userId,
      });
    if (relationshipError) throw new Error(relationshipError.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "student.created",
      entity_type: "students",
      entity_id: student.id,
      after_state: { first_name: data.firstName, last_name: data.lastName },
    });

    return { studentId: student.id };
  });
