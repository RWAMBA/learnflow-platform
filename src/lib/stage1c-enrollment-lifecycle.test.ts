/**
 * Structural verification of the Phase 10 Stage 1C curriculum enrollment
 * lifecycle. No isolated Postgres is available in this environment, so every
 * runtime-behaviour requirement is asserted structurally against the migration
 * SQL that produces it. The executable allow/deny proof lives in
 * scripts/rls/stage1c-principal-tests.sql and runs only against a disposable
 * database (see .github/workflows/rls-principal-tests.yml).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MFA_ENFORCEMENT_ENABLED } from "@/features/security/mfa";
import { __testing } from "@/features/curriculum/effective-placement";

const STAGE1C_FILE = "20260817113059_d492f8e7-f567-441a-a6ce-4b642a990c02.sql";
const STAGE1B_REPAIR2_FILE = "20260816163607_a7813b14-5998-42b2-bcb1-491e1ffe49e5.sql";

const SQL = readFileSync(`supabase/migrations/${STAGE1C_FILE}`, "utf8");
const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const CODE = stripComments(SQL);

/**
 * The authoritative maximum hierarchy depth is parsed from the EXTERNAL Stage
 * 1B Repair 2 migration, never from the file under test, so the proof cannot
 * become self-referential.
 */
const AUTHORITATIVE_MAX_DEPTH = (() => {
  const source = readFileSync(`supabase/migrations/${STAGE1B_REPAIR2_FILE}`, "utf8");
  const match = source.match(/v_max_depth constant int := (\d+);/);
  if (!match) throw new Error("cannot derive the authoritative depth limit from Stage 1B");
  return Number(match[1]);
})();

describe("Stage 1C — migration artifact and ordering", () => {
  it("is present and ordered after every applied Stage 1A/1B migration", () => {
    const files = readdirSync("supabase/migrations").sort();
    expect(files).toContain(STAGE1C_FILE);
    expect(files).toContain(STAGE1B_REPAIR2_FILE);
    expect(files.indexOf(STAGE1C_FILE)).toBeGreaterThan(files.indexOf(STAGE1B_REPAIR2_FILE));
    expect(files.at(-1)).toBe(STAGE1C_FILE);
  });

  it("is a single explicit transaction", () => {
    expect(CODE.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(CODE.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(CODE.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(CODE.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(CODE).not.toMatch(/\bROLLBACK\b/i);
  });

  it("is forward-only, additive and non-destructive", () => {
    expect(CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+DATABASE\b/i);
    expect(CODE).not.toMatch(/\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i);
  });

  it("performs no DML: no seed, no backfill, no delete", () => {
    expect(CODE).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(CODE).not.toMatch(/\bUPDATE\s+public\./i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("stays out of Auth, MFA and SEC-006 stage two", () => {
    expect(CODE).not.toMatch(/\bauth\.(users|mfa|sessions)\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+ROLE\b/i);
    // has_aal2 appears only in guard assertions that stage two is NOT active.
    expect(CODE).not.toMatch(/CREATE\s+POLICY[\s\S]{0,400}?has_aal2/i);
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
  });
});

describe("Stage 1C — fail-closed gate", () => {
  it("aborts when Stage 1C objects already exist", () => {
    for (const object of [
      "public.academic_periods",
      "public.curriculum_enrollments",
      "app_private.can_administer_academic_period(uuid)",
    ]) {
      expect(CODE).toContain(`'${object}'`);
    }
    expect(CODE).toMatch(/Precondition failed: public\.academic_periods already exists/);
    expect(CODE).toMatch(/Precondition failed: public\.curriculum_enrollments already exists/);
    expect(CODE).toMatch(/Precondition failed: a Stage 1C guard function already exists/);
    expect(CODE).toMatch(/Precondition failed: assignment bridge column already exists/);
  });

  it("verifies required prior structures and authoritative policy baselines", () => {
    expect(CODE).toMatch(/Precondition failed: a required Stage 1A\/1B table is missing/);
    expect(CODE).toMatch(/Precondition failed: a required helper is missing/);
    expect(CODE).toMatch(/student_curriculum_assignments read baseline changed/);
    expect(CODE).toMatch(/students tenant-isolation baseline changed/);
    expect(CODE).toMatch(/Precondition failed: SEC-006 stage two appears applied/);
  });

  it("re-verifies its own outcome before committing", () => {
    for (const assertion of [
      "Postcondition failed: a Stage 1C table is missing",
      "Postcondition failed: RLS not enabled on a Stage 1C table",
      "Postcondition failed: expected 4 academic_periods policies",
      "Postcondition failed: expected 4 curriculum_enrollments policies",
      "Postcondition failed: anon retains Stage 1C table privileges",
      "Postcondition failed: a Stage 1C helper is missing",
      "Postcondition failed: expected 5 Stage 1C triggers",
      "Postcondition failed: one-active-primary index missing",
      "Postcondition failed: assignment bridge was backfilled",
      "Postcondition failed: enrollment rows were seeded",
      "Postcondition failed: academic period rows were seeded",
      "Postcondition failed: a Stage 1A/1B object was lost",
      "Postcondition failed: SEC-006 stage two became applied",
    ]) {
      expect(CODE).toContain(assertion);
    }
  });
});

describe("Stage 1C — academic_periods", () => {
  it("is organization-owned with a restrictive parent reference", () => {
    expect(CODE).toMatch(/CREATE TABLE public\.academic_periods/);
    expect(CODE).toMatch(/organization_id uuid NOT NULL/);
    expect(CODE).toMatch(
      /academic_periods_parent_period_id_fkey[\s\S]*?REFERENCES public\.academic_periods\(id\)\s*\n\s*ON DELETE RESTRICT/,
    );
    expect(CODE).toMatch(/period_type IN \('year','term','semester','quarter'\)/);
    expect(CODE).toMatch(/CHECK \(end_date > start_date\)/);
  });

  it("enforces the authoritative depth limit derived from Stage 1B", () => {
    const declared = [...CODE.matchAll(/v_max_depth constant int := (\d+);/g)].map((m) =>
      Number(m[1]),
    );
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.every((d) => d === AUTHORITATIVE_MAX_DEPTH)).toBe(true);
    expect(CODE).toMatch(/IF v_ancestor_depth > v_max_depth THEN/);
    expect(CODE).toMatch(/coalesce\(v_subtree_depth, 1\) \+ v_ancestor_depth > v_max_depth THEN/);
    expect(CODE).toMatch(/s\.depth < \(v_max_depth \+ 1\)/);
    expect(CODE).not.toMatch(/v_ancestor_depth > \d/);
    expect(CODE).not.toMatch(/s\.depth < \(?\d/);
  });

  it("prevents cycles, cross-organization ancestry and containment breaks", () => {
    expect(CODE).toMatch(/academic period cycle violation/);
    expect(CODE).toMatch(/is_cycle/);
    expect(CODE).toMatch(/academic period parent must belong to the same organization/);
    expect(CODE).toMatch(/academic period ancestry must belong to the same organization/);
    expect(CODE).toMatch(/academic period descendants must belong to the same organization/);
    expect(CODE).toMatch(/academic period must fall inside its parent period/);
    expect(CODE).toMatch(/academic period descendants must fall inside the new date range/);
  });

  it("permits sibling overlap by explicit decision", () => {
    expect(CODE).not.toMatch(/EXCLUDE USING/i);
    expect(CODE).not.toMatch(/daterange/i);
    expect(SQL).toMatch(/Sibling academic periods MAY overlap/);
  });
});

describe("Stage 1C — curriculum_enrollments", () => {
  it("carries the full placement reference set", () => {
    for (const column of [
      "student_id uuid NOT NULL",
      "curriculum_version_id uuid NOT NULL",
      "academic_level_id uuid NOT NULL",
      "track_id uuid NULL",
      "academic_period_id uuid NULL",
      "transferred_from_enrollment_id uuid NULL",
    ]) {
      expect(CODE).toContain(column);
    }
    expect(CODE).toMatch(/enrollment_category IN \('primary','supplementary'\)/);
    expect(CODE).toMatch(
      /status IN \('pending','active','completed','transferred','withdrawn','archived'\)/,
    );
  });

  it("allows at most one active primary enrollment per student", () => {
    expect(CODE).toMatch(
      /CREATE UNIQUE INDEX curriculum_enrollments_one_active_primary\s*\n\s*ON public\.curriculum_enrollments \(student_id\)\s*\n\s*WHERE enrollment_category = 'primary' AND status = 'active';/,
    );
  });

  it("enforces the explicit lifecycle and rejects every other transition", () => {
    expect(CODE).toMatch(
      /IF NEW\.status <> 'pending' THEN\s*\n\s*RAISE EXCEPTION 'curriculum enrollment lifecycle violation'/,
    );
    expect(CODE).toMatch(/IF OLD\.status = 'archived' THEN\s*\n\s*RAISE EXCEPTION/);
    expect(CODE).toMatch(/NEW\.status NOT IN \('completed','transferred','withdrawn'\)/);
    // Deletion is only possible while the enrollment never began.
    expect(CODE).toMatch(/IF TG_OP = 'DELETE' THEN\s*\n\s*IF OLD\.status <> 'pending' THEN/);
  });

  it("makes lifecycle timestamps database-authoritative", () => {
    expect(CODE).toMatch(/NEW\.enrolled_at := now\(\);/);
    expect(CODE).toMatch(/NEW\.ended_at := now\(\);/);
    expect(CODE).toMatch(/NEW\.enrolled_at := OLD\.enrolled_at;/);
    expect(CODE).toMatch(/NEW\.ended_at := OLD\.ended_at;/);
    expect(CODE).not.toMatch(/enrolled_at timestamptz NOT NULL DEFAULT/);
  });

  it("freezes placement fields once the enrollment is activated", () => {
    expect(CODE).toMatch(/curriculum enrollment placement is immutable after activation/);
    expect(CODE).toMatch(/v_placement_changed := \(/);
    for (const field of [
      "NEW.student_id IS DISTINCT FROM OLD.student_id",
      "NEW.curriculum_version_id IS DISTINCT FROM OLD.curriculum_version_id",
      "NEW.academic_level_id IS DISTINCT FROM OLD.academic_level_id",
      "NEW.track_id IS DISTINCT FROM OLD.track_id",
      "NEW.academic_period_id IS DISTINCT FROM OLD.academic_period_id",
      "NEW.enrollment_category IS DISTINCT FROM OLD.enrollment_category",
    ]) {
      expect(CODE).toContain(field);
    }
  });

  it("keeps transfers acyclic and student-consistent", () => {
    expect(CODE).toMatch(/transferred-from enrollment must belong to the same student/);
    expect(CODE).toMatch(/curriculum enrollment transfer cycle violation/);
    expect(CODE).toMatch(/curriculum enrollment transfer chain limit exceeded/);
    expect(CODE).toMatch(/academic period must belong to the student organization/);
  });
});

describe("Stage 1C — authorization", () => {
  it("adds a purpose-specific calendar helper without widening curriculum authoring", () => {
    expect(CODE).toMatch(
      /CREATE FUNCTION app_private\.can_administer_academic_period\(p_org_id uuid\)/,
    );
    expect(CODE).toMatch(/SECURITY DEFINER/);
    expect(CODE).toMatch(/SET search_path = ''/);
    expect(CODE).toMatch(/p_org_id IS NOT NULL/);
    // SEC-005: curriculum-authoring authority is neither reused nor broadened.
    expect(CODE).not.toMatch(/can_author_curriculum/);
  });

  it("keeps guard functions unreachable by anon, PUBLIC and authenticated", () => {
    for (const fn of [
      "app_private.enforce_academic_period_hierarchy()",
      "app_private.enforce_curriculum_enrollment_lifecycle()",
      "app_private.enforce_curriculum_enrollment_consistency()",
      "app_private.enforce_assignment_enrollment_student()",
    ]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon;`);
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM authenticated;`);
    }
    // The RLS helper is the sole exception: policies must execute it.
    expect(CODE).toContain(
      "GRANT EXECUTE ON FUNCTION app_private.can_administer_academic_period(uuid) TO authenticated;",
    );
  });

  it("enables RLS and denies anon at the grant layer", () => {
    for (const table of ["public.academic_periods", "public.curriculum_enrollments"]) {
      expect(CODE).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(CODE).toContain(`REVOKE ALL ON TABLE ${table} FROM PUBLIC;`);
      expect(CODE).toContain(`REVOKE ALL ON TABLE ${table} FROM anon;`);
      expect(CODE).toContain(`GRANT ALL ON ${table} TO service_role;`);
    }
    expect(CODE).not.toMatch(/GRANT[^;]*TO anon/);
  });

  it("scopes reads to the existing authoritative viewer predicate", () => {
    expect(CODE).toMatch(
      /CREATE POLICY curriculum_enrollments_select ON public\.curriculum_enrollments\s*\n\s*FOR SELECT TO authenticated\s*\n\s*USING \(app_private\.can_view_student\(student_id\)\);/,
    );
    expect(CODE).toMatch(/organization_id IN \(SELECT app_private\.auth_organization_ids\(\)\)/);
  });

  it("restricts writes to platform admins and the student's organization admin", () => {
    const writePolicies = [
      "curriculum_enrollments_insert",
      "curriculum_enrollments_update",
      "curriculum_enrollments_delete",
    ];
    for (const policy of writePolicies) {
      expect(CODE).toContain(`CREATE POLICY ${policy} ON public.curriculum_enrollments`);
    }
    expect(
      CODE.match(/app_private\.has_org_role\(s\.organization_id, 'org_admin'\)/g)?.length,
    ).toBe(4);
    for (const policy of [
      "academic_periods_insert",
      "academic_periods_update",
      "academic_periods_delete",
    ]) {
      expect(CODE).toMatch(
        new RegExp(
          `CREATE POLICY ${policy}[\\s\\S]*?can_administer_academic_period\\(organization_id\\)`,
        ),
      );
    }
  });
});

describe("Stage 1C — assignment bridge", () => {
  it("is additive, nullable and deliberately unpopulated", () => {
    expect(CODE).toMatch(
      /ALTER TABLE public\.student_curriculum_assignments\s*\n\s*ADD COLUMN curriculum_enrollment_id uuid NULL;/,
    );
    expect(CODE).toMatch(/ON DELETE SET NULL ON UPDATE RESTRICT/);
    expect(SQL).toMatch(/intentionally NOT backfilled/);
  });

  it("rejects an enrollment belonging to a different student", () => {
    expect(CODE).toMatch(/assignment enrollment must belong to the same student/);
    expect(CODE).toMatch(
      /CREATE TRIGGER student_curriculum_assignments_enforce_enrollment_student\s*\n\s*BEFORE INSERT OR UPDATE ON public\.student_curriculum_assignments/,
    );
  });
});

describe("Stage 1C — live-principal RLS infrastructure", () => {
  const RUNNER = readFileSync("scripts/run-rls-principal-tests.mjs", "utf8");
  const PROOF = readFileSync("scripts/rls/stage1c-principal-tests.sql", "utf8");
  const WORKFLOW = readFileSync(".github/workflows/rls-principal-tests.yml", "utf8");

  it("ships a runner that refuses non-disposable targets", () => {
    expect(existsSync("scripts/rls/stage1c-principal-tests.sql")).toBe(true);
    expect(RUNNER).toMatch(/RLS_DISPOSABLE_DB !== "1"/);
    expect(RUNNER).toMatch(/Refusing to run against a hosted Supabase endpoint/);
    expect(RUNNER).toMatch(/supabase\.co/);
  });

  it("always rolls back and never persists test data", () => {
    expect(PROOF).toMatch(/^BEGIN;$/m);
    expect(PROOF.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(PROOF).not.toMatch(/^COMMIT;$/m);
  });

  it("proves allow and deny under real principals", () => {
    expect(PROOF).toMatch(/SET LOCAL ROLE authenticated/);
    expect(PROOF).toMatch(/request\.jwt\.claims/);
    expect(PROOF).toMatch(/DENY FAILED: cross-tenant admin can read another organization/);
    expect(PROOF).toMatch(/DENY FAILED: unrelated authenticated user can read an enrollment/);
    expect(PROOF).toMatch(/DENY FAILED: view-only guardian activated an enrollment/);
    expect(PROOF).toMatch(/ALLOW FAILED: related guardian cannot read the enrollment/);
    expect(PROOF).toMatch(/ALLOW FAILED: tenant org admin cannot activate the enrollment/);
    expect(PROOF).toMatch(/LIFECYCLE FAILED: enrolled_at was not database-assigned/);
  });

  it("runs only against a disposable local Supabase stack in CI", () => {
    expect(WORKFLOW).toMatch(/supabase\/setup-cli@v1/);
    expect(WORKFLOW).toMatch(/version: \$\{\{ env\.SUPABASE_CLI_VERSION \}\}/);
    expect(WORKFLOW).toMatch(/SUPABASE_CLI_VERSION: \d+\.\d+\.\d+/);
    expect(WORKFLOW).toMatch(/supabase start/);
    expect(WORKFLOW).toMatch(/supabase migration up --db-url/);
    expect(WORKFLOW).toMatch(/scripts\/rls\/ci-prelude\.sql/);
    expect(WORKFLOW).toMatch(/RLS_DISPOSABLE_DB: "1"/);
    expect(WORKFLOW).toMatch(
      /RLS_TEST_DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/,
    );
    expect(WORKFLOW).not.toMatch(/services:\s*\n\s*postgres:/);
    expect(WORKFLOW).not.toMatch(/secrets\./);
    expect(WORKFLOW).not.toMatch(/pull_request_target/);
  });

  it("rejects hosted endpoints and tears the environment down", () => {
    expect(WORKFLOW).toMatch(/Reject any hosted Supabase \/ pooler endpoint/);
    expect(WORKFLOW).toMatch(/\*supabase\.co\*\|\*supabase\.com\*\|\*pooler\.\*/);
    expect(WORKFLOW).toMatch(/supabase stop --no-backup/);
    expect(WORKFLOW).toMatch(/if: always\(\)/);
    expect(WORKFLOW).toMatch(/stage1c-residue-check\.sql/);
  });

  it("proves zero residue after the rolled-back proof", () => {
    const residue = readFileSync(
      join(process.cwd(), "scripts", "rls", "stage1c-residue-check.sql"),
      "utf8",
    );
    expect(residue).toMatch(/RESIDUE: % curriculum_enrollments rows persisted/);
    expect(residue).toMatch(/RESIDUE: % academic_periods rows persisted/);
    expect(residue).toMatch(/auth\.users WHERE email LIKE '%@example\.test'/);
  });
});

describe("Stage 1C — compatibility read path", () => {
  it("prefers the Stage 1C enrollment when one exists", () => {
    const placement = __testing.fromEnrollment({
      id: "e1",
      curriculum_version_id: "v1",
      academic_level_id: "g1",
      academic_period_id: "p1",
      track_id: null,
      academic_level: { id: "g1", name: "Grade 7" },
      track: null,
    });
    expect(placement).toEqual({
      source: "enrollment",
      enrollmentId: "e1",
      academicLevelId: "g1",
      academicLevelName: "Grade 7",
      trackId: null,
      trackName: null,
      curriculumVersionId: "v1",
      academicPeriodId: "p1",
    });
  });

  it("falls back to the legacy student columns without changing them", () => {
    const placement = __testing.fromLegacy({
      grade_id: "g2",
      pathway_id: "t2",
      grade: { id: "g2", name: "Grade 8" },
      pathway: { id: "t2", name: "STEM" },
    });
    expect(placement.source).toBe("legacy");
    expect(placement.academicLevelId).toBe("g2");
    expect(placement.trackId).toBe("t2");
    expect(placement.enrollmentId).toBeNull();
    expect(placement.curriculumVersionId).toBeNull();
  });

  it("reports no placement when neither source has one", () => {
    expect(
      __testing.fromLegacy({ grade_id: null, pathway_id: null, grade: null, pathway: null }),
    ).toEqual(__testing.EMPTY);
    expect(__testing.EMPTY.source).toBe("none");
  });
});

describe("Stage 1C — disposable live-principal fixture integrity", () => {
  const FIXTURE = readFileSync("scripts/rls/stage1c-principal-tests.sql", "utf8");
  const FIXTURE_CODE = stripComments(FIXTURE);

  const insertColumns = (table: string) => {
    const match = FIXTURE_CODE.match(
      new RegExp(`INSERT INTO public\\.${table}\\s*\\(([^)]*)\\)`, "i"),
    );
    if (!match) throw new Error(`no fixture INSERT found for public.${table}`);
    return match[1].split(",").map((c) => c.trim());
  };

  it("always rolls the fixture transaction back", () => {
    expect(FIXTURE_CODE).toMatch(/^BEGIN;$/m);
    expect(FIXTURE_CODE.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(FIXTURE_CODE).not.toMatch(/^COMMIT;$/m);
  });

  it("supplies parent_student_relationships.created_by explicitly", () => {
    const columns = insertColumns("parent_student_relationships");
    for (const required of [
      "organization_id",
      "parent_id",
      "student_id",
      "role_subtype",
      "permission_level",
      "created_by",
    ]) {
      expect(columns).toContain(required);
    }
  });

  it("supplies created_by on every relationship-bearing fixture insert", () => {
    for (const table of ["students", "organization_memberships", "user_roles"]) {
      expect(insertColumns(table)).toContain("created_by");
    }
  });

  it("references only synthetic principals declared inside the transaction", () => {
    const declared = [...FIXTURE_CODE.matchAll(/(v_\w+)\s+uuid\s*:=\s*gen_random_uuid\(\)/g)].map(
      (m) => m[1],
    );
    expect(declared).toEqual(
      expect.arrayContaining(["v_admin_a", "v_admin_b", "v_parent_a", "v_outsider"]),
    );
    // created_by values are always variables, never literal UUIDs.
    const createdByValues = [...FIXTURE_CODE.matchAll(/created_by[^;]*?VALUES([\s\S]*?);/gi)]
      .map((m) => m[1])
      .join("\n");
    expect(createdByValues).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const principal of ["v_admin_a", "v_admin_b"]) {
      expect(FIXTURE_CODE).toContain(principal);
    }
    // Every principal is inserted into auth.users inside the rolled-back txn.
    expect(FIXTURE_CODE).toMatch(/INSERT INTO auth\.users/);
  });

  it("keeps real role impersonation and cross-tenant allow/deny assertions", () => {
    expect(FIXTURE_CODE).toMatch(/SET LOCAL ROLE authenticated/);
    expect(FIXTURE_CODE).toMatch(/request\.jwt\.claims/);
    expect(FIXTURE_CODE).toMatch(/DENY FAILED/);
    expect(FIXTURE_CODE).toMatch(/ALLOW FAILED/);
  });
});
