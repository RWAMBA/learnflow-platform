import { supabase } from "@/integrations/supabase/client";

export const notificationKeys = {
  list: (userRoleIds: string[]) => ["notifications", userRoleIds.join(",")] as const,
};

export async function listNotifications(userRoleIds: string[]) {
  if (userRoleIds.length === 0) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at, recipient_user_role_id")
    .in("recipient_user_role_id", userRoleIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(userRoleIds: string[]) {
  if (userRoleIds.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("recipient_user_role_id", userRoleIds)
    .is("read_at", null);
  if (error) throw error;
}

export const NOTIFICATION_LABELS: Record<string, string> = {
  new_message: "New message",
  assignment_due: "Assignment due",
  assignment_overdue: "Assignment overdue",
  assignment_graded: "New progress record",
  relationship_invitation: "Relationship invitation",
};
