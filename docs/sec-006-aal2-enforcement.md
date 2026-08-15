# SEC-006 — Deferred AAL2 enforcement migration (NOT APPLIED)

This document holds the second-stage SEC-006 migration. It is intentionally
**not** in `supabase/migrations/`, because applying it before the activation
prerequisites are met would lock every administrator out of the platform.

## Activation prerequisites

1. At least `MIN_ENROLLED_PLATFORM_ADMINS` (2) active Platform Administrators
   hold a **verified** TOTP factor — confirm with `mfaEnforcementReadiness()`.
2. Active Organization Administrators are enrolled, or are knowingly restricted
   to enrollment-only access until they enroll.
3. Supabase Auth TOTP enrollment/verification is confirmed enabled on the
   hosted project (dashboard setting; not repository-verifiable).
4. Password-reset hardening is live (already shipped: `/reset-password`
   requires a fresh authenticator code before accepting a new password).
5. `MFA_ENFORCEMENT_ENABLED` in `src/features/security/mfa.ts` is flipped to
   `true` in the same release.

## Change template

Each privileged write policy keeps its **existing SEC-001–SEC-005 predicate
verbatim**; the only edit is the additive `and app_private.has_aal2()`
conjunct.

```sql
drop policy <name> on public.<table>;
create policy <name> on public.<table>
  for <command> to authenticated
  using (<ORIGINAL PREDICATE VERBATIM> and app_private.has_aal2())
  with check (<ORIGINAL CHECK VERBATIM> and app_private.has_aal2());
```

## Surfaces in scope

Platform-owned structural curriculum writes (Platform Admin + AAL2):
`curricula`, `grades`, `curriculum_versions`, `pathways`, `subjects`,
`strands`, `sub_strands`, `topics`, `learning_outcomes`,
`learning_objectives`, `lesson_prerequisites`, `competencies`.

Tenant authoring writes (SEC-004 isolation and SEC-005 Organization
Administrator rule preserved, AAL2 added): `lessons`, `curriculum_resources`.

Tenant administration writes (Org Admin + AAL2): `organizations`,
`organization_memberships`, `user_roles`.
`organization_security_settings` already requires AAL2 (stage 1).

Teacher/Tutor writes gain AAL2 **only** under organization policy:

```sql
and (
  not exists (
    select 1 from public.organization_security_settings s
    where s.organization_id = <table>.organization_id
      and s.teacher_mfa_required
  )
  or app_private.has_aal2()
)
```

Parent/Guardian and Student policies are **not** modified by SEC-006.

## Rollback

Re-create each policy with the original predicate (the verbatim text recorded
in the migration that created it), dropping the AAL2 conjunct, and set
`MFA_ENFORCEMENT_ENABLED` back to `false`.
