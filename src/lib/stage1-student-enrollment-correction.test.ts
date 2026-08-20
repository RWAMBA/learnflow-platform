/**
 * Phase 10 Stage 1 — controlled correction: student creation must produce a
 * real curriculum enrollment.
 *
 * No isolated Postgres runs here, so database-runtime behaviour is asserted
 * against the pending correction migration that produces it; the executable
 * live-principal allow/deny proof runs in the disposable CI workflows.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_FILE = readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql"))
  .find((file) =>
    readFileSync(`supabase/migrations/${file}`, "utf8").includes(
      "public.create_student_with_placement",
    ),
  );
const SQL = readFileSync(`supabase/migrations/${MIGRATION_FILE}`, "utf8");
const CODE = SQL.replace(/^\s*--.*$/gm, "");
const SERVER = readFileSync("src/lib/students.functions.ts", "utf8");
const FORM = readFileSync("src/routes/_authenticated/students.new.tsx", "utf8");
const PLACEMENT = readFileSync("src/features/curriculum/effective-placement.ts", "utf8");
const DECISIONS = readFileSync(
  "docs/architecture/phase-10/stage-1-continuation-decision-record.md",
  "utf8",
);

describe("correction migration is additive and forward-only", () => {
  it("is the newest migration and edits no applied migration", () => {
    const files = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort();
    expect(MIGRATION_FILE).toBeTruthy();
    expect(files[files.length - 1]).toBe(MIGRATION_FILE);
    expect(CODE).not.toMatch(/DROP\s+(TABLE|POLICY|COLUMN)/i);
    expect(CODE).not.toMatch(/ALTER\s+TABLE/i);
    expect(CODE).not.toMatch(/DELETE\s+FROM/i);
    expect(CODE).not.toMatch(/TRUNCATE/i);
  });

  it("does not change curriculum rights, readiness or activation state", () => {
    expect(CODE).not.toMatch(/UPDATE\s+public\.curriculum_versions/i);
    expect(CODE).not.toMatch(/rights_status\s*=/i);
    expect(CODE).not.toMatch(/activation_status\s*=/i);
    expect(CODE).not.toMatch(/content_readiness\s*=/i);
  });

  it("declares explicit fail-closed preconditions", () => {
    expect(CODE).toContain("Precondition failed: one-active-primary guard index missing");
    expect(CODE).toContain("Precondition failed: app_private.has_org_role missing");
  });

  it("verifies postconditions before returning", () => {
    expect(CODE).toContain("Postcondition failed: expected exactly one primary enrollment");
    expect(CODE).toContain("Postcondition failed: no enrollment may be invented without a grade");
    expect(CODE).toContain("Postcondition failed: guardian relationship missing");
  });
});

describe("atomic creation function", () => {
  it("is security definer with a locked search path and minimum grants", () => {
    expect(CODE).toMatch(/CREATE OR REPLACE FUNCTION public\.create_student_with_placement/);
    expect(CODE).toContain("SECURITY DEFINER");
    expect(CODE).toContain("SET search_path = public");
    expect(CODE).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_student_with_placement[^\n]*PUBLIC/,
    );
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.create_student_with_placement[^\n]*anon/);
    expect(CODE).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_student_with_placement[^\n]*TO authenticated/,
    );
  });

  it("authenticates and authorizes fail-closed against active membership", () => {
    expect(CODE).toContain("v_actor uuid := auth.uid()");
    expect(CODE).toContain("Authentication required");
    expect(CODE).toContain("app_private.has_org_role(p_organization_id, 'parent_guardian')");
    expect(CODE).toContain("app_private.has_org_role(p_organization_id, 'org_admin')");
    expect(CODE).toContain("Not authorized to create a student in this organization");
  });

  it("derives tenant ownership and creator server-side", () => {
    // created_by / parent_id are always the authenticated actor, never client input.
    expect(CODE).toMatch(/VALUES \(p_organization_id, v_actor, btrim\(p_first_name\)/);
    expect(CODE).toContain("p_organization_id, v_actor, v_student, p_role_subtype");
    expect(CODE).not.toMatch(/p_created_by|p_parent_id|p_actor/);
  });

  it("never writes the deprecated legacy placement columns", () => {
    expect(CODE).not.toMatch(/INSERT INTO public\.students[^;]*grade_id/i);
    expect(CODE).not.toMatch(/INSERT INTO public\.students[^;]*pathway_id/i);
    expect(CODE).not.toMatch(/UPDATE\s+public\.students/i);
  });

  it("creates exactly one pending primary enrollment when a grade is supplied", () => {
    expect(CODE).toMatch(/INSERT INTO public\.curriculum_enrollments/);
    expect(CODE).toContain("'primary', 'pending'");
    expect(CODE).toContain("IF p_academic_level_id IS NOT NULL THEN");
  });

  it("invents no enrollment when no grade is supplied", () => {
    expect(CODE).toContain("no enrollment may be invented without a grade");
    expect(CODE).toContain("A pathway cannot be selected without a grade");
  });

  it("resolves the curriculum version deterministically or fails closed", () => {
    expect(CODE).toContain("app_private.resolve_current_curriculum_version");
    expect(CODE).toContain("WHERE c.version_count = 1");
    expect(CODE).toContain(
      "That grade has no current curriculum version, so a placement cannot be created",
    );
    expect(CODE).toContain(
      "That grade resolves to more than one current curriculum version, so the placement is ambiguous",
    );
    // No newest-wins or implicit selection.
    expect(CODE).not.toMatch(/ORDER BY[^\n]*created_at DESC[^\n]*LIMIT 1/i);
  });

  it("keeps the reusable resolver private", () => {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(CODE).toContain(
        `REVOKE ALL ON FUNCTION app_private.resolve_current_curriculum_version(uuid) FROM ${role}`,
      );
    }
    expect(CODE).not.toContain("app_private.resolve_legacy_placement_version(");
  });

  it("validates the level, curriculum and track relationship", () => {
    expect(CODE).toContain("That grade does not exist");
    expect(CODE).toContain("That pathway does not belong to the selected grade");
    expect(CODE).toContain("That grade requires a pathway");
    expect(CODE).toContain("p.id = p_track_id AND p.grade_id = p_academic_level_id");
  });

  it("leaves the database duplicate/lifecycle guards authoritative", () => {
    expect(CODE).not.toMatch(/DROP INDEX[^\n]*one_active_primary/i);
    expect(CODE).not.toMatch(/DROP TRIGGER/i);
    expect(CODE).not.toMatch(/enrolled_at|ended_at/);
  });
});

describe("server function delegates to the atomic path", () => {
  it("calls the transactional database function and nothing else", () => {
    expect(SERVER).toContain('rpc("create_student_with_placement"');
    expect(SERVER).not.toMatch(/from\("students"\)/);
    expect(SERVER).not.toMatch(/from\("parent_student_relationships"\)/);
    expect(SERVER).not.toMatch(/from\("curriculum_enrollments"\)/);
  });

  it("never sends the deprecated placement columns", () => {
    expect(SERVER).not.toMatch(/grade_id:/);
    expect(SERVER).not.toMatch(/pathway_id:/);
  });

  it("keeps the grade optional and the actor authenticated", () => {
    expect(SERVER).toContain("requireSupabaseAuth");
    expect(SERVER).toMatch(/gradeId: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/);
  });
});

describe("user-facing grade selection is preserved", () => {
  it("still offers grade and pathway selection on the creation form", () => {
    expect(FORM).toContain('name="gradeId"');
    expect(FORM).toContain('name="pathwayId"');
  });
});

describe("legacy placement fields have no active application behaviour", () => {
  const ACTIVE_GLOBS = ["src/features", "src/routes", "src/lib", "src/components"];

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(full);
      if (!/\.(ts|tsx)$/.test(entry.name)) return [];
      if (entry.name.includes(".test.")) return [];
      return [full];
    });
  }

  it("has zero active reads or writes of students.grade_id / students.pathway_id", () => {
    const offenders: string[] = [];
    for (const root of ACTIVE_GLOBS) {
      for (const file of walk(root)) {
        // The reconciliation report is read-only historical reporting and is
        // explicitly excluded by the approved cutover decision.
        if (file.endsWith("src/features/curriculum/enrollment-api.ts")) continue;
        const text = readFileSync(file, "utf8");
        // Inspect only the query chain that follows a students-table access.
        const segments = text.split('.from("students")').slice(1);
        for (const segment of segments) {
          const chain = segment.split(".from(")[0];
          if (/\b(grade_id|pathway_id)\b/.test(chain)) offenders.push(file);
        }

      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads placement only from curriculum_enrollments", () => {
    expect(PLACEMENT).toContain('from("curriculum_enrollments")');
    expect(PLACEMENT).not.toMatch(/fromLegacy/);
    expect(PLACEMENT).not.toMatch(/42P01/);
  });
});

describe("stage 1 decision record", () => {
  it("documents the migration exception and the platform-admin trace", () => {
    expect(DECISIONS).toContain("20260818154626");
    expect(DECISIONS).toContain("narrowly scoped historical exception");
    expect(DECISIONS).toContain("explicit fail-closed preconditions");
    expect(DECISIONS).toContain("app_private.is_platform_admin()");
    expect(DECISIONS).toContain("revoked Platform Administrator is denied every rights mutation");
  });
});
