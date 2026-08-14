import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_curriculum",
  title: "Search curriculum lessons",
  description:
    "Search curriculum lessons the signed-in user may read, by title, with the owning subject and status.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Text to match against lesson titles."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("lessons")
      .select("id, title, status, subject:subjects(id, name)")
      .ilike("title", `%${query}%`)
      .order("title")
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { lessons: data ?? [] },
    };
  },
});
