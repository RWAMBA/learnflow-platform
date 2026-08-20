# Phase 10 Stage 1 — Continuation Decision Record

Additive record of Stage 1A–1C controlled corrections. This document does not
modify the approved Phase 10M architecture; it records decisions taken during
Stage 1 execution.

Date: 20 August 2026
Branch: `feature/phase10-stage1c-enrollment-lifecycle` (PR #6, draft)

---

## SD-1 — New student creation must create a real curriculum enrollment

### Defect

`createStudentWithGuardian` wrote `students.grade_id` and `students.pathway_id`.
Those columns are deprecated compatibility data after the Stage 1 legacy cutover
and no longer control placement, so any newly created learner with a grade
received no `curriculum_enrollments` row and silently recreated the legacy
placement problem.

### Decision

Placement is created at learner creation time, in the authoritative structure,
or the whole operation fails.

- The deprecated learner columns are no longer written by active application
  code, and are still not read by it.
- When a grade is supplied, one `curriculum_enrollments` row is created with
  `enrollment_category = 'primary'`, `status = 'pending'`, the validated
  academic level, the deterministically resolved current curriculum version and
  the optional validated track.
- When no grade is supplied, no enrollment is invented; the approved
  optional-placement behaviour is preserved.
- Grade selection remains a user-facing capability in the creation form.

### Deterministic version resolution (fail closed)

`app_private.resolve_current_curriculum_version(uuid)` mirrors the proven legacy
resolver:

| Current versions for the grade's curriculum | Result |
| --- | --- |
| exactly one | that version is used |
| zero | operation rejected with a user-safe error |
| more than one | operation rejected as ambiguous |

No newest-wins fallback, no implicit selection, no unrelated curriculum.

### Atomicity

Existing server functions run one statement at a time against the caller's
session, which cannot express a multi-row all-or-nothing write, and the
`curriculum_enrollments` INSERT policy admits only organization administrators
and platform administrators — a guardian creating their own learner is not
permitted to write the enrollment directly.

Therefore a new, additive, forward-only migration
(`20260820190500_4f2a9c17-6d51-4b83-9e0a-77c3d1f2ab64.sql`) introduces
`public.create_student_with_placement(...)`:

- `SECURITY DEFINER` with a locked `search_path = public`;
- authenticates (`auth.uid()`), then authorizes against
  `app_private.has_org_role(...)` for `parent_guardian` or `org_admin`, so an
  inactive or suspended membership is denied;
- derives tenant ownership server-side; the client cannot override it;
- validates the academic level, its curriculum, the track's membership of that
  level and the pathway-required rule;
- performs learner, guardian relationship, enrollment and audit writes in one
  transaction, so a failure leaves no orphan learner, partial relationship,
  partial enrollment or legacy placement write;
- asserts explicit preconditions and postconditions;
- grants `EXECUTE` to `authenticated` only; `PUBLIC` and `anon` are revoked;
- leaves every RLS policy, the duplicate-primary guard and the enrollment
  lifecycle triggers untouched and authoritative.

The revoked one-time legacy helper
`app_private.resolve_legacy_placement_version` is not called by application
sessions; only its resolution rule is reused, in a separately scoped private
function that is likewise revoked from `anon`, `authenticated` and `PUBLIC`.

The migration remains **pending / unapplied** until controlled production
finalization.

### Legacy-field cutover status

Zero active application reads and zero active application writes of
`students.grade_id` / `students.pathway_id` remain. Remaining references are
historical reporting (the read-only reconciliation report), migration SQL,
generated Supabase types and tests. The columns are not dropped in this
correction.

---

## SD-2 — Approved migration exception: 20260818154626 sections 8–9

Migration `20260818154626_91d235f0-3c64-4c9f-82a1-3f9c19b8c423.sql` is applied
and immutable. Sections 8–9 lack the project's standard fail-closed
starting-state precondition.

This is accepted as a narrowly scoped historical exception because:

- every affected statement is independently idempotent;
- the migration is already applied and immutable;
- live evidence confirms exactly 12 valid CBC levels;
- there are zero duplicates, zero out-of-scope levels and zero unstaged levels;
- PP1/PP2 level rows do not exist;
- the retained Pre-Primary stage is unavailable and has zero levels;
- disposable replay passed;
- no unsafe resulting state was identified.

The applied migration is **not** edited or re-executed to retrofit preconditions.

### Binding rule for future migrations

Every future curriculum-catalogue, hierarchy or reference-data correction
migration MUST contain:

- explicit fail-closed preconditions;
- ambiguity detection;
- non-destructive behaviour;
- postcondition verification;
- no guessing and no silent repair of unexpected states.

Applied migrations are never edited or re-executed.

---

## SD-3 — Platform Administrator active-status verification (no change required)

Observation: `assertPlatformAdmin` in `src/lib/curriculum-rights.server.ts`
checks only for the existence of a `platform_admins` row, while
`src/lib/rights-evidence.server.ts` requires `status = 'active'`.

Read-only trace:

- `app_private.is_platform_admin()` is `SECURITY DEFINER`, `search_path = public`
  and returns true only for `platform_admins.status = 'active'`.
- Every RLS policy governing rights writes — `rights_grants_platform_admin`
  (ALL), `source_artifacts_platform_admin` (ALL), the `curriculum_versions`
  INSERT/UPDATE/DELETE policies — is gated by `app_private.is_platform_admin()`
  in both `USING` and `WITH CHECK`.
- `curriculum-rights.server.ts` executes exclusively through the caller's
  Supabase session (`context.supabase`); it never imports the service-role
  client. Only `rights-evidence.server.ts` uses the admin client, and it
  requires active status first.

Conclusion: a revoked Platform Administrator is denied every rights mutation by
the authoritative RLS boundary. The existence-only pre-check is a
non-authoritative, fail-closed convenience message. No change is made, and no
scope expansion is taken.
