# LearnFlow — Master Continuation Brief

Verified final state of the security-hardening block on branch
`security/authentication-hardening`. `main` is untouched; nothing in this block
has been merged into it.

## 1. Authoritative state

- Stack: TanStack Start + React 19 + TypeScript + Vite + Supabase. **Not** Next.js.
  Routing is TanStack Router file routes under `src/routes`; server logic is
  `createServerFn` plus server routes.
- Supabase project: `smvlwwevgtwkdndxfmtp`.
- RLS is the authoritative security boundary. UI checks are visibility only.
- `MFA_ENFORCEMENT_ENABLED = false` in `src/features/security/mfa.ts`.
- Stage-two AAL2 RLS enforcement is **prepared but unapplied**
  (`docs/sec-006-stage-two-enforcement.sql`). It is not in
  `supabase/migrations/` and no migration, database, Auth setting, MFA factor or
  administrator record was changed while producing this brief.
- Live migration history through `20260815110738`. No historical migration was
  edited and no unrelated migration is pending.
- Administrator readiness (aggregates only): **2** active Platform
  Administrators, both with a verified TOTP factor; **1** active Organization
  Administrator, with a verified TOTP factor; **0** Organization Administrators
  pending enrollment.

## 2. Closed security findings (must not regress)

SEC-001 self-assigned privileged roles; SEC-002 self-reactivated suspended
memberships; SEC-003 org-role helpers require active membership; SEC-004
published tenant content stays tenant-isolated; SEC-005 Teacher/Tutor
curriculum-authoring authority removed; SEC-006 stage one (TOTP MFA surface,
recovery-session safety, factor-removal challenge, administrator-assisted
reset, least-privilege ACLs on `organization_security_settings`,
`security_events` and `platform_admins`).

## 3. Delivered in the final blocker-remediation block

### Formatting and lint

Changed-file Prettier drift is resolved. The remaining repository-wide drift
came from two generated files (`src/integrations/supabase/types.ts`,
`src/routeTree.gen.ts`), which are never hand-edited and are now excluded in
`.prettierignore` and `eslint.config.js`, plus four MCP route files that were
reformatted. Repository-wide `bun run lint` now reports **0 errors and seven
pre-existing react-refresh warnings** (components exporting both a component and a
non-component value); these predate the security block and are warnings, not
errors.

### E2E environment preflight

`e2e/env-preflight.spec.ts` was failing because `EnvPreflightBanner` had moved
from a `useServerFn` call to a plain `fetch("/api/env-preflight")` that the
harness never intercepted. The spec and `e2e/harness/react-start-mock.ts` now
intercept the API route. Result: **5/5 E2E specs pass**. No production preflight
behaviour was weakened and no secret value is exposed — only variable names and
presence are reported.

### CSP and framing

- `src/lib/csp.ts` builds the policy: `default-src 'self'`, `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`, nonce-based `script-src`
  (`'self' 'nonce-…' 'strict-dynamic'`) and `style-src`.
- A per-response nonce is minted with `crypto.getRandomValues` in
  `src/lib/csp-ssr.ts` and threaded through `router.options.ssr.nonce`
  (`src/router.tsx`, `createIsomorphicFn`), so both TanStack Start inline
  hydration scripts carry the matching nonce. The nonce never reaches the
  client bundle as a constant.
- **Production framing:** `frame-ancestors 'none'` plus
  `X-Frame-Options: DENY`.
- **Preview framing:** hosts matching `lovable.app` / `lovableproject.com` get a
  policy that permits framing so the editor preview keeps working. This is the
  only intentional difference between the two environments.
- **Known limitation:** `style-src-attr` still requires `'unsafe-inline'`
  because shadcn/Radix components set inline `style` attributes at runtime;
  element-level `style-src` remains nonce-based. Removing this needs a UI-level
  change and is deliberately out of scope for the security block.

### CSRF and origin validation

`src/lib/origin-policy.ts` decides which requests require `Origin` validation;
`src/start.ts` applies `csrfMiddleware` to all state-changing server-function
and server-route requests. **Exempt paths (external callers only):** `/mcp`,
`/.mcp/`, `/.well-known/`, and `/api/public/`. Exemption matching is
segment-bounded — a fixed bug previously let `/mcp-admin-console` inherit the
`/mcp` exemption.

### Stage-two SQL rewrite

`docs/sec-006-stage-two-enforcement.sql` was rewritten:

- All stale hard-coded administrator counts removed. Section 0 provides
  read-only, aggregate-only prerequisite queries; section 1 re-asserts them
  transactionally and **fails closed** with `raise exception` if Platform
  Administrator readiness is not met. No identity is ever selected.
- Teacher/Tutor: no in-scope RLS write policy authorizes Teacher or Tutor
  (`can_author_curriculum` is Organization Administrator only, per SEC-005), so
  the drafted `org_requires_mfa()` / `org_mfa_satisfied()` helpers were
  **removed** rather than shipped unused. The requirement to add authoritative
  conditional enforcement alongside any future Teacher/Tutor write surface is
  documented, and the guard fails closed if such a surface appears first. The
  implemented role-aware route guard is preserved.
- A complete, executable rollback transaction restores every original policy
  predicate, revokes the `organization_security_settings` write grants and
  drops the drafted helpers. No placeholders, no DML.
- SEC-001–SEC-005 predicates, open-enrollment/self-service branches,
  Parent/Guardian and Student branches, tenant isolation, mixed
  platform/tenant ownership and unconditional Platform/Organization
  Administrator AAL2 are all preserved verbatim.

Integrity hashes (SHA-256, recompute command in
`docs/sec-006-aal2-enforcement.md`):

| Artifact      | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| Forward SQL   | `c5174cd9c1458266210ad1212873257c587f276f302f9ed59a1fbfaecfab70be` |
| Rollback SQL  | `05fed47231c8c332497f5eeb2f96cef7eb3f6462a42ae4fdf4278e958a80bc86` |
| Full document | `9be38a67e95a9a32a1adbf11dd14f59243284633130481ed6622afb0d25d67d2` |

The SQL becomes a timestamped migration only after Claude review, independent
security/release approval, the security code being merged and deployed from
`main`, and a final administrator-readiness preflight.

### Dependency audit

Root cause of the earlier HTTP 404: the sandbox sets `NPM_CONFIG_REGISTRY` to a
proxy registry that does not implement the npm bulk-advisory endpoint. Using
existing package-manager capability only (no new packages, no dependency
changes), the audit was re-run against the public registry:

```
NPM_CONFIG_REGISTRY=https://registry.npmjs.org BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun audit
```

Bun 1.3.3. The pre-remediation audit returned **6 advisories (5 high, 1 low)**,
all transitive. Every one has now been remediated with package-manager
`overrides` in `package.json` — the smallest safe remediation, since each
advisory was a transitive dependency with exactly one installed version and a
patch-level fix accepted by every parent range. No direct dependency was
upgraded, no major upgrade was required, no package was added or removed.

| Package         | Before | After  | Fixed at | Severity | Advisory                                 | Class      | Path                                                                 |
| --------------- | ------ | ------ | -------- | -------- | ---------------------------------------- | ---------- | -------------------------------------------------------------------- |
| brace-expansion | 1.1.16 | 1.1.18 | 1.1.17   | high     | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | lint       | eslint → @eslint/eslintrc → minimatch; typescript-eslint → minimatch |
| nanoid          | 3.3.16 | 3.3.18 | 3.3.18   | high     | GHSA-2v37-7h3g-55p8                      | build      | vite → postcss                                                       |
| js-yaml         | 4.3.0  | 4.3.1  | 4.3.1    | high     | GHSA-5p4m-2wfm-xmqj                      | build/lint | eslint → @eslint/eslintrc; @tanstack/react-start → xmlbuilder2       |
| esbuild         | 0.27.7 | 0.28.2 | 0.28.1   | low      | GHSA-g7r4-m6w7-qqqr                      | build      | vite; @tanstack/router-plugin → unplugin; @lovable.dev/mcp-js        |

Overrides added to `package.json`:
`brace-expansion: ^1.1.17`, `nanoid: ^3.3.18`, `js-yaml: ^4.3.1`,
`esbuild: ^0.28.1`. Each override stays inside the semver range every parent
declares (all four are patch/minor bumps within the parents' existing major),
so no parent range was violated. `bun.lock` was updated by `bun install` and
is a lockfile-only change (5 packages replaced).

Post-remediation audit result: **No vulnerabilities found** — zero critical,
zero high, zero moderate, zero low. Compatibility was proven by the full
regression suite (typecheck, 164 unit tests, RLS, 5 E2E, lint, production
build) re-run after the overrides were applied.

## 3a. MCP (agent-integration) surface

The app exposes a Model Context Protocol server so Lovable/agent clients can
read LearnFlow data **as the signed-in user**. Full review evidence lives in
`docs/final-security-handoff-report.md` §2.

- Routes: `/mcp` (Streamable HTTP transport), `/.mcp/list-tools`,
  `/.mcp/invoke-tool/$tool`, `/.well-known/oauth-protected-resource`, plus the
  `/.lovable/oauth/consent` screen. All transport routes are generated verbatim
  by the `@lovable.dev/mcp-js` Vite plugin from `src/lib/mcp/index.ts` and are
  excluded from Prettier/ESLint because they are regenerated on every build.
- Auth: OAuth 2.1 bearer tokens issued by the project's Supabase issuer,
  `acceptedAudiences: "authenticated"`. No anonymous mode, no shared key, no
  bypass. Handlers additionally re-check `ctx.isAuthenticated()`.
- Data access: `supabaseForUser` builds a **publishable-key** client that
  forwards the caller's verified token, with `persistSession: false`. No MCP
  file imports a service-role client or logs anything. **RLS is the
  authoritative boundary.**
- Tools (all read-only, `.select()` only, no `rpc`, no writes): `whoami`,
  `list_students`, `list_assignments`, `search_curriculum`. Inputs are Zod
  validated with bounded limits (100/100/50) and uuid/enum constraints; tenant
  and student ids are _narrowing filters only_ and cannot widen RLS. `whoami`
  identity comes solely from the verified token. Errors return `error.message`
  only.
- CSRF: `/.mcp` was missing from the origin-exemption list and is now included
  (`src/lib/origin-policy.ts`), matched on whole path segments so
  `/mcp-admin-console` and `/.mcpx/...` stay origin-validated. Exemption is safe
  only because these endpoints verify a bearer token themselves.
- Tests: `src/lib/mcp-surface.test.ts` (25 tests) pins auth requirement, token
  handling, secret absence, input bounds, spoofed-identifier behaviour,
  read-only usage and origin exemptions.

## 3b. Exact rollback verification (stage two)

`docs/sec-006-prestage-two-policy-baseline.json` captures pre-stage-two policy
definitions from the live catalog; `src/lib/sql-predicate-normalize.ts`
normalises SQL predicates for machine comparison; and
`src/lib/sec006-rollback-parity.test.ts` (36 tests) proves the rollback
transaction restores each original predicate losslessly, removes every
`has_aal2()` term, preserves self-service branches and contains no destructive
DML.

## 4. Verification results

- `bunx tsgo --noEmit`: clean.
- `bun run test`: **225/225 tests pass** across 17 files, including the 25-test
  MCP surface suite and the 36-test stage-two rollback parity suite.
- `bun run test:rls`: RLS recursion check passes; live allow/deny testing
  against the hosted database is **skipped by design** in this block, because it
  would require authenticated write attempts as real principals.
- `bun run test:e2e`: 5/5.
- `bun run lint`: **0 errors**, 7 pre-existing react-refresh warnings. The
  plugin-generated MCP route files are now excluded in `.prettierignore` and
  `eslint.config.js`, since the build regenerates them verbatim.
- `bun audit` against `registry.npmjs.org`: **no vulnerabilities found**.
- `bun run build`: succeeds; no server-only module or service-role key appears
  in client assets.
- Header verification: production responses carry `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, nonce-matched CSP, `nosniff`,
  `strict-origin-when-cross-origin`, restrictive `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, HSTS on https, and `no-store` on
  `/account`, `/admin`, `/dashboard`, `/mfa`, `/reset-password`, `/auth`,
  `/api`, `/_serverFn`. Preview responses are identical except that framing is
  permitted for Lovable preview hosts.

## 5. Known open gaps (not invented, not silently closed)

- **Stage-two enforcement is unapplied** and `MFA_ENFORCEMENT_ENABLED` is
  `false`.
- **Storage**: only `curriculum-resources` exists. An `assignment-submissions`
  bucket and its ownership policies are unimplemented; the submission ownership
  model must be agreed first (Phase 10 Stage 2).
- **Leaked-password protection** remains disabled in Supabase Auth — dashboard
  toggle, not settable from a migration.
- **`style-src-attr 'unsafe-inline'`** as described above.
- **Auth page hydration mismatch** on `/routes/auth.tsx` — cosmetic, unresolved.
- **Live RLS allow/deny testing** against the hosted database has not been run;
  the stage-two SQL tests are structural, not live allow/deny execution.
- **Student session duration** remains an unresolved operational setting: no
  approved duration exists, and none was invented.
- **Rate limiting**: server-persisted password-change lockout is implemented;
  all other rate limiting, CAPTCHA and provider controls are hosted Supabase
  Auth dashboard settings and remain manual. Anonymous public-form abuse
  controls ship with Public Website / Community.

## 6. Manual and review requirements

- Reviewer/user: manual runtime verification (MFA enrollment, challenge,
  recovery, lockout, keyboard navigation, 360px layout) and all Supabase
  dashboard settings including leaked-password protection and TOTP enablement.
- Claude review inputs: this brief; `docs/final-security-handoff-report.md`
  (evidence appendix, MCP review, rollback parity, integrity hashes);
  `docs/sec-006-stage-two-enforcement.sql` (with the three SHA-256 values);
  `docs/sec-006-aal2-enforcement.md`; `src/lib/csp.ts`, `src/lib/csp-ssr.ts`,
  `src/lib/security-headers.ts`, `src/lib/origin-policy.ts`, `src/start.ts`,
  `src/server.ts`, `src/router.tsx`; `src/features/security/mfa.ts`,
  `src/lib/mfa-policy.server.ts`, `src/routes/_authenticated/route.tsx`; and the
  test suites `src/lib/sec006-stage-two-migration.test.ts`,
  `src/lib/csp.test.ts`, `src/lib/security-headers.test.ts`,
  `src/lib/organization-security-settings-acl.test.ts`,
  `src/lib/security-tables-acl.test.ts`, `src/lib/sec006-rollback-parity.test.ts`,
  `src/lib/mcp-surface.test.ts`, `e2e/env-preflight.spec.ts`; and the MCP
  surface `src/lib/mcp/index.ts`, `src/lib/mcp/supabase.ts`,
  `src/lib/mcp/tools/*.ts`.

## 7. Responsibilities and main protection

- **Lovable**: implementation, migrations, tests, evidence packages.
- **Claude**: architecture and security review of each block before it may reach
  `main` or before any enforcement flag is activated.
- `main` is never edited or merged into by the agent. Work lands on a controlled
  security or feature branch, is reviewed, then merged by the user.

## 8. Architecture invariants carried forward

- Phase 1–9 decisions stand: explicit parent/teacher/tutor–student relationship
  tables, separate `user_roles`, `platform_admins` distinct from tenant roles,
  append-only `audit_logs` and server-only `security_events`.
- Phase 10A–10L extended architecture is approved scope.
- Universal Curriculum Engine hierarchy: Curriculum Provider → Curriculum →
  Curriculum Version → Education Stage → Academic Level → optional Track →
  Subject → recursive Curriculum Node → Learning Objective.
- Migrations are additive-first: add → backfill → validate → switch reads →
  switch writes → observe → deprecate → remove in a later verified migration.
- Security travels with each stage: RLS before UI exposure, tenant isolation,
  ownership integrity, private instructor documents, server-mediated uploads,
  abuse protection on anonymous writes, fixed-precision money with currency.
- Deferred (V2/V3/V4): native mobile apps, AI tutor and AI quiz generation,
  marketplace, public API, white-label deployments.

## 8a. Phase 10 Stage 1A/1B state (branch `repair/phase10-stage1b-controlled-reconciliation`)

Baseline `c07227925b639d1182e008f6e268bd00f37977ac`; `origin/main` unchanged at
the same commit. Applied migrations:

| Migration        | Content                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260816092346` | Stage 1A foundation: `curriculum_providers`, `curriculum_versions`, `education_stages`, `subject_groups`, additive columns, version lifecycle enforcement.                                       |
| `20260816135844` | Stage 1A reference mappings: 4 providers, CBC attributed to KICD, CBC `Baseline` version, 4 education stages, Grades 7–10 mapped, 5 subject groups.                                              |
| `20260816140135` | Stage 1B content spine: recursive `curriculum_nodes`, `learning_resources`, compatibility columns on `lessons`/`learning_objectives`/`assessments`, legacy backfill with parity post-conditions. |
| `20260816145744` | Stage 1B controlled-reconciliation repair (this block).                                                                                                                                          |
| `20260816163607` | Stage 1B repair 2: authoritative depth limit **32** restored, `published_at` made database-authoritative, strict lifecycle re-asserted.                                                          |

### Stage 1B repair 2 — platform migration reconciliation (applied)

| Item                        | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Reviewed hand-authored file | `20260816171500_phase10_stage1b_depth32_published_at.sql`          |
| Reviewed SHA-256            | `f9b5162e2661a71a421918597bcaf8358626096b9b66abd7aa45ea22d0ee5e8e` |
| Generated version           | `20260816163607`                                                   |
| Generated filename          | `20260816163607_a7813b14-5998-42b2-bcb1-491e1ffe49e5.sql`          |
| Generated SHA-256           | `96ede51168362687167a7b265d36a36f6adde92fbc0381443385ae6dfb104112` |
| Application status          | Applied successfully, exactly once                                 |

**Equivalence result:** the unified diff between the reviewed and generated
files contains a single hunk whose only difference is the absence of the
terminal line feed after the final `COMMIT;` (12 006 vs 12 005 bytes). With
that one terminal newline normalised the files are byte-identical. No
statement, comment, identifier, predicate, constant, function body,
grant/revoke or transaction boundary differs, and no platform SQL was added.
The reviewed hand-authored file was removed only after this equivalence was
proven; the generated artifact is retained unchanged and the Stage 1B test
suite now references it.

**Remote migration history** — before: `…20260816092346, 20260816135844,
20260816140135, 20260816145744`; after: the same list plus `20260816163607`
(26 recorded versions, generated version present exactly once, no other
migration added).

**Live post-application verification (read-only, aggregate-only):**
`app_private.enforce_curriculum_node_acyclic()` contains
`v_max_depth constant int := 32` and no longer contains
`v_max_depth constant int := 8`; ancestor and descendant checks share that one
constant; descendant traversal keeps the reviewed path-array cycle protection
and the `v_max_depth + 1` bound. Both lifecycle functions force non-published
inserts to `published_at = NULL`, set `now()` on insert-as-published and on the
transition to published, and preserve the value on archival. All three
functions are `SECURITY INVOKER` with `search_path = ''` and are not executable
by `PUBLIC`, `anon` or `authenticated`. Triggers:
`curriculum_nodes_enforce_acyclic` (BEFORE INSERT OR UPDATE OF
`parent_node_id`, `subject_id`), `curriculum_nodes_enforce_lifecycle` and
`learning_resources_enforce_lifecycle` (BEFORE INSERT OR UPDATE OR DELETE).
Aggregates unchanged: curriculum_nodes 0, learning_resources 0, providers 4,
curriculum versions 1, education stages 4, subject groups 5, lessons 30,
tenant-owned nodes 0, legacy-link conflicts 0. No synthetic rows were created
at any point. `MFA_ENFORCEMENT_ENABLED` remains `false`, zero live policies
reference `app_private.has_aal2()`, and SEC-006 stage two remains unapplied.
RLS remains verified **structurally only**; live-principal allow/deny testing
stays SKIPPED because no rollback-only authenticated test channel exists and no
permanent principals may be created.

Auth note: the Supabase linter continues to report **Leaked Password
Protection Disabled**. That is a pre-existing Auth dashboard setting; this
authorization explicitly forbids Auth configuration changes, so it was not
altered.

The repair migration is forward-only and additive; neither applied migration
was edited:

- **Platform-only hierarchy ownership** — validated
  `curriculum_nodes_platform_owned_chk` guarantees
  `authoring_organization_id IS NULL`, so curriculum structure can never become
  tenant-attributed. SEC-004/SEC-005 predicates are untouched; tenant-owned
  content remains confined to `learning_resources`/`lessons`.
- **Subtree depth and cycle enforcement** —
  `app_private.enforce_curriculum_node_acyclic()` validates the moved node's
  _descendants_, not only its ancestors: a recursive subtree probe enforces the
  bounded **maximum effective depth of 32** (proposed ancestor depth plus the
  deepest descendant-relative depth; level 32 accepted, level 33 rejected),
  rejects cycles, and rejects cross-subject subtrees on a subject move.
  The depth-8 limit shipped by `20260816145744` was a defect and is
  **superseded** by the applied migration `20260816163607`, whose descendant
  traversal is cycle-safe (path-array detection) and bounded only at
  `v_max_depth + 1`. Ancestor and descendant validation share one constant.
  The authoritative value 32 originates in `20260816140135` and the Stage 1B
  test suite derives it from that external source rather than from the
  correction under test.
- **Lifecycle immutability** — new
  `app_private.enforce_curriculum_node_lifecycle()` and
  `app_private.enforce_learning_resource_lifecycle()` triggers enforce
  draft → review → published → archived; published rows may only be archived
  (status-only, all content columns immutable), archived rows are frozen,
  published/archived rows cannot be deleted, and `published_at` is set by the
  database. All three helpers are revoked from `anon`/`authenticated`/`PUBLIC`.
- **Stage 1B lifecycle release decision (explicit)** — for `curriculum_nodes`
  and `learning_resources` the strict lifecycle
  draft → review → published → archived is retained: `draft → archived` and
  `review → archived` are rejected, `published → archived` is permitted only as
  a status-only archival transition, archived rows are frozen, and
  published/archived rows cannot be deleted. `curriculum_versions` keeps its
  previously approved, **different** archival behaviour; it is deliberately not
  modified in this repair and **curriculum_versions lifecycle normalization
  remains deferred** to a later lifecycle-normalization review item. The rules
  are not identical across the three tables.
- **`published_at` is database-authoritative** — migration `20260816163607`
  sets `published_at := now()` unconditionally on the transition to published
  (and on insert-as-published), discards any client-supplied past or future
  timestamp, and preserves `OLD.published_at` on every other transition
  including archival, so publication time can never be rewritten. The lifecycle
  triggers therefore also fire `BEFORE INSERT`.
- **Lesson backfill gap closure** — lessons linked only through a legacy
  `learning_outcome_id` inherit the node of the matching objective
  (`legacy_outcome_id` join). A transactional post-condition fails closed if any
  lesson retains a legacy link without a curriculum node. Live result: 30
  lessons, 0 unmapped, 0 tenant-owned nodes.
  The mapping is **precedence-based, not conflict-rejection-based**: sub-strand
  wins, then topic, then learning outcome; a lesson carrying several legacy
  links is resolved by that order rather than rejected. Aggregate-only live
  verification at this repair: **0** lessons whose non-null legacy paths resolve
  to different curriculum nodes (sub-strand vs topic: 0; sub-strand vs outcome:
  0), so precedence is currently unexercised by real data.
- **Legacy tables preserved** — `strands`, `sub_strands`, `topics`,
  `learning_outcomes` remain for a later verified deprecation migration.

Verification: `bunx tsgo --noEmit` clean; `bun run test` **302/302 across 19
files**, including the new 22-test `src/lib/stage1b-content-spine.test.ts`.
`MFA_ENFORCEMENT_ENABLED = false`; no `has_aal2()` policy exists in the live
database; SEC-006 stage two remains unapplied. The Supabase linter reports only
the pre-existing, previously-triaged Auth-dashboard warning
"Leaked Password Protection Disabled" — not introduced by this block and not
remediable from SQL.

### 8b. Phase 10 Stage 1C — curriculum enrollment lifecycle (APPLIED)

Branch `feature/phase10-stage1c-enrollment-lifecycle`. The reviewed Stage 1C
SQL was applied through the platform migration mechanism exactly once and is
recorded as
`supabase/migrations/20260817113059_d492f8e7-f567-441a-a6ce-4b642a990c02.sql`
(SHA-256 `ca10c6c9eeea11a64180282115a49f87c36030d2406c0d13539bc2cbdc0cb675`).
The generated artifact is byte-identical to the reviewed hand-authored file
(SHA-256 `6307b14f4801f3605da757ed77a64718126ff7f30a2c12b57b0cb0c1ed9eb3f1`)
apart from the absent terminal newline after the final `COMMIT;`; the
superseded hand-authored file was removed only after that equivalence was
proven. No production data was seeded, backfilled or modified.

What it introduces:

- `public.academic_periods` — organization-owned, self-referencing calendar
  hierarchy (`year`/`term`/`semester`/`quarter`). Acyclic, same-organization
  ancestry and descendants, bidirectional date containment, and the same
  authoritative maximum depth of **32** used by Stage 1B (ancestor depth plus
  deepest descendant relative depth). Sibling overlap is permitted by explicit
  decision — no exclusion constraint is created.
- `public.curriculum_enrollments` — a Student's placement against a specific
  Curriculum Version, Academic Level, optional Track and optional Academic
  Period. Lifecycle is strictly
  `pending -> active -> (completed|transferred|withdrawn) -> archived`; every
  other transition, including backward transitions, is rejected. `enrolled_at`
  and `ended_at` are database-assigned, never client-supplied. Placement fields
  freeze on activation. Deletion is possible only while still `pending`. A
  partial unique index permits at most one active primary enrollment per
  Student. Transfer chains are student-consistent and acyclic.
- `app_private.can_administer_academic_period(uuid)` — purpose-specific
  calendar authority (Platform Administrator or active Organization
  Administrator). SEC-005 is preserved: `can_author_curriculum` is neither
  reused nor broadened.
- RLS: reads use the existing authoritative `app_private.can_view_student`
  predicate; writes are Platform Administrator or the Student's organization
  `org_admin` only. `anon` holds no grant on either table; all guard trigger
  functions are revoked from PUBLIC, `anon` and `authenticated`.
- `student_curriculum_assignments.curriculum_enrollment_id` — additive,
  nullable, **not backfilled** (no deterministic historical mapping exists),
  guarded so a non-null value must reference an enrollment for the same Student.
- No DML of any kind: no seed, no backfill, no delete. Single transaction with
  a fail-closed precondition gate and a self-verifying postcondition gate.

Supporting work: `src/features/curriculum/effective-placement.ts` is a
read-only compatibility path that prefers a Stage 1C enrollment and falls back
to the legacy `students.grade_id`/`pathway_id` columns; no existing write path
changed and no CRUD UI was added. `src/lib/stage1c-enrollment-lifecycle.test.ts`
(32 tests) verifies the migration structurally, deriving the depth limit from
the external Stage 1B artifact so the proof cannot be self-referential.

**Item 22 (live-principal RLS gate) is now unblocked in CI, not in production.**
`scripts/rls/stage1c-principal-tests.sql` proves allow/deny outcomes under real
principals (`SET LOCAL ROLE authenticated` plus `request.jwt.claims`) and always
ends in `ROLLBACK`. `scripts/run-rls-principal-tests.mjs` refuses to run unless
`RLS_DISPOSABLE_DB=1` with a recognised disposable target, and hard-refuses any
hosted Supabase endpoint. `.github/workflows/rls-principal-tests.yml` runs it
against a throwaway Postgres service container only. No production database is
ever touched.

Full gates: `tsgo` clean, ESLint clean, **360/360 tests pass** across 20 files.
`MFA_ENFORCEMENT_ENABLED = false`; no `has_aal2()` policy exists.


## 9. Continuation state

Phase 1–9 functionality is implemented with the gaps listed in section 5.
Phase 10 Stage 1A and Stage 1B are implemented and reconciled (section 8a).
Stage 1C is fully built but UNAPPLIED and awaiting review (section 8b). Next scope after security: Stage 1 Universal
Curriculum Engine → Stage 2 Programmes → Stage 3 Public Website → Stage 4
Community → Stage 5 Career Pathways → Stage 6 Billing, each independently
testable and deployable, followed by a full gap analysis against Phase 10A–10L
and unfinished Phase 1–9 work. Private instructor-document controls and the
`assignment-submissions` bucket belong to Stage 2.

**Exact next action: Claude pre-application review of the Stage 1C migration
`20260816175000_phase10_stage1c_enrollment_lifecycle.sql` before it is applied
through the platform migration tool and before any merge to `main`. Stage-two
SEC-006 application and MFA enforcement activation remain separately gated.**
