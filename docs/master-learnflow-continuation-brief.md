# LearnFlow — Master Continuation Brief

Generated at the close of the security-hardening block on branch
`security/authentication-hardening`.

## 1. Authoritative state

- Stack: TanStack Start + React 19 + TypeScript + Vite + Supabase. **Not** Next.js.
- Supabase project: `smvlwwevgtwkdndxfmtp`.
- RLS is the authoritative security boundary. UI checks are visibility only.
- `MFA_ENFORCEMENT_ENABLED = false` in `src/features/security/mfa.ts`.
- Stage-two AAL2 RLS enforcement is **prepared but unapplied**
  (`docs/sec-006-stage-two-enforcement.sql`).

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

## 4. Blocking prerequisites for stage two

1. **Only one active Platform Administrator exists, with zero verified TOTP
   factors.** Activating enforcement now would lock the platform out.
   Required manual actions, in order:
   - Promote a second trusted Platform Administrator.
   - Both administrators enroll TOTP at `/account/mfa` on separate devices.
   - Re-run `enforcementReadiness()` inputs and confirm `ready: true`.
2. Apply `docs/sec-006-stage-two-enforcement.sql` as a timestamped migration.
3. Flip `MFA_ENFORCEMENT_ENABLED` to `true` in the **same** release.
4. Rollback is documented at the bottom of the prepared SQL and is lossless.

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

## 6. Next scope after security

Phase 10 Stage 1 (Universal Curriculum Engine) → Stage 2 Programmes → Stage 3
Public Website → Stage 4 Community → Stage 5 Career Pathways → Stage 6 Billing,
each independently testable and deployable, followed by a full gap analysis
against Phase 10A–10L and unfinished Phase 1–9 work.
