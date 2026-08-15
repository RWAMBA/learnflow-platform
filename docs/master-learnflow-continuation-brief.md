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

| Package         | Before | After  | Fixed at | Severity | Advisory                                 | Class      | Path                                                           |
| --------------- | ------ | ------ | -------- | -------- | ---------------------------------------- | ---------- | -------------------------------------------------------------- |
| brace-expansion | 1.1.16 | 1.1.18 | 1.1.17   | high     | GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | lint       | eslint → @eslint/eslintrc → minimatch; typescript-eslint → minimatch |
| nanoid          | 3.3.16 | 3.3.18 | 3.3.18   | high     | GHSA-2v37-7h3g-55p8                      | build      | vite → postcss                                                 |
| js-yaml         | 4.3.0  | 4.3.1  | 4.3.1    | high     | GHSA-5p4m-2wfm-xmqj                      | build/lint | eslint → @eslint/eslintrc; @tanstack/react-start → xmlbuilder2 |
| esbuild         | 0.27.7 | 0.28.2 | 0.28.1   | low      | GHSA-g7r4-m6w7-qqqr                      | build      | vite; @tanstack/router-plugin → unplugin; @lovable.dev/mcp-js  |

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

## 4. Verification results

- `bunx tsgo --noEmit`: clean.
- `bun run test`: **164/164 unit tests pass** across 15 files (the 162 from the
  previous package plus 2 new stage-two structural tests; the stage-two suite is
  now 9 tests covering both the forward and rollback sections).
- `bun run test:rls`: RLS recursion check passes; live allow/deny policy testing
  against the hosted database is **skipped by design** in this block, because it
  would require authenticated write attempts as real principals.
- `bun run test:e2e`: 5/5.
- Changed-file lint: clean. `bun run lint`: **0 errors**, 7 pre-existing
  react-refresh warnings (four MCP route files were mechanically reformatted by
  Prettier to clear the remaining errors).
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
- Claude review inputs: this brief;
  `docs/sec-006-stage-two-enforcement.sql` (with the three SHA-256 values);
  `docs/sec-006-aal2-enforcement.md`; `src/lib/csp.ts`, `src/lib/csp-ssr.ts`,
  `src/lib/security-headers.ts`, `src/lib/origin-policy.ts`, `src/start.ts`,
  `src/server.ts`, `src/router.tsx`; `src/features/security/mfa.ts`,
  `src/lib/mfa-policy.server.ts`, `src/routes/_authenticated/route.tsx`; and the
  test suites `src/lib/sec006-stage-two-migration.test.ts`,
  `src/lib/csp.test.ts`, `src/lib/security-headers.test.ts`,
  `src/lib/organization-security-settings-acl.test.ts`,
  `src/lib/security-tables-acl.test.ts`, `e2e/env-preflight.spec.ts`.

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

## 9. Continuation state

Phase 1–9 functionality is implemented with the gaps listed in section 5.
Phase 10 has not started. Next scope after security: Stage 1 Universal
Curriculum Engine → Stage 2 Programmes → Stage 3 Public Website → Stage 4
Community → Stage 5 Career Pathways → Stage 6 Billing, each independently
testable and deployable, followed by a full gap analysis against Phase 10A–10L
and unfinished Phase 1–9 work. Private instructor-document controls and the
`assignment-submissions` bucket belong to Stage 2.

**Exact next action: Claude review of this security branch before any merge to
`main`, before stage-two application, and before enforcement activation.**
