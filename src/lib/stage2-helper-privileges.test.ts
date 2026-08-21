import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function readMigration(prefix: string): string {
  const file = migrationFiles().find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`migration ${prefix} not found`);
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

const PRIVILEGE_MIGRATION = "20260821191604";
const sql = readMigration(PRIVILEGE_MIGRATION);

describe("Stage 2 RLS helper privilege correction", () => {
  it("grants EXECUTE on the two policy-invoked helpers only", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION app_private\.can_manage_programmes\(uuid\) TO authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION app_private\.can_enroll_in_programme\(uuid, uuid\) TO authenticated, service_role;/,
    );
  });

  it("never grants internal, trigger or audit helpers", () => {
    for (const helper of [
      "programme_organization",
      "programme_occupied_count",
      "is_programme_instructor",
      "validate_programme",
      "validate_programme_instructor",
      "enforce_programme_enrollment_lifecycle",
      "reject_programme_history_delete",
      "log_programme_change",
    ]) {
      expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION app_private\\.${helper}\\(`));
    }
  });

  it("keeps anon and PUBLIC revoked", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION app_private\.can_manage_programmes\(uuid\) FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION app_private\.can_enroll_in_programme\(uuid, uuid\) FROM PUBLIC, anon;/,
    );
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*PUBLIC/);
  });

  it("grants no table privileges and rewrites no policy or function body", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON TABLE/i);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?(FUNCTION|POLICY)/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
  });

  it("is fail-closed: asserts the helpers and policies exist first", () => {
    expect(sql).toMatch(/to_regprocedure\('app_private\.can_manage_programmes\(uuid\)'\) IS NULL/);
    expect(sql).toMatch(/Precondition failed/);
    expect(sql).toMatch(/programmes_insert/);
    expect(sql).toMatch(/programme_enrollments_insert/);
  });

  it("proves the resulting privilege matrix with has_function_privilege", () => {
    expect(sql).toMatch(/has_function_privilege\('authenticated'/);
    expect(sql).toMatch(/has_function_privilege\('service_role'/);
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/Postcondition failed/);
  });

  it("is additive: it does not edit the applied Stage 2 migration", () => {
    const stage2 = readMigration("20260821164120");
    expect(stage2).toMatch(
      /REVOKE ALL ON FUNCTION app_private\.can_manage_programmes\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(PRIVILEGE_MIGRATION > "20260821164120").toBe(true);
  });
});

describe("disposable workflow parity", () => {
  const workflows = ["pr-quality-gates.yml", "rls-principal-tests.yml"].map((f) =>
    readFileSync(join(process.cwd(), ".github", "workflows", f), "utf8"),
  );

  it("runs the Stage 2 principal suite and residue check in both jobs", () => {
    for (const wf of workflows) {
      expect(wf).toContain("node scripts/run-stage2-rls-tests.mjs");
      expect(wf).toContain("scripts/rls/stage2-residue-check.sql");
    }
  });
});
