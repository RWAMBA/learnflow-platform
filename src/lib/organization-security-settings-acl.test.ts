import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEC-006 Gate 2 — asserts the corrective migration keeps the intended
 * least-privilege ACL for public.organization_security_settings. This checks
 * the committed SQL, not a live database.
 */
const dir = "supabase/migrations";
const corrective = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(join(dir, name), "utf8"))
  .filter((sql) => sql.includes("organization_security_settings"))
  .join("\n\n");

describe("organization_security_settings ACL", () => {
  it("revokes all privileges from public, anon and authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(corrective).toContain(
        `revoke all on table public.organization_security_settings from ${role};`,
      );
    }
  });

  it("grants authenticated read access only", () => {
    expect(corrective).toContain(
      "grant select on table public.organization_security_settings to authenticated;",
    );
    expect(corrective).not.toMatch(
      /grant\s+(insert|update|delete|truncate|references|trigger|all)[^;]*on table public\.organization_security_settings to authenticated/i,
    );
  });

  it("preserves service_role access for server-only operations", () => {
    expect(corrective).toContain(
      "grant all on table public.organization_security_settings to service_role;",
    );
  });

  it("keeps row level security enabled and drops the inert write policy", () => {
    expect(corrective).toContain(
      "alter table public.organization_security_settings enable row level security;",
    );
    expect(corrective).toContain(
      "drop policy if exists organization_security_settings_platform_admin_write",
    );
  });

  it("keeps the member read policy", () => {
    expect(corrective).toContain("create policy organization_security_settings_member_read");
  });
});
