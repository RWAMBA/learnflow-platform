# Fail-closed password-change lockout (UI repair)

The server-runtime Supabase key is now bound, so the lockout server functions can write to
`public.password_change_attempts` again. The remaining defect is in the UI: every call to the
lockout server functions is wrapped in `.catch(() => null)`, so if the server layer fails the
page silently behaves as if there were no lockout at all. That is fail-open behaviour on a
security control.

## What changes

Scope: one file, `src/routes/_authenticated/account.security.tsx`. No schema, no server-function
signature, no RLS, no MFA work.

1. **Track lockout-service health.** Add a small piece of local state (e.g. `lockoutUnavailable`)
   set to `true` whenever a lockout server call rejects.
2. **Initial load (line ~88).** Keep the page usable, but on failure set `lockoutUnavailable` and
   show a non-blocking warning that attempt limiting could not be confirmed.
3. **Pre-submit re-check (line ~116).** If the re-check rejects, do **not** proceed. Show a clear
   error ("We could not verify your account's security status — please try again in a moment")
   and return. This is the fail-closed switch: an unreachable lockout service must block the
   password change, not wave it through.
4. **Failure recording (line ~146).** If `recordPasswordChangeFailure` rejects, fall back to the
   local attempt counter *and* apply a client-side cooldown once the local count reaches the
   threshold, plus surface that the attempt could not be recorded server-side. An attacker can
   still refresh past the local counter, but combined with step 3 the submit path stays blocked
   while the service is down.
5. **Success reset (line ~172).** Failure here is harmless (stale rows expire), so keep it
   tolerant but log it to the console for diagnosis instead of swallowing silently.
6. **Copy and a11y.** Reuse the existing `formError` alert pattern and status badge styling so
   the new states match the current design system; the alert region stays `role="alert"`.

## Verification

- Re-test `/account/security` manually: three wrong current-password attempts must now produce
  the paused-form message and countdown, and the countdown must survive a page refresh.
- Confirm rows appear in `public.password_change_attempts` after failed attempts.
- Simulate a lockout-service failure and confirm the submit path blocks rather than proceeding.
- Typecheck and the existing test suite must stay green.

## Out of scope

SEC-006 / MFA, ACL hardening of `password_change_attempts`, and any migration work remain
untouched and will be planned separately.
