import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the signed-in LearnFlow user's profile, active organization roles, and platform-admin status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const [profile, roles, admin] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
      supabase
        .from("user_roles")
        .select(
          "id, status, role:roles(code, name), organization:organizations(id, name, tenant_type)",
        )
        .eq("user_id", userId)
        .eq("status", "active"),
      supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    const error = profile.error ?? roles.error ?? admin.error;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = {
      userId,
      email: ctx.getUserEmail() ?? null,
      fullName: profile.data?.full_name ?? null,
      isPlatformAdmin: admin.data !== null,
      roles: roles.data ?? [],
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
