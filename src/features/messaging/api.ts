import { supabase } from "@/integrations/supabase/client";

export const messagingKeys = {
  conversations: (userRoleId: string) => ["conversations", userRoleId] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  contacts: (userId: string, userRoleId: string) => ["contacts", userId, userRoleId] as const,
};

export async function listConversations(userRoleId: string) {
  const { data: participation, error: participationError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_role_id", userRoleId);
  if (participationError) throw participationError;

  const conversationIds = (participation ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, created_at, participants:conversation_participants(user_role_id, user_role:user_roles(id, user_id, profile:profiles(full_name), role:roles(code, name))), messages(id, body, sent_at, read_at, sender_user_role_id)",
    )
    .in("id", conversationIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, body, sent_at, read_at, sender_user_role_id, sender:user_roles(id, user_id, profile:profiles(full_name), role:roles(code, name))",
    )
    .eq("conversation_id", conversationId)
    .order("sent_at");
  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId: string, userRoleId: string) {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_user_role_id", userRoleId)
    .is("read_at", null);
  if (error) throw error;
}

/**
 * The people the signed-in role may message: only counterparties reachable
 * through an active relationship, plus the organization administrator.
 */
export async function listAllowedContacts(params: {
  userId: string;
  organizationId: string;
  roleCode: string;
  studentId?: string | null;
}) {
  const counterpartUserIds = new Set<string>();

  if (params.roleCode === "student" && params.studentId) {
    const [parents, teachers, tutors] = await Promise.all([
      supabase
        .from("parent_student_relationships")
        .select("parent_id")
        .eq("student_id", params.studentId)
        .eq("status", "active"),
      supabase
        .from("teacher_student_relationships")
        .select("teacher_id")
        .eq("student_id", params.studentId)
        .eq("status", "active"),
      supabase
        .from("tutor_student_relationships")
        .select("tutor_id")
        .eq("student_id", params.studentId)
        .eq("status", "active"),
    ]);
    parents.data?.forEach((row) => counterpartUserIds.add(row.parent_id));
    teachers.data?.forEach((row) => counterpartUserIds.add(row.teacher_id));
    tutors.data?.forEach((row) => counterpartUserIds.add(row.tutor_id));
  } else {
    const studentIds = new Set<string>();
    const [asParent, asTeacher, asTutor] = await Promise.all([
      supabase
        .from("parent_student_relationships")
        .select("student_id")
        .eq("parent_id", params.userId)
        .eq("status", "active"),
      supabase
        .from("teacher_student_relationships")
        .select("student_id")
        .eq("teacher_id", params.userId)
        .eq("status", "active"),
      supabase
        .from("tutor_student_relationships")
        .select("student_id")
        .eq("tutor_id", params.userId)
        .eq("status", "active"),
    ]);
    asParent.data?.forEach((row) => studentIds.add(row.student_id));
    asTeacher.data?.forEach((row) => studentIds.add(row.student_id));
    asTutor.data?.forEach((row) => studentIds.add(row.student_id));

    if (studentIds.size > 0) {
      const ids = Array.from(studentIds);
      const [parents, teachers, tutors] = await Promise.all([
        supabase
          .from("parent_student_relationships")
          .select("parent_id")
          .in("student_id", ids)
          .eq("status", "active"),
        supabase
          .from("teacher_student_relationships")
          .select("teacher_id")
          .in("student_id", ids)
          .eq("status", "active"),
        supabase
          .from("tutor_student_relationships")
          .select("tutor_id")
          .in("student_id", ids)
          .eq("status", "active"),
      ]);
      parents.data?.forEach((row) => counterpartUserIds.add(row.parent_id));
      teachers.data?.forEach((row) => counterpartUserIds.add(row.teacher_id));
      tutors.data?.forEach((row) => counterpartUserIds.add(row.tutor_id));
    }
  }

  counterpartUserIds.delete(params.userId);

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id, role:roles!inner(code)")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .eq("roles.code", "org_admin");
  admins?.forEach((row) => {
    if (row.user_id !== params.userId) counterpartUserIds.add(row.user_id);
  });

  if (counterpartUserIds.size === 0) return [];

  const { data, error } = await supabase
    .from("user_roles")
    .select("id, user_id, profile:profiles(full_name), role:roles(code, name)")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .in("user_id", Array.from(counterpartUserIds));
  if (error) throw error;
  return data ?? [];
}
