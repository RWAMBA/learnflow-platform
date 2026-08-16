#!/usr/bin/env node
/**
 * Runner for the Stage 1C live-principal RLS proof.
 *
 * Safety contract:
 *  - refuses to run unless RLS_DISPOSABLE_DB=1 is set explicitly;
 *  - refuses any connection string that is not clearly a disposable/local one;
 *  - the SQL itself always ends in ROLLBACK, so nothing is persisted;
 *  - exits 0 with a notice when no disposable database is configured, so the
 *    static Stage 1C vitest suite stays the always-on check.
 */
import { execFileSync } from "node:child_process";

const SCRIPT = "scripts/rls/stage1c-principal-tests.sql";
const connection = process.env.RLS_TEST_DATABASE_URL || "";

if (process.env.RLS_DISPOSABLE_DB !== "1" || !connection) {
  console.log(
    "[stage1c-rls] No disposable database configured (RLS_DISPOSABLE_DB=1 + RLS_TEST_DATABASE_URL) — skipping.",
  );
  process.exit(0);
}

const isDisposable =
  /@(localhost|127\.0\.0\.1|db|postgres)(:|\/)/.test(connection) ||
  connection.includes("disposable");
if (!isDisposable) {
  console.error("[stage1c-rls] Refusing to run: connection is not a recognised disposable target.");
  process.exit(1);
}
for (const forbidden of ["supabase.co", "supabase.com", "pooler."]) {
  if (connection.includes(forbidden)) {
    console.error("[stage1c-rls] Refusing to run against a hosted Supabase endpoint.");
    process.exit(1);
  }
}

try {
  const out = execFileSync("psql", [connection, "-v", "ON_ERROR_STOP=1", "-f", SCRIPT], {
    encoding: "utf8",
  });
  process.stdout.write(out);
} catch (error) {
  console.error("[stage1c-rls] FAILED");
  console.error(error.stdout || "");
  console.error(error.stderr || error.message);
  process.exit(1);
}
console.log("[stage1c-rls] PASS — transaction rolled back, nothing persisted.");
