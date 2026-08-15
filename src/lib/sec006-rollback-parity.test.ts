/**
 * Machine-verifiable rollback parity for SEC-006 stage two.
 *
 * Every policy the rollback section of `docs/sec-006-stage-two-enforcement.sql`
 * re-creates is compared, predicate by predicate, against the authoritative
 * pre-stage-two definition captured from the live catalog in
 * `docs/sec-006-prestage-two-policy-baseline.json`. Only lexical noise is
 * normalised (see src/lib/sql-predicate-normalize.ts); semantic SQL must be
 * identical.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalizeSqlPredicate, parseCreatePolicyStatements } from "./sql-predicate-normalize";

const SQL = readFileSync("docs/sec-006-stage-two-enforcement.sql", "utf8");
const BASELINE = JSON.parse(
  readFileSync("docs/sec-006-prestage-two-policy-baseline.json", "utf8"),
) as {
  policies: {
    policy: string;
    table: string;
    command: string;
    roles: string[];
    source: string;
    original_using: string;
    original_check: string;
  }[];
};

const section = (open: string, close: string) => SQL.slice(SQL.indexOf(open), SQL.indexOf(close));
const FORWARD = section(">>> FORWARD SQL BEGIN", "<<< FORWARD SQL END");
const ROLLBACK = section(">>> ROLLBACK SQL BEGIN", "<<< ROLLBACK SQL END");

const rollbackPolicies = parseCreatePolicyStatements(ROLLBACK);
const forwardPolicies = parseCreatePolicyStatements(FORWARD);
const byName = new Map(rollbackPolicies.map((entry) => [entry.policy, entry]));

describe("SEC-006 stage-two rollback parity", () => {
  it("re-creates every policy the forward section replaces", () => {
    const forwardNames = new Set(forwardPolicies.map((entry) => entry.policy));
    // organization_security_settings_platform_admin_write did not exist before
    // stage two: rollback drops it and revokes the grants instead.
    forwardNames.delete("organization_security_settings_platform_admin_write");
    expect([...forwardNames].sort()).toEqual([...byName.keys()].sort());
    expect(byName.size).toBe(BASELINE.policies.length);
  });

  it.each(BASELINE.policies.map((entry) => [entry.policy, entry] as const))(
    "restores %s to its pre-stage-two definition",
    (_name, expected) => {
      const actual = byName.get(expected.policy);
      expect(actual, `rollback is missing ${expected.policy}`).toBeDefined();
      expect(actual!.table).toBe(expected.table);
      expect(actual!.command).toBe(expected.command);
      expect(actual!.roles).toEqual(expected.roles);
      expect(canonicalizeSqlPredicate(actual!.using)).toBe(
        canonicalizeSqlPredicate(expected.original_using),
      );
      expect(canonicalizeSqlPredicate(actual!.check)).toBe(
        canonicalizeSqlPredicate(expected.original_check),
      );
    },
  );

  it("leaves no AAL2 conjunct anywhere in the rollback authorization logic", () => {
    for (const policy of rollbackPolicies) {
      expect(`${policy.using} ${policy.check}`).not.toContain("has_aal2");
    }
  });

  // Policies whose predicate mixes an administrative branch with a
  // self-service branch: AAL2 is attached to the administrative branch only,
  // so the original predicate is not a contiguous substring of the new one.
  // Their branch-level parity is asserted by the self-service test below.
  const MIXED_BRANCH_POLICIES = new Set(["membership_self_join", "user_role_insert"]);

  it("adds AAL2 only as an extra conjunct in the forward section", () => {
    for (const policy of forwardPolicies) {
      if (policy.policy === "organization_security_settings_platform_admin_write") continue;
      const baseline = BASELINE.policies.find((entry) => entry.policy === policy.policy);
      expect(baseline, `forward policy ${policy.policy} has no baseline`).toBeDefined();
      for (const clause of ["using", "check"] as const) {
        const forwardClause = canonicalizeSqlPredicate(policy[clause]);
        const original = canonicalizeSqlPredicate(
          clause === "using" ? baseline!.original_using : baseline!.original_check,
        );
        if (original === "") {
          expect(forwardClause).toBe("");
          continue;
        }
        expect(forwardClause).toContain("app_private.has_aal2()");
        if (MIXED_BRANCH_POLICIES.has(policy.policy)) continue;
        // The original predicate survives verbatim inside the new one.
        const withoutAal2 = forwardClause
          .replace(/ and app_private\.has_aal2\(\)/g, "")
          .replace(/app_private\.has_aal2\(\) and /g, "");
        expect(withoutAal2).toContain(original.replace(/^\(|\)$/g, ""));
      }
    }
  });

  it("keeps self-service, Parent/Guardian and Student branches unchanged", () => {
    for (const name of ["membership_self_join", "user_role_insert"]) {
      const baseline = BASELINE.policies.find((entry) => entry.policy === name)!;
      const rollback = byName.get(name)!;
      const selfBranch = (text: string) =>
        canonicalizeSqlPredicate(text).slice(canonicalizeSqlPredicate(text).indexOf("user_id="));
      expect(selfBranch(rollback.check)).toBe(selfBranch(baseline.original_check));
      const forward = forwardPolicies.find((entry) => entry.policy === name)!;
      expect(selfBranch(forward.check)).not.toContain("has_aal2");
    }
  });

  it("is transactional, executable and free of destructive DML or placeholders", () => {
    expect(ROLLBACK).toContain("begin;");
    expect(ROLLBACK).toContain("commit;");
    expect(ROLLBACK).not.toMatch(/<[A-Z_ ]+>/);
    expect(ROLLBACK).not.toMatch(
      /\b(insert into|update .* set|delete from|truncate|drop table)\b/i,
    );
    expect(ROLLBACK).toContain(
      "revoke insert, update, delete on table public.organization_security_settings from authenticated",
    );
  });

  it("attributes every baseline policy to an authoritative source", () => {
    for (const entry of BASELINE.policies) {
      expect(entry.source).toMatch(/supabase\/migrations\/\d+_.*\.sql/);
      expect(entry.roles).toEqual(["authenticated"]);
    }
  });
});
