/**
 * Verifies the applied least-privilege ACL correction for the tamper-resistant
 * security tables (security_events, platform_admins).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "supabase/migrations";
const MIGRATION = readdirSync(DIR)
  .map((name) => readFileSync(`${DIR}/${name}`, "utf8"))
  .find((sql) => sql.includes("Least-privilege ACL correction"));

describe("security table ACL correction", () => {
  it("exists as an applied migration", () => {
    expect(MIGRATION).toBeDefined();
  });

  it("removes write privileges from anon and authenticated", () => {
    for (const table of ["public.security_events", "public.platform_admins"]) {
      expect(MIGRATION).toContain(`revoke all on table ${table} from anon;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from authenticated;`);
      expect(MIGRATION).toContain(`grant select on table ${table} to authenticated;`);
      expect(MIGRATION).toContain(`grant all on table ${table} to service_role;`);
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
    }
  });

  it("is additive: no drops, deletes or truncations", () => {
    expect(MIGRATION).not.toMatch(/\bdrop table\b/i);
    expect(MIGRATION).not.toMatch(/\bdelete from\b/i);
    expect(MIGRATION).not.toMatch(/\btruncate\b/i);
  });
});
