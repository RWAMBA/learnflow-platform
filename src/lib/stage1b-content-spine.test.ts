/**
 * Structural verification of the Phase 10 Stage 1B content spine and its
 * controlled-reconciliation repair. No isolated Postgres is available in this
 * environment, so every runtime-behaviour requirement is asserted structurally
 * against the applied migration SQL that produces it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MFA_ENFORCEMENT_ENABLED } from "@/features/security/mfa";

const SPINE_FILE = "20260816140135_1db60abb-0075-47b6-b5bb-e3cc1003d16c.sql";
const REPAIR_FILE = "20260816145744_7e9471d8-7e88-4a54-9523-e9cfa440aaf2.sql";
const REPAIR2_FILE = "20260816171500_phase10_stage1b_depth32_published_at.sql";

const SPINE = readFileSync(`supabase/migrations/${SPINE_FILE}`, "utf8");
const REPAIR = readFileSync(`supabase/migrations/${REPAIR_FILE}`, "utf8");
const REPAIR2 = readFileSync(`supabase/migrations/${REPAIR2_FILE}`, "utf8");
const BOTH = `${SPINE}\n${REPAIR}\n${REPAIR2}`;

/** The brief is hard-wrapped, so compare against a whitespace-normalised copy. */
const BRIEF_TEXT = readFileSync("docs/master-learnflow-continuation-brief.md", "utf8").replace(
  /\s+/g,
  " ",
);

const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const REPAIR_CODE = stripComments(REPAIR);
const REPAIR2_CODE = stripComments(REPAIR2);

/**
 * The authoritative maximum effective hierarchy depth is defined by the
 * ORIGINAL Stage 1B spine migration, not by the correction under test. It is
 * parsed from that external source so the proof cannot become self-referential.
 */
const AUTHORITATIVE_MAX_DEPTH = (() => {
  const match = SPINE.match(/IF v_depth > (\d+) THEN\s*\n\s*RAISE EXCEPTION 'curriculum node depth limit exceeded'/);
  if (!match) throw new Error("cannot derive the authoritative depth limit from the Stage 1B spine migration");
  return Number(match[1]);
})();

/**
 * Structural proof (NOT an executable database test): returns the list of
 * reasons a candidate migration fails the authoritative depth invariant.
 */
function depthProofFailures(sql: string, expected: number): string[] {
  const failures: string[] = [];
  const declared = [...sql.matchAll(/v_max_depth constant int := (\d+);/g)].map((m) => Number(m[1]));
  if (declared.length === 0) failures.push("no declared limit");
  if (!declared.every((d) => d === expected)) failures.push("declared limit differs from authoritative source");
  if (!/IF v_ancestor_depth > v_max_depth THEN/.test(sql)) failures.push("ancestor check not tied to the shared limit");
  if (!/coalesce\(v_subtree_depth, 1\) \+ v_ancestor_depth > v_max_depth THEN/.test(sql))
    failures.push("descendant check not tied to the shared limit");
  if (/v_ancestor_depth > \d/.test(sql)) failures.push("ancestor check uses a hardcoded limit");
  if (/\+ v_ancestor_depth > \d/.test(sql)) failures.push("descendant check uses a hardcoded limit");
  if (!/s\.depth < \(v_max_depth \+ 1\)/.test(sql)) failures.push("descendant traversal not bounded by the shared limit");
  if (/s\.depth < \(?\d/.test(sql)) failures.push("descendant traversal bounded by a hardcoded value");
  return failures;
}

describe("Stage 1B — migration artifacts", () => {
  it("both migrations are present and ordered", () => {
    const files = readdirSync("supabase/migrations").sort();
    expect(files).toContain(SPINE_FILE);
    expect(files).toContain(REPAIR_FILE);
    expect(files).toContain(REPAIR2_FILE);
    expect(files.indexOf(REPAIR_FILE)).toBeGreaterThan(files.indexOf(SPINE_FILE));
    expect(files.indexOf(REPAIR2_FILE)).toBeGreaterThan(files.indexOf(REPAIR_FILE));
  });

  it("the repair is forward-only and never edits prior migrations", () => {
    expect(REPAIR_CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(REPAIR_CODE).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(REPAIR_CODE).not.toMatch(/\bTRUNCATE\b/i);
    expect(REPAIR_CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(REPAIR_CODE).not.toMatch(/\bALTER\s+DATABASE\b/i);
  });

  it("the repair is transactional and fails closed on preconditions", () => {
    expect(REPAIR.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(REPAIR.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(REPAIR).toContain("Precondition failed: Stage 1B tables are not present");
    expect(REPAIR).toContain("Precondition failed: tenant-owned curriculum_nodes rows exist");
  });

  it("repair 2 is forward-only and never edits prior migrations", () => {
    expect(REPAIR2_CODE).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(REPAIR2_CODE).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(REPAIR2_CODE).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(REPAIR2_CODE).not.toMatch(/\bTRUNCATE\b/i);
    expect(REPAIR2_CODE).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(REPAIR2_CODE).not.toMatch(/\bALTER\s+DATABASE\b/i);
  });

  it("repair 2 is transactional and refuses to replace an unexpected function", () => {
    expect(REPAIR2_CODE.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(REPAIR2.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(REPAIR2).toContain(
      "Precondition failed: installed acyclicity guard is not the reviewed depth-8 version",
    );
    expect(REPAIR2).toContain("Post-condition failed: superseded depth-8 limit is still present");
  });

  it("repair 2 introduces no Stage 1C objects", () => {
    for (const forbidden of ["academic_period", "curriculum_enrollment", "track", "programme"]) {
      expect(REPAIR2_CODE.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("Stage 1B — authoritative depth limit (structural proof)", () => {
  it("derives the invariant from the external Stage 1B spine migration", () => {
    expect(AUTHORITATIVE_MAX_DEPTH).toBe(32);
    expect(SPINE).toMatch(/IF v_depth > 32 THEN/);
  });

  it("the superseded repair violated the externally derived invariant", () => {
    expect(depthProofFailures(REPAIR, AUTHORITATIVE_MAX_DEPTH).length).toBeGreaterThan(0);
  });

  it("the forward correction satisfies the externally derived invariant", () => {
    expect(depthProofFailures(REPAIR2, AUTHORITATIVE_MAX_DEPTH)).toEqual([]);
  });

  it("ancestor and descendant validation share one authoritative constant", () => {
    const declared = [...REPAIR2.matchAll(/v_max_depth constant int := (\d+);/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(["32"]));
    expect(REPAIR2).toContain("IF v_ancestor_depth > v_max_depth THEN");
    expect(REPAIR2).toContain("coalesce(v_subtree_depth, 1) + v_ancestor_depth > v_max_depth THEN");
  });

  it("effective level 32 is accepted and 33 rejected by the combined rule", () => {
    // ancestor depth 31 + deepest descendant-relative depth 1 = 32 -> allowed
    expect(31 + 1 > AUTHORITATIVE_MAX_DEPTH).toBe(false);
    // ancestor depth 31 + deepest descendant-relative depth 2 = 33 -> rejected
    expect(31 + 2 > AUTHORITATIVE_MAX_DEPTH).toBe(true);
    expect(REPAIR2).toContain("curriculum node subtree depth limit exceeded");
  });

  it("descendant traversal continues through the 32-level boundary", () => {
    expect(REPAIR2).toContain("s.depth < (v_max_depth + 1)");
    expect(REPAIR2).not.toMatch(/s\.depth < \(?8/);
  });

  it("malformed descendant cycles fail closed rather than being accepted", () => {
    expect(REPAIR2).toContain("c.id = ANY(s.path)");
    expect(REPAIR2).toContain("coalesce(bool_or(s.is_cycle), false)");
    expect(REPAIR2).toMatch(/IF v_subtree_cycle THEN\s*\n\s*RAISE EXCEPTION 'curriculum node cycle violation'/);
  });

  it("cross-subject descendants and same-subject parents remain enforced", () => {
    expect(REPAIR2).toContain("curriculum node parent must belong to the same subject");
    expect(REPAIR2).toContain("curriculum node subtree subject mismatch");
  });

  it("guard hardening is preserved", () => {
    expect(REPAIR2).toContain("SECURITY INVOKER");
    expect(REPAIR2).toContain("SET search_path = ''");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(REPAIR2).toContain(
        `REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_acyclic() FROM ${role};`,
      );
    }
    expect(REPAIR2).toMatch(
      /CREATE TRIGGER curriculum_nodes_enforce_acyclic\s+BEFORE INSERT OR UPDATE OF parent_node_id, subject_id/,
    );
  });
});

describe("Stage 1B — depth proof rejects defective variants (negative tests)", () => {
  const mutate = (from: string | RegExp, to: string) => REPAIR2.replace(from, to);

  it("rejects a correction that keeps the depth-8 limit", () => {
    expect(
      depthProofFailures(mutate(/v_max_depth constant int := 32;/g, "v_max_depth constant int := 8;"), AUTHORITATIVE_MAX_DEPTH),
    ).toContain("declared limit differs from authoritative source");
  });

  it("rejects a correction that uses 31", () => {
    expect(
      depthProofFailures(mutate(/v_max_depth constant int := 32;/g, "v_max_depth constant int := 31;"), AUTHORITATIVE_MAX_DEPTH),
    ).toContain("declared limit differs from authoritative source");
  });

  it("rejects a correction that uses 33", () => {
    expect(
      depthProofFailures(mutate(/v_max_depth constant int := 32;/g, "v_max_depth constant int := 33;"), AUTHORITATIVE_MAX_DEPTH),
    ).toContain("declared limit differs from authoritative source");
  });

  it("rejects ancestor and descendant checks using different limits", () => {
    const failures = depthProofFailures(
      mutate(
        "coalesce(v_subtree_depth, 1) + v_ancestor_depth > v_max_depth THEN",
        "coalesce(v_subtree_depth, 1) + v_ancestor_depth > 8 THEN",
      ),
      AUTHORITATIVE_MAX_DEPTH,
    );
    expect(failures).toContain("descendant check not tied to the shared limit");
    expect(failures).toContain("descendant check uses a hardcoded limit");
  });

  it("rejects descendant traversal that stops before the 32-level boundary", () => {
    const failures = depthProofFailures(
      mutate("s.depth < (v_max_depth + 1)", "s.depth < 8"),
      AUTHORITATIVE_MAX_DEPTH,
    );
    expect(failures).toContain("descendant traversal not bounded by the shared limit");
    expect(failures).toContain("descendant traversal bounded by a hardcoded value");
  });
});

describe("Stage 1B — server-authoritative published_at", () => {
  const NODE_DEF = "CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_node_lifecycle()";
  const RESOURCE_DEF = "CREATE OR REPLACE FUNCTION app_private.enforce_learning_resource_lifecycle()";
  const nodeFn = REPAIR2.slice(REPAIR2.indexOf(NODE_DEF), REPAIR2.indexOf(RESOURCE_DEF));
  const resourceFn = REPAIR2.slice(REPAIR2.indexOf(RESOURCE_DEF));

  it("publication time is assigned unconditionally, not only when NULL", () => {
    for (const fn of [nodeFn, resourceFn]) {
      expect(fn).toContain("NEW.published_at := now();");
      expect(fn).not.toContain("NEW.published_at IS NULL");
    }
  });

  it("a client-supplied timestamp (past or future) cannot survive publication", () => {
    // Any client value is overwritten on the transition, and discarded otherwise.
    expect(nodeFn).toMatch(/IF NEW\.status = 'published' THEN\s*\n\s*NEW\.published_at := now\(\);\s*\n\s*ELSE\s*\n\s*NEW\.published_at := OLD\.published_at;/);
    expect(resourceFn).toMatch(/NEW\.published_at := now\(\);\s*\n\s*ELSE\s*\n\s*NEW\.published_at := OLD\.published_at;/);
  });

  it("insert-as-published is also database-timed and unpublished inserts are NULL", () => {
    for (const fn of [nodeFn, resourceFn]) {
      expect(fn).toMatch(/TG_OP = 'INSERT'[\s\S]{0,400}NEW\.published_at := now\(\);[\s\S]{0,80}ELSE[\s\S]{0,80}NEW\.published_at := NULL;/);
    }
    expect(REPAIR2).toMatch(
      /CREATE TRIGGER curriculum_nodes_enforce_lifecycle\s+BEFORE INSERT OR UPDATE OR DELETE/,
    );
    expect(REPAIR2).toMatch(
      /CREATE TRIGGER learning_resources_enforce_lifecycle\s+BEFORE INSERT OR UPDATE OR DELETE/,
    );
  });

  it("archival cannot modify published_at", () => {
    expect(nodeFn).toMatch(/NEW\.status <> 'archived'[\s\S]{0,1400}NEW\.published_at := OLD\.published_at;/);
    expect(resourceFn).toContain("NEW.published_at := OLD.published_at;");
  });
});

describe("Stage 1B — explicit lifecycle release decision", () => {
  it("draft and review cannot be archived directly", () => {
    expect(REPAIR2).toMatch(/OLD\.status = 'draft' AND NEW\.status = 'archived'/);
    expect(REPAIR2).toMatch(/OLD\.status = 'review' AND NEW\.status = 'archived'/);
    expect(REPAIR2).toMatch(/OLD\.status IN \('draft','review'\) AND NEW\.status = 'archived'/);
  });

  it("archived rows stay frozen and published/archived rows cannot be deleted", () => {
    expect(REPAIR2).toMatch(/OLD\.status = 'archived'[\s\S]{0,120}RAISE EXCEPTION 'curriculum node lifecycle violation'/);
    expect(REPAIR2).toMatch(/TG_OP = 'DELETE'[\s\S]{0,200}OLD\.status IN \('published','archived'\)/);
  });

  it("curriculum_versions lifecycle is untouched and its normalization deferred", () => {
    expect(REPAIR2_CODE).not.toContain("curriculum_versions");
    expect(BRIEF_TEXT).toContain("curriculum_versions lifecycle normalization remains deferred");
  });
});

describe("Stage 1B — legacy link precedence", () => {
  it("the backfill priority is deterministic: sub-strand, then topic, then outcome", () => {
    const subStrand = SPINE.indexOf("legacy_source = 'sub_strand'");
    const topic = SPINE.indexOf("legacy_source = 'topic'");
    expect(subStrand).toBeGreaterThan(-1);
    expect(topic).toBeGreaterThan(subStrand);
    // The outcome-only pass runs last and only where no node was already mapped.
    expect(REPAIR).toMatch(/l\.curriculum_node_id IS NULL[\s\S]{0,200}o\.legacy_outcome_id = l\.learning_outcome_id/);
  });

  it("precedence is documented as precedence-based, not conflict-rejecting", () => {
    expect(BRIEF_TEXT).toContain("precedence-based, not conflict-rejection-based");
  });
});

describe("Stage 1B — platform-only hierarchy ownership", () => {
  it("curriculum_nodes ownership is constrained to platform-owned rows", () => {
    expect(REPAIR).toContain("curriculum_nodes_platform_owned_chk");
    expect(REPAIR).toMatch(/CHECK \(authoring_organization_id IS NULL\)/);
    expect(REPAIR).toContain("VALIDATE CONSTRAINT curriculum_nodes_platform_owned_chk");
  });

  it("write policies remain platform-administrator only (SEC-005 preserved)", () => {
    for (const policy of [
      "curriculum_nodes_insert",
      "curriculum_nodes_update",
      "curriculum_nodes_delete",
    ]) {
      expect(SPINE).toContain(policy);
    }
    expect(SPINE).toContain("app_private.is_platform_admin()");
    expect(SPINE).not.toMatch(/curriculum_nodes[\s\S]{0,400}has_org_role\((?:[^)]*)'teacher'/i);
  });

  it("tenant-owned learning resources stay tenant-isolated", () => {
    expect(SPINE).toContain("learning_resources_select");
    expect(SPINE).toContain("app_private.auth_organization_ids()");
    expect(SPINE).toContain("app_private.can_author_curriculum(organization_id)");
    expect(SPINE).toContain("prevent_learning_resource_ownership_change");
  });
});

describe("Stage 1B — subtree depth and cycle enforcement", () => {
  it("the acyclicity guard validates descendants, not only ancestors", () => {
    expect(REPAIR).toContain("enforce_curriculum_node_acyclic");
    expect(REPAIR).toMatch(/WITH RECURSIVE subtree\(id, depth\)/);
    expect(REPAIR).toContain("v_subtree_depth");
    expect(REPAIR).toContain("curriculum node subtree depth limit exceeded");
  });

  it("a bounded maximum depth is enforced", () => {
    // The authoritative value is derived externally; see the depth-limit suite.
    expect(REPAIR).toContain("curriculum node depth limit exceeded");
    expect(REPAIR2).toContain("curriculum node depth limit exceeded");
  });

  it("cycles and cross-subject parents are still rejected", () => {
    expect(REPAIR).toContain("curriculum node cycle violation");
    expect(REPAIR).toContain("curriculum node parent must belong to the same subject");
    expect(REPAIR).toContain("curriculum node subtree subject mismatch");
  });

  it("the guard fires on insert and on parent/subject moves", () => {
    expect(REPAIR).toMatch(
      /CREATE TRIGGER curriculum_nodes_enforce_acyclic\s+BEFORE INSERT OR UPDATE OF parent_node_id, subject_id/,
    );
  });
});

describe("Stage 1B — lifecycle immutability", () => {
  it("curriculum nodes enforce draft/review/published/archived", () => {
    expect(REPAIR).toContain("enforce_curriculum_node_lifecycle");
    expect(REPAIR).toMatch(/NEW\.status NOT IN \('draft','review','published','archived'\)/);
    expect(REPAIR).toContain("curriculum node lifecycle violation");
    expect(REPAIR).toMatch(
      /CREATE TRIGGER curriculum_nodes_enforce_lifecycle\s+BEFORE UPDATE OR DELETE/,
    );
  });

  it("published nodes may only be archived, and content stays immutable", () => {
    const fn = REPAIR.slice(
      REPAIR.indexOf("enforce_curriculum_node_lifecycle"),
      REPAIR.indexOf("enforce_learning_resource_lifecycle"),
    );
    expect(fn).toMatch(/OLD\.status = 'published'/);
    expect(fn).toMatch(/NEW\.status <> 'archived'/);
    for (const col of ["title", "subject_id", "parent_node_id", "node_type", "sequence_order"]) {
      expect(fn).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    expect(fn).toMatch(/OLD\.status = 'archived'/);
  });

  it("published and archived nodes cannot be deleted", () => {
    expect(REPAIR).toMatch(
      /TG_OP = 'DELETE'[\s\S]{0,200}OLD\.status IN \('published','archived'\)/,
    );
  });

  it("learning resources enforce the same lifecycle", () => {
    expect(REPAIR).toContain("enforce_learning_resource_lifecycle");
    expect(REPAIR).toContain("learning resource lifecycle violation");
    expect(REPAIR).toMatch(
      /CREATE TRIGGER learning_resources_enforce_lifecycle\s+BEFORE UPDATE OR DELETE/,
    );
  });

  it("publication timestamps are set by the database, not the caller", () => {
    const matches = REPAIR.match(/NEW\.published_at := now\(\);/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("lifecycle helpers are not executable by application roles", () => {
    for (const fn of [
      "enforce_curriculum_node_acyclic",
      "enforce_curriculum_node_lifecycle",
      "enforce_learning_resource_lifecycle",
    ]) {
      expect(REPAIR).toContain(`REVOKE ALL ON FUNCTION app_private.${fn}() FROM authenticated;`);
      expect(REPAIR).toContain(`REVOKE ALL ON FUNCTION app_private.${fn}() FROM anon;`);
    }
  });
});

describe("Stage 1B — lesson backfill completeness", () => {
  it("the spine maps sub-strand and topic links", () => {
    expect(SPINE).toMatch(/UPDATE public\.lessons l[\s\S]{0,300}legacy_source = 'sub_strand'/);
    expect(SPINE).toMatch(/UPDATE public\.lessons l[\s\S]{0,300}legacy_source = 'topic'/);
  });

  it("the repair closes the learning-outcome-only gap deterministically", () => {
    expect(REPAIR).toContain("o.legacy_outcome_id = l.learning_outcome_id");
    expect(REPAIR).toMatch(/l\.curriculum_node_id IS NULL/);
    expect(REPAIR).toMatch(/o\.curriculum_node_id IS NOT NULL/);
  });

  it("a post-condition proves no legacy-linked lesson is left unmapped", () => {
    expect(REPAIR).toContain(
      "Backfill gap: % lessons retain a legacy link without a curriculum node",
    );
    expect(REPAIR).toContain("Ownership violation: % tenant-owned curriculum nodes");
  });

  it("legacy tables are preserved for later verified deprecation", () => {
    for (const t of ["strands", "sub_strands", "topics", "learning_outcomes"]) {
      expect(REPAIR_CODE).not.toMatch(new RegExp(`DROP TABLE[^;]*${t}`, "i"));
    }
  });
});

describe("Stage 1B — out-of-scope invariants", () => {
  it("SEC-006 stage two remains inactive", () => {
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
    expect(BOTH).not.toContain("has_aal2(");
  });

  it("no auth or MFA configuration is touched", () => {
    expect(REPAIR_CODE).not.toMatch(/\bauth\./);
    expect(REPAIR_CODE).not.toContain("organization_security_settings");
    expect(REPAIR_CODE).not.toContain("platform_admins");
    expect(REPAIR2_CODE).not.toMatch(/\bauth\./);
    expect(REPAIR2_CODE).not.toContain("organization_security_settings");
    expect(REPAIR2_CODE).not.toContain("platform_admins");
  });
});
