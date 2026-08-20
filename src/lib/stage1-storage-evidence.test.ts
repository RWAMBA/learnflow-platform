/**
 * Phase 10 Stage 1 — rights-evidence storage hardening (structural, always-on).
 *
 * The executable proof runs against a disposable Supabase stack on the pull
 * request (scripts/run-storage-api-tests.mjs). This suite guarantees the
 * repository still declares the surface that proof asserts against, that the
 * server path is fail-closed, and that CI cannot pass by skipping it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_FILE = readdirSync("supabase/migrations").find((file) =>
  readFileSync(`supabase/migrations/${file}`, "utf8").includes("curriculum-rights-evidence"),
);
const MIGRATION = readFileSync(`supabase/migrations/${MIGRATION_FILE}`, "utf8");
const SERVER = readFileSync("src/lib/rights-evidence.server.ts", "utf8");
const FUNCTIONS = readFileSync("src/lib/rights-evidence.functions.ts", "utf8");
const SCHEMAS = readFileSync("src/lib/rights-evidence.schemas.ts", "utf8");
const RUNNER = readFileSync("scripts/run-storage-api-tests.mjs", "utf8");
const RESIDUE = readFileSync("scripts/rls/stage1-storage-api-residue-check.sql", "utf8");
const SQL_RESIDUE = readFileSync("scripts/rls/stage1-storage-residue-check.sql", "utf8");
const PANEL = readFileSync("src/features/curriculum/components/evidence-panel.tsx", "utf8");
const WORKFLOW = readFileSync(".github/workflows/rls-principal-tests.yml", "utf8");
const GATES = readFileSync(".github/workflows/pr-quality-gates.yml", "utf8");

describe("dedicated private evidence bucket", () => {
  it("is additive and never weakens the tenant resource policies", () => {
    expect(MIGRATION_FILE).toBeTruthy();
    expect(MIGRATION).not.toMatch(/DROP POLICY[^\n]*curriculum_resources_/);
    for (const policy of ["read", "insert", "update", "delete"]) {
      expect(MIGRATION).toContain(`rights_evidence_${policy}`);
    }
  });

  it("creates a private bucket with an explicit size and MIME allowlist", () => {
    expect(MIGRATION).toContain("'curriculum-rights-evidence'");
    expect(MIGRATION).toMatch(/public, file_size_limit, allowed_mime_types/);
    expect(MIGRATION).toContain("26214400");
    expect(MIGRATION).toContain("'application/pdf', 'image/png', 'image/jpeg', 'text/plain'");
  });

  it("restricts every evidence policy to an active platform administrator", () => {
    const clauses = MIGRATION.match(/app_private\.is_platform_admin\(\)/g) ?? [];
    expect(clauses.length).toBeGreaterThanOrEqual(4);
    expect(MIGRATION).toContain("app_private.is_rights_evidence_path(name)");
  });

  it("only accepts server-generated, non-enumerable object keys", () => {
    expect(MIGRATION).toContain("^rights-evidence/[0-9a-f]{8}");
    expect(MIGRATION).toContain("position('..' IN p_name) = 0");
    expect(MIGRATION).toContain("position('%2e' IN lower(p_name)) = 0");
  });

  it("validates size, MIME and extension and keeps the object path immutable", () => {
    expect(MIGRATION).toContain("is not on the allowlist");
    expect(MIGRATION).toContain("does not match MIME type");
    expect(MIGRATION).toContain("the stored object path is immutable");
  });

  it("audits every insert, change and deletion of evidence", () => {
    expect(MIGRATION).toContain("log_rights_evidence_change");
    expect(MIGRATION).toContain(
      "AFTER INSERT OR UPDATE OR DELETE ON public.rights_evidence_documents",
    );
    expect(MIGRATION).toContain("public.rights_audit_log");
  });

  it("grants no anonymous access to the evidence table", () => {
    expect(MIGRATION).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.rights_evidence_documents TO authenticated",
    );
    expect(MIGRATION).not.toMatch(/rights_evidence_documents TO anon/);
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
  });
});

describe("server-mediated evidence access is fail-closed", () => {
  it("requires authentication on every entry point", () => {
    const declarations = FUNCTIONS.match(/createServerFn/g) ?? [];
    const guards = FUNCTIONS.match(/requireSupabaseAuth/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(declarations.length);
  });

  it("re-verifies ACTIVE platform administrator status before privileged work", () => {
    expect(SERVER).toContain('.eq("status", "active")');
    expect(SERVER).toContain("Only active platform administrators may manage rights evidence");
    const asserts = SERVER.match(/await assertActivePlatformAdmin\(context\)/g) ?? [];
    expect(asserts.length).toBeGreaterThanOrEqual(5);
  });

  it("accepts an evidence identifier and resolves the path from the database", () => {
    expect(SERVER).toContain("evidenceIdSchema");
    expect(SERVER).toContain('.eq("id", input.evidenceId)');
    expect(SERVER).toContain("String(row.storage_path)");
  });

  it("issues only short-lived signed URLs", () => {
    expect(SCHEMAS).toContain("EVIDENCE_DOWNLOAD_URL_SECONDS = 120");
    expect(SCHEMAS).toContain("EVIDENCE_UPLOAD_URL_SECONDS = 300");
    expect(SERVER).toContain(
      "createSignedUrl(String(row.storage_path), EVIDENCE_DOWNLOAD_URL_SECONDS)",
    );
  });

  it("never leaks the object path or the service-role client to the browser", () => {
    expect(SERVER).toContain('await import("@/integrations/supabase/client.server")');
    expect(SERVER).toContain("Storage paths are platform-internal");
    expect(FUNCTIONS).not.toContain("client.server");
    expect(PANEL).not.toContain("storage_path");
    expect(PANEL).not.toContain("SERVICE_ROLE");
  });

  it("records signed-URL issuance in the immutable audit trail", () => {
    expect(SERVER).toContain("evidence_signed_url_issued");
    expect(SERVER).toContain('from("rights_audit_log")');
  });

  it("keeps the documented upload allowlist in one place", () => {
    for (const mime of ["application/pdf", "image/png", "image/jpeg", "text/plain"]) {
      expect(SCHEMAS).toContain(mime);
    }
    expect(SCHEMAS).toContain("EVIDENCE_MAX_BYTES = 26_214_400");
    expect(SCHEMAS).toContain("The filename must not contain a path");
  });
});

describe("real Storage HTTP API proof", () => {
  const mandated = [
    "active platform admin completes the evidence upload path",
    "active platform admin obtains a short-lived evidence signed URL",
    "the signed URL retrieves exactly the intended fixture",
    "a signed URL for one object cannot retrieve another object",
    "an expired signed URL fails",
    "organization admin uploads an allowed same-tenant resource",
    "evidence list denied",
    "evidence upload denied",
    "evidence download denied",
    "evidence signed-URL creation denied",
    "evidence update denied",
    "evidence delete denied",
    "revoked platform administrator",
    "authenticated non-platform user",
    "rights_audit_log UPDATE is rejected (append-only)",
    "rights_audit_log DELETE is rejected (append-only)",
    "cross-tenant resource download denied",
    "cross-tenant resource list denied",
    "cross-tenant resource upload denied",
    "cross-tenant resource update denied",
    "cross-tenant resource delete denied",
    "arbitrary object-path signing denied for a tenant admin",
    "traversal or non-allowlisted path denied",
    "restricted/expired rights never satisfy curriculum availability",
    "platform administrator cannot write a tenant learning resource",
  ];
  for (const label of mandated) {
    it(`asserts: ${label}`, () => {
      expect(RUNNER).toContain(label);
    });
  }

  it("uses real auth sessions and the real Storage API, not simulated claims", () => {
    expect(RUNNER).toContain("signInWithPassword");
    expect(RUNNER).toContain("createSignedUrl");
    expect(RUNNER).toContain("await fetch(");
    expect(RUNNER).not.toContain("SET LOCAL ROLE");
  });

  it("refuses hosted, pooled or production environments", () => {
    expect(RUNNER).toContain('RLS_DISPOSABLE_DB !== "1"');
    for (const host of ["supabase.co", "supabase.com", "supabase.in", "pooler."]) {
      expect(RUNNER).toContain(host);
    }
    expect(RUNNER).toContain("identifies a production environment");
  });

  it("fails rather than skips when CI requires it", () => {
    expect(RUNNER).toContain('STORAGE_API_REQUIRED === "1"');
    expect(RUNNER).toContain("but no disposable Storage environment is configured");
    expect(RUNNER).toContain("Storage service unavailable");
  });

  it("never prints a key, token or signed URL", () => {
    expect(RUNNER).not.toMatch(/console\.log\([^)]*(serviceKey|anonKey|signedUrl|token)/);
    expect(RUNNER).not.toMatch(/process\.env\.SUPABASE_TEST_SERVICE_ROLE_KEY[^\n]*console/);
  });

  it("cleans up and proves zero residue while retaining the schema bucket", () => {
    expect(RUNNER).toContain("cleanup complete");
    expect(RUNNER).toContain("admin.auth.admin.deleteUser");
    expect(RESIDUE).toContain("only the schema-defined evidence bucket may remain");
    expect(RESIDUE).toContain("storage-api-%@example.test");
    expect(SQL_RESIDUE).toContain("id <> 'curriculum-rights-evidence'");
  });

  it("registers every created auth fixture in one authoritative registry", () => {
    const creations = RUNNER.match(/await makeUser\(/g) ?? [];
    expect(creations.length).toBeGreaterThanOrEqual(9);
    // makeUser is the single creation path and registers immediately.
    const adminCreate = RUNNER.match(/admin\.auth\.admin\.createUser\(/g) ?? [];
    expect(adminCreate).toHaveLength(1);
    expect(RUNNER).toContain(
      "created.users.push({ label: tag, id: data.user.id, createdAt: data.user.created_at })",
    );
  });

  it("registers the revoked platform admin and the no-admin-row fixture", () => {
    expect(RUNNER).toContain('makeUser("platform-revoked")');
    expect(RUNNER).toContain('makeUser("non-platform")');
  });

  it("deletes auth fixtures after dependent rows, awaited and inspected", () => {
    const cleanup = RUNNER.slice(RUNNER.indexOf("async function cleanup()"));
    const rowsAt = cleanup.indexOf("DELETE FROM public.organization_memberships");
    const usersAt = cleanup.indexOf("await deleteAuthFixtures()");
    expect(rowsAt).toBeGreaterThan(-1);
    expect(usersAt).toBeGreaterThan(rowsAt);
    expect(RUNNER).toContain("const { error } = await admin.auth.admin.deleteUser(fixture.id");
  });

  it("treats a failed deletion as a test failure that cannot be ignored", () => {
    const fn = RUNNER.slice(RUNNER.indexOf("async function deleteAuthFixtures()"));
    expect(fn).toContain("AUTH FIXTURE DELETE FAILED");
    expect(fn).toContain("failures += 1");
    expect(fn).not.toContain("catch {}");
  });

  it("verifies fixture absence by UUID before completion", () => {
    const fn = RUNNER.slice(RUNNER.indexOf("async function deleteAuthFixtures()"));
    expect(fn).toContain("SELECT id FROM auth.users WHERE id IN (");
    expect(fn).toContain("AUTH FIXTURE RESIDUE");
    expect(fn).toContain("auth fixture absence verified by UUID");
    // Safe metadata only.
    expect(fn).not.toMatch(/fixture\.email|password|access_token/);
  });

  it("keeps the independent residue assertion on fixture auth users", () => {
    expect(RESIDUE).toContain("fixture auth user(s)");
    expect(RESIDUE).toContain("FROM auth.users WHERE email LIKE 'storage-api-%@example.test'");
  });


  it("uses only schema-approved platform administrator statuses", () => {
    expect(RUNNER).not.toContain("'suspended'");
    expect(RUNNER).toContain("'revoked'");
    for (const status of ["pending", "inactive", "disabled"]) {
      expect(RUNNER).not.toContain(`platform_admins (user_id, status) VALUES ('${status}'`);
    }
  });

  it("negatives fail the same helper production authorization uses", () => {
    // 'revoked' is not 'active', so app_private.is_platform_admin() is false,
    // and the second negative has no platform_admins row at all.
    expect(RUNNER).toContain("app_private.is_platform_admin()");
    expect(RUNNER).toContain("platform-revoked");
    expect(RUNNER).toContain("non-platform");
  });

  it("never mutates the append-only rights audit log during cleanup", () => {
    // The only mutation statements are the two deliberate rejection proofs.
    const mutations =
      RUNNER.match(/(DELETE\s+FROM|UPDATE|TRUNCATE)[^\n;]*rights_audit_log/gi) ?? [];
    expect(mutations).toHaveLength(2);
    expect(RUNNER).not.toMatch(/TRUNCATE[^\n;]*rights_audit_log/i);
    const cleanup = RUNNER.slice(RUNNER.indexOf("async function cleanup()"));
    expect(cleanup).not.toMatch(/(DELETE\s+FROM|UPDATE|TRUNCATE)[^\n;]*rights_audit_log/i);
    expect(RUNNER).not.toMatch(/DROP TRIGGER[^\n]*rights_audit/i);
    expect(RUNNER).not.toMatch(/ALTER TABLE[^\n]*DISABLE TRIGGER/i);
  });

  it("captures an audit baseline and publishes an exact retained-event manifest", () => {
    expect(RUNNER).toContain("auditBaselineIds");
    expect(RUNNER).toContain("auditDelta");
    expect(RUNNER).toContain("AUDIT_MANIFEST_PATH");
    expect(RESIDUE).toContain("expected_audit_events");
    expect(RESIDUE).toContain("unexpected (unmanifested) rights audit row(s)");
    expect(RESIDUE).toContain("append-only violated");
  });

  it("finalizes the manifest only after mutable fixture cleanup", () => {
    const cleanup = RUNNER.slice(RUNNER.indexOf("async function cleanup()"));
    const deleteAt = cleanup.indexOf("DELETE FROM public.rights_grants");
    const manifestAt = cleanup.indexOf("writeFileSync(AUDIT_MANIFEST_PATH");
    expect(deleteAt).toBeGreaterThan(-1);
    expect(manifestAt).toBeGreaterThan(deleteAt);
    expect(RUNNER).toContain("audit manifest finalized after cleanup");
  });

  it("semantically attributes every new audit row and fails closed otherwise", () => {
    expect(RUNNER).toContain("function attributeAuditRow");
    expect(RUNNER).toContain("expectedAuditEntities");
    expect(RUNNER).toContain("expectedAuditActors");
    expect(RUNNER).toContain("EXPECTED_AUDIT_ACTIONS");
    expect(RUNNER).toContain("UNATTRIBUTABLE AUDIT EVENT");
    // An unattributable row increments failures and is never manifested.
    expect(RUNNER).toContain("entity is not a fixture created by this run");
    expect(RUNNER).toContain("actor is not a fixture identity of this run");
  });

  it("validates cleanup-generated audit events for evidence and grant deletes", () => {
    const cleanup = RUNNER.slice(RUNNER.indexOf("async function cleanup()"));
    expect(cleanup).toContain("SELECT id FROM public.rights_evidence_documents;");
    expect(cleanup).toContain("SELECT id FROM public.rights_grants;");
    expect(cleanup).toContain("expectedAuditEntities.add(id)");
  });

  it("retains pre-existing migration-generated audit rows explicitly, not by exception", () => {
    expect(RUNNER).toContain("pre-existing (migration-generated) audit event");
    expect(RUNNER).toContain("audit baseline captured before fixtures");
    expect(RUNNER).toContain("const manifest = [...baseline, ...validated]");
    // Diagnostics stay to safe metadata: state payloads are never read.
    expect(RUNNER).not.toMatch(/SELECT[^;]*previous_state/i);
    expect(RUNNER).not.toMatch(/SELECT[^;]*new_state/i);
  });
  it("uses synthetic fixtures only", () => {
    expect(RUNNER).toContain("@example.test");
    expect(RUNNER).toContain("synthetic disposable evidence fixture");
  });
});

describe("CI executes the Storage API gate on pull requests", () => {
  for (const [name, workflow] of [
    ["principal workflow", WORKFLOW],
    ["quality gates", GATES],
  ] as const) {
    it(`${name} runs the API proof, signed-URL tests and residue proof`, () => {
      expect(workflow).toContain("scripts/run-storage-api-tests.mjs");
      expect(workflow).toContain("scripts/rls/stage1-storage-api-residue-check.sql");
      expect(workflow).toContain('STORAGE_API_REQUIRED: "1"');
      expect(workflow).toContain("storage/v1/version");
      expect(workflow).toMatch(/on:\s*\n\s*pull_request:/);
    });

    it(`${name} replays the full migration history first`, () => {
      expect(workflow).toContain("supabase migration up --db-url");
      expect(workflow).toContain("hosted Supabase endpoint detected");
    });

    it(`${name} tears down the disposable environment unconditionally`, () => {
      expect(workflow).toContain("supabase stop --no-backup");
      expect(workflow).toContain("unconditional teardown");
      expect(workflow).toContain('-v audit_ids="$(cat "$manifest")"');
    });
  }
});
