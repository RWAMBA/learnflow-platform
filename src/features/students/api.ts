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
      "id, first_name, last_name, date_of_birth, organization_id, user_role_id, grade:grades(id, name, sequence_order), pathway:pathways(id, name)",
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
      "id, first_name, last_name, date_of_birth, organization_id, user_role_id, created_by, grade:grades(id, name, sequence_order, pathway_required), pathway:pathways(id, name)",
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
      "id, permission_level, status, student:students(id, first_name, last_name, organization_id, grade:grades(name))",
    )
    .eq("parent_id", userId)
    .eq("status", "active");
  if (error) throw error;
  return data;
}

export async function listRosterForEducator(userId: string, kind: "teacher" | "tutor") {
  const table = kind === "teacher" ? "teacher_student_relationships" : "tutor_student_relationships";
  const column = kind === "teacher" ? "teacher_id" : "tutor_id";
  const { data, error } = await supabase
    .from(table)
    .select(
      "id, status, subject:subjects(id, name), student:students(id, first_name, last_name, organization_id, grade:grades(name))",
    )
    .eq(column, userId)
    .eq("status", "active");
  if (error) throw error;
  return data;
}
