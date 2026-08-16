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

const SPINE = readFileSync(`supabase/migrations/${SPINE_FILE}`, "utf8");
const REPAIR = readFileSync(`supabase/migrations/${REPAIR_FILE}`, "utf8");
const BOTH = `${SPINE}\n${REPAIR}`;

const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const REPAIR_CODE = stripComments(REPAIR);

describe("Stage 1B — migration artifacts", () => {
  it("both migrations are present and ordered", () => {
    const files = readdirSync("supabase/migrations").sort();
    expect(files).toContain(SPINE_FILE);
    expect(files).toContain(REPAIR_FILE);
    expect(files.indexOf(REPAIR_FILE)).toBeGreaterThan(files.indexOf(SPINE_FILE));
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
    expect(REPAIR).toMatch(/v_max_depth constant int := 8;/);
    expect(REPAIR).toContain("curriculum node depth limit exceeded");
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
  });
});
