# LearnFlow — Final Security Handoff Report

Branch: `security/authentication-hardening`. `main` remains the production
baseline at `0193d736` and is untouched. Stage-two AAL2 RLS enforcement is
prepared but **unapplied**, and `MFA_ENFORCEMENT_ENABLED = false`.

This report closes the three pre-merge corrections raised in Claude's review:
(1) MCP surface documentation and security review, (2) exact rollback
verification, (3) CSP / header / CSRF evidence appendix.

---

## 1. Baseline invariants

| Invariant | Verified state |
| --- | --- |
| Working branch | `security/authentication-hardening` |
| `main` | `0193d736` (untouched, not merged into) |
| Stage-two SQL location | `docs/`, **not** `supabase/migrations/` |
| Stage-two SQL SHA-256 | `9be38a67e95a9a32a1adbf11dd14f59243284633130481ed6622afb0d25d67d2` |
| MFA enforcement | `MFA_ENFORCEMENT_ENABLED = false` (`src/features/security/mfa.ts`) |
| Live migration history | through `20260815110738`; none edited |
| Platform Administrators | 2 active, both with a verified TOTP factor |
| Organization Administrators | 1 active with a verified TOTP factor, 0 pending |
| Dependency audit | `bun audit` against `registry.npmjs.org`: no vulnerabilities |

No migration, Auth setting, MFA factor or administrator record was changed while
producing this report.

---

## 2. Correction 1 — MCP surface: documentation and security review

### 2.1 Exposed surface

| Path | Handler | Purpose |
| --- | --- | --- |
| `/mcp` | `src/routes/mcp.ts` | MCP Streamable HTTP transport |
| `/.mcp/list-tools` | `src/routes/[.mcp]/list-tools.ts` | REST tool listing |
| `/.mcp/invoke-tool/$tool` | `src/routes/[.mcp]/invoke-tool/$tool.ts` | REST tool invocation |
| `/.well-known/oauth-protected-resource` | `src/routes/[.well-known]/oauth-protected-resource.ts` | Public, non-secret OAuth resource metadata |
| `/.lovable/oauth/consent` | `src/routes/[.]lovable.oauth.consent.tsx` | Supabase-driven consent screen |

All four transport routes are generated verbatim by the `@lovable.dev/mcp-js`
Vite plugin from the single definition in `src/lib/mcp/index.ts`; they are now
excluded from Prettier/ESLint (they are regenerated on every build).

### 2.2 Authentication and token handling

- The server is defined with `auth.oauth.issuer({ issuer: https://<project-ref>.supabase.co/auth/v1, acceptedAudiences: "authenticated" })`.
  There is no anonymous mode, no shared API key and no bypass flag.
- The SDK verifies the bearer JWT against the Supabase issuer before a handler
  runs; unauthenticated calls receive `401` with a
  `WWW-Authenticate` pointer to the protected-resource metadata.
- Every handler independently re-checks `ctx.isAuthenticated()` and returns an
  `isError` result rather than querying — defence in depth if transport
  verification were ever relaxed.
- `supabaseForUser` (`src/lib/mcp/supabase.ts`) throws unless `ctx.getToken()`
  returns a verified token, then builds a **publishable-key** client that
  forwards `Authorization: Bearer <caller token>` with
  `persistSession: false, autoRefreshToken: false`.
- No MCP file imports `client.server`, `supabaseAdmin`, or any `SERVICE_ROLE`
  value; no MCP file logs anything. Tokens are never persisted, echoed or
  written into responses.

### 2.3 Tools and boundary enforcement

| Tool | Input | Read scope | Bound |
| --- | --- | --- | --- |
| `whoami` | none | `profiles`, `user_roles` (active), `platform_admins` (active) for the token's own user id | single user |
| `list_students` | optional `organizationId` (uuid), optional `search`, `limit` | `students` + grade/pathway | 1–100, default 25 |
| `list_assignments` | optional `studentId` (uuid), optional `status` enum, `limit` | `assignments` + lesson/subject/student | 1–100, default 25 |
| `search_curriculum` | required non-empty `query`, `limit` | `lessons` + subject | 1–50, default 20 |

- Every tool is annotated `readOnlyHint: true`, `idempotentHint: true`,
  `openWorldHint: false`, and only ever calls `.select(...)`. No tool performs
  `insert`, `update`, `upsert`, `delete` or `rpc`.
- **RLS is the authoritative boundary.** Tool parameters are *narrowing filters
  only*: `organizationId` and `studentId` reduce rows the caller's policies
  already permit, and cannot widen them. Spoofing another tenant's id yields an
  empty result, not a leak.
- `whoami` derives identity exclusively from `ctx.getUserId()`; its input schema
  is empty, so no caller-supplied user id can reach a query.
- Errors return only `error.message`; PostgREST `details`/`hint` payloads and
  raw error objects are not surfaced.

### 2.4 CSRF interaction (defect found and fixed)

`/mcp` was exempt from origin validation, but the REST fallback prefix `/.mcp`
was not, so bearer-authenticated agents that legitimately send no `Origin`
would have been rejected on `POST /.mcp/invoke-tool/*`. `/.mcp` is now listed in
`ORIGIN_EXEMPT_PREFIXES` (`src/lib/origin-policy.ts`). The exemption is matched
on whole path segments, so `/mcp-admin-console`, `/mcpx` and `/.mcpx/...` remain
fully origin-validated. Exemption is safe only because these endpoints
authenticate the caller with a verified OAuth bearer token.

### 2.5 Tests added

`src/lib/mcp-surface.test.ts` — 25 tests covering: advertised tool set and
read-only annotations; OAuth-only auth with no anonymous fallback; absence of
secrets in the manifest and metadata; no service-role import and no logging in
any MCP file; token forwarding and session-persistence settings; rejection of
missing/invalid/expired tokens for all four tools; limit bounds, empty-query
rejection, malformed-uuid rejection, unknown-property rejection, invalid status
rejection; identity derived from the token; filters as narrowing-only;
read-only PostgREST usage; error-message minimisation; whole-segment origin
exemptions and continued validation of look-alike paths; consent-screen
redirect target not caller-controlled.

---

## 3. Correction 2 — Exact rollback verification

- `docs/sec-006-prestage-two-policy-baseline.json` captures the authoritative
  pre-stage-two policy definitions read from the live `pg_policies` catalog
  (SHA-256 `19f19054822d3d1b17d095218d5e8e52dc7e75e0e271d43a3e1fb0012a889e99`).
- `src/lib/sql-predicate-normalize.ts` normalises SQL predicates lexically
  (keyword casing, redundant type casts, schema prefixes, grouping parentheses
  versus call parentheses) so forward, rollback and catalog text are
  machine-comparable.
- `src/lib/sec006-rollback-parity.test.ts` — 36 tests asserting that: every
  policy the forward transaction replaces has a rollback counterpart; each
  rollback predicate normalises **exactly** to the captured pre-stage-two
  definition (lossless, not merely equivalent-looking); rollback removes every
  `has_aal2()` term; self-service branches are preserved; and the rollback
  transaction contains no destructive DML.
- `src/lib/sec006-stage-two-migration.test.ts` continues to verify the forward
  script's aggregate-only preflight gates and fail-closed transactional guard.

---

## 4. Correction 3 — CSP, header and CSRF evidence appendix

### 4.1 Nonce generation

`createCspNonce()` (`src/lib/csp.ts`) draws 16 bytes from
`crypto.getRandomValues` and base64-encodes them — per response, never derived
from a secret, never reused. `src/lib/csp-ssr.ts` threads that nonce into the
router (`src/router.tsx` → `router.options.ssr.nonce`), which is the value both
TanStack SSR inline scripts honour, and into the response header, so the
document's inline scripts and the header always agree.

### 4.2 Policy construction

`buildContentSecurityPolicy()` emits, for the production bundle:
`default-src 'self'`; `object-src 'none'`; `base-uri 'self'`;
`form-action 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`;
`style-src 'self' 'nonce-…'`; `img-src 'self' data: blob:`;
`font-src 'self' data:`; `worker-src 'self' blob:`; `frame-src 'none'`;
`connect-src 'self' <supabase https origin> <supabase wss origin>`;
`upgrade-insecure-requests` on https.

- `'unsafe-eval'` is never emitted. The single `'unsafe-inline'` is confined to
  `style-src-attr`, which permits React's `style=""` attributes and cannot
  execute script.
- Framing: `frame-ancestors 'none'` everywhere except verified preview hosts
  (`localhost`, `*.lovableproject.com`, `*.lovable.dev`, and the
  `id-preview--*` / `*-dev` `*.lovable.app` sandboxes), where the Lovable editor
  origins are allowed. Custom domains are treated as production.
- Script/style directives are omitted only in dev, where Vite injects its own
  un-nonced inline scripts.

### 4.3 Origin / CSRF validation

`requiresOriginValidation()` (`src/lib/origin-policy.ts`), applied by
`csrfMiddleware` in `src/start.ts`: **all** server functions are validated;
server routes are validated for every state-changing method (`GET`/`HEAD`/
`OPTIONS` exempt); `/mcp`, `/.mcp`, `/.well-known/` and `/api/public/` are
exempt on whole-segment matching because each authenticates its caller
independently of origin.

### 4.4 Evidence hashes (SHA-256)

```
9be38a67e95a9a32a1adbf11dd14f59243284633130481ed6622afb0d25d67d2  docs/sec-006-stage-two-enforcement.sql
19f19054822d3d1b17d095218d5e8e52dc7e75e0e271d43a3e1fb0012a889e99  docs/sec-006-prestage-two-policy-baseline.json
3944367338883191c18c545dba85b24c919cdc22e7037b1812aefd8ef6874a01  src/lib/csp.ts
1893df94810a9efc65d26e3ecb8e1d1c25b9144e5fffcafb17fece18cfba0aa0  src/lib/csp-ssr.ts
8672b1e4cabdf5c74b959a6b73f3f9da8c16c1fd997366e95c24f1847b894364  src/lib/security-headers.ts
8a0538d524d92c1e1c6597350ac2daf2c594d1059e8af2a116e1e1b172b54ce8  src/lib/sql-predicate-normalize.ts
23831a9d9671da3b234c4e5ed8087f9daa678d1a680f3758d119e34645104c4d  src/lib/mcp/index.ts
dd17dbefcf1a1e2355a1c1edcbad1aeb24e595ec18bbe9ba617014aa89f228cb  src/lib/mcp/supabase.ts
d6ddcecfddf0bfe55cd53fb2dd861e3c1af833f520b942b6237cf952efd3f69c  src/lib/mcp/tools/list-assignments.ts
7c784e3a70f20ee4e8e30d5ff087a61467a2ad81a7e69839ec94f4cd51e1d482  src/lib/mcp/tools/list-students.ts
8b7f1ce9e1e20aaedeb9e11d7d638ee5a66aa7a51dc9795c2358e5067b54e4cc  src/lib/mcp/tools/search-curriculum.ts
54e392241273cc156751fc2bef81fded5698679eae454700152fac6cd6a444f0  src/lib/mcp/tools/whoami.ts
```

`src/lib/origin-policy.ts` changed in this block; its post-change hash is
recorded in section 6.

---

## 5. Diff summary for this block

| File | Change |
| --- | --- |
| `src/lib/mcp-surface.test.ts` | **new** — 25-test MCP security suite |
| `src/lib/sec006-rollback-parity.test.ts` | **new** — 36-test exact rollback parity suite |
| `src/lib/sql-predicate-normalize.ts` | **new** — SQL predicate normaliser |
| `docs/sec-006-prestage-two-policy-baseline.json` | **new** — authoritative pre-stage-two policy fixture |
| `src/lib/origin-policy.ts` | `/.mcp` added to the whole-segment origin exemptions |
| `.prettierignore`, `eslint.config.js` | exclude plugin-generated MCP route files |
| `docs/final-security-handoff-report.md` | **new** — this report |
| `docs/master-learnflow-continuation-brief.md` | MCP section + rollback/handoff references |

No application behaviour, migration, RLS policy, enforcement flag or
administrator record changed.

---

## 6. Verification results

| Gate | Result |
| --- | --- |
| Typecheck (`tsgo`) | PASS |
| Unit + RLS tests (`bun run test`) | **225/225 PASS** across 17 files |
| MCP surface suite | 25/25 PASS |
| Rollback parity suite | 36/36 PASS |
| Stage-two forward suite | PASS |
| E2E (`bun run test:e2e`) | **5/5 PASS** |
| Lint (`bun run lint`) | **0 errors**, 7 pre-existing react-refresh warnings |
| Production build | PASS (Cloudflare Worker output) |
| `bun audit` (public registry) | No vulnerabilities found |
| Secret isolation | no service-role key or `sb_secret_` value in the client bundle |

---

## 7. Outstanding, non-repository items

- Supabase dashboard: leaked-password protection, TOTP enablement, rate limits,
  CAPTCHA, redirect allow-list.
- Manual runtime verification: MFA enrollment/challenge/recovery, password
  lockout, keyboard navigation, 360px layout.
- Stage-two application and enforcement activation remain gated on Claude's
  approval; stage-two SQL must be applied only with the documented preflight and
  the verified rollback transaction on hand.
