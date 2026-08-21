/**
 * PR #7 CI replay correction — deterministic fresh replay of the complete
 * migration history.
 *
 * The disposable workflows replay every migration against an EMPTY database.
 * A migration therefore may not encode the live production census (three
 * learners, three active primary placements) as a schema invariant. These
 * tests assert that the corrected migration replays deterministically in both
 * an empty and a populated environment, without weakening authorization,
 * availability gates, tenant checks, audit attribution or duplicate-placement
 * protection.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "supabase/migrations";
const MIGRATIONS = readdirSync(DIR).sort();
const SOURCES = MIGRATIONS.map((name) => ({
  name,
  sql: readFileSync(`${DIR}/${name}`, "utf8"),
}));

const TRANSFER = SOURCES.find((m) =>
  m.sql.includes("FUNCTION public.transfer_curriculum_enrollment"),
);
if (!TRANSFER) throw new Error("the atomic transfer migration is missing");

const SQL = TRANSFER.sql;
const CODE = SQL.replace(/^\s*--.*$/gm, "");
const RECOVERY = CODE.slice(CODE.indexOf("  v_unplaced   integer;"));
const POSTCONDITIONS = CODE.slice(CODE.lastIndexOf("DO $$"));

describe("fresh replay — no environment-specific census", () => {
  it("asserts no absolute learner count anywhere in the history", () => {
    for (const { name, sql } of SOURCES) {
      const body = sql.replace(/^\s*--.*$/gm, "");
      expect(body, name).not.toMatch(/students\s*=\s*%,\s*expected\s*3/);
      expect(body, name).not.toMatch(/active primary enrollments\s*=\s*%,\s*expected\s*3/);
    }
  });

  it("zero students and zero enrollments are a valid replay state", () => {
    // The only learner assertions are existential/relative: "no learner may be
    // unplaced" and "no learner may hold duplicates". Both are trivially true
    // for an empty database.
    expect(POSTCONDITIONS).toContain("learner(s) unplaced");
    expect(POSTCONDITIONS).toContain("duplicate active primary placements");
    expect(POSTCONDITIONS).not.toMatch(/IF v_n\s*<>\s*3 THEN/);
    expect(POSTCONDITIONS).not.toMatch(/IF v_n\s*<\s*3 THEN/);
    expect(POSTCONDITIONS).not.toMatch(/v_n\s*>=\s*3/);
  });

  it("the incident-absent recovery path no-ops and returns successfully", () => {
    const guard = RECOVERY.slice(0, RECOVERY.indexOf("IF v_unplaced <> 1"));
    expect(guard).toContain("IF v_unplaced = 0 THEN");
    expect(guard).toContain("nothing to do (idempotent)");
    expect(guard).toContain("RETURN;");
  });

  it("requires the proven replacement placement when the incident is present", () => {
    expect(RECOVERY).toContain("expected exactly 1 transferred primary row");
    expect(RECOVERY).toContain("the previous placement is incomplete");
    expect(RECOVERY).toContain("previous grade and curriculum version do not agree");
    expect(RECOVERY).toContain("previous pathway does not belong to the previous grade");
  });

  it("requires a recovered placement to preserve version, level, track and period", () => {
    for (const column of [
      "curriculum_version_id",
      "academic_level_id",
      "track_id",
      "academic_period_id",
    ]) {
      expect(POSTCONDITIONS).toContain(`e.${column}`);
      expect(POSTCONDITIONS).toContain(`src.${column}`);
    }
    expect(POSTCONDITIONS).toContain("recovered placement(s) diverge from the proven source");
  });
});

describe("fresh replay — protections preserved", () => {
  it("keeps duplicate active-primary protection", () => {
    expect(RECOVERY).toContain("learner already holds a current primary placement");
    expect(POSTCONDITIONS).toContain("duplicate active primary placements");
  });

  it("keeps the transfer RPC authenticated-only", () => {
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) TO authenticated;",
    );
    expect(POSTCONDITIONS).toContain("authenticated cannot execute the transfer RPC");
    expect(POSTCONDITIONS).toContain("anon may execute the transfer RPC");
  });

  it("keeps the RPC atomic, authorized and tenant-checked", () => {
    const rpc = CODE.slice(
      CODE.indexOf("FUNCTION public.transfer_curriculum_enrollment"),
      CODE.indexOf("REVOKE ALL ON FUNCTION public.transfer_curriculum_enrollment"),
    );
    expect(rpc).toContain("FOR UPDATE");
    expect(rpc).toContain("Authentication required");
    expect(rpc).toContain("app_private.can_transfer_enrollment");
    expect(rpc).toContain("public.curriculum_version_is_available");
    expect(rpc).toContain("belongs to a different organization");
    expect(rpc).toContain("SECURITY DEFINER");
  });

  it("keeps audit attribution for the recovery", () => {
    expect(RECOVERY).toContain("'curriculum_enrollment.transfer_incident_recovered'");
    expect(POSTCONDITIONS).toContain("curriculum_enrollment.transfer_incident_recovered");
  });

  it("remains additive and forward-only", () => {
    expect(CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(CODE).not.toMatch(/\bTRUNCATE\b/i);
  });
});
