/**
 * Stage 2 continuation — atomic transfer repair and forward-only recovery.
 *
 * The executable proof under real authenticated principals lives in
 * scripts/rls/stage1c-principal-tests.sql and runs only against a disposable
 * database. These tests assert the structural guarantees of the migration that
 * produces the behaviour, plus the application cutover to the single RPC.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = readdirSync("supabase/migrations").sort();
const FILE = MIGRATIONS.find((name) =>
  readFileSync(`supabase/migrations/${name}`, "utf8").includes(
    "FUNCTION public.transfer_curriculum_enrollment",
  ),
);
if (!FILE) throw new Error("the atomic transfer migration is missing");

const CODE = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/^\s*--.*$/gm, "");
const SERVER = readFileSync("src/lib/enrollment.server.ts", "utf8");
const RPC = CODE.slice(
  CODE.indexOf("FUNCTION public.transfer_curriculum_enrollment"),
  CODE.indexOf("REVOKE ALL ON FUNCTION public.transfer_curriculum_enrollment"),
);
const RECOVERY = CODE.slice(CODE.indexOf("  v_unplaced   integer;"));

describe("atomic transfer — migration artifact", () => {
  it("is additive, forward-only and non-destructive", () => {
    expect(CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(CODE).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(CODE).not.toMatch(/\bALTER\s+DATABASE\b/i);
  });

  it("is ordered after every earlier migration", () => {
    expect(MIGRATIONS.indexOf(FILE)).toBe(MIGRATIONS.length - 1);
  });

  it("never touches Supabase-reserved schemas", () => {
    for (const schema of ["auth.", "storage.", "realtime.", "vault.", "supabase_functions."]) {
      expect(CODE.includes(`ALTER TABLE ${schema}`)).toBe(false);
      expect(CODE.includes(`CREATE TABLE ${schema}`)).toBe(false);
    }
  });
});

describe("atomic transfer — RPC guarantees", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(RPC).toContain("SECURITY DEFINER");
    expect(RPC).toContain("SET search_path = ''");
  });

  it("requires an authenticated caller", () => {
    expect(RPC).toContain("IF v_actor IS NULL THEN");
    expect(RPC).toContain("Authentication required");
  });

  it("derives learner and tenant server-side instead of trusting the caller", () => {
    expect(RPC).not.toMatch(/p_student_id|p_organization_id/);
    expect(RPC).toContain("SELECT s.organization_id INTO v_org");
  });

  it("re-checks authorization inside the database using the same predicate as RLS", () => {
    expect(RPC).toContain("IF NOT app_private.can_transfer_enrollment(v_student) THEN");
    expect(RPC).toContain("Not authorized to transfer this enrollment");
    const helper = CODE.slice(
      CODE.indexOf("FUNCTION app_private.can_transfer_enrollment"),
      CODE.indexOf("REVOKE ALL ON FUNCTION app_private.can_transfer_enrollment"),
    );
    expect(helper).toContain("app_private.is_platform_admin()");
    expect(helper).toContain("app_private.has_org_role(s.organization_id, 'org_admin')");
  });

  it("locks the learner's placements before mutating them", () => {
    expect(RPC.indexOf("FOR UPDATE")).toBeGreaterThan(-1);
    expect(RPC.indexOf("FOR UPDATE")).toBeLessThan(RPC.indexOf("UPDATE public.curriculum_enrollments\n     SET status = 'transferred'"));
  });

  it("closes the source and creates the replacement in one transaction", () => {
    const close = RPC.indexOf("SET status = 'transferred'");
    const insert = RPC.indexOf("INSERT INTO public.curriculum_enrollments");
    const activate = RPC.indexOf("SET status = 'active' WHERE id = v_new");
    expect(close).toBeLessThan(insert);
    expect(insert).toBeLessThan(activate);
    expect(RPC).not.toMatch(/\bCOMMIT\b|\bBEGIN;|\bSAVEPOINT\b/);
  });

  it("respects the lifecycle guard by creating the placement pending, then activating", () => {
    expect(RPC).toContain("'primary', 'pending', p_enrollment_id");
    expect(RPC).toContain("UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_new;");
  });

  it("only transfers an active primary placement", () => {
    expect(RPC).toContain("Only an active enrollment can be transferred");
    expect(RPC).toContain("Only a primary placement can be transferred");
  });

  it("validates the destination and refuses cross-tenant periods", () => {
    expect(RPC).toContain("That curriculum version does not belong to the selected grade");
    expect(RPC).toContain("That pathway does not belong to the selected grade");
    expect(RPC).toContain("That grade requires a pathway");
    expect(RPC).toContain("That academic period belongs to a different organization");
  });

  it("applies the Stage 1 availability gate to every ordinary transfer", () => {
    expect(RPC).toContain("IF NOT public.curriculum_version_is_available(p_curriculum_version_id)");
    expect(RPC).toContain("That curriculum version is not available for enrollment");
  });

  it("keeps placement history by pointing the replacement at its source", () => {
    expect(RPC).toContain("transferred_from_enrollment_id");
    expect(RPC).toContain("'source_enrollment_id', p_enrollment_id");
  });

  it("writes an audit row naming the acting user", () => {
    expect(RPC).toContain("INSERT INTO public.audit_logs");
    expect(RPC).toContain("'curriculum_enrollment.transferred'");
    expect(RPC).toContain("v_actor");
  });

  it("verifies exactly one active primary placement before returning", () => {
    expect(RPC).toContain("Postcondition failed: expected exactly one active primary placement");
  });

  it("is executable by authenticated only, never anon", () => {
    expect(CODE).toContain(
      "REVOKE ALL ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon",
    );
    expect(CODE).toContain(
      "GRANT EXECUTE ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) TO authenticated",
    );
    expect(CODE).toContain(
      "REVOKE ALL ON FUNCTION app_private.can_transfer_enrollment(uuid) FROM PUBLIC, anon, authenticated",
    );
  });
});

describe("forward-only learner recovery", () => {
  it("is idempotent: it does nothing when no learner is unplaced", () => {
    expect(RECOVERY).toContain("IF v_unplaced = 0 THEN");
    expect(RECOVERY).toContain("nothing to do (idempotent)");
  });

  it("fails closed on every precondition rather than guessing", () => {
    for (const guard of [
      "expected exactly 1 affected learner",
      "expected exactly 1 transferred primary row",
      "the previous placement is incomplete",
      "previous grade and curriculum version do not agree",
      "previous pathway does not belong to the previous grade",
      "learner already holds a current primary placement",
    ]) {
      expect(RECOVERY).toContain(guard);
    }
  });

  it("restores the last proven placement instead of inventing a destination", () => {
    expect(RECOVERY).toContain("v_source.curriculum_version_id");
    expect(RECOVERY).toContain("v_source.academic_level_id");
    expect(RECOVERY).toContain("'restored', 'last proven valid placement'");
  });

  it("records the recovery in the immutable audit trail", () => {
    expect(RECOVERY).toContain("'curriculum_enrollment.transfer_incident_recovered'");
    expect(RECOVERY).toContain("non-atomic transfer left learner unplaced");
  });

  it("edits or deletes no history", () => {
    expect(RECOVERY).not.toMatch(/DELETE FROM public\.curriculum_enrollments/);
    expect(RECOVERY).not.toMatch(/UPDATE public\.curriculum_enrollments\s+SET status = 'active'\s+WHERE id = v_source/);
  });

  it("verifies the whole census before committing", () => {
    for (const check of [
      "Postcondition failed: students = %, expected 3",
      "Postcondition failed: active primary enrollments = %, expected 3",
      "learner(s) unplaced",
      "duplicate active primary placements",
      "unreconciled legacy placements",
      "curriculum version(s) now pass the availability gate",
      "CBC grade count = %, expected 12",
      "pre-primary level(s) present",
    ]) {
      expect(CODE).toContain(check);
    }
  });
});

describe("application cutover", () => {
  it("calls the single atomic RPC", () => {
    expect(SERVER).toContain('rpc("transfer_curriculum_enrollment"');
  });

  it("no longer closes and re-creates the placement in two calls", () => {
    const fn = SERVER.slice(SERVER.indexOf("export async function transferEnrollment"));
    expect(fn).not.toContain('status: "transferred"');
    expect(fn).not.toContain(".insert(");
    expect(fn).not.toContain("transferred_from_enrollment_id");
  });

  it("never sends learner identity the database can derive itself", () => {
    const fn = SERVER.slice(SERVER.indexOf("export async function transferEnrollment"));
    expect(fn).not.toContain("student_id");
  });
});
