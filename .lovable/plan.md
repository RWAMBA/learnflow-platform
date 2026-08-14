# Password lockout diagnostic report — HEAD `3a7ac9301`

## Conclusion

**Classification: B. Failure attempts are not being recorded.**

The test exceeded the configured threshold: Supabase Auth logs contain 30 rejected password sign-in requests in the inspected 24-hour period, while `public.password_change_attempts` contains zero rows and zero recorded attempts. The current server runtime has `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, but `SUPABASE_SERVICE_ROLE_KEY` is missing. Every lockout read/write uses the service-role client, which throws as soon as it is first accessed. The page catches those failures and converts them to `null`, so the user sees only the ordinary incorrect-password message and never receives a persisted lockout state or countdown.

## 1. Configured threshold and duration

- Threshold: **3 failed attempts** (`src/lib/password-security.server.ts:3`).
- Escalating cooldowns: **30 seconds, 60 seconds, then 300 seconds** (`src/lib/password-security.server.ts:4,46-49`).
- Attempt 3 receives 30 seconds; attempt 4 receives 60 seconds; attempt 5 and later receive 300 seconds, provided each later attempt occurs after the previous lock expires.
- The route duplicates the threshold as `3` at `src/routes/_authenticated/account.security.tsx:31`.

## 2–4. Incorrect-password execution path and server-function result

1. Valid form submission enters `onSubmit` (`account.security.tsx:113`).
2. It first calls `getPasswordChangeLockout`; any failure is suppressed to `null` (`:116`).
3. It resolves the signed-in user's email (`:129-139`).
4. It verifies the supplied current password with `supabase.auth.signInWithPassword` (`:141-144`).
5. On invalid credentials, the `verifyError` branch is entered (`:145`).
6. That branch invokes `recordPasswordChangeFailure` (`:146`). Thus the client code does call/attempt the server function after every rejected current password.
7. The server function passes through `requireSupabaseAuth`, dynamically imports `supabaseAdmin`, and calls `registerFailure` (`src/lib/password-security.functions.ts:12-18`).
8. `registerFailure` first reads the current row, increments it, and upserts the result (`src/lib/password-security.server.ts:38-68`).
9. In the current runtime, this cannot complete: constructing/using `supabaseAdmin` requires `SUPABASE_SERVICE_ROLE_KEY`; its absence throws (`src/integrations/supabase/client.server.ts:32-44,58-67`).
10. The route suppresses the rejected server-function call with `.catch(() => null)` (`account.security.tsx:146`).

No retained network snapshot or server log entry exposes the individual RPC, so transport-level receipt cannot be independently reconstructed. The source proves the invocation is reached after `verifyError`; runtime prerequisites prove the handler cannot successfully persist in the environment inspected.

## 5–7. Persistence, readback, and UI receipt

- Live read-only database check: **0 rows**, **0 total failed attempts**, no latest update in `public.password_change_attempts`.
- Therefore no row was created or updated by the manual test.
- `getPasswordChangeLockout` cannot return a persisted record because none exists; in the current runtime it also depends on the same missing service-role client (`password-security.functions.ts:4-10`).
- Initial-load errors are silently discarded (`account.security.tsx:75-90`). Submit-time read errors are converted to `null` (`:116`). Record-write errors are also converted to `null` (`:146`).
- The UI therefore never receives a state with `lockedForSeconds > 0`, which is required to set `cooldownUntil` and render lockout messaging (`:117-124,152-159`).

## 8–10. Countdown and suppressed-error conditions

The countdown **does exist**:

- The timer derives `secondsLeft` from `cooldownUntil` once per second (`account.security.tsx:96-109`).
- `locked` is true only while `secondsLeft > 0` (`:111`).
- The page displays `You can try again in {secondsLeft}s` only when `locked` is true (`:228-232`) and changes/disables the submit button (`:274-279`).

Conditions preventing it from rendering:

- A server read/write rejects and is converted to `null` (`:88-90,116,146`).
- No returned state has `lockedForSeconds > 0` (`:117,152`).
- When recording fails, the fallback only increments React-local `failedAttempts` (`:147-148`). Even after the local count reaches 3, the lockout branch requires a non-null server state. The remaining-attempt display is clamped to at least 1 (`:162`), so it continues showing a generic **Current password is incorrect** message rather than revealing that persistence failed.
- The generic message is set at `:163-166`; no server error text reaches the user.

## 11. Permissions, RLS, middleware, and environment

- The deployed table exists and RLS is enabled.
- The deployed privilege probe reports service-role read/insert/update capability. The migration grants service role full table access (`supabase/migrations/20260812155729_efc743a1-5c64-4c4b-b26c-9b56400214a7.sql:10-18`). Service-role access bypasses RLS, so table RLS is not the blocker.
- Browser code does not write the table directly; all persistence is intended to happen through the privileged server client.
- Auth token attachment is registered globally (`src/start.ts:37-39`; `src/integrations/supabase/auth-attacher.ts:5-13`). Server middleware validates the bearer token and supplies `context.userId` (`auth-middleware.ts:33-107`). There is no evidence that this middleware is the primary failure.
- The global preflight checks only the `core` scope (`src/start.ts:9-12`), while the service-role key is classified as `admin` (`src/lib/env-preflight-vars.ts:14-25`). It therefore does not fail early or explain the missing key before the handler runs.
- Direct environment-presence inspection, without reading values: `SUPABASE_URL=present`, `SUPABASE_PUBLISHABLE_KEY=present`, `SUPABASE_SERVICE_ROLE_KEY=missing`.
- The project uses an externally managed Supabase connection, so an authenticated browser session could not be recreated independently for a non-mutating end-to-end replay.

## 12. Logs (redacted)

- Supabase Auth logs: **30** `/token` responses with status 400 and `Invalid login credentials` in the inspected 24-hour period. No email, user ID, token, or password was retrieved or reported.
- Postgres logs: no `password_change_attempts`, permission-denied, or RLS-error entries in the inspected six-hour window.
- Preview server-function logs: no matching `password_change_attempts`, `Unauthorized`, or `SUPABASE_SERVICE_ROLE_KEY` entries in the last hour.
- Browser snapshot: no retained server-function network request and no matching client console error. This is consistent with explicit client-side suppression, but does not independently prove transport receipt.

## 13. Responsible files and lines

- Configuration and persistence: `src/lib/password-security.server.ts:3-4,22-35,38-68`.
- Authenticated wrappers: `src/lib/password-security.functions.ts:4-18`.
- Missing-key throw: `src/integrations/supabase/client.server.ts:32-44,58-67`.
- Token attachment/authentication: `src/integrations/supabase/auth-attacher.ts:5-13`, `src/integrations/supabase/auth-middleware.ts:33-107`, `src/start.ts:37-39`.
- Incomplete preflight scope: `src/start.ts:9-12`, `src/lib/env-preflight-vars.ts:14-25`.
- Error suppression and display gating: `src/routes/_authenticated/account.security.tsx:75-90,96-124,141-166,228-232,274-279`.
- Table access definition: `supabase/migrations/20260812155729_efc743a1-5c64-4c4b-b26c-9b56400214a7.sql:1-18`.

## 14. Minimal regression-only repair plan (not implemented)

1. Restore/rebind `SUPABASE_SERVICE_ROLE_KEY` for the preview/server runtime; do not alter the database row or MFA scope.
2. Include the service-role requirement in the preflight for these privileged password-security functions, or add a narrowly scoped explicit configuration failure so this cannot silently degrade.
3. Stop swallowing lockout read/write failures: retain a safe, non-sensitive error state that blocks password changes and tells the user the security check is temporarily unavailable. Log a redacted server-side diagnostic.
4. Add regression tests for attempts 1–2, attempt 3 producing a 30-second lock, refresh/readback persistence, and service failure causing fail-closed UI rather than a local counter.
5. Re-test with an authenticated account and verify one persisted row, readback, message, countdown, and refresh persistence; do not reset attempt records as part of diagnosis.

No files, database data, commits, branches, or password-attempt records were changed, and no SEC-006/MFA work was started.
