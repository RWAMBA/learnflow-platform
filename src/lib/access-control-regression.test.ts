import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260808181352_harden_critical_access_control.sql",
);

const onboardingServerPath = resolve(process.cwd(), "src/lib/onboarding.functions.ts");

const onboardingUiPath = resolve(process.cwd(), "src/routes/_authenticated/onboarding.tsx");

const migration = readFileSync(migrationPath, "utf8");
const onboardingServer = readFileSync(onboardingServerPath, "utf8");
const onboardingUi = readFileSync(onboardingUiPath, "utf8");

function getFunctionBlock(functionName: string) {
  const startMarker = `CREATE OR REPLACE FUNCTION ${functionName}`;
  const start = migration.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Missing function: ${functionName}`);
  }

  const end = migration.indexOf("$$;", start);

  if (end === -1) {
    throw new Error(`Could not find end of function: ${functionName}`);
  }

  return migration.slice(start, end + 3);
}

function getPolicyBlock(policyName: string) {
  const startMarker = `CREATE POLICY ${policyName}`;
  const start = migration.indexOf(startMarker);

  if (start === -1) {
    throw new Error(`Missing policy: ${policyName}`);
  }

  const end = migration.indexOf(";\n", start);

  if (end === -1) {
    throw new Error(`Could not find end of policy: ${policyName}`);
  }

  return migration.slice(start, end + 1);
}

describe("critical access-control remediation", () => {
  it("applies the migration atomically", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("requires active membership when checking organization roles", () => {
    const block = getFunctionBlock("app_private.has_org_role");

    expect(block).toContain("JOIN public.organization_memberships om");
    expect(block).toContain("AND om.organization_id = ur.organization_id");
    expect(block).toContain("AND ur.status = 'active'");
    expect(block).toContain("AND om.status = 'active'");
  });

  it("requires active membership when resolving authenticated role IDs", () => {
    const block = getFunctionBlock("app_private.auth_user_role_ids");

    expect(block).toContain("JOIN public.organization_memberships om");
    expect(block).toContain("AND om.organization_id = ur.organization_id");
    expect(block).toContain("AND ur.status = 'active'");
    expect(block).toContain("AND om.status = 'active'");
  });

  it("removes self-service membership updates", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS membership_self_update");

    expect(migration).not.toMatch(/CREATE\s+POLICY\s+membership_self_update\b/i);
  });

  it("restricts self-service membership creation", () => {
    const block = getPolicyBlock("membership_self_join");

    expect(block).toContain("user_id = auth.uid()");
    expect(block).toContain("status = 'active'");
    expect(block).toContain("created_by = auth.uid()");
    expect(block).toContain("app_private.is_open_enrollment(organization_id)");
  });

  it("restricts self-service role assignment to parent_guardian", () => {
    const block = getPolicyBlock("user_role_insert");

    expect(block).toContain("user_id = auth.uid()");
    expect(block).toContain("status = 'active'");
    expect(block).toContain("created_by = auth.uid()");
    expect(block).toContain("app_private.is_open_enrollment(organization_id)");
    expect(block).toContain("SELECT app_private.auth_organization_ids()");
    expect(block).toContain("r.code = 'parent_guardian'");
  });

  it("does not accept caller-selected roles in the onboarding server function", () => {
    expect(onboardingServer).not.toContain("roleCodes");
    expect(onboardingServer).not.toContain(".upsert(");
    expect(onboardingServer).toContain('"parent_guardian"');
  });

  it("does not expose role selection in the onboarding UI", () => {
    expect(onboardingUi).not.toContain("SELECTABLE_ROLES");
    expect(onboardingUi).not.toContain("SelectableRole");
    expect(onboardingUi).not.toContain("roleCodes");
    expect(onboardingUi).not.toContain("Your roles");
    expect(onboardingUi).not.toContain("setRoles");
    expect(onboardingUi).toMatch(/Self-service onboarding creates a Parent\/Guardian\s+account\./);
  });
});
