# SEC-006 — MFA and AAL Enforcement (Revised Plan, Read-Only)

Supersedes the rejected plan in full. Baseline `883da9c7734dfe17458e4a8b92c8e11dfef62a86`.

## A. Executive decision
Add Supabase-native TOTP MFA and make Supabase's own AAL2 the authoritative signal for privileged access. Threat: a stolen or reused password today grants complete Platform Administrator and Organization Administrator authority, because password is the only factor and no AAL check exists anywhere in the repository. Result: privileged structural writes are refused by RLS unless the caller's JWT proves `aal2`, and mandatory-MFA principals cannot reach privileged surfaces with a password alone.

Two material decisions are deliberately left open for reviewer approval (E and L). No custom credential is presented as MFA.

## B. Baseline and repository evidence
- HEAD `883da9c7734dfe17458e4a8b92c8e11dfef62a86` ("Repfixed password lockout UI"); `git status --porcelain` empty.
- Baseline contained by `security/authentication-hardening`, `origin/security/authentication-hardening`, `secondary/security/authentication-hardening` and the active edit branch (`git branch -a --contains 883da9c`).
- Password-security files present: `src/lib/password-security.functions.ts`, `src/lib/password-security.server.ts`, `src/routes/_authenticated/account.security.tsx`, `src/routes/_authenticated/account.security-checklist.tsx`, `src/lib/password-security-lockout.test.ts`.
- SEC-001–SEC-005 present: `supabase/migrations/20260808181352_harden_critical_access_control.sql` (`app_private.has_org_role`, `app_private.auth_user_role_ids`), `supabase/migrations/20260809194700_harden_curriculum_authorization.sql` (`app_private.can_author_curriculum` L10–20 with `REVOKE ALL … FROM PUBLIC` / `GRANT EXECUTE … TO authenticated` L25–31, platform policies, ownership-immutability triggers L863/L895), lockout migration `20260812155729_efc743a1-5c64-4c4b-b26c-9b56400214a7.sql`.
- Service-role key: referenced only in `src/integrations/supabase/client.server.ts`, `src/lib/env-preflight-vars.ts`, `src/lib/password-security.*`; presence checked in the server shell without reading, printing or hashing the value.
- Framework: TanStack Start + React 19 + Vite (`package.json`, `src/start.ts`). Installed `@supabase/supabase-js` and `@supabase/auth-js` are **2.111.0** (node_modules package.json).

BASELINE VERIFICATION: PASSED.

## C. Current authentication flow (verified)
- `src/routes/auth.tsx` — `/auth`, `ssr:false` (L31–53); `isSafeNext` L55–58 accepts only `/`-prefixed non-`//` paths; `SignInForm.onSubmit` L117–128 = `signInWithPassword` then immediate `/dashboard` or `window.location.replace(next)`; `SignUpForm.onSubmit` L184–203; `ResetRequestForm.onSubmit` L263–273 (`resetPasswordForEmail`, `redirectTo` `${origin}/reset-password`); signed-in redirect effect L67–74.
- `src/routes/reset-password.tsx` L43–51 — calls `updateUser({password})` with **no** recovery-session validation, no session-type check, no AAL check.
- `src/routes/_authenticated/route.tsx` L6–17 — the single gate: `ssr:false`, `supabase.auth.getUser()`, email-confirmation check, `redirect({to:"/auth"})`; no `next` preservation.
- `src/features/auth/use-session.ts` — session/loading only.
- `src/features/roles/api.ts` `fetchViewerContext` — roles from `user_roles` (active) joined to `roles`/`organizations`; `isPlatformAdmin` from `platform_admins` (own row). `src/features/roles/role-context.tsx` supplies presentational context.
- `src/integrations/supabase/auth-middleware.ts` L92–106 — `supabase.auth.getClaims(token)`; injects `supabase`, `userId`, `claims`; `claims.aal` never read.
- `src/start.ts` — `functionMiddleware: [envPreflightMiddleware, attachSupabaseAuth]`, `requestMiddleware: [errorMiddleware, csrfMiddleware]`.
- Password change: `src/routes/_authenticated/account.security.tsx` with server-authoritative, fail-closed lockout (`src/lib/password-security.*`). Untouched by this plan except where F/H explicitly note reuse of the *pattern*, not the table.

## D. Current MFA/AAL gap (corrected search evidence)
Command actually run: `rg -n 'mfa|aal|Assurance' src supabase -i` — searched paths `src/` and `supabase/` only; `node_modules/`, `dist/`, `.git/` and other ignored paths were **not** searched (ripgrep default respects `.gitignore`). Result: **zero matches in `src/` and `supabase/`**. Generated `src/routeTree.gen.ts` and `src/integrations/supabase/types.ts` fall inside `src/` and were therefore covered.

Dependency-level matches do exist (`node_modules/@supabase/auth-js`), which is exactly the point: the capability ships in the client library but is unused by this application. Confirmed missing in application code: factor listing, enrollment, challenge, verify, unenroll, AAL read, AAL-aware server checks, AAL-aware RLS, MFA audit, recovery, reset-password MFA gating. `supabase/config.toml` contains only `project_id` and `[auth] minimum_password_length / password_requirements` — no `[auth.mfa]`.

`input-otp@^1.4.2` is present in `package.json` as a shadcn primitive. It is a text-entry component only and is **not** an MFA implementation.

## E. Enforcement policy and unresolved policy-storage decision
| Principal | Requirement | Source of truth |
|---|---|---|
| Platform Administrator | Mandatory; AAL2 for structural writes | `public.platform_admins` (`status='active'`) |
| Organization Administrator | Mandatory | `public.user_roles` + `public.roles.code='org_admin'`, `status='active'` |
| Teacher / Tutor | Organization-configurable, default off | organization policy store (below) |
| Parent/Guardian | Optional | — |
| Student | Optional, default off, never forced | — |

### UNRESOLVED DECISION 1 — organization policy storage
| Option | Schema convention fit | Validation | RLS | Indexing | Extensibility | Migration / rollback |
|---|---|---|---|---|---|---|
| (a) Column on `public.organizations` (`mfa_required_roles text[]`) | Fits: `organizations` already holds tenant policy flags (`open_enrollment`, `younger_student_independent_login`, `default_locale` — verified in `types.ts`) | Array membership must be validated by CHECK or trigger against `roles.code`; arrays cannot use FK | Inherits existing `organizations` policies; **risk**: whoever may update an organization row may change security policy, so a column-level restriction or trigger is required | GIN index only if filtered on; not needed for per-org lookup | Low — each new security setting adds a column | Simplest add; rollback = `DROP COLUMN` |
| (b) `public.organization_security_settings` (1:1) | Fits Lovable/Supabase conventions; mirrors existing per-org tables | Column-level CHECKs; clean defaults | Own policies; policy writes separable from general org editing | PK on `organization_id` | High — future security settings land here without touching `organizations` | New table + GRANT + RLS + policies; rollback = `DROP TABLE` |
| (c) Normalized `organization_mfa_role_policy(organization_id, role_id, required boolean)` | Fits relational conventions; matches `user_roles` shape | Real FK to `roles(id)` — strongest validation | Own policies; row-level auditability per role | Unique `(organization_id, role_id)` + index on `organization_id` | Highest, but most joins in RLS hot paths | Largest migration; rollback = `DROP TABLE` |

Recommendation: **(b)**, as the best balance of validation, RLS separation and extensibility with a single-row read in helper functions. **Not finalized — requires reviewer approval before any migration is drafted.** Evaluation in all three cases funnels through one SECURITY DEFINER helper so UI and RLS never diverge.

## F. User journeys
1. **Enrollment** (`/account/security`, also reachable at AAL1 with no factor): status → "Add authenticator" → `supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })` → render returned `totp.qr_code` (SVG string from Supabase) **and** `totp.secret` as a copyable manual fallback → user enters code → `challenge()` → `verify()`. Per auth-js 2.111.0 docs (`lib/types.d.ts` L1045): verifying promotes the current session to `aal2` and logs out other sessions. Cancel / navigate-away / repeated failure → `mfa.unenroll({ factorId })` for the *unverified* factor; on next page load any lingering `status:'unverified'` factor is offered for cleanup. Post-enrollment state is re-read via `listFactors()` + `getAuthenticatorAssuranceLevel()`.
2. **Login challenge**: after `signInWithPassword`, call `getAuthenticatorAssuranceLevel()`; if `currentLevel==='aal1' && nextLevel==='aal2'` navigate to `/mfa?next=…`; otherwise the existing non-MFA path is unchanged. Wrong code → inline error, retry; expired challenge → new `challenge()`; cancel → user stays at AAL1 with only the exempt routes reachable.
3. **Existing-session step-up**: the `_authenticated` gate detects verified factor + AAL1 and redirects to `/mfa?next=<validated current path>`. No forced sign-out.
4. **Management**: `/account/security` lists verified and unverified factors with friendly name and created date.
5. **Unenrollment** (correction 6): gated by `supabase.auth.reauthenticate()` + the nonce path, **not** `signInWithPassword`. Evidence: `GoTrueClient.d.ts` L1319–1332 documents `reauthenticate()` as the freshness mechanism for sensitive updates; re-running `signInWithPassword` mints a **new AAL1 session** and would silently downgrade the current AAL2 session, so it is rejected. Immediately before `mfa.unenroll`, the client re-reads `getAuthenticatorAssuranceLevel()` and a server function re-reads `claims.aal` — both must be `aal2`, else the action fails closed. No second MFA challenge is issued (no nested deadlock). The password-change lockout is neither reused nor modified.
   - *Insufficient data to verify*: whether "Secure password change" (which governs `reauthenticate()` enforcement) is enabled on this project — dashboard-only, not inspected.
6. **Recovery**: see L (unresolved).
7. **Password reset**: hardened in Stage 2, before any enforcement (correction 13).

## G. MFA and AAL state model
Factor: `none → unverified → verified → removed` (`Factor.status` values confirmed in `lib/types.d.ts` L346/L366).
AAL: `aal1 → aal2` on successful `verify()`; a fresh password sign-in returns to `aal1`.
Invariants: (1) verified factor + AAL1 ⇒ step-up, never sign-out; (2) privileged mutations require the **server-observed** `aal` claim; (3) a mandatory-MFA principal cannot remove their last verified factor; (4) enrollment, `/auth`, `/reset-password` and sign-out are always reachable; (5) OTPs, TOTP secrets and tokens are never logged or stored in application tables.
Cleanup: unverified factors are unenrolled on cancel, on verification abandonment, and on next security-page load.

## H. Client architecture
Proposed: `src/features/auth/use-mfa.ts` (React Query wrapper over `listFactors` + `getAuthenticatorAssuranceLevel`), `src/features/auth/components/mfa-enroll-dialog.tsx`, `mfa-challenge-form.tsx`, `mfa-factor-list.tsx`. Reused existing primitives: `input-otp` via shadcn, `@/components/ui/{form,dialog,alert,card,button}`, `sonner`, `useSession`, `RoleProvider`, `PageHeader`, `QueryState`. State ownership: React Query for factor/AAL reads; challenge id held in component state only and never persisted. Client AAL is presentational.

## I. Server architecture
- `src/integrations/supabase/auth-middleware.ts`: add exported `requireSupabaseAal2` composed on `requireSupabaseAuth`; passes only when `typeof claims.aal === 'string' && claims.aal === 'aal2'`; any other value (missing, null, non-string) throws a generic error. Existing middleware untouched.
- Proposed `src/lib/mfa.functions.ts` / `src/lib/mfa.server.ts`: `getMfaRequirement` (role + org policy → required boolean), `recordMfaAudit` (writes an audit row server-side), and — only if L(b) is approved — `adminClearUserFactors` implemented with the **verified** admin API below.
- Verified admin API (correction 7, auth-js 2.111.0, `GoTrueAdminApi.js` L33–35, L750, L768; `lib/types.d.ts` L1462–1549):
  - `supabase.auth.admin.mfa.listFactors({ userId: string }) → { factors: Factor[] }` — returns **all** factors attached to the user (verified and unverified).
  - `supabase.auth.admin.mfa.deleteFactor({ id: string, userId: string }) → { id: string }` — documented to log the user out of all sessions when the deleted factor was verified.
  - Both are marked `@experimental` in the installed types and require a service-role client (`src/integrations/supabase/client.server.ts`), imported **inside** the handler. The previously invented `adminResetUserFactors` does not exist and is withdrawn.
- Diagnostics follow the existing redacted pattern (`logLockoutDiagnostic` in `src/lib/password-security.server.ts` L23–25): operation label + coarse reason only.

## J. Route and navigation architecture
Guard order inside `src/routes/_authenticated/route.tsx` `beforeLoad` (extended, not replaced):
1. No user → `/auth` (existing behaviour, unchanged).
2. Unconfirmed email → `/auth` (existing).
3. **Exempt paths short-circuit before any MFA logic**: `/account/security` (enrollment), plus the top-level `/auth`, `/mfa` and `/reset-password` routes, which live outside `_authenticated` and are never gated. Sign-out is an action, not a route, and is available from the shell on every exempt page.
4. MFA required + no verified factor → redirect to `/account/security?enroll=1`.
5. Verified factor + AAL1 → redirect to `/mfa?next=<validated path>`.
Loop proof: `/account/security` is exempt at step 3, so rule 4 can never target a gated route (no self-redirect). `/mfa` and `/reset-password` are top-level routes with no `_authenticated` parent, so rule 5's target is never re-gated. `/auth` redirects to `/dashboard` only when a session exists (`auth.tsx` L67–74) and `/dashboard` at AAL1 with a factor goes to `/mfa`, which never redirects back to `/auth` while a session exists — the cycle is broken at `/mfa`. Every hop terminates at an exempt route.
Destination handling: `next` is validated by the existing `isSafeNext` (`auth.tsx` L55–58), reused (extracted to a shared module) on `/mfa`; absolute URLs, protocol-relative `//host` and non-`/` values are dropped and replaced with `/dashboard`.

## K. Database and RLS design
Supabase Auth remains the exclusive store for factors, secrets, challenges and AAL. **No application table holds TOTP secrets, and no table holds recovery-credential hashes** (correction 3 — nothing is granted to `authenticated`, because nothing is created).

Proposed, all additive and each separately approved:
1. Organization policy store — **blocked on UNRESOLVED DECISION 1**; no SQL is drafted until option (a)/(b)/(c) is chosen.
2. AAL helper (correction 15). Convention check: no migration in this repository uses `auth.jwt()` or `request.jwt.claims` (`rg -n "auth.jwt\(\)|request.jwt.claims" supabase/migrations` → no matches), so there is no existing project convention; `auth.jwt()` is chosen as the supported Supabase accessor rather than raw `current_setting`, which raises on a missing GUC. Proposed shape, matching the existing `app_private` helper convention (SEC-005 L10–31):
   ```sql
   CREATE OR REPLACE FUNCTION app_private.is_aal2()
   RETURNS boolean
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
   AS $$ SELECT coalesce(nullif(auth.jwt() ->> 'aal', ''), '') = 'aal2'; $$;
   REVOKE ALL ON FUNCTION app_private.is_aal2() FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION app_private.is_aal2() TO authenticated;
   ```
   Fail-closed behaviour: missing claim, SQL NULL, empty string, non-string JSON value and anonymous requests all yield `false` (`->>` returns NULL for non-scalar values; `coalesce` maps NULL to `''`). Owner: the migration role, as with existing `app_private` helpers. No grant to `anon`; no `public.` exposure.
3. Privileged write surfaces requiring AAL2 (correction 14). Verified today in `supabase/migrations/20260809194700_harden_curriculum_authorization.sql`, all platform-scoped (`authoring_organization_id IS NULL AND app_private.is_platform_admin()`):
   | Table | Policies (write) | Line refs | Proposed enforcement |
   |---|---|---|---|
   | `public.curriculum_versions` | `_insert`, `_update`, `_delete` | L70, L79, L92 | RLS + server function |
   | `public.pathways` | `_insert`, `_update`, `_delete` | L128, L137, L150 | RLS + server function |
   | `public.subjects` | `_insert`, `_update`, `_delete` | L186, L195, L208 | RLS + server function |
   | `public.topics` | `_insert`, `_update`, `_delete` | L244, L253, L266 | RLS + server function |
   | `public.strands` | `_insert`, `_update`, `_delete` | L302, L311, L324 | RLS + server function |
   | `public.sub_strands` | `_insert`, `_update`, `_delete` | L360, L369, L382 | RLS + server function |
   | `public.learning_outcomes` | `_write` | L412 | RLS + server function |
   | `public.learning_objectives` | `_write` | L610 | RLS + server function |
   Each policy is re-created with its **existing predicate preserved verbatim** and `AND app_private.is_aal2()` appended to `USING` and `WITH CHECK`. SELECT policies are not modified. Tenant-scoped policies (`lessons_*`, `curriculum_resources_*`, `lesson_prerequisites_write`) are **out of SEC-006 scope** — Org Admin MFA is mandatory at the login boundary, and adding AAL2 to tenant authoring is a separate decision. Server functions in `src/lib/curriculum.functions.ts` and `src/lib/curriculum-hierarchy.functions.ts` additionally carry `requireSupabaseAal2`; UI is never the authoritative control.
4. No change to `public.password_change_attempts`.

## L. Recovery design — UNRESOLVED DECISION 2
Custom backup codes are **withdrawn from the core design** (corrections 1–3). Evidence: the installed auth-js 2.111.0 exposes AAL promotion only through `mfa.verify()` / `mfa.challengeAndVerify()` against an enrolled factor (`lib/types.d.ts` L1039–1054). No API accepts an application-generated credential and returns an `aal2` JWT. Therefore an application recovery code **cannot** produce a genuine Supabase AAL2 session, is incompatible with AAL2-enforced RLS, must not be represented as MFA verification, and `mfa_backup_codes` is removed from the migration plan entirely.

Proposed replacement, for approval: **bounded administrator-assisted factor reset**. A Platform Administrator, authenticated and at AAL2, calls a server function that uses the verified `supabase.auth.admin.mfa.listFactors` / `deleteFactor` API to clear another user's factors. The target user is then at AAL1 with no factor and **must re-enroll before regaining privileged access** — no bypass, no elevation. Every call is audited (actor, target, factor id, outcome). Self-service by the target user is not possible.

Platform Administrator break-glass: enforcement (Stage 5) is gated on at least two Platform Administrators holding verified factors, so a locked-out administrator can be reset by the other. Where only one exists, the reviewer must either enroll a second administrator or authorise an out-of-band Supabase dashboard/service-role reset as an operational runbook step — that runbook is a reviewer decision, not something this plan silently adopts.

## M. File plan (verified existing vs proposed)
Existing paths below were each confirmed on disk at baseline. New paths are labelled **proposed** and follow existing directory conventions (`src/features/auth/components/`, `src/lib/*.functions.ts` + `*.server.ts`, flat `src/routes/`).
| Path | Status | Purpose / symbols | Imports & consumers |
|---|---|---|---|
| `src/integrations/supabase/auth-middleware.ts` | existing (modify) | add `requireSupabaseAal2` | consumed by curriculum + mfa server fns |
| `src/features/auth/use-mfa.ts` | **proposed** | `useMfaStatus()` | `@/integrations/supabase/client`, React Query |
| `src/features/auth/components/mfa-enroll-dialog.tsx` | **proposed** | `MfaEnrollDialog` | used by `account.security.tsx` |
| `src/features/auth/components/mfa-challenge-form.tsx` | **proposed** | `MfaChallengeForm` | used by `/mfa` + enroll dialog |
| `src/features/auth/components/mfa-factor-list.tsx` | **proposed** | `MfaFactorList`, unenroll action | used by `account.security.tsx` |
| `src/features/auth/schemas.ts` | existing (modify) | add `otpSchema` | forms |
| `src/features/auth/safe-next.ts` | **proposed** | extract `isSafeNext` from `auth.tsx` L55–58 | `/auth`, `/mfa`, `_authenticated` gate |
| `src/lib/mfa.functions.ts` | **proposed** | `getMfaRequirement`, `recordMfaAudit`, `adminClearUserFactors` (pending L) | client-callable |
| `src/lib/mfa.server.ts` | **proposed** | requirement resolution, redacted diagnostics | server-only |
| `src/routes/mfa.tsx` | **proposed** | `/mfa` step-up route, `ssr:false`, validated `next` | route tree |
| `src/routes/auth.tsx` | existing (modify) | post-sign-in AAL branch (L117–128) | — |
| `src/routes/reset-password.tsx` | existing (modify) | recovery-session validation + MFA gate (L43–51) | — |
| `src/routes/_authenticated/route.tsx` | existing (modify) | exemptions + enrollment/step-up rules | — |
| `src/routes/_authenticated/account.security.tsx` | existing (modify) | add MFA section; lockout logic untouched | — |
| `src/features/security/checklist.ts` | existing (modify) | MFA checklist entries | `account.security-checklist.tsx` |
| `src/lib/curriculum.functions.ts`, `src/lib/curriculum-hierarchy.functions.ts` | existing (modify) | attach `requireSupabaseAal2` to platform structural writes | — |
| `src/routeTree.gen.ts` | existing (**generated**) | changes mechanically when `/mfa` is added; never hand-edited | — |
| `src/lib/mfa-policy.test.ts`, `src/lib/mfa-aal.test.ts` | **proposed** (tests) | unit coverage | vitest |
| `src/features/auth/components/mfa-enroll-dialog.test.tsx` | **proposed** (tests) | component coverage | vitest |
| `supabase/migrations/<timestamp>_sec006_mfa_aal_enforcement.sql` | **proposed** (migration) | section N | — |
| `supabase/config.toml` | existing (**configuration**, modify) | `[auth.mfa]` block | — |
No deletions. **No dependency changes and no new package.json scripts are proposed**; any would require separate approval.

## N. Migration plan
Filename pattern `supabase/migrations/<UTC timestamp>_sec006_mfa_aal_enforcement.sql`, mirroring the descriptive naming of `20260808181352_harden_critical_access_control.sql`.
Substeps needing **no** migration: Stages 1–3 (status display, enrollment UI, `/mfa` route, reset-password hardening) and all server-function AAL checks except those backed by RLS.
Ordered SQL, wrapped in a single `BEGIN; … COMMIT;` as SEC-005 does:
1. `app_private.is_aal2()` + `REVOKE`/`GRANT EXECUTE TO authenticated`.
2. Organization policy store — **omitted until UNRESOLVED DECISION 1 is approved**; may ship as its own later migration.
3. `DROP POLICY IF EXISTS` + `CREATE POLICY` for the 20 write policies in K.3, each preserving its verbatim SEC-005 predicate with `AND app_private.is_aal2()` appended.
Prerequisites: Stage 2 (reset hardening) merged; at least two Platform Administrators verified-enrolled. Reversibility: full — rollback re-creates the K.3 policies with their original SEC-005 text and drops the helper. No data is written, so rollback is lossless.

## O. Supabase configuration plan
Project tier: **Supabase Free** (stated by the reviewer; not independently inspected here).
- **Required, repository-side (verified file):** `supabase/config.toml` currently holds only `project_id` and `[auth]` password settings. Proposed addition: `[auth.mfa] max_enrolled_factors`, `[auth.mfa.totp] enroll_enabled = true`, `verify_enabled = true`. TOTP MFA is available on Free.
- **Recommended, dashboard-only (not inspected — Insufficient data to verify current values):** redirect/Site-URL allow-list covering every preview and production origin (relevant to the earlier origin-divergence finding), "Secure password change" (governs `reauthenticate()`), session timebox and refresh-token rotation, CAPTCHA on auth endpoints.
- **Plan-gated:** leaked-password protection — previously identified as unavailable/plan-gated on this project; it stays out of SEC-006 scope and is not claimed as achievable.
- **Explicitly deferred:** phone/SMS MFA (`[auth.mfa.phone]` untouched and disabled) — out of scope unless separately approved.
No dashboard or `config.toml` value was read or changed during planning; nothing here is labelled repository-verified except `supabase/config.toml` itself.

## P. Security and privacy analysis
Trust boundaries: browser (untrusted) → server function with validated bearer claims → Postgres RLS (authoritative). Client-side AAL and role checks are presentational only (K.3 pairs every UI check with RLS). Secrets: TOTP secrets and challenges never leave Supabase Auth; the service-role key stays in `client.server.ts`, imported inside handlers only; no recovery-credential store exists.
Audit targets (correction 9, verified in `supabase/migrations/20260730144142_…sql`):
- `public.audit_logs` — created L416–426; columns `id, actor_user_id, organization_id, action, entity_type, entity_id, before_state, after_state, created_at`; FKs to `profiles`/`organizations`; **no event-type CHECK**; RLS enabled L828 with `audit_logs_select` L829 and `audit_logs_insert` L834 (re-created L118–119 of `20260731094301_…sql`); grants `select, insert` to `authenticated`, `all` to `service_role` (L427–428); index `idx_audit_org_created` L457. Suitable for MFA enroll/unenroll/admin-reset entries with **no migration required**.
- `public.security_events` — created L430–441; columns `id, event_type, severity, actor_user_id, organization_id, ip_address, details, created_at`; **`event_type` has a CHECK constrained to** `('failed_login','account_lockout','suspicious_invitation_activity','excessive_password_reset_requests','other')`; `severity` CHECK `('info','warning','critical')`; RLS enabled L837 with `security_events_platform_admin_only` L838; grants `select` to `authenticated`, `all` to `service_role` (L442–443); indexes L458–459. MFA-specific event types would need an **additive migration to extend the CHECK**, or MFA challenge-failure events use `'other'` with a typed `details` payload. Recommendation: use `'other'` initially; no migration.
- Existing application write paths: *Insufficient data to verify* which modules already insert into these tables; to be confirmed before Stage 1 implementation.
Audit payloads carry actor id, target id, factor id and outcome only — never OTPs, secrets, tokens, emails or keys.
Throttling (correction 8): `public.password_change_attempts` is **not** reused, extended or overloaded. Supabase applies its own server-side MFA verification rate limits, but the exact limits for this project are *Insufficient data to verify*. Therefore no application-side MFA throttle is proposed in SEC-006; if observation after Stage 3 shows a gap, a separate bounded control is proposed as its own reviewed block.
Fail-closed conditions: missing/malformed `aal` claim, unresolvable MFA requirement, admin API error, or unverifiable freshness before unenrollment — all deny.

## Q. Accessibility and responsive design
Labelled OTP field with `inputMode="numeric"` and `autoComplete="one-time-code"`; the QR image carries a text alternative and is always accompanied by the copyable manual secret (never QR-only); errors announced via `role="alert" aria-live="assertive"` and successes via `aria-live="polite"`, matching `account.security.tsx` L255–274; focus moves to the OTP field on challenge and to the error region on failure; dialogs trap and restore focus; complete keyboard operation with visible focus; 360px single-column layout with no horizontal scroll and ≥24px targets; WCAG 2.2 AA contrast.

## R. Test and verification matrix (existing commands only — correction 10)
Verified existing `package.json` scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `test` (`vitest run`), `test:rls` (`vitest run src/lib/rls-recursion.test.ts && node scripts/check-rls-recursion.mjs`), `test:e2e` (`playwright test`). `@playwright/test` and `playwright.config.ts` exist. Type checking has **no dedicated script**; use `bunx tsgo` / `bunx tsc --noEmit` against `tsconfig.json` — labelled a proposed command, not an existing script.
| Criterion | Verification | Command |
|---|---|---|
| Role/org MFA requirement resolution | unit | `bun run test` |
| AAL claim gating incl. missing/null/malformed/non-string | unit | `bun run test` |
| Factor state transitions & unverified cleanup | unit | `bun run test` |
| Enrollment dialog, manual-secret fallback, cancel cleanup | component | `bun run test` |
| Challenge failure / expiry / cancel | component | `bun run test` |
| Route guard exemptions & loop absence (`/auth`,`/mfa`,`/account/security`,`/reset-password`,sign-out) | integration | `bun run test:e2e` |
| MFA and non-MFA login paths; step-up preserving destination | integration | `bun run test:e2e` |
| Password-reset AAL1 bypass refused; non-MFA recovery still works | integration | `bun run test:e2e` |
| Unenrollment freshness + AAL2 recheck; no nested deadlock | integration | `bun run test:e2e` |
| Administrator-assisted reset authorization + audit (if L approved) | unit + manual | `bun run test` + manual |
| RLS allow/deny at aal1 vs aal2 on the 8 tables in K.3 | RLS | `bun run test:rls` + targeted manual SQL by an approver |
| SEC-001–SEC-005 regressions unchanged | unit | `bun run test` (`src/lib/access-control-regression.test.ts`, `src/lib/curriculum-authorization-regression.test.ts`) |
| Password-lockout regressions unchanged | unit | `bun run test` (`src/lib/password-security-lockout.test.ts`) |
| Production build | build | `bun run build` |
| Lint | static | `bun run lint` |
| Authenticated manual MFA enroll → login → step-up → unenroll | manual | — |
| 360px, keyboard-only, screen-reader announcements | manual | — |
| Client-bundle secret scan | manual | grep of `dist/client` |
Playwright specs for MFA are **proposed new test files**, not existing coverage.

## S. Sequenced implementation and rollback
| Stage | Content | Depends on | DB/config? | Stop condition | Rollback |
|---|---|---|---|---|---|
| 1 | Read-only MFA status on `/account/security` (no enforcement) | — | no | status cannot be read reliably | revert files |
| 2 | **Password-reset & recovery-session hardening** (correction 13): validate recovery session, define behaviour for expired/missing/malformed/consumed sessions, require MFA challenge before `updateUser` for MFA-enabled users, preserve non-MFA recovery, keep sign-out reachable | 1 | no | any non-MFA user loses recovery | revert files |
| 3 | Enrollment + `/mfa` route + login branch + step-up + loop tests | 2 | no | any redirect loop observed | revert files |
| 4 | Organization policy store | **UNRESOLVED DECISION 1 approval** | migration — **separate approval** | option not chosen | drop object |
| 5 | Recovery mechanism | **UNRESOLVED DECISION 2 approval** | no migration under the admin-reset option | admin API unusable | revert files |
| 6 | Enforcement switch-on: `requireSupabaseAal2` + RLS AAL2 conjunctions (K.3) | 2,3,5 + ≥2 admins enrolled | migration — **separate approval** | any SEC-001–SEC-005 regression, or any admin lockout risk | restore original policy text |
| 7 | `supabase/config.toml` `[auth.mfa]` + dashboard settings | 6 | config — **separate approval** | plan-gated control assumed available | revert config |
No mandatory-enforcement stage runs while an AAL1 reset bypass exists — Stage 2 strictly precedes Stage 6.

## T. Binary final acceptance criteria
1. Final commit is a descendant of `883da9c…`; SHA reported; working tree clean; local/origin/secondary refs synchronized. ☐
2. Only files listed in M changed; `src/routeTree.gen.ts` changed only by generation. ☐
3. No dependency or script added without separate approval. ☐
4. Migration applied exactly as in N, inside one transaction, with a verified rollback script. ☐
5. Every SEC-001–SEC-005 predicate present verbatim in the re-created policies. ☐
6. `bun run test`, `bun run test:rls`, `bun run lint`, `bun run build` all pass. ☐
7. `bun run test:e2e` passes including loop, step-up, reset-bypass and unenrollment specs. ☐
8. RLS verified deny at aal1 and allow at aal2 on all 8 tables in K.3. ☐
9. Password-lockout regression tests unchanged and green; `password_change_attempts` untouched. ☐
10. Manual authenticated run: enroll → login challenge → step-up → unenroll → administrator-assisted reset. ☐
11. No Platform Administrator lockout path; ≥2 administrators verified-enrolled before enforcement. ☐
12. No application table stores TOTP secrets or recovery-credential hashes; no such grant to `authenticated`. ☐
13. Log/audit scan shows no OTP, secret, token, email, user identifier or service key. ☐
14. Client-bundle scan of `dist/client` shows no service-role key. ☐
15. WCAG 2.2 AA, keyboard-only and 360px checks pass. ☐
16. Both unresolved decisions (E, L) explicitly approved in writing before their stages. ☐

## Outstanding items for reviewer
1. **UNRESOLVED DECISION 1** — organization policy storage (E): recommendation (b), approval required.
2. **UNRESOLVED DECISION 2** — recovery mechanism (L): administrator-assisted factor reset proposed; break-glass runbook for a single-administrator project needs a decision.
3. Grace period for existing mandatory-MFA principals: recommended in principle; **duration is a reviewer decision** and is deliberately not proposed here.
4. Insufficient data to verify: current dashboard auth settings (Site URL/redirect allow-list, Secure password change, session limits, CAPTCHA); Supabase's exact MFA verification rate limits for this project; which modules already write to `audit_logs` / `security_events`.

PLAN STATUS: BLOCKED — READY once the four Outstanding items above are decided. Blocking evidence/decisions: (1) organization policy storage option; (2) recovery mechanism approval and single-administrator break-glass runbook; (3) grace-period duration; (4) read-only confirmation of the four dashboard/rate-limit/audit-write-path facts listed as Insufficient data to verify.
