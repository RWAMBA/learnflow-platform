import { supabase } from "@/integrations/supabase/client";

export const studentKeys = {
  list: (organizationId: string) => ["students", organizationId] as const,
  detail: (studentId: string) => ["student", studentId] as const,
  forViewer: (userId: string) => ["students", "linked", userId] as const,
};

export async function listStudents(organizationId: string) {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, date_of_birth, organization_id, user_role_id, grade:grades!subjects_grade_id_fkey(id, name, sequence_order), pathway:pathways!subjects_pathway_id_fkey(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("first_name");
  if (error) throw error;
  return data;
}

export async function getStudent(studentId: string) {
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, first_name, last_name, date_of_birth, organization_id, user_role_id, created_by, grade:grades!subjects_grade_id_fkey(id, name, sequence_order, pathway_required), pathway:pathways!subjects_pathway_id_fkey(id, name)",
    )
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Students the signed-in user is linked to as a parent/guardian. */
export async function listLinkedStudentsForParent(userId: string) {
  const { data, error } = await supabase
    .from("parent_student_relationships")
    .select(
      "id, permission_level, status, student:students(id, first_name, last_name, organization_id, grade:grades!subjects_grade_id_fkey(name))",
    )
    .eq("parent_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return data;
}

export async function listRosterForEducator(userId: string, kind: "teacher" | "tutor") {
  const select =
    "id, status, subject:subjects(id, name), student:students(id, first_name, last_name, organization_id, grade:grades!subjects_grade_id_fkey(name))";
  const { data, error } =
    kind === "teacher"
      ? await supabase
          .from("teacher_student_relationships")
          .select(select)
          .eq("teacher_id", userId)
          .eq("status", "active")
      : await supabase
          .from("tutor_student_relationships")
          .select(select)
          .eq("tutor_id", userId)
          .eq("status", "active");
  if (error) throw error;
  return data;
}
