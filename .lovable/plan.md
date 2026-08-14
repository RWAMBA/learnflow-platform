# Restore the deleted password-security layer on security/authentication-hardening

The MCP merge (`452c208`) dropped the server-side password lockout work that exists at
`origin/main` (`0193d736`). SEC-006 cannot start until that layer is back on the controlled
branch. This plan only restores the regression — no SEC-006/MFA work is included.

## What gets restored

Recovered verbatim from commit `0193d736` (no redesign, no reinterpretation):

- `src/lib/password-security.server.ts` — server-side attempt/lockout logic
- `src/lib/password-security.functions.ts` — TanStack Start server functions wrapping it
- `src/features/security/checklist.ts` — security checklist data model
- `src/routes/_authenticated/account.security-checklist.tsx` — the checklist page
- `supabase/migrations/20260812155729_efc743a1-5c64-4c4b-b26c-9b56400214a7.sql` — the
  `public.password_change_attempts` migration file (restored as a file only; the migration
  is already applied on the deployed database, so nothing is re-run)

## Files reconciled rather than overwritten

Two files changed on both lines and must be merged by hand, keeping both behaviours:

- `src/routes/_authenticated/account.security.tsx` — current tree has the client-only
  cooldown. Restore the server-backed lockout calls from `0193d736` while keeping any
  intervening presentational changes.
- `src/components/layout/profile-menu.tsx` — re-add the "Security checklist" entry
  alongside the current MCP-era menu items.

`src/routeTree.gen.ts` is generated; the checklist route reappears there automatically.

## Explicitly not touched

`src/lib/mcp/**`, `src/routes/mcp.ts`, `src/routes/[.mcp]/**`,
`src/routes/[.well-known]/**`, `src/routes/[.]lovable.oauth.consent.tsx`,
`vite.config.ts`, `package.json` — the MCP integration stays exactly as it is.

## Verification before hand-off

1. `git diff --name-status 0193d736..HEAD` shows **no `D` entries** for the five restored paths.
2. TypeScript build passes.
3. `/account/security` enforces the lockout across a page refresh (server-persisted, not local state).
4. `/account/security-checklist` renders and reports current password-policy/MFA status.
5. `git status` reviewed and reported back to you.

## After this lands

Re-run the baseline reconciliation. Once the controlled branch contains both the MCP work and
the restored password-security layer, you re-approve that commit as the SEC-006 baseline and I
produce the SEC-006 plan (sections A–T) separately.
