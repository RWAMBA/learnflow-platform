#!/usr/bin/env node
/**
 * Runner for the Stage 2 (Programmes) live-principal RLS proof.
 *
 * Safety contract:
 *  - refuses to run unless RLS_DISPOSABLE_DB=1 is set explicitly;
 *  - refuses any connection string that is not clearly a disposable/local one;
 *  - the SQL itself always ends in ROLLBACK, so nothing is persisted;
 *  - a residue check runs afterwards and fails the job on any leftover row;
 *  - exits 0 with a notice when no disposable database is configured, so the
 *    static Stage 2 vitest suite stays the always-on check.
 */
import { execFileSync } from "node:child_process";

const SCRIPT = "scripts/rls/stage2-principal-tests.sql";
const RESIDUE = "scripts/rls/stage2-residue-check.sql";
const connection = process.env.RLS_TEST_DATABASE_URL || "";

if (process.env.RLS_DISPOSABLE_DB !== "1" || !connection) {
  console.log(
    "[stage2-rls] No disposable database configured (RLS_DISPOSABLE_DB=1 + RLS_TEST_DATABASE_URL) — skipping.",
  );
  process.exit(0);
}

const isDisposable =
  /@(localhost|127\.0\.0\.1|db|postgres)(:|\/)/.test(connection) ||
  connection.includes("disposable");
if (!isDisposable) {
  console.error("[stage2-rls] Refusing to run: connection is not a recognised disposable target.");
  process.exit(1);
}
for (const forbidden of ["supabase.co", "supabase.com", "pooler."]) {
  if (connection.includes(forbidden)) {
    console.error("[stage2-rls] Refusing to run against a hosted Supabase endpoint.");
    process.exit(1);
  }
}

function run(file, label) {
  try {
    const out = execFileSync("psql", [connection, "-v", "ON_ERROR_STOP=1", "-f", file], {
      encoding: "utf8",
    });
    process.stdout.write(out);
  } catch (error) {
    console.error(`[stage2-rls] ${label} FAILED`);
    console.error(error.stdout || "");
    console.error(error.stderr || error.message);
    process.exit(1);
  }
}

run(SCRIPT, "principal proof");
run(RESIDUE, "residue check");
console.log("[stage2-rls] PASS — transaction rolled back, zero residue.");
