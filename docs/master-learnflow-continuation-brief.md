# LearnFlow — Master Continuation Brief

Generated at the close of the security-hardening block on branch
`security/authentication-hardening`. Synchronized at controlled commit
`e3089da193d2aa7b43fefd60d60f20024995beae` ("Implemented security headers"),
which is 80 commits ahead of and 0 behind `origin/main`
(`0193d736bbaff8d9a4409265288604cc5acdaaee`). `local`, `origin` and
`secondary` `security/authentication-hardening` are identical; `main` is
untouched.

## 1. Authoritative state

- Stack: TanStack Start + React 19 + TypeScript + Vite + Supabase. **Not** Next.js.
  Routing is TanStack Router file routes under `src/routes`; server logic is
  `createServerFn` plus server routes. No Next.js App Router, no react-router.
- Supabase project: `smvlwwevgtwkdndxfmtp`.
- RLS is the authoritative security boundary. UI checks are visibility only.
- `MFA_ENFORCEMENT_ENABLED = false` in `src/features/security/mfa.ts`.
- Stage-two AAL2 RLS enforcement is **prepared but unapplied**
  (`docs/sec-006-stage-two-enforcement.sql`).
- Live migration history through `20260815110738`; the three migrations added
  by this branch (`20260814230011`, `20260815092853`, `20260815110738`) are
  applied and match the repository files. No historical migration was edited
  and no unrelated migration is pending.

## 2. Closed security findings (must not regress)

SEC-001 self-assigned privileged roles; SEC-002 self-reactivated suspended
memberships; SEC-003 org-role helpers require active membership; SEC-004
published tenant content stays tenant-isolated; SEC-005 Teacher/Tutor
curriculum-authoring authority removed; SEC-006 stage one (TOTP MFA surface,
recovery-session safety, factor-removal challenge, administrator-assisted
reset, least-privilege ACLs).

## 3. Applied in this block

| Change | Effect |
| --- | --- |
| Migration `…_least_privilege_security_tables` | `security_events` and `platform_admins`: `anon`/`authenticated` write privileges revoked, `SELECT` only, `service_role` retains full access, RLS re-asserted. Additive; no data touched. |
| `src/lib/security-headers.ts` + `src/server.ts` | `nosniff`, `strict-origin-when-cross-origin`, restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, HSTS on https only, `no-store` on `/account`, `/admin`, `/dashboard`, `/mfa`, `/reset-password`, `/auth`, `/api`, `/_serverFn`. |
| `readMandatoryMfa()` + `_authenticated/route.tsx` | The MFA guard now derives *who* is mandatory from live role state (Platform Admin, Org Admin, and Teacher/Tutor only under explicit organization policy) instead of treating everyone as mandatory. Read failures fail closed to enrollment-only. Still inert while enforcement is off. |
| Tests | 147 unit tests pass, including new stage-two structural, ACL and header suites. |
| Second Platform Administrator promotion | One controlled transactional insert into `public.platform_admins` plus one `security_events` record. No Auth users, factors, roles or memberships changed. |

## 4. Stage-two readiness

Administrator readiness is now **PASS** (aggregate counts only):

- Active Platform Administrators: 2; with a verified TOTP factor: 2.
- Active Organization Administrators: 1; with a verified factor: 1; without: 0.
- Teacher/Tutor assignments under an enabled organization MFA policy: 0.

Remaining steps, to be taken only after Claude review approves activation:

1. Apply `docs/sec-006-stage-two-enforcement.sql` as a timestamped migration.
2. Flip `MFA_ENFORCEMENT_ENABLED` to `true` in the **same** release.
3. Rollback is documented at the bottom of the prepared SQL and is lossless.

Note: the header comment inside the prepared SQL still says "currently 1
active, 0 with a verified factor". That sentence is stale as of the second
administrator promotion and should be corrected when the file is copied into
`supabase/migrations/`.

## 5. Known open gaps (not invented, not silently closed)

- **Storage**: only `curriculum-resources` exists. An `assignment-submissions`
  bucket and its ownership policies are unimplemented; the submission
  ownership model must be agreed before RLS is written.
- **Leaked-password protection** remains disabled in Supabase Auth. It is a
  dashboard toggle and cannot be set from a migration.
- **CSP**: no script/style CSP and no `frame-ancestors` directive are emitted.
  Vite/TanStack Start injects inline hydration payloads with no per-request
  nonce hook, and the approved production framing origins are unknown; the app
  is currently served inside the Lovable preview iframe. Both require an
  explicit decision before a policy is shipped.
- **Auth page hydration mismatch** is reported in the browser console on
  `/routes/auth.tsx`; it is cosmetic but unresolved.
- **Lint**: ~2.9k repo-wide Prettier drift errors predate this block.
- **E2E**: `e2e/env-preflight.spec.ts` has pre-existing failures unrelated to
  security work.
- **Changed-file lint**: the files touched on this branch still report 40
  Prettier formatting errors (formatting only, no rule violations). They were
  not auto-fixed because the verification pass forbade application edits.
- **Dependency audit**: `bun audit` returns HTTP 404 in this environment; no
  vulnerability evidence could be produced.

## 5b. Responsibilities and main protection

- **Lovable**: implementation, migrations, tests, evidence packages.
- **Claude**: architecture and security review of each block before it may
  reach `main` or before any enforcement flag is activated.
- **Reviewer/user**: manual runtime verification (MFA enrollment, challenge,
  recovery, lockout, keyboard and 360px checks) and all Supabase dashboard
  settings.
- `main` is never edited or merged into directly by the agent. Work lands on a
  controlled security or feature branch, is reviewed, then merged by the user.

## 5c. Architecture invariants carried forward

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
- Deferred (V2/V3/V4) and out of current scope: native mobile apps, AI tutor
  and AI quiz generation, marketplace, public API, white-label deployments.

## 6. Next scope after security

Phase 10 Stage 1 (Universal Curriculum Engine) → Stage 2 Programmes → Stage 3
Public Website → Stage 4 Community → Stage 5 Career Pathways → Stage 6 Billing,
each independently testable and deployable, followed by a full gap analysis
against Phase 10A–10L and unfinished Phase 1–9 work.

Private instructor-document controls and the `assignment-submissions` bucket
belong to Phase 10 Stage 2 (Programmes), where the submission ownership model
is defined.

**Exact next action: Claude review of this security branch before any merge to
`main`, before stage-two application, and before enforcement activation.**
