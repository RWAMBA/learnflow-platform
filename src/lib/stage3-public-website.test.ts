/**
 * Stage 3 — Public Website: schema, lifecycle, RLS and privilege verification.
 *
 * No isolated Postgres is available here, so each database guarantee is
 * asserted structurally against the migration SQL that creates it. The
 * executable allow/deny proof under real principals lives in
 * scripts/rls/stage2-principal-tests.sql style runners and the disposable
 * database workflow.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "supabase/migrations";
const MIGRATIONS = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const STAGE3_FILES = MIGRATIONS.filter((file) =>
  readFileSync(`${DIR}/${file}`, "utf8").includes("public_site_audit_log"),
);
if (STAGE3_FILES.length === 0) throw new Error("the Stage 3 public website migration is missing");

const stripComments = (sql: string) => sql.replace(/^\s*--.*$/gm, "");
const SQL = STAGE3_FILES.map((f) => stripComments(readFileSync(`${DIR}/${f}`, "utf8"))).join("\n");

const TEN_ENTITIES = [
  "site_content",
  "guide_articles",
  "testimonials",
  "faqs",
  "merchandise_items",
  "public_inquiries",
  "instructor_application_details",
  "submission_throttle",
  "newsletter_subscriptions",
  "newsletter_consent_events",
] as const;

describe("Stage 3 — migration artifacts", () => {
  it("orders after every Stage 1 and Stage 2 migration", () => {
    const first = MIGRATIONS.indexOf(STAGE3_FILES[0]!);
    expect(first).toBeGreaterThan(0);
    expect(MIGRATIONS.slice(0, first).every((f) => f < STAGE3_FILES[0]!)).toBe(true);
  });

  it("is additive, forward-only and non-destructive", () => {
    for (const forbidden of [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bTRUNCATE\b/i,
      /\bALTER\s+DATABASE\b/i,
      /\bDELETE\s+FROM\s+storage\./i,
    ]) {
      expect(SQL).not.toMatch(forbidden);
    }
  });

  it("never creates tables in Supabase-reserved schemas", () => {
    for (const schema of ["auth.", "storage.", "realtime.", "vault.", "supabase_functions."]) {
      expect(SQL.includes(`CREATE TABLE ${schema}`)).toBe(false);
    }
  });

  it("creates all ten approved entities", () => {
    for (const table of TEN_ENTITIES) {
      expect(SQL).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\b`));
    }
  });

  it("enables row level security on every entity plus the audit log", () => {
    for (const table of [...TEN_ENTITIES, "public_site_audit_log"]) {
      expect(SQL).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"),
      );
    }
  });
});

describe("Stage 3 — deduplication index is timezone independent", () => {
  it("uses the fixed UTC truncation expression", () => {
    expect(SQL).toContain("date_trunc('hour', created_at AT TIME ZONE 'utc')");
  });

  it("never uses the prohibited mutable bare expression", () => {
    const bare = /date_trunc\('hour',\s*created_at\s*\)/g;
    expect(SQL.match(bare)).toBeNull();
  });

  it("applies the same UTC basis inside the duplicate lookup", () => {
    expect(SQL).toContain("date_trunc('hour', i.created_at AT TIME ZONE 'utc')");
    expect(SQL).toContain("date_trunc('hour', now() AT TIME ZONE 'utc')");
  });
});

describe("Stage 3 — content lifecycle and immutability", () => {
  it("forces new content to start as draft", () => {
    expect(SQL).toContain("public content must be created as draft");
  });

  it("permits only the approved status transitions", () => {
    expect(SQL).toMatch(/OLD\.status = 'draft'\s+AND NEW\.status IN \('published','archived'\)/);
    expect(SQL).toMatch(/OLD\.status = 'published' AND NEW\.status IN \('draft','archived'\)/);
    expect(SQL).toMatch(/OLD\.status = 'archived'\s+AND NEW\.status = 'draft'/);
  });

  it("detects a stale writer through optimistic content_version", () => {
    expect(SQL).toContain("CONFLICT: content_version mismatch");
    expect(SQL).toContain("USING ERRCODE = '40001'");
    expect(SQL).toContain("NEW.content_version := OLD.content_version + 1");
  });

  it("preserves creation attribution across updates", () => {
    expect(SQL).toContain("NEW.created_at := OLD.created_at");
    expect(SQL).toContain("NEW.created_by := OLD.created_by");
  });

  it("rejects hard deletes on published content and submissions", () => {
    expect(SQL).toContain("app_private.reject_hard_delete()");
    // CMS tables receive the guard through one generated loop; submission
    // tables declare it literally.
    expect(SQL).toContain("t || '_no_delete'");
    for (const trigger of [
      "public_inquiries_no_delete",
      "instructor_applications_no_delete",
      "newsletter_subscriptions_no_delete",
    ]) {
      expect(SQL).toContain(trigger);
    }
  });

  it("keeps consent evidence and the site audit log append-only", () => {
    expect(SQL).toContain("reject_newsletter_consent_mutation");
    expect(SQL).toContain("reject_public_site_audit_mutation");
  });
});

describe("Stage 3 — RLS exposure", () => {
  it("lets anonymous readers see published rows only", () => {
    expect(SQL).toContain("FOR SELECT TO anon USING (status = 'published')");
  });

  it("gives signed-in users published rows or full platform-admin visibility", () => {
    expect(SQL).toContain(
      "FOR SELECT TO authenticated USING (status = 'published' OR app_private.is_platform_admin())",
    );
  });

  it("restricts every content write to a platform administrator", () => {
    expect(SQL).toContain(
      "FOR INSERT TO authenticated WITH CHECK (app_private.is_platform_admin())",
    );
    expect(SQL).toContain(
      "FOR UPDATE TO authenticated USING (app_private.is_platform_admin()) WITH CHECK (app_private.is_platform_admin())",
    );
  });

  it("grants anonymous readers no access at all to private submissions", () => {
    for (const table of [
      "public_inquiries",
      "instructor_application_details",
      "newsletter_subscriptions",
      "newsletter_consent_events",
      "submission_throttle",
    ]) {
      expect(SQL).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table}[^;]*TO anon`, "i"));
      expect(SQL).not.toMatch(
        new RegExp(`CREATE POLICY[^;]*ON public\\.${table}[^;]*TO anon`, "is"),
      );
    }
  });

  it("scopes private submission reads to platform administrators", () => {
    expect(SQL).toContain("public_inquiries_admin_read");
    expect(SQL).toContain("instructor_applications_admin_read");
    expect(SQL).toContain("newsletter_admin_read");
    expect(SQL).toContain("newsletter_consent_admin_read");
  });
});

describe("Stage 3 — function security", () => {
  it("pins search_path on every function it defines", () => {
    const definitions = SQL.match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$\$/g) ?? [];
    expect(definitions.length).toBeGreaterThan(5);
    for (const definition of definitions) {
      expect(definition).toMatch(/SET search_path = ''/);
    }
  });

  it("revokes public execution before granting the minimum", () => {
    const revokes = SQL.match(/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC/g) ?? [];
    expect(revokes.length).toBeGreaterThan(5);
  });

  it("exposes public wrappers only to the server role", () => {
    for (const fn of [
      "public.submit_public_inquiry",
      "public.request_newsletter_subscription",
      "public.confirm_newsletter_subscription",
      "public.withdraw_newsletter_subscription",
      "public.consume_rate_limit",
    ]) {
      expect(SQL).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn.replace(".", "\\.")}[^;]*TO service_role`));
      expect(SQL).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn.replace(".", "\\.")}[^;]*TO anon`));
    }
  });

  it("keeps privileged internals inside app_private", () => {
    expect(SQL).toMatch(/CREATE (OR REPLACE )?FUNCTION app_private\./);
    expect(SQL).not.toMatch(/GRANT EXECUTE ON FUNCTION app_private\.[^;]*TO anon/);
  });
});

describe("Stage 3 — retention and rate limiting", () => {
  it("stores only a hashed network identifier", () => {
    expect(SQL).toMatch(/ip_hash/);
    expect(SQL).not.toMatch(/\bip_address\b/);
  });

  it("closes and de-identifies expired submissions instead of deleting evidence", () => {
    expect(SQL).toContain("purge_expired_public_submissions");
    expect(SQL).toContain("retention expired");
  });

  it("enforces rate limits atomically in the database", () => {
    expect(SQL).toContain("consume_rate_limit");
    expect(SQL).toContain("submission_throttle");
  });
});

describe("Stage 3 — private recruitment storage", () => {
  it("gates instructor documents on platform-administrator authority", () => {
    expect(SQL).toContain("instructor_applications_platform_admin_read");
    expect(SQL).toContain("instructor-applications");
  });

  it("never writes to storage.buckets from SQL", () => {
    expect(SQL).not.toMatch(/INSERT INTO storage\.buckets/i);
    expect(SQL).not.toMatch(/UPDATE storage\.buckets/i);
  });
});
