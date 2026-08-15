/**
 * Structural verification of the PREPARED Phase 10 Stage 1A curriculum-foundation
 * migration. These tests do not touch a database: no isolated/shadow Postgres is
 * available in this environment, so every runtime-behaviour requirement is asserted
 * structurally against the migration SQL that will produce it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MFA_ENFORCEMENT_ENABLED } from "@/features/security/mfa";

const MIGRATION_FILE = "20260815191500_phase10_stage1a_curriculum_foundation.sql";
const SQL = readFileSync(`supabase/migrations/${MIGRATION_FILE}`, "utf8");
const MIGRATIONS = readdirSync("supabase/migrations").sort();

const has = (needle: string) => SQL.includes(needle);

describe("Stage 1A — transaction and safety envelope", () => {
  it("is exactly one explicit transaction", () => {
    expect(SQL.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(SQL.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(SQL.indexOf("BEGIN;")).toBeLessThan(SQL.indexOf("COMMIT;"));
    expect(SQL).not.toMatch(/\bROLLBACK\b/);
  });

  it("never conceals drift with IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE", () => {
    expect(SQL).not.toMatch(/IF NOT EXISTS/i);
    expect(SQL).not.toMatch(/DROP\s+\w+\s+IF\s+EXISTS/i);
    expect(SQL).not.toMatch(/CREATE\s+OR\s+REPLACE/i);
  });

  it("performs no destructive legacy rename or drop", () => {
    expect(SQL).not.toMatch(/RENAME/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+COLUMN/i);
    expect(SQL).not.toMatch(/TRUNCATE\s+(TABLE\s+)?public\./i);
    expect(SQL).not.toMatch(/DELETE\s+FROM/i);
  });

  it("is the newest migration and later than the SEC-006 ACL migration", () => {
    expect(MIGRATIONS.at(-1)).toBe(MIGRATION_FILE);
    expect(MIGRATION_FILE > "20260815110738").toBe(true);
  });
});

describe("Stage 1A — fail-closed preconditions", () => {
  it("asserts absence of every new table, column, constraint, index, trigger, function and policy", () => {
    const precheck = SQL.slice(SQL.indexOf("$precheck$"), SQL.lastIndexOf("$precheck$"));
    for (const marker of [
      "public.curriculum_providers",
      "public.education_stages",
      "public.subject_groups",
      "provider_id",
      "is_current",
      "education_stage_id",
      "academic_level_id",
      "curricula_provider_id_fkey",
      "curriculum_versions_one_current_per_curriculum",
      "curriculum_providers_set_updated_at",
      "enforce_curriculum_version_lifecycle",
      "curriculum_providers_write",
    ]) {
      expect(precheck).toContain(marker);
    }
    expect(precheck).toContain("pg_constraint");
    expect(precheck).toContain("pg_indexes");
    expect(precheck).toContain("pg_trigger");
    expect(precheck).toContain("pg_policies");
  });

  it("requires public.set_updated_at() with the trigger signature", () => {
    expect(has("p.proname = 'set_updated_at'")).toBe(true);
    expect(has("pg_get_function_result(p.oid) = 'trigger'")).toBe(true);
  });

  it("aborts unless the tenant-owned curriculum version count is zero", () => {
    expect(has("WHERE organization_id IS NOT NULL")).toBe(true);
    expect(has("tenant-owned curriculum versions require data-disposition review")).toBe(true);
  });

  it("asserts the four SEC-005 curriculum_versions policy predicates before replacing them", () => {
    expect(has("curriculum_versions policy baseline mismatch")).toBe(true);
    expect(
      has(
        "'((organization_id IS NULL) AND ((status = ''published''::text) OR app_private.is_platform_admin()))'",
      ),
    ).toBe(true);
    expect(
      SQL.split("'((organization_id IS NULL) AND app_private.is_platform_admin())'").length - 1,
    ).toBeGreaterThanOrEqual(4);
  });

  it("every assertion raises and therefore aborts the whole transaction", () => {
    expect(SQL.match(/RAISE EXCEPTION 'stage1a precondition failed/g)?.length ?? 0).toBeGreaterThan(
      8,
    );
  });
});

describe("Stage 1A — new tables", () => {
  it("creates exactly the three new tables", () => {
    const created = [...SQL.matchAll(/CREATE TABLE (public\.\w+)/g)].map((m) => m[1]);
    expect(created).toEqual([
      "public.curriculum_providers",
      "public.education_stages",
      "public.subject_groups",
    ]);
  });

  it("defines curriculum_providers columns and unique code", () => {
    expect(has("code text NOT NULL")).toBe(true);
    expect(has("CONSTRAINT curriculum_providers_code_key UNIQUE (code)")).toBe(true);
  });

  it("defines education_stages columns, FK actions, unique sequence and lifecycle check", () => {
    expect(has("curriculum_version_id uuid NOT NULL")).toBe(true);
    expect(has("sequence_order integer NOT NULL DEFAULT 1")).toBe(true);
    expect(has("status text NOT NULL DEFAULT 'draft'")).toBe(true);
    expect(has("REFERENCES public.curriculum_versions(id)\n    ON DELETE RESTRICT ON UPDATE RESTRICT")).toBe(true);
    expect(has("education_stages_version_sequence_key UNIQUE (curriculum_version_id, sequence_order)")).toBe(true);
    expect(has("education_stages_status_chk CHECK (status IN ('draft','review','published','archived'))")).toBe(true);
  });

  it("defines subject_groups with a unique name", () => {
    expect(has("CONSTRAINT subject_groups_name_key UNIQUE (name)")).toBe(true);
  });

  it("attaches a BEFORE UPDATE set_updated_at trigger to each new table", () => {
    for (const table of ["curriculum_providers", "education_stages", "subject_groups"]) {
      expect(has(`CREATE TRIGGER ${table}_set_updated_at\n  BEFORE UPDATE ON public.${table}`)).toBe(true);
    }
    expect(SQL.match(/EXECUTE FUNCTION public\.set_updated_at\(\)/g)).toHaveLength(3);
  });
});

describe("Stage 1A — grants, revocations and RLS", () => {
  const tables = ["curriculum_providers", "education_stages", "subject_groups"];

  it("revokes PUBLIC and anon on every new table", () => {
    for (const t of tables) {
      expect(has(`REVOKE ALL ON public.${t} FROM PUBLIC;`)).toBe(true);
      expect(has(`REVOKE ALL ON public.${t} FROM anon;`)).toBe(true);
    }
  });

  it("grants authenticated exactly SELECT, INSERT, UPDATE, DELETE", () => {
    for (const t of tables) {
      expect(has(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated;`)).toBe(true);
    }
    expect(SQL).not.toMatch(/TRUNCATE[^;]*TO authenticated/);
    expect(SQL).not.toMatch(/REFERENCES[^;]*TO authenticated/);
    expect(SQL).not.toMatch(/TRIGGER[^;]*TO authenticated/);
  });

  it("grants server-only privileges to service_role", () => {
    for (const t of tables) {
      expect(
        has(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.${t} TO service_role;`),
      ).toBe(true);
    }
  });

  it("grants nothing to anon anywhere", () => {
    expect(SQL).not.toMatch(/GRANT[^;]*TO anon/i);
  });

  it("enables RLS on every new table", () => {
    for (const t of tables) {
      expect(has(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)).toBe(true);
    }
  });
});

describe("Stage 1A — policies", () => {
  it("creates exactly the six new policies with the reviewed shapes", () => {
    for (const t of ["curriculum_providers", "education_stages", "subject_groups"]) {
      expect(has(`CREATE POLICY ${t}_select ON public.${t}\n  FOR SELECT TO authenticated USING (true);`)).toBe(true);
      expect(
        has(
          `CREATE POLICY ${t}_write ON public.${t}\n  FOR ALL TO authenticated\n  USING (app_private.is_platform_admin())\n  WITH CHECK (app_private.is_platform_admin());`,
        ),
      ).toBe(true);
    }
  });

  it("ordinary authenticated users may read reference tables but not write them", () => {
    // read: USING (true) on every select policy; write: platform-admin only.
    expect(SQL.match(/FOR SELECT TO authenticated USING \(true\)/g)).toHaveLength(4);
    expect(SQL.match(/app_private\.is_platform_admin\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });

  it("replaces the four curriculum_versions policies with exact DROP statements", () => {
    for (const name of ["select", "insert", "update", "delete"]) {
      expect(has(`DROP POLICY curriculum_versions_${name} ON public.curriculum_versions;`)).toBe(true);
    }
    expect(SQL).not.toMatch(/DROP POLICY IF EXISTS/i);
  });

  it("denies Organization Administrator and tenant-owned curriculum version writes", () => {
    expect(
      has("WITH CHECK (app_private.is_platform_admin() AND organization_id IS NULL);"),
    ).toBe(true);
    expect(
      has("CREATE POLICY curriculum_versions_update ON public.curriculum_versions\n  FOR UPDATE TO authenticated\n  USING (app_private.is_platform_admin())"),
    ).toBe(true);
    expect(
      has("CREATE POLICY curriculum_versions_delete ON public.curriculum_versions\n  FOR DELETE TO authenticated\n  USING (app_private.is_platform_admin());"),
    ).toBe(true);
  });

  it("introduces no AAL2 term during Stage 1A", () => {
    expect(SQL).not.toMatch(/has_aal2/);
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
  });

  it("scopes every policy to authenticated only", () => {
    const roles = [...SQL.matchAll(/FOR (?:SELECT|INSERT|UPDATE|DELETE|ALL) TO (\w+)/g)].map((m) => m[1]);
    expect(new Set(roles)).toEqual(new Set(["authenticated"]));
  });
});

describe("Stage 1A — additive existing-table changes", () => {
  it("adds exactly nine columns to existing tables", () => {
    const added = [...SQL.matchAll(/ALTER TABLE (public\.\w+) ADD COLUMN (\w+)/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    expect(added).toEqual([
      "public.curricula.provider_id",
      "public.curriculum_versions.is_current",
      "public.grades.education_stage_id",
      "public.grades.status",
      "public.grades.published_at",
      "public.subjects.academic_level_id",
      "public.subjects.track_id",
      "public.subjects.subject_group_id",
    ]);
    // subjects.published_at pre-exists and is asserted, not re-added.
    expect(has("subjects.published_at not in the expected shape")).toBe(true);
    expect(added.length + 1).toBe(9);
  });

  it("creates the five explicit FK indexes plus the partial unique index", () => {
    const idx = [...SQL.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1]);
    expect(idx).toEqual([
      "curricula_provider_id_idx",
      "curriculum_versions_one_current_per_curriculum",
      "grades_education_stage_id_idx",
      "subjects_academic_level_id_idx",
      "subjects_track_id_idx",
      "subjects_subject_group_id_idx",
    ]);
    expect(
      has("curriculum_versions_one_current_per_curriculum\n  ON public.curriculum_versions(curriculum_id) WHERE is_current;"),
    ).toBe(true);
  });

  it("uses the reviewed foreign-key actions", () => {
    expect(has("curricula_provider_id_fkey\n  FOREIGN KEY (provider_id) REFERENCES public.curriculum_providers(id)\n  ON DELETE RESTRICT ON UPDATE RESTRICT")).toBe(true);
    for (const [c, ref] of [
      ["grades_education_stage_id_fkey", "public.education_stages(id)"],
      ["subjects_academic_level_id_fkey", "public.grades(id)"],
      ["subjects_track_id_fkey", "public.pathways(id)"],
      ["subjects_subject_group_id_fkey", "public.subject_groups(id)"],
    ]) {
      expect(SQL).toContain(c);
      expect(SQL).toContain(`REFERENCES ${ref}\n  ON DELETE SET NULL ON UPDATE RESTRICT`);
    }
  });

  it("enforces platform ownership and current-only-when-published on curriculum_versions", () => {
    expect(has("curriculum_versions_org_null_chk CHECK (organization_id IS NULL)")).toBe(true);
    expect(has("curriculum_versions_current_published_chk\n  CHECK (NOT is_current OR status = 'published')")).toBe(true);
    expect(has("ADD COLUMN is_current boolean NOT NULL DEFAULT false")).toBe(true);
    expect(SQL).not.toMatch(/UPDATE public\.curriculum_versions SET is_current/);
    expect(SQL).not.toMatch(/DROP CONSTRAINT/i);
  });

  it("publishes existing grades, defaults future grades to draft and validates the check", () => {
    const order = [
      "ALTER TABLE public.grades ADD COLUMN status text;",
      "UPDATE public.grades SET status = 'published' WHERE status IS NULL;",
      "ALTER TABLE public.grades ALTER COLUMN status SET DEFAULT 'draft';",
      "grades_status_chk CHECK (status IN ('draft','review','published','archived')) NOT VALID;",
      "ALTER TABLE public.grades VALIDATE CONSTRAINT grades_status_chk;",
      "ALTER TABLE public.grades ALTER COLUMN status SET NOT NULL;",
    ];
    let cursor = -1;
    for (const step of order) {
      const at = SQL.indexOf(step);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(SQL).not.toMatch(/grades SET published_at/);
  });

  it("copies subject structure verbatim from the legacy columns and leaves grouping null", () => {
    expect(has("UPDATE public.subjects SET academic_level_id = grade_id;")).toBe(true);
    expect(has("UPDATE public.subjects SET track_id = pathway_id;")).toBe(true);
    expect(SQL).not.toMatch(/SET subject_group_id/);
    expect(SQL).not.toMatch(/subjects SET published_at/);
  });

  it("does not change pathways", () => {
    expect(SQL).not.toMatch(/ALTER TABLE public\.pathways/);
  });
});

describe("Stage 1A — curriculum version lifecycle", () => {
  it("creates a hardened trigger function with an empty search path", () => {
    expect(has("CREATE FUNCTION app_private.enforce_curriculum_version_lifecycle()")).toBe(true);
    expect(has("RETURNS trigger")).toBe(true);
    expect(has("LANGUAGE plpgsql")).toBe(true);
    expect(has("SECURITY INVOKER")).toBe(true);
    expect(has("SET search_path = ''")).toBe(true);
  });

  it("uses generic exception text with no identifiers", () => {
    const msgs = [...SQL.matchAll(/RAISE EXCEPTION '(curriculum version[^']*)'/g)].map((m) => m[1]);
    expect(msgs.length).toBeGreaterThanOrEqual(5);
    expect(new Set(msgs)).toEqual(new Set(["curriculum version lifecycle violation"]));
  });

  it("blocks deletion of published and archived rows", () => {
    expect(has("IF TG_OP = 'DELETE' THEN\n    IF OLD.status IN ('published','archived') THEN")).toBe(true);
  });

  it("blocks any update to an archived row", () => {
    expect(has("IF OLD.status = 'archived' THEN\n    RAISE EXCEPTION")).toBe(true);
  });

  it("allows only a status-only published -> archived transition and forces is_current false", () => {
    const published = SQL.slice(SQL.indexOf("IF OLD.status = 'published' THEN"));
    expect(published).toContain("IF NEW.status <> 'archived' THEN");
    for (const field of [
      "curriculum_id",
      "organization_id",
      "parent_version_id",
      "label",
      "notes",
      "published_at",
      "created_by",
      "created_at",
    ]) {
      expect(published).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(published).toContain("NEW.is_current := false;");
  });

  it("allows draft/review workflow transitions including direct archival", () => {
    const tail = SQL.slice(SQL.indexOf("-- Draft and review rows follow"));
    expect(tail).toContain("NEW.status NOT IN ('draft','review','published','archived')");
    expect(tail).toContain("IF NEW.status = 'archived' THEN\n    NEW.is_current := false;");
    expect(tail).toContain("IF NEW.is_current AND NEW.status <> 'published' THEN");
  });

  it("attaches a BEFORE UPDATE OR DELETE row trigger and locks the function down", () => {
    expect(
      has(
        "CREATE TRIGGER curriculum_versions_enforce_lifecycle\n  BEFORE UPDATE OR DELETE ON public.curriculum_versions\n  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_version_lifecycle();",
      ),
    ).toBe(true);
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(
        has(`REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM ${role};`),
      ).toBe(true);
    }
  });
});

describe("Stage 1A — scope containment", () => {
  it("inserts no seed data", () => {
    expect(SQL).not.toMatch(/INSERT INTO/i);
  });

  it("does not touch Stage 1B/1C or unrelated tables", () => {
    for (const table of [
      "lessons",
      "curriculum_resources",
      "topics",
      "strands",
      "sub_strands",
      "learning_outcomes",
      "student_curriculum_assignments",
      "competencies",
      "assessments",
    ]) {
      expect(SQL).not.toMatch(new RegExp(`ALTER TABLE public\\.${table}\\b`));
      expect(SQL).not.toMatch(new RegExp(`UPDATE public\\.${table}\\b`));
    }
  });

  it("leaves the SEC-006 stage-two package and security baseline files untouched", () => {
    const stageTwo = readFileSync("docs/sec-006-stage-two-enforcement.sql", "utf8");
    expect(stageTwo).toContain("has_aal2");
    expect(MIGRATIONS.some((n) => n.includes("stage_two"))).toBe(false);
  });
});
