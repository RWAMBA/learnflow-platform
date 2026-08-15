import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listStudentsTool from "./tools/list-students";
import listAssignmentsTool from "./tools/list-assignments";
import searchCurriculumTool from "./tools/search-curriculum";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "learnflow-platform",
  title: "LearnFlow Platform",
  version: "0.1.0",
  instructions:
    "Read-only tools for LearnFlow, a multi-tenant homeschooling and education platform. Every call acts as the signed-in user and is limited by their tenant roles. Use `whoami` first to learn the user's organizations and roles, then `list_students`, `list_assignments`, or `search_curriculum`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listStudentsTool, listAssignmentsTool, searchCurriculumTool],
});
