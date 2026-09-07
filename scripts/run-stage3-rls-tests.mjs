#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const connection = process.env.RLS_TEST_DATABASE_URL || "";
if (process.env.RLS_DISPOSABLE_DB !== "1" || !connection) {
  console.log("[stage3-rls] No disposable database configured — skipping.");
  process.exit(0);
}
const disposable =
  /@(localhost|127\.0\.0\.1|db|postgres)(:|\/)/.test(connection) ||
  connection.includes("disposable");
if (!disposable || ["supabase.co", "supabase.com", "pooler."].some((v) => connection.includes(v))) {
  console.error("[stage3-rls] Refusing to run against a non-disposable database.");
  process.exit(1);
}

for (const file of [
  "scripts/rls/stage3-principal-tests.sql",
  "scripts/rls/stage3-residue-check.sql",
]) {
  try {
    process.stdout.write(
      execFileSync("psql", [connection, "-v", "ON_ERROR_STOP=1", "-f", file], {
        encoding: "utf8",
      }),
    );
  } catch (error) {
    console.error(`[stage3-rls] FAILED: ${file}`);
    console.error(error.stdout || "");
    console.error(error.stderr || error.message);
    process.exit(1);
  }
}
console.log("[stage3-rls] PASS — transaction rolled back, zero residue.");
