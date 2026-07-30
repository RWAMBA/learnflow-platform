import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoleContext } from "@/features/roles/role-context";

/** The student record represented by the active student role, if any. */
export function useCurrentStudent() {
  const { activeRole } = useRoleContext();
  const userRoleId = activeRole?.roleCode === "student" ? activeRole.userRoleId : null;

  return useQuery({
    queryKey: ["current-student", userRoleId],
    enabled: Boolean(userRoleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, organization_id, grade:grades(id, name, sequence_order)")
        .eq("user_role_id", userRoleId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
