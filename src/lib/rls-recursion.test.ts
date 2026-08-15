import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERSATION_TABLES,
  collectEffectivePolicies,
  findRecursivePolicies,
} from "./rls-recursion";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function loadMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }));
}

describe("findRecursivePolicies", () => {
  it("flags a policy that queries its own table", () => {
    const violations = findRecursivePolicies([
      {
        name: "conversation_participants_select",
        table: "public.conversation_participants",
        expression:
          "USING (conversation_id IN (SELECT conversation_id FROM public.conversation_participants WHERE user_role_id = auth.uid()))",
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].policy).toBe("conversation_participants_select");
  });

  it("accepts a policy that delegates to a SECURITY DEFINER helper", () => {
    expect(
      findRecursivePolicies([
        {
          name: "messages_select",
          table: "public.messages",
          expression: "USING (app_private.is_conversation_participant(conversation_id))",
        },
      ]),
    ).toEqual([]);
  });

  it("ignores cross-table references", () => {
    expect(
      findRecursivePolicies([
        {
          name: "conversations_select",
          table: "public.conversations",
          expression:
            "USING (EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id = id))",
        },
      ]),
    ).toEqual([]);
  });
});

describe("conversation RLS policies in migrations", () => {
  const policies = collectEffectivePolicies(loadMigrations());

  it("defines policies for every conversation table", () => {
    for (const table of CONVERSATION_TABLES) {
      expect(policies.some((policy) => policy.table.toLowerCase() === table)).toBe(true);
    }
  });

  it("has no self-referential policy on conversation tables", () => {
    const violations = findRecursivePolicies(policies);
    expect(
      violations,
      violations.map((v) => `${v.table}.${v.policy}: ${v.reason}`).join("\n"),
    ).toEqual([]);
  });
});
