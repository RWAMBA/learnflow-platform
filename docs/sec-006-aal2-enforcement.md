# SEC-006 — Deferred AAL2 enforcement migration (NOT APPLIED)

The executable second stage lives in `docs/sec-006-stage-two-enforcement.sql`.
It is intentionally **not** in `supabase/migrations/`.

## When it may become a migration

`docs/sec-006-stage-two-enforcement.sql` may be copied into
`supabase/migrations/<timestamp>_sec006_stage_two_aal2.sql` only after **all**
of the following:

1. Claude architecture/security review of the security branch is complete.
2. Independent security/release approval is recorded.
3. The security code is merged and deployed from `main`.
4. The administrator-readiness preflight (section 0 of the SQL) passes at
   deployment time.

`MFA_ENFORCEMENT_ENABLED` in `src/features/security/mfa.ts` is flipped to
`true` in the **same** release.

## Deployment prerequisites (aggregates only)

Section 0 of the SQL returns counts and booleans only — never a user id, email
or factor id. The same conditions are re-asserted transactionally by the
fail-closed guard in section 1, so the migration aborts rather than locking
administrators out:

- Active Platform Administrators >= 2, and every one of them holds a verified
  TOTP factor.
- Active Organization Administrators either hold a verified factor or are
  knowingly routed to the enrollment-only surface (`/account/mfa`) until they
  enrol; the pending count is reported as a notice, not a hard failure.
- Zero Teacher/Tutor write policies exist on the tables in scope (see below).
- Supabase Auth TOTP enrollment/verification is enabled on the hosted project
  (dashboard setting; not repository-verifiable).
- Password-reset hardening is live (already shipped: `/reset-password`
  requires a fresh authenticator code before accepting a new password).

## Change template

Each privileged write policy keeps its **existing SEC-001–SEC-005 predicate
verbatim**; the only edit is the additive `and app_private.has_aal2()`
conjunct. MFA never grants a permission the principal did not already hold.

## Surfaces in scope

Platform-owned structural curriculum writes (Platform Admin + AAL2):
`curriculum_versions`, `pathways`, `subjects`, `strands`, `sub_strands`,
`topics`, `learning_outcomes`, plus the lesson-scoped child rows
`learning_objectives` and `lesson_prerequisites`.

Tenant authoring writes (SEC-004 isolation and SEC-005 Organization
Administrator rule preserved, AAL2 added): `lessons`, `curriculum_resources`.

Tenant administration writes (Org Admin / Platform Admin + AAL2):
`organizations`, `organization_memberships`, `user_roles`, and the
administrative write path for `organization_security_settings` (re-introduced
with matching grants; stage one deliberately left it read-only).

Open-enrollment/self-service branches, Parent/Guardian branches and Student
policies are **not** modified by SEC-006.

## Teacher/Tutor conclusion

Verified against the live catalog:

- `app_private.can_author_curriculum(uuid)` resolves to
  `p_org_id is not null and app_private.has_org_role(p_org_id, 'org_admin')` —
  Organization Administrator authority only (SEC-005).
- No INSERT/UPDATE/DELETE/ALL policy on any in-scope table references a Teacher
  or Tutor role or relationship. Teacher/Tutor predicates exist only on
  relationship-scoped learning surfaces (`assignments`, `assessments`,
  messaging), which SEC-006 does not touch.

There is therefore **no Teacher/Tutor mutation surface to gate**, and the
previously drafted `app_private.org_requires_mfa()` /
`app_private.org_mfa_satisfied()` helpers have been removed from the SQL rather
than shipped unused. The `organization_security_settings.teacher_mfa_required`
and `tutor_mfa_required` columns remain the policy-storage surface, and the
implemented role-aware route guard (`readMandatoryMfa()` +
`src/routes/_authenticated/route.tsx`) is preserved and continues to honour
them for UI-level step-up. UI enforcement is visibility only and is never
authoritative.

**Carried-forward requirement:** any future change that grants Teacher or Tutor
a mutation surface must, in the same change, add authoritative conditional
enforcement to that exact policy branch
(`and (not <org requires MFA for role> or app_private.has_aal2())`) with
policy-off / policy-on allow-and-deny tests. Section 0.3 and the section 1
guard fail closed if such a surface appears first.

## Rollback

The SQL file contains a complete, executable rollback section between the
`>>> ROLLBACK SQL BEGIN` and `<<< ROLLBACK SQL END` markers: a single
`begin; … commit;` transaction that re-creates every policy with its original
pre-stage-two predicate, revokes the `organization_security_settings` write
grants, and defensively drops the drafted helpers. It contains no placeholders
and no DML, so rollback is lossless. Set `MFA_ENFORCEMENT_ENABLED` back to
`false` in the same release.

## Integrity hashes

Recomputed with:

```
python3 - <<'PY'
import hashlib
s = open('docs/sec-006-stage-two-enforcement.sql').read()
def seg(a, b):
    i, j = s.index(a), s.index(b)
    return s[i:j + len(b)]
print('forward ', hashlib.sha256(seg('-- >>> FORWARD SQL BEGIN', '-- <<< FORWARD SQL END').encode()).hexdigest())
print('rollback', hashlib.sha256(seg('-- >>> ROLLBACK SQL BEGIN', '-- <<< ROLLBACK SQL END').encode()).hexdigest())
print('document', hashlib.sha256(s.encode()).hexdigest())
PY
```

- Forward SQL: `c5174cd9c1458266210ad1212873257c587f276f302f9ed59a1fbfaecfab70be`
- Rollback SQL: `05fed47231c8c332497f5eeb2f96cef7eb3f6462a42ae4fdf4278e958a80bc86`
- Full document: `9be38a67e95a9a32a1adbf11dd14f59243284633130481ed6622afb0d25d67d2`
