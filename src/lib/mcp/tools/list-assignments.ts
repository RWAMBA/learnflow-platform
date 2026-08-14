import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_assignments",
  title: "List assignments",
  description:
    "List learning assignments visible to the signed-in user, optionally filtered by student or status.",
  inputSchema: {
    studentId: z.string().uuid().optional().describe("Restrict to one student."),
    status: z
      .enum(["not_started", "in_progress", "submitted", "graded", "overdue"])
      .optional()
      .describe("Restrict to one assignment status."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ studentId, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("assignments")
      .select(
        "id, status, due_at, instructions, lesson:lessons(id, title, subject:subjects(name)), student:students(id, first_name, last_name)",
      )
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(limit ?? 25);
    if (studentId) query = query.eq("student_id", studentId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { assignments: data ?? [] },
    };
  },
});
