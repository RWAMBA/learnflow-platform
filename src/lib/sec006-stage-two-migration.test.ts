/**
 * Structural verification of the PREPARED stage-two AAL2 enforcement SQL.
 * These tests do not touch a database; they assert that the prepared file
 * cannot be applied accidentally and that it only ever ADDS an AAL2 conjunct
 * to policies whose original predicate is preserved verbatim.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MFA_ENFORCEMENT_ENABLED } from "@/features/security/mfa";

const PREPARED = readFileSync("docs/sec-006-stage-two-enforcement.sql", "utf8");
const MIGRATIONS = readdirSync("supabase/migrations");

describe("SEC-006 stage two (prepared, unapplied)", () => {
  it("is not present in the migrations directory", () => {
    const applied = MIGRATIONS.map((name) =>
      readFileSync(`supabase/migrations/${name}`, "utf8"),
    ).join("\n");
    expect(applied).not.toContain("has_aal2()) )");
    expect(applied.includes("org_requires_mfa")).toBe(false);
    expect(MIGRATIONS.some((name) => name.includes("stage_two"))).toBe(false);
  });

  it("keeps runtime enforcement disabled while stage two is unapplied", () => {
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
  });

  it("adds AAL2 to every privileged curriculum and tenant-admin policy", () => {
    for (const policy of [
      "curriculum_versions_insert",
      "curriculum_versions_update",
      "curriculum_versions_delete",
      "learning_outcomes_write",
      "learning_objectives_write",
      "lesson_prerequisites_write",
      "lessons_insert",
      "lessons_update",
      "lessons_delete",
      "curriculum_resources_write",
      "org_platform_admin_write",
      "membership_admin_update",
      "user_role_update",
    ]) {
      expect(PREPARED).toContain(`create policy ${policy}`);
    }
    expect(PREPARED).toContain("app_private.has_aal2()");
  });

  it("preserves the original ownership and isolation predicates", () => {
    // SEC-004/SEC-005 boundaries must survive verbatim inside the new policies.
    expect(PREPARED).toContain("app_private.can_author_curriculum(");
    expect(PREPARED).toContain("app_private.is_platform_admin()");
    expect(PREPARED).toContain("(authoring_organization_id is null)");
    expect(PREPARED).toContain("author_type = 'tenant'");
  });

  it("never attaches a mandatory rule to self-service or learner branches", () => {
    // The open-enrollment branches stay free of has_aal2().
    const selfJoin = PREPARED.slice(
      PREPARED.indexOf("create policy membership_self_join"),
      PREPARED.indexOf("create policy user_role_update"),
    );
    const openEnrollmentBranch = selfJoin.slice(selfJoin.indexOf("or ((user_id = auth.uid())"));
    expect(openEnrollmentBranch).not.toContain("has_aal2");

    const userRoleInsert = PREPARED.slice(PREPARED.indexOf("create policy user_role_insert"));
    const parentBranch = userRoleInsert.slice(
      userRoleInsert.indexOf("or ((user_id = auth.uid())"),
      userRoleInsert.indexOf("-- ---", userRoleInsert.indexOf("or ((user_id = auth.uid())")),
    );
    expect(parentBranch).not.toContain("has_aal2");
    expect(parentBranch).toContain("parent_guardian");
  });

  it("makes Teacher/Tutor MFA conditional on explicit organization policy", () => {
    expect(PREPARED).toContain("create or replace function app_private.org_requires_mfa");
    expect(PREPARED).toContain("when _organization_id is null then false");
    expect(PREPARED).toContain("), false)");
  });

  it("documents an exact rollback procedure", () => {
    expect(PREPARED).toContain("ROLLBACK PROCEDURE");
    expect(PREPARED).toContain("rollback is lossless");
  });
});
