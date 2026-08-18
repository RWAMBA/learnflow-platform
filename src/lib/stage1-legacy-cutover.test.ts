/**
 * Phase 10 Stage 1 — legacy learner placement cutover.
 *
 * Structural verification of the applied backfill migration plus behavioural
 * verification of the now-authoritative enrollment read path. No isolated
 * Postgres is available here, so database-runtime requirements are asserted
 * against the migration SQL that produces them; the executable live-principal
 * allow/deny proof runs in .github/workflows/rls-principal-tests.yml.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { __testing, getEffectivePlacement } from "@/features/curriculum/effective-placement";

const CUTOVER_FILE = "20260818171728_1b43c1e2-7880-4f1d-94ef-1b45cf91a0c5.sql";
const STAGE1C_FILE = "20260817113059_d492f8e7-f567-441a-a6ce-4b642a990c02.sql";
const SQL = readFileSync(`supabase/migrations/${CUTOVER_FILE}`, "utf8");
const CODE = SQL.replace(/^\s*--.*$/gm, "");
const STAGE1C = readFileSync(`supabase/migrations/${STAGE1C_FILE}`, "utf8");

describe("Stage 1 legacy cutover — migration is additive and idempotent", () => {
  it("is present and is the newest migration", () => {
    const files = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files).toContain(CUTOVER_FILE);
    expect(files[files.length - 1]).toBe(CUTOVER_FILE);
  });

  it("does not modify or re-execute the previously applied Stage 1C migration", () => {
    expect(STAGE1C).toContain("CREATE TABLE public.curriculum_enrollments");
    expect(CODE).not.toMatch(/CREATE TABLE\s+public\.(curriculum_enrollments|academic_periods)/);
    expect(CODE).not.toMatch(/DROP\s+TABLE/i);
    expect(CODE).not.toMatch(/ALTER\s+TABLE/i);
  });

  it("never deletes or overwrites historical learner data", () => {
    expect(CODE).not.toMatch(/DELETE\s+FROM/i);
    expect(CODE).not.toMatch(/UPDATE\s+public\.students/i);
    expect(CODE).not.toMatch(/TRUNCATE/i);
  });

  it("only inserts for learners without an existing primary enrollment", () => {
    expect(CODE).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.curriculum_enrollments e/);
    expect(CODE).toContain("e.enrollment_category = 'primary'");
  });

  it("preserves the original learner record timestamp", () => {
    expect(CODE).toContain("r.created_at");
    expect(CODE).toMatch(/enrollment_category, status, created_at/);
  });

  it("requires the duplicate-primary guard index before writing", () => {
    expect(CODE).toContain("curriculum_enrollments_one_active_primary");
    expect(CODE).toContain("Precondition failed: one-active-primary guard index missing");
  });

  it("asserts no duplicate primary enrollment can result", () => {
    expect(CODE).toContain("duplicate primary enrollments");
    expect(CODE).toMatch(/GROUP BY student_id HAVING count\(\*\) > 1/);
  });
});

describe("Stage 1 legacy cutover — deterministic, fail-closed mapping", () => {
  it("resolves a curriculum version only when exactly one current version exists", () => {
    expect(CODE).toContain("app_private.resolve_legacy_placement_version");
    expect(CODE).toContain("c.version_count = 1");
  });

  it("skips rather than guesses an ambiguous placement", () => {
    expect(CODE).toMatch(/IF v_version IS NULL THEN[\s\S]*?CONTINUE;/);
  });

  it("fails closed when a uniquely resolvable learner is left unreconciled", () => {
    expect(CODE).toContain("app_private.unreconciled_legacy_placements");
    expect(CODE).toContain("resolvable legacy placement(s) not reconciled");
  });

  it("keeps both helper functions off the authenticated and anonymous API surface", () => {
    for (const fn of [
      "app_private.resolve_legacy_placement_version(uuid)",
      "app_private.unreconciled_legacy_placements()",
    ]) {
      for (const role of ["PUBLIC", "anon", "authenticated"]) {
        expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM ${role};`);
      }
    }
  });
});

describe("Stage 1 legacy cutover — availability gate stays closed", () => {
  it("does not touch curriculum rights, readiness or activation state", () => {
    expect(CODE).not.toMatch(/rights_status/);
    expect(CODE).not.toMatch(/activation_status/);
    expect(CODE).not.toMatch(/content_readiness/);
    expect(CODE).not.toMatch(/rights_grants|source_artifacts|rights_reviewed_at/);
  });

  it("does not weaken the availability function or the enrollment RLS policies", () => {
    expect(CODE).not.toMatch(/curriculum_version_is_available/);
    expect(CODE).not.toMatch(/CREATE POLICY|DROP POLICY|GRANT .* TO (anon|authenticated)/);
  });

  it("leaves enrollment writes restricted to platform and organization administrators", () => {
    expect(STAGE1C).toMatch(
      /CREATE POLICY curriculum_enrollments_insert[\s\S]*?app_private\.is_platform_admin\(\)[\s\S]*?has_org_role\(s\.organization_id, 'org_admin'\)/,
    );
    expect(STAGE1C).toMatch(
      /CREATE POLICY curriculum_enrollments_select[\s\S]*?app_private\.can_view_student\(student_id\)/,
    );
  });

  it("keeps lifecycle, transfer history and tenant consistency triggers authoritative", () => {
    expect(STAGE1C).toContain("transferred_from_enrollment_id");
    expect(STAGE1C).toContain("curriculum enrollment transfer cycle violation");
    expect(STAGE1C).toContain("academic period must belong to the student organization");
  });

  it("contains no learner personal data", () => {
    expect(CODE).not.toMatch(/first_name|last_name|email|date_of_birth/);
  });
});

describe("Stage 1 legacy cutover — enrollments are authoritative for reads", () => {
  it("queries only the enrollment table for effective placement", () => {
    const reader = readFileSync("src/features/curriculum/effective-placement.ts", "utf8");
    expect(reader).toContain('.from("curriculum_enrollments")');
    expect(reader).not.toContain('.from("students")');
    expect(reader).not.toContain("42P01");
  });

  it("no longer exposes a legacy placement resolver", () => {
    expect("fromLegacy" in __testing).toBe(false);
    expect(typeof getEffectivePlacement).toBe("function");
  });

  it("treats a learner with no primary enrollment as unplaced rather than legacy-placed", () => {
    expect(__testing.EMPTY.source).toBe("none");
    expect(__testing.EMPTY.academicLevelId).toBeNull();
    expect(__testing.EMPTY.curriculumVersionId).toBeNull();
  });

  it("maps an enrollment row onto the placement contract", () => {
    const placement = __testing.fromEnrollment({
      id: "df94390c",
      curriculum_version_id: "9fb2e35f",
      academic_level_id: "57ba1ca1",
      academic_period_id: null,
      track_id: null,
      academic_level: { id: "57ba1ca1", name: "Grade 7" },
      track: null,
    });
    expect(placement.source).toBe("enrollment");
    expect(placement.enrollmentId).toBe("df94390c");
    expect(placement.curriculumVersionId).toBe("9fb2e35f");
    expect(placement.academicLevelName).toBe("Grade 7");
  });
});
