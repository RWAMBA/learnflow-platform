# SEC-006 — MFA & AAL Enforcement (Revised A–T Plan)

Baseline: `883da9c7734dfe17458e4a8b92c8e11dfef62a86`. Working HEAD `1d082e8` is a descendant. Read-only evidence only; nothing implemented.

## A. Objective

Add Supabase-native TOTP MFA, make it mandatory for Platform and Organization Administrators, and enforce AAL2 at the database boundary for privileged writes — without breaking SEC-001–SEC-005 or locking administrators out.

## B. Non-goals

SMS/phone factors, passkeys, WebAuthn, per-tenant MFA UX customisation, session-management redesign, SEC-007+ items.

## C. Verified evidence base

- `@supabase/supabase-js ^2.111.0`, `@supabase/auth-js 2.111.0` installed.
- Admin MFA API exists: `supabase.auth.admin.mfa.listFactors(params)` and `supabase.auth.admin.mfa.deleteFactor({ id, userId })` (marked `@experimental`; deleting a verified factor logs the user out of all sessions). No method named `adminResetUserFactors` exists — that name is withdrawn.
- User MFA API present on GoTrueClient: `enroll`, `challenge`, `verify`, `challengeAndVerify`, `unenroll`, `listFactors`, `getAuthenticatorAssuranceLevel`.
- `public.audit_logs` (migration `20260730144142_...`): id, actor_user_id, organization_id, action, entity_type, entity_id, before_state, after_state, created_at. Grants: `select, insert` to authenticated. Policy `audit_logs_insert` (tightened in `20260731094301_...`) allows any authenticated user to insert rows with `actor_user_id = auth.uid()` → **fabricable**.
- `public.security_events` (same migration): id, event_type (CHECK in `failed_login`, `account_lockout`, `suspicious_invitation_activity`, `excessive_password_reset_requests`, `other`), severity (CHECK info/warning/critical), actor_user_id, organization_id, ip_address inet, details jsonb, created_at. Grants: `select` to authenticated, `all` to service_role. Only policy: `security_events_platform_admin_only` (SELECT, platform admin). **No browser INSERT path → tamper-resistant. This is the audit target.**
- `public.organization_security_settings` does not exist in any migration.
- `public.organizations` columns verified (no settings/security jsonb; `branding jsonb` is the only free-form column). Grants: `select, update` to authenticated.
- `supabase/config.toml` contains only `minimum_password_length = 12` and `password_requirements`. No `[auth.mfa]` block.
- No migration uses `auth.jwt()` or `request.jwt.claims` (grep over `supabase/migrations` returned 0).
- `_authenticated/route.tsx` gate: `ssr: false`, `getUser()`, redirect `/auth`, plus email-confirmation redirect. Routes present: `/auth`, `/reset-password`, `/`, `/.lovable/oauth/consent`, `/mcp`, and 30 `_authenticated/*` routes.
- package.json scripts that exist: `dev, build, build:dev, preview, lint, format, test (vitest run), test:rls, test:e2e (playwright test)`. `playwright.config.ts` and `e2e/` exist (component harness, baseURL :5199, one spec). So `test:rls` and `test:e2e` are real, but the e2e harness is not an authenticated app runner.

## D. Correction to prior Section D

Prior "zero matches" claim re-run with explicit command and scope:
`rg -in "mfa|aal[0-9]?|assurance" src supabase/migrations supabase/config.toml e2e scripts -g '!routeTree.gen.ts' -g '!*types.ts'` → **0 matches across 213 files**. Excluded: `node_modules`, generated `src/routeTree.gen.ts`, generated Supabase types. Conclusion stands for first-party source only; no claim is made about dependencies or docs.

## E. Recovery codes — withdrawn from core design

Supabase issues AAL2 only after `mfa.verify()` against an enrolled factor. No installed API accepts an application-defined code and returns an AAL2 JWT. Therefore:

- Custom backup codes are **incompatible with AAL2-enforced RLS**.
- `mfa_backup_codes` is **removed** from the migration set.
- No flow will represent code consumption as MFA verification.
- No table storing recovery-code hashes will be created, and no `authenticated` SELECT grant on credential material will be added.
  Proposed replacement (requires approval): **bounded administrator-assisted factor reset** — a second Platform Admin, in an AAL2 session, calls a server function using `admin.mfa.listFactors` + `admin.mfa.deleteFactor`; the target user must re-enroll before regaining privileged access; every step written to `security_events`. If declined, recovery stays an open decision and enforcement must not activate.

## F. Organization policy storage — three options (unresolved)

1. **Column on `organizations`** (e.g. `require_admin_mfa boolean not null default false`). Conventions: matches existing flag style (`younger_student_independent_login`). Validation: trivial. RLS: inherits org policies — but `authenticated` already holds table-level `update`, so an Org Admin could disable their own requirement unless a guard trigger is added. Indexing: none needed. Extensibility: poor. Rollback: simple drop.
2. **`organization_security_settings` 1:1 table**. Conventions: consistent with existing per-domain tables; needs explicit GRANTs. Validation: CHECKs per column. RLS: readable by org members, writable only via SECURITY DEFINER / AAL2 policy — cleanest isolation. Indexing: PK on organization_id. Extensibility: good. Rollback: drop table.
3. **Normalized org × role MFA policy table**. Most granular; highest complexity and policy surface; unnecessary while the policy is binary for two admin roles.
   **Recommendation: option 2**, not finalized — awaiting reviewer approval.

## G. Enforcement scope (verified write surfaces)

Server functions requiring AAL2 (exports verified in repo): org — `updateOrganizationSettings`, `setMemberRoleStatus`, `grantOrganizationRole`, membership invite/revoke handlers; platform curriculum — the 18 privileged curriculum/version/pathway/subject/topic/lesson/objective mutation exports previously enumerated. RLS: the ~20 privileged write policies on `curriculum_versions`, `pathways`, `subjects`, `topics`, `lessons`, `learning_objectives`, `organizations`, `organization_memberships`, `user_roles`. Every SEC-001–SEC-005 predicate is preserved **verbatim**; the only change is an additive `AND public.auth_has_aal2()` conjunct shown per policy in the migration diff.

## H. AAL helper

No existing project convention. Proposed `public.auth_has_aal2()` — `stable`, `security definer`, `set search_path = public`, implemented over `auth.jwt()` (Supabase-supported wrapper) rather than raw `current_setting('request.jwt.claims', true)`, as `coalesce(nullif(auth.jwt() ->> 'aal',''),'aal1') = 'aal2'`, returning false for missing, null, malformed or non-string claims. Unit-tested by direct SQL invocation.

## I. Password-reset hardening comes first

Recovery sessions are AAL1. No enforcement stage may activate while a reset link grants privileged access. Stage 1 hardens `/reset-password`: recovery sessions are confined to password update only, are signed out afterwards, and cannot reach privileged `_authenticated` routes.

## J. Route design and loop proof

Guard order in `_authenticated/route.tsx`: (1) no user → `/auth`; (2) unconfirmed email → `/auth`; (3) MFA required for principal AND no verified factor → `/mfa/enroll`; (4) MFA required AND factor exists AND aal < aal2 → `/mfa/challenge?redirect=<intended>`.
Guard exceptions (never re-gated): `/mfa/enroll`, `/mfa/challenge`, `/auth`, `/reset-password`, sign-out. Loop proof: `/mfa/*` are excluded from rules 3–4, so they cannot redirect to themselves; `/auth` and `/reset-password` sit outside `_authenticated`; sign-out clears the session then lands on `/auth`, where rule 1 no longer applies. Intended destination travels in a sanitized same-origin `redirect` search param validated to start with `/`, consumed only after `getAuthenticatorAssuranceLevel()` reports `currentLevel === 'aal2'`.

## K. Unenrollment freshness

`signInWithPassword` re-authentication is **withdrawn** (it mints a new AAL1 session and can downgrade the current one). `supabase.auth.reauthenticate()` is also withdrawn: it issues an email/phone nonce usable only by `updateUser`, not by `mfa.unenroll`. Mechanism: require a fresh `mfa.challengeAndVerify()` against the factor being removed, then immediately re-read `getAuthenticatorAssuranceLevel()`; unenroll only if `currentLevel === 'aal2'` and the verification falls inside a short bounded window. Any failure or unreadable AAL fails closed with no state change.

## L. Throttling

`public.password_change_attempts` is **not** touched or overloaded. MFA challenge throttling relies first on Supabase Auth's own challenge rate limits; a separate bounded control (`mfa_challenge_attempts`, same shape/patterns as the verified lockout table, service-role only) is proposed **only if** verification shows Supabase limits are insufficient.

## M. Proposed files (all proposed, none exist today)

- `src/routes/_authenticated/mfa.enroll.tsx`, `src/routes/_authenticated/mfa.challenge.tsx` — flat dot-named files matching the existing `_authenticated` convention; consumed only by the generated route tree.
- `src/features/security/mfa.ts` — client MFA helpers (`src/features/security/` already exists via `checklist.ts`); consumed by the two routes and `account.security.tsx`.
- `src/lib/mfa-policy.server.ts` + `src/lib/mfa-policy.functions.ts` — matches the existing `password-security.server.ts` / `.functions.ts` pairing; functions consumed by the routes and the admin reset UI.
- `src/lib/mfa-policy.test.ts` — vitest, alongside `password-security-lockout.test.ts`.
- Migrations (names assigned at creation): AAL helper + policy store; additive AAL2 conjuncts; audit ACL hardening.

## N. Adoption / bootstrap

Current state: **1 active Platform Admin, 0 verified factors** — activating enforcement now locks the platform out. Sequence: (1) ship enrollment UI with MFA optional; (2) enroll and verify at least a second Platform Admin; (3) prompt Org Admins in-app; (4) only then activate enforcement. Existing AAL1 sessions are not force-killed; they are redirected to `/mfa/enroll` or `/mfa/challenge` on the next privileged navigation. A grace period may be used but **no duration is proposed here** — reviewer decides, or enforcement is gated on the enrollment count instead.

## O. Audit

All MFA events (`enroll_started`, `factor_verified`, `challenge_failed`, `unenroll`, `admin_factor_reset`, `enforcement_activated`) go to `public.security_events` via service-role server functions. `audit_logs` is not used for MFA because authenticated users can insert into it. Requires an additive migration to extend the `event_type` CHECK; no grant changes.

## P. Config

Available now (repository-verifiable): `supabase/config.toml` `[auth.mfa]` TOTP enable/verify settings and `max_enrolled_factors`. Plan-gated or unverifiable from the repo: leaked-password protection (previously reported unavailable on the current **Supabase Free** tier), advanced MFA policy, and dashboard-managed redirect allow-lists. Those dashboard values remain **unverified** and are not claimed as repository-verifiable.

## Q. Testing

Real commands: `bun run test` (vitest), `bun run test:rls`, `bun run test:e2e` (Playwright against the existing component harness). Proposed additions requiring approval: an authenticated Playwright project pointed at the dev server, and a SQL-level AAL policy suite; both are new infrastructure, not existing capability.

## R. Implementation order

1. Verify remote TOTP capability. 2. `config.toml` MFA block. 3. Password-reset/recovery hardening. 4. MFA status UI on `/account/security`. 5. Enrollment + challenge routes (MFA optional). 6. `security_events` MFA audit path. 7. Admin recovery readiness (≥2 enrolled Platform Admins) + admin factor-reset function. 8. Policy store migration. 9. Atomic enforcement activation (server middleware + RLS conjuncts + route gate). 10. `audit_logs` / lockout ACL hardening.

## S. Rollback

Each stage is one migration plus one code change; enforcement (stage 9) is reversible by dropping the AAL2 conjuncts, restoring the SEC-001–SEC-005 predicates verbatim, and disabling the route gate flag.

## T. Outstanding decisions

1. Organization policy storage — approve option 2 (or choose another).
2. Recovery — approve bounded administrator-assisted factor reset, or leave unresolved.
3. Grace period — duration, or "gate on enrollment count".
4. Remote Supabase Auth settings (TOTP enabled, max factors, secure password change, redirect allow-lists) — still unread; requires dashboard or Management API access.
5. Approval for new test infrastructure (authenticated Playwright project, SQL AAL suite).

PLAN STATUS: BLOCKED — resolve the five items in Section T; all other design choices are repository-grounded.
