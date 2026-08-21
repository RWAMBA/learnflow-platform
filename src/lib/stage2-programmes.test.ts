/**
 * Stage 2 — Programmes: structural and behavioural verification.
 *
 * No isolated Postgres is available in this environment, so every database
 * guarantee is asserted structurally against the migration SQL that produces
 * it. The executable allow/deny proof under real authenticated principals
 * lives in scripts/rls/stage2-principal-tests.sql and runs only against a
 * disposable database (see .github/workflows/rls-principal-tests.yml).
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_PROGRAMME_ENROLLMENT_TRANSITIONS,
  OCCUPYING_ENROLLMENT_STATUSES,
  PROGRAMME_CATEGORIES,
  PROGRAMME_ENROLLMENT_STATUSES,
  programmeIsFull,
  programmePlacesRemaining,
} from "@/features/programmes/constants";
import {
  canEnrollInProgrammes,
  canManageProgrammeEnrollments,
  canManageProgrammes,
} from "@/features/roles/permissions";
import {
  enrollLearnerSchema,
  programmeEnrollmentStatusSchema,
  programmeSchema,
} from "@/lib/programmes.schemas";

const MIGRATIONS = readdirSync("supabase/migrations").sort();
const STAGE2_FILE = MIGRATIONS.find((file) =>
  readFileSync(`supabase/migrations/${file}`, "utf8").includes("CREATE TABLE public.programmes"),
);

if (!STAGE2_FILE) throw new Error("the Stage 2 programmes migration is missing");

const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const CODE = stripComments(readFileSync(`supabase/migrations/${STAGE2_FILE}`, "utf8"));

describe("Stage 2 — migration artifact", () => {
  it("is ordered after every Stage 1 migration", () => {
    const index = MIGRATIONS.indexOf(STAGE2_FILE);
    expect(index).toBe(MIGRATIONS.length - 1);
  });

  it("is forward-only, additive and non-destructive", () => {
    expect(CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+DATABASE\b/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("never touches Supabase-reserved schemas", () => {
    for (const schema of ["auth.", "storage.", "realtime.", "vault.", "supabase_functions."]) {
      expect(CODE.includes(`CREATE TABLE ${schema}`)).toBe(false);
      expect(CODE.includes(`ALTER TABLE ${schema}`)).toBe(false);
    }
  });
});

describe("Stage 2 — schema and tenancy", () => {
  const tables = ["programmes", "programme_instructors", "programme_enrollments"];

  it.each(tables)("creates public.%s with RLS enabled", (table) => {
    expect(CODE).toContain(`CREATE TABLE public.${table} (`);
    expect(CODE).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  });

  it.each(tables)("grants Data API access to %s without widening anon", (table) => {
    expect(CODE).toContain(`GRANT SELECT, INSERT, UPDATE ON public.${table} TO authenticated`);
    expect(CODE).toContain(`GRANT ALL ON public.${table} TO service_role`);
    expect(CODE).not.toContain(`ON public.${table} TO anon`);
  });

  it.each(tables)("never grants DELETE on %s, so history cannot be erased", (table) => {
    expect(CODE).not.toMatch(new RegExp(`GRANT[^;]*DELETE[^;]*public\\.${table} TO authenticated`));
  });

  it("scopes every table to an organization", () => {
    for (const table of tables) {
      const block = CODE.slice(CODE.indexOf(`CREATE TABLE public.${table} (`));
      expect(block.slice(0, block.indexOf(");"))).toContain(
        "organization_id uuid NOT NULL REFERENCES public.organizations(id)",
      );
    }
  });

  it("carries the approved nine-value category vocabulary and nothing else", () => {
    const match = CODE.match(/category text NOT NULL CHECK \(category IN \(([\s\S]*?)\)\)/);
    expect(match).not.toBeNull();
    const values = [...(match?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1]);
    expect(values.sort()).toEqual([...PROGRAMME_CATEGORIES].sort());
  });

  it("models capacity as nullable, meaning unlimited", () => {
    expect(CODE).toContain("capacity integer CHECK (capacity IS NULL OR capacity > 0)");
  });

  it("keeps ownership immutable", () => {
    expect(CODE).toContain("Programme ownership is immutable");
  });
});

describe("Stage 2 — removed scope stays removed", () => {
  const forbidden = [
    "certificate",
    "credential",
    "diploma",
    "degree",
    "tvet",
    "university",
    "admission",
    "career_pathway",
    "career pathway",
    "badge",
    "issues_certificate",
  ];

  it.each(forbidden)("does not reintroduce %s anywhere in the migration", (term) => {
    expect(CODE.toLowerCase()).not.toContain(term);
  });

  it("treats completion purely as an enrollment status", () => {
    expect(PROGRAMME_ENROLLMENT_STATUSES).toContain("completed");
    expect(CODE).toContain(
      "CHECK (status IN ('enrolled','active','completed','withdrawn','archived'))",
    );
  });
});

describe("Stage 2 — enrollment lifecycle", () => {
  it("only allows the approved transitions in the database trigger", () => {
    expect(CODE).toContain("(OLD.status = 'enrolled'  AND NEW.status IN ('active','withdrawn'))");
    expect(CODE).toContain("(OLD.status = 'active'    AND NEW.status IN ('completed','withdrawn'))");
    expect(CODE).toContain("(OLD.status = 'completed' AND NEW.status = 'archived')");
    expect(CODE).toContain("(OLD.status = 'withdrawn' AND NEW.status = 'archived')");
    expect(CODE).toContain("Invalid programme enrollment transition");
  });

  it("mirrors those transitions in the UI capability map", () => {
    expect(ALLOWED_PROGRAMME_ENROLLMENT_TRANSITIONS).toEqual({
      enrolled: ["active", "withdrawn"],
      active: ["completed", "withdrawn"],
      completed: ["archived"],
      withdrawn: ["archived"],
      archived: [],
    });
  });

  it("forces every new enrollment to start as enrolled", () => {
    expect(CODE).toContain("A new programme enrollment must start as enrolled");
  });

  it("refuses enrollment into a programme that is not published", () => {
    expect(CODE).toContain("Only a published programme can accept enrollments");
  });

  it("refuses a second current enrollment for the same learner", () => {
    expect(CODE).toContain("CREATE UNIQUE INDEX programme_enrollments_one_current_idx");
    expect(CODE).toContain("WHERE status IN ('enrolled','active')");
  });

  it("blocks deletion of instructor and enrollment history", () => {
    expect(CODE).toContain("Programme history cannot be deleted; archive it instead");
    expect(CODE).toContain("CREATE TRIGGER programme_instructors_no_delete BEFORE DELETE");
    expect(CODE).toContain("CREATE TRIGGER programme_enrollments_no_delete BEFORE DELETE");
  });
});

describe("Stage 2 — capacity is enforced atomically", () => {
  it("locks the programme row before counting places", () => {
    const rpc = CODE.slice(CODE.indexOf("FUNCTION public.enroll_student_in_programme"));
    expect(rpc.indexOf("FOR UPDATE")).toBeGreaterThan(-1);
    expect(rpc.indexOf("FOR UPDATE")).toBeLessThan(rpc.indexOf("This programme is full"));
    expect(rpc.indexOf("This programme is full")).toBeLessThan(
      rpc.indexOf("INSERT INTO public.programme_enrollments"),
    );
  });

  it("counts only occupying statuses against capacity", () => {
    expect(OCCUPYING_ENROLLMENT_STATUSES).toEqual(["enrolled", "active"]);
    expect(CODE).toContain(
      "WHERE e.programme_id = p_programme_id AND e.status IN ('enrolled','active')",
    );
  });

  it("refuses to shrink capacity below the learners already enrolled", () => {
    expect(CODE).toContain("Capacity cannot be reduced below the % learner(s) already enrolled");
  });

  it("computes remaining places consistently in the UI helper", () => {
    expect(programmePlacesRemaining(null, 12)).toBeNull();
    expect(programmePlacesRemaining(10, 4)).toBe(6);
    expect(programmePlacesRemaining(10, 12)).toBe(0);
    expect(programmeIsFull(null, 9999)).toBe(false);
    expect(programmeIsFull(10, 9)).toBe(false);
    expect(programmeIsFull(10, 10)).toBe(true);
  });
});

describe("Stage 2 — authorization", () => {
  it("requires an authenticated caller in both privileged RPCs", () => {
    expect(CODE.match(/IF auth\.uid\(\) IS NULL THEN RAISE EXCEPTION 'Authentication required'/g))
      .toHaveLength(2);
  });

  it("re-runs the RLS authorization test inside the privileged enrollment RPC", () => {
    expect(CODE).toContain(
      "IF NOT app_private.can_enroll_in_programme(p_programme_id, p_student_id) THEN",
    );
    expect(CODE).toContain("Not authorized to enroll this learner in this programme");
  });

  it("pins search_path on every function it defines", () => {
    const definitions = CODE.match(/CREATE OR REPLACE FUNCTION [\s\S]*?AS \$\$/g) ?? [];
    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      expect(definition).toMatch(/SET search_path = ''/);
    }
  });

  it("revokes every private helper from PUBLIC, anon and authenticated", () => {
    const helpers = [
      "app_private.programme_organization(uuid)",
      "app_private.can_manage_programmes(uuid)",
      "app_private.programme_occupied_count(uuid)",
      "app_private.is_programme_instructor(uuid)",
      "app_private.can_enroll_in_programme(uuid, uuid)",
      "app_private.validate_programme()",
      "app_private.validate_programme_instructor()",
      "app_private.enforce_programme_enrollment_lifecycle()",
      "app_private.reject_programme_history_delete()",
      "app_private.log_programme_change()",
    ];
    for (const helper of helpers) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${helper} FROM PUBLIC, anon, authenticated`);
    }
  });

  it("exposes the two public RPCs to authenticated only, never anon", () => {
    for (const signature of [
      "public.enroll_student_in_programme(uuid, uuid)",
      "public.set_programme_enrollment_status(uuid, text)",
    ]) {
      expect(CODE).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon`);
      expect(CODE).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
    }
  });

  it("restricts every policy to the authenticated role", () => {
    const policies = CODE.match(/CREATE POLICY [\s\S]*?;\n/g) ?? [];
    expect(policies.length).toBe(8);
    for (const policy of policies) {
      expect(policy).toContain("TO authenticated");
    }
  });

  it("limits programme authoring and instructor assignment to organization administrators", () => {
    expect(CODE).toContain(
      "CREATE POLICY programmes_insert ON public.programmes\n  FOR INSERT TO authenticated\n  WITH CHECK (app_private.can_manage_programmes(organization_id))",
    );
    expect(CODE).toContain(
      "CREATE POLICY programme_instructors_insert ON public.programme_instructors\n  FOR INSERT TO authenticated\n  WITH CHECK (app_private.can_manage_programmes(organization_id))",
    );
    expect(CODE).toContain("Instructors cannot assign themselves to a programme");
  });

  it("hides draft and archived programmes from ordinary organization members", () => {
    expect(CODE).toContain(
      "AND (status = 'published' OR app_private.has_org_role(organization_id, 'org_admin'))",
    );
  });

  it("requires an assigned instructor to also hold an existing learner relationship", () => {
    const helper = CODE.slice(
      CODE.indexOf("FUNCTION app_private.can_enroll_in_programme"),
      CODE.indexOf("REVOKE ALL ON FUNCTION app_private.programme_organization"),
    );
    expect(helper).toContain("app_private.is_programme_instructor(p_programme_id) AND EXISTS (");
    expect(helper).toContain("public.teacher_student_relationships");
    expect(helper).toContain("public.tutor_student_relationships");
    expect(helper).toContain("r.permission_level = 'full_management'");
  });

  it("refuses cross-tenant programmes, instructors and learners", () => {
    expect(CODE).toContain("Cross-tenant instructor assignment is not allowed");
    expect(CODE).toContain("Learner and programme must belong to the same organization");
    expect(CODE).toContain("Instructor assignment must belong to the programme organization");
  });

  it("only accepts an active Teacher or Tutor role as an instructor", () => {
    expect(CODE).toContain("Only a Teacher or Tutor may instruct a programme");
    expect(CODE).toContain("That Teacher or Tutor role is not active");
    expect(CODE).toContain("AND r.code IN ('teacher','tutor')");
  });

  it("mirrors the database rules in the UI capability map", () => {
    expect(canManageProgrammes("org_admin")).toBe(true);
    for (const role of ["parent_guardian", "teacher", "tutor", "student"] as const) {
      expect(canManageProgrammes(role)).toBe(false);
      expect(canManageProgrammeEnrollments(role)).toBe(false);
    }
    expect(canEnrollInProgrammes("student")).toBe(false);
    for (const role of ["org_admin", "parent_guardian", "teacher", "tutor"] as const) {
      expect(canEnrollInProgrammes(role)).toBe(true);
    }
  });
});

describe("Stage 2 — audit trail", () => {
  it("logs every programme, instructor and enrollment change with the acting user", () => {
    expect(CODE).toContain("INSERT INTO public.audit_logs (actor_user_id, organization_id, action");
    for (const trigger of [
      "programmes_audit",
      "programme_instructors_audit",
      "programme_enrollments_audit",
    ]) {
      expect(CODE).toContain(`CREATE TRIGGER ${trigger} AFTER INSERT OR UPDATE`);
    }
  });
});

describe("Stage 2 — input validation", () => {
  it("rejects an empty or oversized programme name", () => {
    const base = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      category: "sport" as const,
      status: "draft" as const,
    };
    expect(programmeSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(programmeSchema.safeParse({ ...base, name: "a".repeat(161) }).success).toBe(false);
    expect(programmeSchema.safeParse({ ...base, name: "Chess Club" }).success).toBe(true);
  });

  it("rejects a non-positive or fractional capacity", () => {
    const base = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      name: "Choir",
      category: "music" as const,
      status: "published" as const,
    };
    expect(programmeSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(programmeSchema.safeParse({ ...base, capacity: -3 }).success).toBe(false);
    expect(programmeSchema.safeParse({ ...base, capacity: 2.5 }).success).toBe(false);
    expect(programmeSchema.safeParse({ ...base, capacity: null }).success).toBe(true);
    expect(programmeSchema.safeParse({ ...base, capacity: 20 }).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(
      programmeSchema.safeParse({
        organizationId: "11111111-1111-4111-8111-111111111111",
        name: "Robotics",
        category: "career_pathway",
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("never accepts 'enrolled' as a transition target", () => {
    const enrollmentId = "22222222-2222-4222-8222-222222222222";
    expect(programmeEnrollmentStatusSchema.safeParse({ enrollmentId, status: "enrolled" }).success)
      .toBe(false);
    expect(programmeEnrollmentStatusSchema.safeParse({ enrollmentId, status: "completed" }).success)
      .toBe(true);
  });

  it("requires real identifiers on an enrollment request", () => {
    expect(enrollLearnerSchema.safeParse({ programmeId: "nope", studentId: "nope" }).success).toBe(
      false,
    );
  });
});
