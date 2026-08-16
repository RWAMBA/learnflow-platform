import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_students",
  title: "List students",
  description:
    "List the students the signed-in user can access, optionally filtered by an organization id or a name search.",
  inputSchema: {
    organizationId: z.string().uuid().optional().describe("Restrict to one organization."),
    search: z.string().trim().min(1).optional().describe("Match part of a first or last name."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("students")
      .select(
        "id, first_name, last_name, organization_id, grade:grades!subjects_grade_id_fkey(name), pathway:pathways!subjects_pathway_id_fkey(name)",
      )
      .order("first_name")
      .limit(limit ?? 25);
    if (organizationId) query = query.eq("organization_id", organizationId);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { students: data ?? [] },
    };
  },
});
