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

  it("does not ship an unused Teacher/Tutor conditional helper", () => {
    // SEC-005 removed Teacher/Tutor curriculum-authoring authority and no
    // in-scope write policy references those roles, so no helper may be
    // created and presented as active enforcement.
    expect(PREPARED).not.toContain("create or replace function app_private.org_requires_mfa");
    expect(PREPARED).not.toContain("create or replace function app_private.org_mfa_satisfied");
    expect(PREPARED).toContain("DELIBERATELY NOT IMPLEMENTED");
    // The forward guard fails closed if such a surface ever appears.
    expect(PREPARED).toContain("teacher_tutor_write_policies");
    expect(PREPARED).toContain("Teacher/Tutor write policies exist on in-scope tables");
  });

  it("carries no hard-coded administrator counts and gates on live aggregates", () => {
    expect(PREPARED).not.toContain("currently 1 active");
    expect(PREPARED).toContain("DEPLOYMENT PREREQUISITE CHECKS (READ ONLY, AGGREGATES ONLY)");
    expect(PREPARED).toContain("active_platform_admins_with_verified_factor");
    expect(PREPARED).toContain("platform administrator readiness failed");
    // Aggregates only: no identity column is ever selected.
    expect(PREPARED).not.toMatch(/select[^;]*\bmf\.id\b/i);
    expect(PREPARED).not.toContain("u.email");
  });

  it("provides an executable rollback section restoring the original predicates", () => {
    const forward = PREPARED.slice(
      PREPARED.indexOf(">>> FORWARD SQL BEGIN"),
      PREPARED.indexOf("<<< FORWARD SQL END"),
    );
    const rollback = PREPARED.slice(
      PREPARED.indexOf(">>> ROLLBACK SQL BEGIN"),
      PREPARED.indexOf("<<< ROLLBACK SQL END"),
    );
    expect(forward).toContain("begin;");
    expect(forward).toContain("commit;");
    expect(rollback).toContain("begin;");
    expect(rollback).toContain("commit;");
    // Rollback removes AAL2 entirely and keeps no placeholders or DML.
    expect(rollback).not.toContain("has_aal2()");
    expect(rollback).not.toMatch(/<[A-Z_ ]+>/);
    expect(rollback).not.toMatch(/\b(insert into|update .* set|delete from|truncate|drop table)\b/i);
    // Original predicates are restored for each surface.
    for (const policy of [
      "curriculum_versions_insert",
      "learning_outcomes_write",
      "learning_objectives_write",
      "lesson_prerequisites_write",
      "lessons_insert",
      "curriculum_resources_write",
      "org_platform_admin_write",
      "membership_admin_update",
      "membership_self_join",
      "user_role_update",
      "user_role_insert",
    ]) {
      expect(rollback).toContain(`create policy ${policy}`);
    }
    // Helper state restored and stage-one read-only ACL re-asserted.
    expect(rollback).toContain("drop function if exists app_private.org_requires_mfa(uuid, text)");
    expect(rollback).toContain(
      "revoke insert, update, delete on table public.organization_security_settings from authenticated",
    );
  });

  it("documents an exact rollback procedure", () => {
    expect(PREPARED).toContain("ROLLBACK PROCEDURE");
    expect(PREPARED).toContain("rollback is lossless");
  });
});
