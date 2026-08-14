# SEC-006 — Multi-Factor Authentication and AAL Enforcement (Plan Only)

## A. Executive decision
Add Supabase-native TOTP MFA with assurance-level (AAL2) enforcement. Threat: a stolen or reused password currently grants full privileged access — including Platform Administrator structural writes and Organization Administrator tenant control — because password is the only factor. Result: privileged identities cannot act on the platform with a password alone; privileged structural writes are refused at the database boundary unless the caller's token proves AAL2.

## B. Baseline and repository evidence
- HEAD `883da9c7734dfe17458e4a8b92c8e11dfef62a86` ("Repfixed password lockout UI"); `git status --porcelain` empty (clean).
- Baseline contained by `security/authentication-hardening`, `origin/security/authentication-hardening`, `secondary/security/authentication-hardening`, and the active edit branch.
- Password-security files all present: `src/lib/password-security.functions.ts`, `src/lib/password-security.server.ts`, `src/routes/_authenticated/account.security.tsx`, `src/routes/_authenticated/account.security-checklist.tsx`, `src/lib/password-security-lockout.test.ts`.
- SEC-001–SEC-005 migrations present: `supabase/migrations/20260808181352_harden_critical_access_control.sql` (`app_private.has_org_role`, `app_private.auth_user_role_ids`), `20260809194700_harden_curriculum_authorization.sql` (`app_private.can_author_curriculum`, ownership-immutability triggers), plus lockout migration `20260812155729_efc743a1-5c64-4c4b-b26c-9b56400214a7.sql`.
- Service role: referenced only in `src/integrations/supabase/client.server.ts`, `src/lib/env-preflight-vars.ts` and server-side password-security code; presence confirmed in server runtime without reading its value.
- Framework confirmed TanStack Start + React 19 + Vite (`package.json`, `src/start.ts`). `input-otp@^1.4.2` already available for code entry; no QR dependency needed (Supabase `enroll` returns `totp.qr_code` SVG).

BASELINE VERIFICATION: PASSED.

## C. Current authentication flow
- `src/routes/auth.tsx` — `/auth` (`ssr:false`), `validateSearch` with `mode`/`next` and `isSafeNext` (L55–58); `SignInForm.onSubmit` L117–128 calls `signInWithPassword` then navigates straight to `/dashboard`; `SignUpForm` L184–203; `ResetRequestForm` L263–273 (`resetPasswordForEmail` → `/reset-password`).
- `src/routes/reset-password.tsx` L43–51 — calls `updateUser({password})` with no recovery-session or AAL validation.
- `src/routes/_authenticated/route.tsx` L6–17 — sole route gate: `ssr:false`, `supabase.auth.getUser()`, email-confirmation check, redirect `/auth`.
- `src/features/auth/use-session.ts` — session/loading only; no AAL.
- `src/features/roles/role-context.tsx` + `src/features/roles/api.ts` — viewer roles and `isPlatformAdmin` from `platform_admins`; presentational.
- `src/start.ts` — `functionMiddleware: [envPreflightMiddleware, attachSupabaseAuth]`, CSRF for server fns.
- `src/integrations/supabase/auth-middleware.ts` L92–106 — `getClaims(token)`; injects `supabase`, `userId`, `claims`. Claims include `aal` but it is never inspected.

## D. Current MFA/AAL gap (all confirmed by repository search)
Repo-wide search for `mfa|aal|Assurance` across `src` and `supabase` returns zero matches. Therefore missing: factor listing, TOTP enrollment, login challenge, step-up, unenrollment, AAL-aware server checks, AAL-aware RLS, recovery, MFA audit, and reset-password MFA gating. `supabase/config.toml` contains only `project_id` and `[auth]` password settings — no MFA configuration.

## E. Enforcement policy
| Principal | Requirement | Evaluation source |
|---|---|---|
| Platform Administrator | Mandatory; AAL2 required for structural writes | `platform_admins.status='active'` |
| Organization Administrator | Mandatory | `user_roles` + `roles.code='org_admin'`, active |
| Teacher / Tutor | Organization-configurable (default off) | new org policy column |
| Parent/Guardian | Optional | — |
| Student | Optional, default off, never forced | — |

Organization-level requirement is represented as one additive column on `public.organizations` (`mfa_required_roles text[] NOT NULL DEFAULT '{}'`), evaluated by a SECURITY DEFINER helper `app_private.mfa_required_for(uid)` returning boolean, so both UI and RLS read one authority. Unresolved decision — none; if the reviewer prefers a separate `organization_security_settings` table instead of a column, say so before Stage 4.

## F. User journeys
Enrollment (`/account/security`): status → "Add authenticator" → `enroll({factorType:'totp', friendlyName})` → QR + manual secret + `input-otp` code → `challenge` → `verify` → success state re-reads factors and AAL. Cancel/abandon/verify-failure paths call `unenroll(factorId)` for the unverified factor.
Login challenge: after `signInWithPassword`, read `getAuthenticatorAssuranceLevel()`; if `currentLevel==='aal1' && nextLevel==='aal2'` route to `/mfa?next=…`; otherwise preserve the existing direct navigation.
Existing-session step-up: privileged route or action detects aal1→aal2 and sends the user to `/mfa` with the intended destination retained.
Management: list verified/unverified factors, rename-free, unenroll behind fresh password verification (reusing the existing lockout-protected verification pattern) — never behind a second MFA challenge (deadlock).
Recovery: backup codes at enrollment; single-use consumption at `/mfa`.
Password reset: `/reset-password` validates a recovery session, and for MFA-enabled users requires challenge completion before `updateUser`.
All flows show explicit states for wrong code, expired challenge, cancelled challenge, expired session, and unavailable service (fail closed).

## G. MFA state model
Factor: none → unverified (enrolled) → verified → removed. Unverified factors older than the enrollment attempt are cleaned up on cancel, error, and on next visit to the security page.
AAL: aal1 (password) → aal2 (after verify). Invariants: (1) verified factor + aal1 session = step-up required, not sign-out; (2) privileged mutations require server-verified aal2 claim; (3) removing the last factor for a mandatory-MFA principal is refused; (4) OTP/secret/backup codes never logged or persisted in app tables (hashes only).

## H. Client architecture
New: `src/features/auth/use-mfa.ts` (factors + AAL query), `src/features/auth/components/mfa-enroll-dialog.tsx`, `mfa-challenge-form.tsx`, `mfa-factor-list.tsx`, `backup-codes-dialog.tsx`. Reuse `input-otp`, shadcn `Form`/`Dialog`/`Alert`, `PasswordStrengthMeter` sibling patterns, `sonner`, `useSession`, `RoleProvider`. State ownership: React Query for factor/AAL reads keyed by user; ephemeral challenge id in component state only.

## I. Server architecture
- `src/integrations/supabase/auth-middleware.ts`: add an exported `requireSupabaseAal2` middleware composed on top of `requireSupabaseAuth`, rejecting when `claims.aal !== 'aal2'` (fail closed, generic message). Existing middleware unchanged.
- New `src/lib/mfa.functions.ts` + `src/lib/mfa.server.ts`: `getMfaRequirement`, `recordMfaAudit`, `generateBackupCodes`, `consumeBackupCode`, `adminResetUserFactors` (platform-admin + AAL2 only, admin client imported inside the handler).
- Diagnostics use the redacted `logLockoutDiagnostic`-style pattern (`operation` + coarse `reason` only).

## J. Route and navigation architecture
New public-ish route `src/routes/mfa.tsx` (`ssr:false`) requiring a session but not AAL2, with validated `next` search param reusing `isSafeNext`. `_authenticated/route.tsx` gains: if `mfa_required && no verified factor` → `/account/security?enroll=1`; if `verified factor && aal1` → `/mfa?next=<current>`. `/auth`, `/mfa`, `/reset-password` and sign-out remain reachable at aal1, which prevents the loop. `/mfa` itself never redirects to `_authenticated`.

## K. Database and RLS design
Supabase Auth exclusively owns factors, secrets, challenges and AAL — no app table for TOTP secrets.
Additive migration:
- `ALTER TABLE public.organizations ADD COLUMN mfa_required_roles text[] NOT NULL DEFAULT '{}';`
- `CREATE TABLE public.mfa_backup_codes (id uuid pk, user_id uuid not null, code_hash text not null, used_at timestamptz, created_at, updated_at)`, unique `(user_id, code_hash)`, index on `user_id`; GRANT `SELECT` to `authenticated`, `ALL` to `service_role` (writes are service-role only); RLS on; policy: users may read only their own rows (never the hash beyond existence via a view/count).
- `app_private.auth_aal()` → `current_setting('request.jwt.claims')::jsonb->>'aal'`; `app_private.is_aal2()`; `app_private.mfa_required_for(uuid)`.
- Amend highest-privilege structural write policies only (platform curriculum structure) to `AND app_private.is_aal2()`. SEC-001–SEC-005 predicates are retained verbatim and only conjoined.
No change to `password_change_attempts`.

## L. Recovery design
Backup codes (server-generated, 10 × high-entropy, shown once, stored as salted hashes, single-use, marked `used_at` atomically) **plus** bounded administrator-assisted reset: a Platform Administrator at AAL2 may clear another user's factors via `adminResetUserFactors`, fully audited. Break-glass: at least two active Platform Administrators must hold enrolled factors before mandatory enforcement is switched on, and backup codes guarantee a second path — no unauthenticated bypass exists.

## M. Exact file plan
| File | Action | Purpose |
|---|---|---|
| `src/integrations/supabase/auth-middleware.ts` | modify | add `requireSupabaseAal2` |
| `src/features/auth/use-mfa.ts` | add (new) | factors + AAL hook |
| `src/features/auth/components/mfa-enroll-dialog.tsx` | add (new) | enroll/challenge/verify |
| `src/features/auth/components/mfa-challenge-form.tsx` | add (new) | shared OTP entry |
| `src/features/auth/components/mfa-factor-list.tsx` | add (new) | list + unenroll |
| `src/features/auth/components/backup-codes-dialog.tsx` | add (new) | one-time display |
| `src/features/auth/schemas.ts` | modify | OTP + backup-code schemas |
| `src/lib/mfa.functions.ts` / `src/lib/mfa.server.ts` | add (new) | requirement, audit, backup codes, admin reset |
| `src/routes/mfa.tsx` | add (new) | step-up/challenge route |
| `src/routes/auth.tsx` | modify | post-sign-in AAL branch |
| `src/routes/reset-password.tsx` | modify | recovery-session + MFA gate |
| `src/routes/_authenticated/route.tsx` | modify | enrollment/step-up gates |
| `src/routes/_authenticated/account.security.tsx` | modify | MFA section (lockout logic untouched) |
| `src/features/security/checklist.ts` | modify | MFA checklist items |
| `supabase/migrations/<new>` | add (new) | section K |
| `supabase/config.toml` | modify | `[auth.mfa]` settings |
| `src/lib/mfa-policy.test.ts`, `src/lib/mfa-recovery.test.ts`, `src/features/auth/components/mfa-enroll-dialog.test.tsx`, `e2e/mfa.spec.ts` | add (new) | tests |
No deletions.

## N. Migration plan
Single additive migration, pattern `supabase/migrations/<timestamp>_sec006_mfa_aal_enforcement.sql`, ordered: (1) organizations column; (2) create `mfa_backup_codes` → GRANT → ENABLE RLS → policies; (3) `app_private.auth_aal/is_aal2/mfa_required_for`; (4) conjoin `is_aal2()` into platform-structural write policies. Runs in one transaction. Prerequisite: at least one Platform Administrator enrolled (Stage 5 gate). Rollback: revert step 4 policies to their SEC-001/SEC-005 text, drop helpers, drop table, drop column. Stages 1–3 of implementation need no migration.

## O. Supabase configuration plan
Required: `[auth.mfa] max_enrolled_factors`, `[auth.mfa.totp] enroll_enabled = true`, `verify_enabled = true` in `supabase/config.toml`; leaked-password protection and redirect allow-list in the dashboard (dashboard-only). Recommended: session timebox/refresh-token rotation, CAPTCHA on `/auth`. Deferred: phone/SMS factors (explicitly out of scope, `[auth.mfa.phone]` left disabled). Insufficient data to verify which of these are plan-gated on this project's Supabase tier — to be confirmed read-only in the dashboard before Stage 6; no configuration changed during planning.

## P. Security and privacy analysis
Trust boundaries: browser (untrusted) → server functions with bearer claims → Postgres RLS (authoritative). Client AAL checks are UX only. Secrets: TOTP secrets never leave Supabase Auth; backup codes hashed; service role stays server-only. Audit: `security_events` / `audit_logs` rows for enroll, verify-failure, unenroll, backup-code use, and admin factor reset — event type and actor id only, never OTPs, secrets, codes, tokens or emails. Abuse controls: rate-limit challenge verification failures reusing the existing lockout table pattern. Fail closed: unknown/missing `aal` claim, unavailable requirement lookup, or backup-code service failure all deny.

## Q. Accessibility and responsive design
Labelled OTP input with `inputMode="numeric"` and `autoComplete="one-time-code"`; QR image has a text alternative plus the manual secret in a copyable field; errors via `role="alert" aria-live="assertive"`, success via `aria-live="polite"`; focus moves to the OTP field on challenge and to the error summary on failure; dialogs trap and restore focus; full keyboard operation; 360px single-column layout with no horizontal scroll; contrast and target sizes to WCAG 2.2 AA.

## R. Test and verification matrix
`bun run test` (vitest): policy resolution per role, AAL claim gating, backup-code single-use and authorization, factor state transitions, unchanged password-lockout regressions, SEC-001–SEC-005 regression suites (`src/lib/access-control-regression.test.ts`, `src/lib/curriculum-authorization-regression.test.ts`). Component tests: enrollment dialog, challenge form, cancellation cleanup. `bun run test:rls` plus targeted allow/deny checks at aal1 vs aal2. `bun run test:e2e` (Playwright): MFA and non-MFA login, expired/incorrect challenge, step-up with preserved destination, redirect-loop absence, reset-password bypass attempt, unenroll reauthentication, 360px and keyboard-only passes. Build via the harness. Manual authenticated MFA run and a client-bundle secret scan close the matrix.

## S. Sequenced implementation and rollback
1. Read-only MFA status hook + security-page display (no enforcement). Rollback: revert files.
2. Enrollment + backup-code UI against server functions (no gating).
3. `/mfa` route, login branch, step-up, redirect-loop tests.
4. Migration (section K) — **separate approval required**.
5. Server + RLS enforcement switched on for Platform/Org Admin after admin enrollment verified — **separate approval required**.
6. `supabase/config.toml` + dashboard settings — **separate approval required**.
7. Password-reset hardening, unenrollment reauthentication, admin-assisted recovery, full test/accessibility pass.
Stop conditions: any SEC-001–SEC-005 regression failure, any admin lockout risk, or any AAL claim not observable server-side.

## T. Final acceptance criteria (binary)
Baseline descendant commit recorded • only planned files changed • migration applied and reversible • `bun run test`, `bun run test:rls`, `bun run test:e2e` pass • build passes • RLS allow/deny verified at aal1 and aal2 • SEC-001–SEC-005 regressions green • password-lockout tests unchanged and green • authenticated manual MFA enroll/login/step-up/unenroll/recovery verified • no admin lockout path • secret scan of client bundle clean • no OTP/secret/backup code/token/email in logs • WCAG 2.2 AA, keyboard-only and 360px verified • branches synchronized • working tree clean • final commit SHA reported.

PLAN STATUS: READY FOR REVIEW
