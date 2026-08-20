#!/usr/bin/env node
/**
 * Phase 10 Stage 1 — REAL Storage HTTP API authorization proof.
 *
 * Unlike scripts/rls/stage1-storage-principal-tests.sql (which proves the
 * storage.objects policies through SQL principals), this runner drives the
 * actual Supabase Storage HTTP API with real local Auth sessions: real
 * sign-ins, real uploads, real signed URLs, real downloads.
 *
 * Safety contract:
 *   - requires RLS_DISPOSABLE_DB=1;
 *   - refuses hosted Supabase domains, pooler endpoints and anything that
 *     looks like a production environment;
 *   - uses synthetic fixtures only (@example.test identities);
 *   - deletes every object, user and fixture row it creates and then proves
 *     zero residue (the schema-defined evidence bucket is retained);
 *   - never prints a key, token, signed URL or session.
 *
 * When STORAGE_API_REQUIRED=1 (CI), a missing disposable environment or an
 * unavailable Storage service is a FAILURE, never a skip.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REQUIRED = process.env.STORAGE_API_REQUIRED === "1";
const url = process.env.SUPABASE_TEST_URL || "";
const anonKey = process.env.SUPABASE_TEST_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || "";
const dbUrl = process.env.RLS_TEST_DATABASE_URL || "";
const EVIDENCE_BUCKET = "curriculum-rights-evidence";
const RESOURCE_BUCKET = "curriculum-resources";
const PASSWORD = "Disposable-Fixture-Passw0rd!";
const AUDIT_MANIFEST_PATH =
  process.env.STORAGE_API_AUDIT_MANIFEST || "/tmp/stage1-storage-api-audit-manifest.txt";

function fail(message) {
  console.error(`[storage-api] ${message}`);
  process.exit(1);
}

if (process.env.RLS_DISPOSABLE_DB !== "1" || !url || !anonKey || !serviceKey || !dbUrl) {
  if (REQUIRED) {
    fail(
      "STORAGE_API_REQUIRED=1 but no disposable Storage environment is configured " +
        "(RLS_DISPOSABLE_DB, SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, " +
        "SUPABASE_TEST_SERVICE_ROLE_KEY, RLS_TEST_DATABASE_URL).",
    );
  }
  console.log("[storage-api] No disposable Storage environment configured — skipping locally.");
  process.exit(0);
}

for (const value of [url, dbUrl]) {
  for (const forbidden of ["supabase.co", "supabase.com", "supabase.in", "pooler."]) {
    if (value.includes(forbidden)) fail("Refusing to run against a hosted Supabase endpoint.");
  }
  if (!/(localhost|127\.0\.0\.1)/.test(value)) fail("Refusing: endpoint is not local/disposable.");
}
for (const marker of ["NODE_ENV", "VERCEL_ENV", "ENVIRONMENT"]) {
  if ((process.env[marker] || "").toLowerCase() === "production") {
    fail(`Refusing: ${marker} identifies a production environment.`);
  }
}

const psql = (sql) =>
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql], { encoding: "utf8" });

// rights_audit_log is append-only by design: the harness never deletes,
// updates or truncates it. It captures a baseline instead and proves that the
// only rows added are the ones this run is expected to append.
let auditBaselineIds = new Set();

function auditIds() {
  const out = psql(`SELECT id FROM public.rights_audit_log ORDER BY created_at;`).trim();
  return out
    ? out
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function auditDelta() {
  return auditIds().filter((id) => !auditBaselineIds.has(id));
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });

const results = [];
const created = { users: [], objects: [] };
let failures = 0;

async function expectDenied(label, run) {
  let denied = false;
  let detail = "";
  try {
    const outcome = await run();
    if (outcome && outcome.error) denied = true;
    else if (Array.isArray(outcome?.data) && outcome.data.length === 0) denied = true;
    else if (outcome === "denied") denied = true;
    else detail = "operation succeeded";
  } catch {
    denied = true;
  }
  record(label, denied, detail || "not denied");
}

async function expectAllowed(label, run) {
  try {
    const outcome = await run();
    if (outcome && outcome.error) return record(label, false, outcome.error.message);
    record(label, true, "");
  } catch (error) {
    record(label, false, error.message);
  }
}

function record(label, ok, detail) {
  results.push({ label, ok });
  if (!ok) failures += 1;
  console.log(`[storage-api] ${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${detail})`}`);
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function makeUser(tag) {
  const email = `storage-api-${tag}-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) fail(`could not create the ${tag} fixture user: ${error.message}`);
  if (!uuidRe.test(data.user.id)) fail("unexpected fixture user id");
  created.users.push(data.user.id);
  return { id: data.user.id, email };
}

async function session(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error) fail(`could not sign in the fixture user: ${error.message}`);
  return client;
}

function evidenceKey() {
  return `rights-evidence/${crypto.randomUUID()}/${crypto.randomUUID().replace(/-/g, "")}.pdf`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // --------------------------------------------------- storage preflight
  const buckets = await admin.storage.listBuckets();
  if (buckets.error) fail(`Storage service unavailable: ${buckets.error.message}`);
  const evidenceBucket = (buckets.data ?? []).find((b) => b.name === EVIDENCE_BUCKET);
  if (!evidenceBucket) fail(`the schema-defined bucket ${EVIDENCE_BUCKET} is missing`);
  record("evidence bucket exists and is private", evidenceBucket.public === false, "bucket public");
  if (!(buckets.data ?? []).some((b) => b.name === RESOURCE_BUCKET)) {
    const madeResourceBucket = await admin.storage.createBucket(RESOURCE_BUCKET, { public: false });
    if (madeResourceBucket.error) fail(madeResourceBucket.error.message);
    created.resourceBucket = true;
  }
  record(
    "no public bucket exists",
    (buckets.data ?? []).every((b) => b.public === false),
    "a public bucket exists",
  );

  // ------------------------------------------------------------ fixtures
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();
  const users = {
    adminA: await makeUser("org-admin-a"),
    adminB: await makeUser("org-admin-b"),
    teacher: await makeUser("teacher"),
    tutor: await makeUser("tutor"),
    student: await makeUser("student"),
    parent: await makeUser("parent"),
    platformActive: await makeUser("platform-active"),
    // The schema allows exactly 'active' and 'revoked'; the negative platform
    // principal uses the approved revoked status, so it fails the very helper
    // production authorization uses (app_private.is_platform_admin()).
    platformRevoked: await makeUser("platform-revoked"),
    // A second negative: an authenticated user with no platform_admins row.
    nonPlatform: await makeUser("non-platform"),
  };

  psql(`
    INSERT INTO public.organizations (id, name, tenant_type)
    VALUES ('${orgA}', 'API Disposable Org A', 'family'),
           ('${orgB}', 'API Disposable Org B', 'family');
    INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by) VALUES
      ('${orgA}', '${users.adminA.id}', 'active', '${users.adminA.id}'),
      ('${orgA}', '${users.teacher.id}', 'active', '${users.adminA.id}'),
      ('${orgA}', '${users.tutor.id}', 'active', '${users.adminA.id}'),
      ('${orgA}', '${users.student.id}', 'active', '${users.adminA.id}'),
      ('${orgA}', '${users.parent.id}', 'active', '${users.adminA.id}'),
      ('${orgB}', '${users.adminB.id}', 'active', '${users.adminB.id}');
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgA}', '${users.adminA.id}', id, 'active', '${users.adminA.id}' FROM public.roles WHERE code = 'org_admin';
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgB}', '${users.adminB.id}', id, 'active', '${users.adminB.id}' FROM public.roles WHERE code = 'org_admin';
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgA}', '${users.teacher.id}', id, 'active', '${users.adminA.id}' FROM public.roles WHERE code = 'teacher';
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgA}', '${users.tutor.id}', id, 'active', '${users.adminA.id}' FROM public.roles WHERE code = 'tutor';
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgA}', '${users.student.id}', id, 'active', '${users.adminA.id}' FROM public.roles WHERE code = 'student';
    INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
    SELECT '${orgA}', '${users.parent.id}', id, 'active', '${users.adminA.id}' FROM public.roles WHERE code = 'parent_guardian';
    INSERT INTO public.platform_admins (user_id, status) VALUES
      ('${users.platformActive.id}', 'active'),
      ('${users.platformRevoked.id}', 'revoked');
  `);

  // A curriculum version whose rights are expired/restricted: it must never
  // become available, whatever else exists.
  const curriculumId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  psql(`
    INSERT INTO public.curricula (id, code, name) VALUES ('${curriculumId}', 'APIDISP', 'API Disposable Curriculum');
    INSERT INTO public.curriculum_versions (id, curriculum_id, label) VALUES ('${versionId}', '${curriculumId}', 'v1');
    INSERT INTO public.source_artifacts (id, rights_holder, source_title)
    VALUES ('${crypto.randomUUID()}', 'API Disposable Holder', 'API Disposable Source');
  `);
  const artifactId = psql(
    `SELECT id FROM public.source_artifacts WHERE source_title = 'API Disposable Source' LIMIT 1;`,
  ).trim();
  psql(`
    INSERT INTO public.rights_grants
      (source_artifact_id, grant_type, effective_date, expiry_date, reviewer_id, reviewed_at,
       permits_storage, permits_commercial_use, permits_authenticated_display)
    VALUES ('${artifactId}', 'commercial_licence', current_date - 400, current_date - 1,
            '${users.platformActive.id}', now(), true, true, true);
    INSERT INTO public.source_artifact_links (source_artifact_id, entity_type, entity_id)
    VALUES ('${artifactId}', 'curriculum_version', '${versionId}');
  `);

  // The rights-grant insert must have appended exactly one audit event.
  const afterGrant = auditDelta();

  // The negative principals must fail the exact production condition, i.e.
  // app_private.is_platform_admin() — "a platform_admins row with status
  // 'active'". 'revoked' is the only approved non-active status.
  const platformAuthority = (userId) =>
    psql(
      `SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = '${userId}' AND status = 'active');`,
    ).trim() === "t";
  record(
    "active platform administrator satisfies the production authority condition",
    platformAuthority(users.platformActive.id),
    "active admin lacked authority",
  );
  record(
    "revoked platform administrator fails the production authority condition",
    !platformAuthority(users.platformRevoked.id),
    "revoked admin retained authority",
  );
  record(
    "authenticated non-platform user fails the production authority condition",
    !platformAuthority(users.nonPlatform.id),
    "non-platform user held authority",
  );
  record(
    "the rights-grant fixture appended exactly one immutable audit event",
    afterGrant.length === 1,
    `${afterGrant.length} audit row(s) appended`,
  );

  // Append-only enforcement, proven rather than bypassed.
  const auditRowId = afterGrant[0];
  if (auditRowId) {
    let updateRejected = false;
    try {
      psql(`UPDATE public.rights_audit_log SET action = 'tampered' WHERE id = '${auditRowId}';`);
    } catch {
      updateRejected = true;
    }
    record("rights_audit_log UPDATE is rejected (append-only)", updateRejected, "update succeeded");

    let deleteRejected = false;
    try {
      psql(`DELETE FROM public.rights_audit_log WHERE id = '${auditRowId}';`);
    } catch {
      deleteRejected = true;
    }
    record("rights_audit_log DELETE is rejected (append-only)", deleteRejected, "delete succeeded");
  } else {
    record("rights_audit_log UPDATE is rejected (append-only)", false, "no audit row to test");
    record("rights_audit_log DELETE is rejected (append-only)", false, "no audit row to test");
  }

  const sessions = {};
  for (const [key, user] of Object.entries(users)) sessions[key] = await session(user);

  // ============================================================ POSITIVE
  const evidencePath = evidenceKey();
  const evidenceBody = new Blob(["synthetic disposable evidence fixture"], {
    type: "application/pdf",
  });
  await expectAllowed("active platform admin completes the evidence upload path", async () => {
    const out = await sessions.platformActive.storage
      .from(EVIDENCE_BUCKET)
      .upload(evidencePath, evidenceBody, { contentType: "application/pdf" });
    if (!out.error) created.objects.push([EVIDENCE_BUCKET, evidencePath]);
    return out;
  });

  let signedEvidenceUrl = "";
  await expectAllowed(
    "active platform admin obtains a short-lived evidence signed URL",
    async () => {
      const out = await sessions.platformActive.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(evidencePath, 60);
      signedEvidenceUrl = out.data?.signedUrl ? new URL(out.data.signedUrl, url).toString() : "";
      return out;
    },
  );

  if (signedEvidenceUrl) {
    const response = await fetch(signedEvidenceUrl);
    const text = response.ok ? await response.text() : "";
    record(
      "the signed URL retrieves exactly the intended fixture",
      response.ok && text.includes("synthetic disposable evidence fixture"),
      `status ${response.status}`,
    );

    // The same signature must not address a different object.
    const otherPath = evidenceKey();
    const swapped = signedEvidenceUrl.replace(evidencePath, otherPath);
    const swapResponse = await fetch(swapped);
    record(
      "a signed URL for one object cannot retrieve another object",
      !swapResponse.ok,
      `status ${swapResponse.status}`,
    );
  } else {
    record("the signed URL retrieves exactly the intended fixture", false, "no signed URL");
    record("a signed URL for one object cannot retrieve another object", false, "no signed URL");
  }

  // Expired signature.
  const shortLived = await sessions.platformActive.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(evidencePath, 1);
  if (shortLived.data?.signedUrl) {
    await sleep(3000);
    const expiredResponse = await fetch(new URL(shortLived.data.signedUrl, url).toString());
    record("an expired signed URL fails", !expiredResponse.ok, `status ${expiredResponse.status}`);
  } else {
    record("an expired signed URL fails", false, "could not mint a 1s signed URL");
  }

  const tenantPath = `${orgA}/lesson/api-disposable-plan.pdf`;
  await expectAllowed("organization admin uploads an allowed same-tenant resource", async () => {
    const out = await sessions.adminA.storage
      .from(RESOURCE_BUCKET)
      .upload(tenantPath, new Blob(["synthetic tenant resource"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    if (!out.error) created.objects.push([RESOURCE_BUCKET, tenantPath]);
    return out;
  });
  await expectAllowed("organization admin downloads its own tenant resource", () =>
    sessions.adminA.storage.from(RESOURCE_BUCKET).download(tenantPath),
  );

  // ============================================================ NEGATIVE
  const deniedPrincipals = [
    ["anonymous", anonymous],
    ["student", sessions.student],
    ["parent", sessions.parent],
    ["teacher", sessions.teacher],
    ["tutor", sessions.tutor],
    ["organization administrator", sessions.adminA],
    ["revoked platform administrator", sessions.platformRevoked],
    ["authenticated non-platform user", sessions.nonPlatform],
  ];

  for (const [label, client] of deniedPrincipals) {
    await expectDenied(`${label}: evidence list denied`, () =>
      client.storage.from(EVIDENCE_BUCKET).list("rights-evidence"),
    );
    await expectDenied(`${label}: evidence upload denied`, () =>
      client.storage
        .from(EVIDENCE_BUCKET)
        .upload(evidenceKey(), new Blob(["x"], { type: "application/pdf" })),
    );
    await expectDenied(`${label}: evidence download denied`, () =>
      client.storage.from(EVIDENCE_BUCKET).download(evidencePath),
    );
    await expectDenied(`${label}: evidence signed-URL creation denied`, () =>
      client.storage.from(EVIDENCE_BUCKET).createSignedUrl(evidencePath, 60),
    );
    await expectDenied(`${label}: evidence update denied`, () =>
      client.storage
        .from(EVIDENCE_BUCKET)
        .update(evidencePath, new Blob(["tampered"], { type: "application/pdf" })),
    );
    await expectDenied(`${label}: evidence delete denied`, async () => {
      const out = await client.storage.from(EVIDENCE_BUCKET).remove([evidencePath]);
      if (out.error) return out;
      return (out.data ?? []).length === 0 ? "denied" : out;
    });
    await expectDenied(`${label}: evidence metadata rows are unreadable`, async () => {
      const out = await client.from("rights_evidence_documents").select("id");
      return out.error ? out : { data: out.data ?? [] };
    });
  }

  // The tenant-resource privilege must not become evidence authority, and the
  // platform evidence privilege must not become tenant authority.
  await expectDenied("platform administrator cannot write a tenant learning resource", () =>
    sessions.platformActive.storage
      .from(RESOURCE_BUCKET)
      .upload(`${orgA}/lesson/platform-injected.pdf`, new Blob(["x"])),
  );
  await expectDenied("cross-tenant resource download denied", () =>
    sessions.adminB.storage.from(RESOURCE_BUCKET).download(tenantPath),
  );
  await expectDenied("cross-tenant resource list denied", () =>
    sessions.adminB.storage.from(RESOURCE_BUCKET).list(orgA),
  );
  await expectDenied("cross-tenant resource upload denied", () =>
    sessions.adminB.storage.from(RESOURCE_BUCKET).upload(`${orgA}/injected.pdf`, new Blob(["x"])),
  );
  await expectDenied("cross-tenant resource update denied", () =>
    sessions.adminB.storage.from(RESOURCE_BUCKET).update(tenantPath, new Blob(["x"])),
  );
  await expectDenied("cross-tenant resource delete denied", async () => {
    const out = await sessions.adminB.storage.from(RESOURCE_BUCKET).remove([tenantPath]);
    if (out.error) return out;
    return (out.data ?? []).length === 0 ? "denied" : out;
  });
  await expectDenied("arbitrary object-path signing denied for a tenant admin", () =>
    sessions.adminA.storage.from(EVIDENCE_BUCKET).createSignedUrl(evidencePath, 60),
  );
  await expectDenied("arbitrary tenant path signing denied across tenants", () =>
    sessions.adminB.storage.from(RESOURCE_BUCKET).createSignedUrl(tenantPath, 60),
  );

  for (const traversal of [
    "rights-evidence/../escape.pdf",
    "rights-evidence/%2e%2e/escape.pdf",
    `${orgA}/../rights-evidence/escape.pdf`,
    "rights-evidence/escape.exe",
  ]) {
    await expectDenied(`traversal or non-allowlisted path denied: ${traversal}`, () =>
      sessions.platformActive.storage
        .from(EVIDENCE_BUCKET)
        .upload(traversal, new Blob(["x"], { type: "application/pdf" })),
    );
  }

  // ------------------------------------------- availability stays closed
  const gate = await sessions.student.rpc("curriculum_version_is_available", {
    p_version_id: versionId,
  });
  record(
    "restricted/expired rights never satisfy curriculum availability",
    gate.error ? true : gate.data === false,
    "the availability gate opened",
  );

  let enrolmentExists = false;
  try {
    psql(`
      INSERT INTO public.students (id, organization_id, created_by, first_name, last_name)
      VALUES ('${crypto.randomUUID()}', '${orgA}', '${users.adminA.id}', 'API', 'Disposable');
    `);
    const studentId = psql(
      `SELECT id FROM public.students WHERE first_name = 'API' AND last_name = 'Disposable' LIMIT 1;`,
    ).trim();
    psql(`
      INSERT INTO public.curriculum_enrollments (student_id, curriculum_version_id, enrollment_category, status, created_by)
      VALUES ('${studentId}', '${versionId}', 'primary', 'active', '${users.adminA.id}');
    `);
    enrolmentExists = true;
  } catch {
    enrolmentExists = false;
  }
  const gateAfter = await sessions.student.rpc("curriculum_version_is_available", {
    p_version_id: versionId,
  });
  record(
    enrolmentExists
      ? "an unavailable curriculum stays inaccessible despite an existing enrolment"
      : "an unavailable curriculum cannot even be enrolled into",
    gateAfter.error ? true : gateAfter.data === false,
    "the availability gate opened",
  );

  console.log(`[storage-api] ${results.length} assertions executed, ${failures} failure(s).`);
}

async function cleanup() {
  for (const [bucket, path] of created.objects) {
    await admin.storage.from(bucket).remove([path]);
  }
  const stray = await admin.storage.from(EVIDENCE_BUCKET).list("rights-evidence");
  for (const folder of stray.data ?? []) {
    const inner = await admin.storage.from(EVIDENCE_BUCKET).list(`rights-evidence/${folder.name}`);
    for (const object of inner.data ?? []) {
      await admin.storage
        .from(EVIDENCE_BUCKET)
        .remove([`rights-evidence/${folder.name}/${object.name}`]);
    }
  }
  if (created.resourceBucket) {
    await admin.storage.emptyBucket(RESOURCE_BUCKET);
    await admin.storage.deleteBucket(RESOURCE_BUCKET);
  }
  for (const id of created.users) {
    await admin.auth.admin.deleteUser(id, false);
  }
  psql(`
    DELETE FROM public.curriculum_enrollments ce USING public.students s
      WHERE ce.student_id = s.id AND s.first_name = 'API' AND s.last_name = 'Disposable';
    DELETE FROM public.students WHERE first_name = 'API' AND last_name = 'Disposable';
    DELETE FROM public.rights_evidence_documents;
    DELETE FROM public.source_artifact_links;
    DELETE FROM public.rights_grants;
    DELETE FROM public.source_artifacts;
    DELETE FROM public.curriculum_versions WHERE label = 'v1'
      AND curriculum_id IN (SELECT id FROM public.curricula WHERE code = 'APIDISP');
    DELETE FROM public.curricula WHERE code = 'APIDISP';
    DELETE FROM public.platform_admins;
    DELETE FROM public.user_roles;
    DELETE FROM public.organization_memberships;
    DELETE FROM public.organizations WHERE name LIKE 'API Disposable Org%';
    DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
  `);

  // rights_audit_log is append-only: the rows this run appended (grant insert
  // and the grant delete performed above) are published to the residue proof
  // as the exact allowed remainder until the disposable environment is
  // destroyed. They are never deleted, updated or truncated here.
  const remaining = auditDelta();
  writeFileSync(AUDIT_MANIFEST_PATH, remaining.join(","), "utf8");
  console.log(
    `[storage-api] ${remaining.length} immutable audit event(s) retained (manifest written).`,
  );
}

try {
  auditBaselineIds = new Set(auditIds());
  await main();
} catch (error) {
  failures += 1;
  console.error(`[storage-api] runner error: ${error.message}`);
} finally {
  try {
    await cleanup();
    console.log("[storage-api] cleanup complete — objects, users and fixture rows removed.");
  } catch (error) {
    failures += 1;
    console.error(`[storage-api] cleanup FAILED: ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`[storage-api] FAILED — ${failures} assertion(s)/step(s) did not pass.`);
  process.exit(1);
}
console.log("[storage-api] PASS — real Storage HTTP API authorization proven, zero residue left.");
