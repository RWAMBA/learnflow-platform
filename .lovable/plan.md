# MASTER STATE SYNC REPORT — LearnFlow

## A. Git and repository confirmation

- Active branch visible to me: `edit/edt-9f7b7c61-5fec-41df-84cf-d6dd20fab1be` — NOT `security/authentication-hardening`. Discrepancy flagged. Git state is managed by the platform; I cannot switch branches.
- Recent history: `b8ec4a0 Work in progress` → `515f9e0 merge: curriculum authorization hardening` → `48ed304 security: harden curriculum authorization` → `a468db6 security: harden critical access control`. Both referenced commits (`515f9e0…`, `48ed304…`) are present in ancestry, matching the brief.
- Framework: TanStack Start v1 + React 19 + TypeScript + Vite 7 + Tailwind v4 + shadcn/ui. No Next.js anywhere. Confirmed authoritative; no conversion proposed.
- Supabase: `@supabase/supabase-js` 2.111, generated client, `auth-middleware` (`requireSupabaseAuth`), `auth-attacher` registered in `src/start.ts`, admin client in `client.server.ts`.
- Both security migrations present: `supabase/migrations/20260808181352_harden_critical_access_control.sql` and `supabase/migrations/20260809194700_harden_curriculum_authorization.sql`.
- Overall consistency: repository matches the brief on framework, security migrations, and role/tenant tables. Divergences listed in section I.

## B. Architecture understanding (restated, not redesigned)

- Multi-tenancy: `organizations` with tenant types (family, independent_tutor, private_school, homeschool_academy, learning_centre, ngo); membership via `organization_memberships`.
- Roles: Student, Parent/Guardian, Teacher, Tutor, Organization Administrator via `roles` + `user_roles`; multiple roles supported.
- Platform Administrator: separate `platform_admins` table, resolved through `app_private.is_platform_admin()`.
- Relationships: explicit `parent_student_relationships`, `teacher_student_relationships`, `tutor_student_relationships` — kept explicit, no generic polymorphic model.
- Authorization boundary: RLS is authoritative; UI checks (`src/features/roles/*`) control visibility only; inactive/suspended memberships must not resolve privileges.
- Universal curriculum target: Provider → Curriculum → Version → Education Stage → Academic Level → optional Track → Subject → recursive Curriculum Node → Learning Objective; recursion supports CBC (Strand/Sub-strand), Cambridge (Unit/Topic), American (Unit/Chapter).
- Curriculum structure through Learning Objective is platform-controlled reference data (Platform Admin). Lesson and Learning Resource are the mixed platform/tenant ownership boundary; tenant authoring is Org Admin-controlled; Teacher/Tutor have no default authoring rights; published tenant content stays tenant-isolated.
- Phase 10 sequence: Universal Curriculum Engine → Programmes → Public Website → Community → Career Pathways → Billing, each independently migrated, secured, tested and released.
- Completion requires Phase 10A–10L plus unfinished Phase 1–9, not Phase 10 alone.

## C. SEC-001 … SEC-005 repository verification

- SEC-001 (no self-assignment of privileged roles): VISIBLE. `20260808181352_…sql` policy `user_role_insert` restricts to `user_id = auth.uid()`, `status='active'`, `created_by = auth.uid()`, open-enrollment org, and `r.code = 'parent_guardian'`. `src/lib/onboarding.functions.ts` accepts no caller-selected role; asserted by `src/lib/access-control-regression.test.ts`.
- SEC-002 (no self-reactivation of suspended membership): VISIBLE. `DROP POLICY IF EXISTS membership_self_update` with no re-creation; `membership_self_join` constrained to active + open enrollment. Test-asserted.
- SEC-003 (active membership required for org role resolution): VISIBLE. `app_private.has_org_role` and `app_private.auth_user_role_ids` join `organization_memberships` and require `ur.status='active' AND om.status='active'`. Test-asserted.
- SEC-004 (published tenant curriculum stays tenant-isolated): VISIBLE in `20260809194700_harden_curriculum_authorization.sql`; ownership-immutability triggers `lessons_ownership_immutable` and `curriculum_resources_ownership_immutable` are live in the database.
- SEC-005 (Teacher/Tutor curriculum-authoring removed): VISIBLE. Write paths gated by `app_private.has_org_role(org,'org_admin')` or `app_private.is_platform_admin()`; covered by `src/lib/curriculum-authorization-regression.test.ts`.
- No inconsistency found in these five.

## D. Authentication implementation inventory

Login (`src/routes/auth.tsx`): `supabase.auth.signInWithPassword`; errors surfaced via `toast.error(error.message)`; on success `navigate({ to: "/dashboard" })`; session established by the browser client (localStorage) and mirrored by `useSession`.

Signup (`src/routes/auth.tsx`): `supabase.auth.signUp` with `emailRedirectTo: window.location.origin` and `full_name` metadata; when no session is returned it shows an await-email-confirmation state. Tenant onboarding continues at `/onboarding` via `src/lib/onboarding.functions.ts` (Parent/Guardian only). The `auth.users` INSERT trigger `app_private.handle_new_user()` creates the profile.

Password reset: request via `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/reset-password" })`; `src/routes/reset-password.tsx` (`ssr:false`) calls `supabase.auth.updateUser({ password })` and navigates to `/dashboard`. It does not explicitly validate recovery-token presence or handle a missing/expired recovery session beyond a generic error toast.

Password change (`src/routes/_authenticated/account.security.tsx`): re-verifies the current password with `supabase.auth.signInWithPassword`, then `supabase.auth.updateUser`; inline errors for wrong password and expired session with a "Sign in again" action calling `signOut`. Server-persisted lockout via `password_change_attempts` and `src/lib/password-security.functions.ts` under `requireSupabaseAuth`. No true Supabase reauthentication (`auth.reauthenticate`) is used.

Session handling: `getSession` in `src/features/auth/use-session.ts` and `src/integrations/supabase/auth-attacher.ts`; `getUser` in the `_authenticated` route guard (which also requires email confirmation) and in the security page; `onAuthStateChange` only in `use-session.ts`; sign-out in `src/components/layout/profile-menu.tsx` and the security page; no explicit `refreshSession` (client auto-refresh only). Server requests validate the bearer token via `supabase.auth.getClaims(token)`.

MFA: explicitly NOT implemented. Repository-wide search finds no `auth.mfa.enroll`, no `auth.mfa.challenge`, no `auth.mfa.verify`, no `auth.mfa.listFactors`, no `auth.mfa.unenroll`, no `getAuthenticatorAssuranceLevel`, no AAL1 handling, no AAL2 handling. The only OTP artifact is the generic shadcn `src/components/ui/input-otp.tsx` primitive, unused by any auth flow — not evidence of MFA.

## E. SEC-006 gap analysis (no implementation)

1. Enrollment/setup: no enrollment UI/route, no factor list, no friendly-name handling, no post-enroll confirmation state.
2. TOTP QR/secret verification: no QR rendering, no manual secret fallback, no enroll → challenge → verify completion step (unverified factors would linger).
3. Login challenge: sign-in does not detect an aal2 requirement, does not branch to a challenge screen, has no code-entry/verify step or attempt handling.
4. AAL/session transition: no `getAuthenticatorAssuranceLevel()` read, no `currentLevel` vs `nextLevel` distinction, no post-verify session refresh/invalidation.
5. Route enforcement: `_authenticated/route.tsx` checks only user presence and email confirmation; no AAL gate and no step-up route.
6. RLS/database enforcement: no policy or helper reads the JWT `aal` claim; privileged surfaces (platform admin, org admin, curriculum authoring) are not AAL-aware; server functions do not inspect `claims.aal`.
7. MFA management/unenroll: no management UI, no unenroll with reauthentication, no audit trail into `security_events`/`audit_logs`.
8. Lost device/recovery: no backup codes, no admin-assisted recovery path, no support policy for factor removal.
9. Password-reset interaction: recovery links reach `/reset-password` at aal1; with MFA enforced this becomes a bypass path unless a challenge precedes the password update.
10. Platform Administrator: no mandatory-MFA gate for `platform_admins` surfaces.
11. Organization Administrator: no per-organization MFA policy field or enforcement point.
12. Testing: no unit tests for AAL logic, no integration tests for the challenge flow, no regression tests proving non-MFA users are unaffected, no RLS allow/deny tests for AAL-aware policies.

## F. MFA enforcement policy recommendation

- MUST require MFA: Platform Administrator (cross-tenant reach, curriculum reference data, admin surfaces) and Organization Administrator (tenant-wide data, memberships, role assignment, billing).
- SHOULD require MFA: Teacher and Tutor (access to minors' records, grading and assessment integrity) — best as an organization-configurable requirement rather than a hard platform rule.
- Optional, strongly encouraged: Parent/Guardian — holds child PII but limited blast radius; enforce when the organization opts in.
- Optional, default off: Student — often minors on shared or limited devices; mandatory TOTP is an accessibility and lockout risk.
- Risk basis: enforcement scales with blast radius and sensitivity of minors' data; recovery burden scales inversely with user sophistication.

## G. Regression risks from an MFA implementation

Login (extra branch may break the happy path or double-navigate); signup (new users at aal1 must not be blocked before enrollment); password recovery and reset links (recovery sessions are aal1 — an AAL gate could lock users out of the reset page); `/account/security` (current-password verification uses `signInWithPassword`, which can itself trigger a challenge and create a nested-challenge dead end); existing sessions (aal1 sessions of newly-required roles need a step-up path, not a forced logout); onboarding (guard changes could trap new users); role resolution and organization switching (`RoleProvider` refetch loops if invalidation fires on new auth events); Platform Administrator access (a mis-scoped gate could lock out all admins — needs a recovery path); route guards (redirect loops between `/auth`, an MFA route and `_authenticated`); Supabase Auth callbacks (redirect allow-list must include any new callback path); SSR (MFA state is client-only and must stay in `ssr:false`/client paths); mobile responsiveness (QR plus code entry at 360px).

## H. Proposed SEC-006 implementation plan (not executed)

Substep 1 — MFA status read layer. REQUIRED SECURITY CONTROL. Files: new `src/features/auth/mfa/api.ts` and `use-mfa-status.ts` using `listFactors` and `getAuthenticatorAssuranceLevel`. No DB/migration, no Supabase config, no UI change. Tests: unit tests on level derivation. Rollback: delete module.

Substep 2 — TOTP enrollment UI on `/account/security` (or `/account/security/mfa`). REQUIRED. Files: new enrollment component and route section reusing `input-otp`. Flow: enroll → QR/secret → challenge → verify, cleaning up unverified factors on cancel. No DB change. Supabase: confirm TOTP factors enabled. Tests: component tests per step plus mobile viewport check. Rollback: hide entry point.

Substep 3 — Login challenge. REQUIRED. Files: `src/routes/auth.tsx` plus a challenge component. After sign-in, when `nextLevel === 'aal2' && currentLevel === 'aal1'`, render the challenge instead of navigating. Tests: integration tests for MFA and non-MFA users. Rollback: branch-level feature flag.

Substep 4 — Route enforcement and step-up. REQUIRED. Files: `src/routes/_authenticated/route.tsx` plus a new `/auth/mfa` step-up route. Redirect only when `nextLevel === 'aal2'`; `/reset-password` and sign-out must stay reachable. Tests: guard tests including no redirect loops. Rollback: revert the guard block.

Substep 5 — MFA management and unenrollment. REQUIRED. Files: security page. Requires fresh password verification before `unenroll` and writes an audit row. DB: reuse `security_events`/`audit_logs`; additive migration only if a new event value is needed. Tests: unenroll requires verification.

Substep 6 — Role-based MFA policy. REQUIRED for Platform/Org Admin. DB: additive migration adding an organization-level MFA requirement flag and a platform-level requirement; no destructive change. Enforcement in UI plus AAL-aware checks in server functions. Tests: allow/deny per role.

Substep 7 — AAL-aware server/RLS enforcement for privileged writes. RECOMMENDED DEFENSE-IN-DEPTH (required for platform-admin structural writes). DB: additive helper reading the `aal` claim; policies extended only for the highest-privilege surfaces. Tests: RLS allow/deny at aal1 vs aal2. Rollback: drop helper usage from policies.

Substep 8 — Recovery: backup codes and/or admin-assisted reset. RECOMMENDED. DB: additive hashed-codes table with strict RLS, server-generated only. Tests: single-use enforcement.

Substep 9 — Password-reset interaction hardening. REQUIRED. Files: `src/routes/reset-password.tsx`. Explicitly detect the recovery session and require an MFA challenge before `updateUser` for MFA-enabled accounts.

Substep 10 — Supabase configuration and posture. SUPABASE-PLAN-DEPENDENT CONTROL. Leaked-password protection, MFA factor limits and phone factors, session timeout/lifetime, redirect allow-list, CAPTCHA. Dashboard-only, mirrored in `supabase/config.toml`.

Substep 11 — Full regression suite. REQUIRED. Existing access-control, curriculum-authorization, RLS-recursion and dashboard tests plus new MFA suites; responsive and WCAG 2.2 AA checks on new screens.

## I. Architecture/repository divergences (not resolved)

1. Active branch is a platform edit branch, not `security/authentication-hardening`.
2. Universal curriculum architecture is not yet in the schema: no `curriculum_providers`, `education_stages`, `academic_levels`, `tracks`, `curriculum_nodes`, `curriculum_enrollments`. Current tables are `curricula`, `curriculum_versions`, `grades`, `subjects`, `topics`, `strands`, `sub_strands`, `learning_outcomes`, `competencies`, `pathways`, `learning_objectives`, `lessons` — the CBC-shaped fixed-depth model. This is Stage 1 work, expected.
3. A `/account/security-checklist` route referenced in earlier conversation history does not exist in the repository; only `account.security.tsx` is present.
4. `src/components/ui/input-otp.tsx` exists but is unused — it is not MFA.
5. `reset-password.tsx` does not verify that a recovery session exists before allowing `updateUser`.
6. Route metadata uses "the Platform" rather than "LearnFlow".
7. The working tree carries a "Work in progress" commit on top of the verified merge base.

## J. Remaining roadmap awareness

Confirmed: after security hardening, implementation continues through Universal Curriculum Engine, Programmes, Public Website, Community, Career Pathways, Billing, then remaining Phase 1–9 completion, full UI/responsiveness/WCAG 2.2 AA completion, and final security/architecture/release validation. Confirmed that implementation happens on controlled branches, never directly on main.

## K. No-change attestation

This investigation was read-only. Unchanged: source code, migration files, database schema, database data, Supabase Auth configuration, Git branch, commits, Project Knowledge, project settings. The only file written is this report document. No build-mode action was taken; awaiting external review.