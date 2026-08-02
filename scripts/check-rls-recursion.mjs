#!/usr/bin/env node
/**
 * CI guard: verifies the live database has no self-referential RLS policy on
 * the conversation tables (the cause of 42P17 "infinite recursion detected in
 * policy"). Requires psql plus PG* env vars or DATABASE_URL / SUPABASE_DB_URL.
 * Exits 0 with a notice when no database connection is configured, so the
 * static migration test (vitest) remains the always-on check.
 */
import { execFileSync } from "node:child_process";
import { CONVERSATION_TABLES, findRecursivePolicies } from "../src/lib/rls-recursion.ts";

const connection = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";
if (!connection && !process.env.PGHOST) {
  console.log("[rls-check] No database connection configured — skipping live policy check.");
  process.exit(0);
}

const tableList = CONVERSATION_TABLES.map((t) => `'${t.split(".")[1]}'`).join(", ");
const sql = `SELECT coalesce(json_agg(json_build_object(
  'name', policyname,
  'table', schemaname || '.' || tablename,
  'expression', coalesce(qual, '') || ' ' || coalesce(with_check, '')
)), '[]'::json)
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (${tableList});`;

const args = ["-Atq", "-c", sql];
if (connection) args.unshift(connection);

let output;
try {
  output = execFileSync("psql", args, { encoding: "utf8" });
} catch (error) {
  console.error("[rls-check] Failed to query pg_policies:", error.message);
  process.exit(1);
}

const policies = JSON.parse(output.trim() || "[]");
if (policies.length === 0) {
  console.error("[rls-check] No policies found on conversation tables — refusing to pass.");
  process.exit(1);
}

const violations = findRecursivePolicies(policies);
if (violations.length > 0) {
  console.error("[rls-check] Recursive RLS policies detected:");
  for (const violation of violations) {
    console.error(`  - ${violation.table}.${violation.policy}: ${violation.reason}`);
  }
  process.exit(1);
}

console.log(`[rls-check] OK — ${policies.length} conversation policies, none self-referential.`);