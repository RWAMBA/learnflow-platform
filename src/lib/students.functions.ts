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
 * Stage 1 controlled correction — atomic learner creation.
 *
 * The student record, the creating guardian's full-management relationship and
 * (when a grade is supplied) one pending primary `curriculum_enrollments` row
 * are created in a single database transaction by
 * `public.create_student_with_placement`. The deprecated
 * `students.grade_id` / `students.pathway_id` columns are never written: the
 * enrollment is the authoritative placement. Curriculum version resolution is
 * deterministic-or-fail-closed and tenant ownership is derived server-side from
 * the authenticated actor's active membership.
 */
export const createStudentWithGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createStudentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: result, error } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: { student_id: string; enrollment_id: string | null } | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("create_student_with_placement", {
      p_organization_id: data.organizationId,
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      p_date_of_birth: data.dateOfBirth || null,
      p_academic_level_id: data.gradeId || null,
      p_track_id: data.pathwayId || null,
      p_role_subtype: data.roleSubtype,
    });

    if (error) throw new Error(error.message);
    if (!result?.student_id) throw new Error("The student could not be created");

    return { studentId: result.student_id, enrollmentId: result.enrollment_id ?? null };
  });
