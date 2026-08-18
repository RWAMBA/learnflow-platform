/**
 * Phase 10 Stage 1 — Storage authorization (structural, always-on).
 *
 * The executable live-principal proof runs against a disposable Supabase stack
 * in .github/workflows/rls-principal-tests.yml
 * (scripts/rls/stage1-storage-principal-tests.sql). This suite is the always-on
 * guard: it proves the repository still declares the Storage surface the
 * principal proof asserts against, and that the proof itself stays disposable
 * and fail-closed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BUCKET_POLICIES = readFileSync(
  "supabase/migrations/20260803201609_2970e0c1-21fe-4d4a-8bd0-ec973c901a47.sql",
  "utf8",
);
const HARDENING = readFileSync(
  "supabase/migrations/20260809194700_harden_curriculum_authorization.sql",
  "utf8",
);
const PROOF = readFileSync("scripts/rls/stage1-storage-principal-tests.sql", "utf8");
const RUNNER = readFileSync("scripts/run-storage-principal-tests.mjs", "utf8");
const RESIDUE = readFileSync("scripts/rls/stage1-storage-residue-check.sql", "utf8");
const WORKFLOW = readFileSync(".github/workflows/rls-principal-tests.yml", "utf8");
const GATES = readFileSync(".github/workflows/pr-quality-gates.yml", "utf8");

describe("Stage 1 storage surface is the one the proof targets", () => {
  it("declares exactly the private curriculum-resources bucket", () => {
    expect(PROOF).toContain("'curriculum-resources'");
    expect(PROOF).toContain("DENY FAILED: curriculum-resources must be a private bucket");
    expect(PROOF).toContain("DENY FAILED: a public storage bucket exists in Stage 1");
  });

  it("keeps every storage.objects policy scoped to the first path segment", () => {
    for (const policy of ["read", "insert", "update", "delete"]) {
      expect(BUCKET_POLICIES).toContain(`curriculum_resources_${policy}`);
    }
    expect(BUCKET_POLICIES).toContain("(storage.foldername(name))[1]::uuid");
    expect(HARDENING).toContain("((storage.foldername(name))[1])::uuid");
  });

  it("keeps write authority on organization-scoped authoring, not membership alone", () => {
    expect(HARDENING).toContain("app_private.can_author_curriculum(");
    expect(HARDENING).toMatch(/DROP POLICY IF EXISTS curriculum_resources_insert/);
  });

  it("requires the proof to check that RLS is enabled and the policies exist", () => {
    expect(PROOF).toContain("relrowsecurity");
    expect(PROOF).toContain("Stage 1 storage policies are missing");
  });
});

describe("Storage principal proof covers every mandated case", () => {
  const cases: Array<[string, RegExp]> = [
    ["anonymous denied", /anonymous principal can list/],
    ["anonymous write denied", /anonymous principal wrote a storage object/],
    ["student/parent denied private rights evidence", /can read platform-private licence evidence/],
    ["teacher/tutor denied authoring", /uploaded a learning resource without authoring authority/],
    ["org admin denied platform licence evidence", /organization admin can read platform-private licence evidence/],
    ["org admin allowed inside its tenant", /tenant admin cannot read its own learning resource/],
    ["platform admin allowed on licence evidence", /platform admin cannot read the licence evidence record/],
    ["cross-tenant read denied", /tenant admin can read a cross-tenant object/],
    ["cross-tenant list denied", /tenant admin can list a cross-tenant prefix/],
    ["cross-tenant write denied", /tenant admin wrote into another tenant prefix/],
    ["cross-tenant update denied", /tenant admin updated a cross-tenant object/],
    ["cross-tenant delete denied", /tenant admin deleted a cross-tenant object/],
    ["path manipulation denied", /path manipulation with prefix "%" was accepted/],
    ["traversal cannot cross tenants", /traversal path resolved to a cross-tenant object/],
    ["expired evidence stays closed", /expired rights grant satisfied the availability gate/],
    ["unavailable curriculum not browsable", /learner can browse nodes of an unavailable curriculum version/],
    ["unpublished lessons not browsable", /learner can browse unpublished lessons/],
    ["cross-tenant resources not readable", /learner can read cross-tenant curriculum resources/],
  ];
  for (const [label, pattern] of cases) {
    it(`asserts: ${label}`, () => {
      expect(PROOF).toMatch(pattern);
    });
  }

  it("exercises real principals rather than a privileged session", () => {
    expect(PROOF).toContain("SET LOCAL ROLE anon");
    expect(PROOF).toContain("SET LOCAL ROLE authenticated");
    expect(PROOF).toContain("request.jwt.claims");
    expect(PROOF).not.toMatch(/SET LOCAL ROLE service_role/);
  });
});

describe("Storage proof is disposable-only and leaves no residue", () => {
  it("always rolls back", () => {
    expect(PROOF.trimEnd().endsWith("ROLLBACK;")).toBe(true);
    expect(PROOF).not.toMatch(/^\s*COMMIT;/m);
  });

  it("refuses hosted endpoints and requires an explicit disposable flag", () => {
    expect(RUNNER).toContain('RLS_DISPOSABLE_DB !== "1"');
    for (const host of ["supabase.co", "supabase.com", "pooler."]) {
      expect(RUNNER).toContain(host);
    }
  });

  it("proves zero residue afterwards", () => {
    for (const table of [
      "storage.objects",
      "storage.buckets",
      "public.rights_grants",
      "public.source_artifacts",
      "public.platform_admins",
    ]) {
      expect(RESIDUE).toContain(table);
    }
  });

  it("uses only disposable fixture identities", () => {
    expect(PROOF).toMatch(/@example\.test/);
    expect(PROOF).not.toMatch(/supabase\.co/);
  });
});

describe("CI executes the storage gate on pull requests", () => {
  it("runs the storage proof and its residue check in the principal workflow", () => {
    expect(WORKFLOW).toContain("scripts/run-storage-principal-tests.mjs");
    expect(WORKFLOW).toContain("scripts/rls/stage1-storage-residue-check.sql");
    expect(WORKFLOW).toMatch(/on:\s*\n\s*pull_request:/);
  });

  it("runs every mandatory Stage 1 gate on candidate pull requests", () => {
    for (const gate of [
      "--frozen-lockfile",
      "run typecheck",
      "run lint",
      "run test",
      "run build",
      "scan-secrets.mjs",
      "scan-bundle-leaks.mjs",
      "check-migration-order.mjs",
    ]) {
      expect(GATES).toContain(gate);
    }
    expect(GATES).toMatch(/on:\s*\n\s*pull_request:/);
  });

  it("never references a hosted Supabase endpoint or production secret", () => {
    for (const banned of ["supabase.co/", "secrets.SUPABASE"]) {
      expect(GATES).not.toContain(banned);
    }
  });
});
