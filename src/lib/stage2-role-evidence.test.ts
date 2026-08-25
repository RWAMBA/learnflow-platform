/**
 * Stage 2 — role-evidence closure.
 *
 * Two behavioral gaps were closed with real-principal SQL proofs in
 * `scripts/rls/stage2-principal-tests.sql`:
 *
 *   1. an independently-logged-in Learner reading only their own records;
 *   2. archived-programme exclusion, proven distinctly from draft exclusion.
 *
 * The assertions below are deliberately narrow. They protect the wiring and
 * the source structure so the SQL proofs cannot be silently deleted, weakened
 * into "exception expected" logic, or collapsed so one lifecycle status stands
 * in for the other. They do NOT replace the SQL proofs, which are executed
 * against real principals by both disposable GitHub workflows.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const SQL = read("scripts/rls/stage2-principal-tests.sql");
const API = read("src/features/programmes/api.ts");
const INDEX = read("src/routes/_authenticated/programmes.index.tsx");
const PR_GATES = read(".github/workflows/pr-quality-gates.yml");
const RLS_WORKFLOW = read(".github/workflows/rls-principal-tests.yml");

/** The learner proof runs between its banner and the archived-programme banner. */
const LEARNER_BLOCK = SQL.slice(
  SQL.indexOf("learner self-view"),
  SQL.indexOf("archived programme behaviour"),
);

/** The archived proof runs from its banner to the end of the suite. */
const ARCHIVED_BLOCK = SQL.slice(SQL.indexOf("archived programme behaviour"));

describe("Stage 2 — learner self-view principal proof", () => {
  it("isolates a substantive learner proof block", () => {
    expect(LEARNER_BLOCK.length).toBeGreaterThan(1000);
  });

  it("runs under a real authenticated learner principal, not a superuser", () => {
    expect(LEARNER_BLOCK).toContain("v_learner");
    expect(LEARNER_BLOCK).toContain("request.jwt.claims");
    expect(SQL).toContain("SET LOCAL ROLE authenticated");
  });

  it("proves the learner reads their own academic and extracurricular records", () => {
    expect(LEARNER_BLOCK).toContain(
      "ALLOW FAILED: a learner cannot read their own academic enrollment",
    );
    expect(LEARNER_BLOCK).toContain("public.curriculum_enrollments");
    expect(LEARNER_BLOCK).toContain("public.programme_enrollments");
  });

  it("proves another learner's records and cross-tenant records stay invisible", () => {
    expect(LEARNER_BLOCK).toContain(
      "DENY FAILED: a learner read another learner's academic enrollment",
    );
    expect(LEARNER_BLOCK).toContain("v_student_other");
  });

  it("proves the learner holds no programme-management authority", () => {
    for (const denial of [
      "DENY FAILED: a learner created a programme",
      "DENY FAILED: a learner archived a programme",
    ]) {
      expect(LEARNER_BLOCK).toContain(denial);
    }
  });

  it("asserts outcomes rather than inferring behaviour from source text", () => {
    expect(LEARNER_BLOCK).toMatch(/ALLOW FAILED/);
    expect(LEARNER_BLOCK).toMatch(/DENY FAILED/);
  });
});

describe("Stage 2 — archived-programme behavioural proof", () => {
  it("isolates a substantive archived proof block", () => {
    expect(ARCHIVED_BLOCK.length).toBeGreaterThan(1000);
  });

  it("reaches archived through the authorized publish-then-archive lifecycle", () => {
    expect(ARCHIVED_BLOCK).toContain("v_prog_archived");
    expect(ARCHIVED_BLOCK).toContain("LIFECYCLE FAILED: the programme did not reach archived");
  });

  it("keeps the archived programme reachable through the management view", () => {
    expect(ARCHIVED_BLOCK).toContain(
      "ALLOW FAILED: an archived programme disappeared from the management view",
    );
  });

  it("excludes the archived programme from every ordinary catalogue principal", () => {
    expect(ARCHIVED_BLOCK).toContain("DENY FAILED: an archived programme is visible to a %");
    for (const label of ["'guardian'", "'teacher'", "'tutor'", "'learner'"]) {
      expect(ARCHIVED_BLOCK).toContain(label);
    }
  });

  it("refuses new enrollment into, and reopening of, an archived programme", () => {
    for (const denial of [
      "DENY FAILED: an administrator enrolled into an archived programme",
      "DENY FAILED: an instructor enrolled into an archived programme",
      "DENY FAILED: an archived programme was reopened",
    ]) {
      expect(ARCHIVED_BLOCK).toContain(denial);
    }
  });

  it("preserves existing enrollment history across archival with no hard deletion", () => {
    expect(ARCHIVED_BLOCK).toContain("v_enrollment_archived");
    expect(ARCHIVED_BLOCK).toContain(
      "LIFECYCLE FAILED: an archived programme was reopened during the proof",
    );
  });

  it("keeps draft and archived assertions separate so neither stands in for the other", () => {
    // The draft-exclusion proof lives outside the archived block.
    const beforeArchived = SQL.slice(0, SQL.indexOf("archived programme behaviour"));
    expect(beforeArchived).toContain("draft");
    expect(ARCHIVED_BLOCK).toContain("archived");
  });
});

describe("Stage 2 — application-layer role scoping", () => {
  it("scopes learner-visible enrollment reads to the caller's tenant and RLS", () => {
    expect(API).toContain("listVisibleProgrammeEnrollments");
    expect(API).toContain('.eq("organization_id", organizationId)');
    // No service-role escape hatch in the client read path.
    expect(API).not.toContain("supabaseAdmin");
    expect(API).not.toContain("client.server");
  });

  it("restricts ordinary catalogue reads to published programmes", () => {
    expect(INDEX).toContain('const status = mayManage ? tab : "published"');
    expect(INDEX).toContain('useState<string>(mayManage ? ALL : "published")');
  });

  it("exposes draft and archived views only behind the management gate", () => {
    expect(INDEX).toContain("canManageProgrammes");
    expect(INDEX).toContain('value="archived"');
    // The archived tab is inside the management-only branch.
    const managementBranch = INDEX.slice(INDEX.indexOf("mayManage ? ("), INDEX.indexOf(") : ("));
    expect(managementBranch).toContain('value="archived"');
    expect(managementBranch).toContain('value="draft"');
  });

  it("keeps programme-management controls off ordinary learner surfaces", () => {
    // The "New programme" action is rendered only when mayManage is true.
    expect(INDEX).toContain("mayManage && organizationId ? (");
  });
});

describe("Stage 2 — disposable workflow wiring", () => {
  it("runs the Stage 2 principal proof in both workflows", () => {
    for (const workflow of [PR_GATES, RLS_WORKFLOW]) {
      expect(workflow).toContain("scripts/run-stage2-rls-tests.mjs");
    }
  });

  it("proves zero Stage 2 residue in both workflows", () => {
    for (const workflow of [PR_GATES, RLS_WORKFLOW]) {
      expect(workflow).toContain("scripts/rls/stage2-residue-check.sql");
    }
  });

  it("still executes the Storage principal and residue proofs after Stage 2", () => {
    for (const workflow of [PR_GATES, RLS_WORKFLOW]) {
      expect(workflow).toContain("scripts/run-storage-principal-tests.mjs");
      expect(workflow).toContain("scripts/rls/stage1-storage-residue-check.sql");
      expect(workflow).toContain("scripts/run-storage-api-tests.mjs");
      expect(workflow).toContain("scripts/rls/stage1-storage-api-residue-check.sql");
    }
  });
});

describe("Stage 2 — preserved scope removals", () => {
  it("keeps higher-learning, career and certificate scope out of the new proofs", () => {
    const lower = (LEARNER_BLOCK + ARCHIVED_BLOCK).toLowerCase();
    for (const term of [
      "certificate",
      "credential",
      "university",
      "tvet",
      "diploma",
      "career pathway",
      "career aspiration",
    ]) {
      expect(lower).not.toContain(term);
    }
  });
});
