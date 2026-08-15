import { supabase } from "@/integrations/supabase/client";

export const relationshipKeys = {
  forStudent: (studentId: string) => ["relationships", "student", studentId] as const,
  pendingForUser: (userId: string) => ["relationships", "pending", userId] as const,
  orgMembers: (organizationId: string) => ["organization-members", organizationId] as const,
};

export async function listRelationshipsForStudent(studentId: string) {
  const [parents, teachers, tutors] = await Promise.all([
    supabase
      .from("parent_student_relationships")
      .select(
        "id, status, invitation_status, permission_level, role_subtype, parent_id, parent:profiles!parent_student_relationships_parent_id_fkey(full_name)",
      )
      .eq("student_id", studentId),
    supabase
      .from("teacher_student_relationships")
      .select(
        "id, status, invitation_status, teacher_id, subject:subjects(id, name), teacher:profiles!teacher_student_relationships_teacher_id_fkey(full_name)",
      )
      .eq("student_id", studentId),
    supabase
      .from("tutor_student_relationships")
      .select(
        "id, status, invitation_status, tutor_id, subject:subjects(id, name), tutor:profiles!tutor_student_relationships_tutor_id_fkey(full_name)",
      )
      .eq("student_id", studentId),
  ]);
  if (parents.error) throw parents.error;
  if (teachers.error) throw teachers.error;
  if (tutors.error) throw tutors.error;
  return {
    parents: parents.data ?? [],
    teachers: teachers.data ?? [],
    tutors: tutors.data ?? [],
  };
}

/** Invitations awaiting the signed-in user's response. */
export async function listPendingInvitationsForUser(userId: string) {
  const [parents, teachers, tutors] = await Promise.all([
    supabase
      .from("parent_student_relationships")
      .select("id, status, student:students(id, first_name, last_name)")
      .eq("parent_id", userId)
      .eq("status", "pending_invitation"),
    supabase
      .from("teacher_student_relationships")
      .select("id, status, subject:subjects(name), student:students(id, first_name, last_name)")
      .eq("teacher_id", userId)
      .eq("status", "pending_invitation"),
    supabase
      .from("tutor_student_relationships")
      .select("id, status, subject:subjects(name), student:students(id, first_name, last_name)")
      .eq("tutor_id", userId)
      .eq("status", "pending_invitation"),
  ]);
  if (parents.error) throw parents.error;
  if (teachers.error) throw teachers.error;
  if (tutors.error) throw tutors.error;

  return [
    ...(parents.data ?? []).map((row) => ({ kind: "parent" as const, ...row })),
    ...(teachers.data ?? []).map((row) => ({ kind: "teacher" as const, ...row })),
    ...(tutors.data ?? []).map((row) => ({ kind: "tutor" as const, ...row })),
  ];
}

export async function listOrganizationMembers(organizationId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select(
      "id, user_id, role:roles(code, name), profile:profiles!user_roles_user_id_fkey(id, full_name)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error) throw error;
  return data ?? [];
}
