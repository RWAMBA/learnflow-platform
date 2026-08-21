# LearnFlow — Phase 10F: Programme Architecture

**Scope:** Full-Time Homeschooling, Part-Time Tuition, Extracurricular Activities, Programme lifecycle, Programme enrollment, Programme completion.
**Status:** Approved and **implemented in Stage 2**, with the certificate concept removed (see Section 0.1). See Section 0.
**Builds on:** Phases 1–9 and Phase 10A–10E — approved.

---

## 0. Refinements Applied This Revision

| # | Refinement | Reasoning |
|---|---|---|
| 1 | Programme instructor assignment is now an explicit relationship (`programme_instructors`), not embedded on `programmes` | Enables the authorization refinement below without new role types, and supports future multiple-instructor/scheduling needs. |
| 2 | Extracurricular Programme Enrollment authorization extended to an assigned Teacher/Tutor, scoped to students they're already authorized for | Section 3. |
| 3 | `programme_type` formalized into a named Programme Category vocabulary | Section 2. |
| 4 | ~~`programmes` gains an `issues_certificate` flag~~ — **withdrawn**, see Section 0.1 | Certificates are architecturally removed. |

## 0.1 Scope Removal Applied at Stage 2 (approved)

Certificates, credentials, badges, achievement records and every
higher-learning concept (university, TVET, degree, diploma, admissions,
career aspiration, career pathway) are **architecturally removed, not
deferred**. Concretely, for this phase:

- `programmes.issues_certificate` is **not** implemented and must not be added.
- Programme completion is **only** the enrollment status `completed`. It
  confers nothing, unlocks nothing and is never rendered as an award.
- No certificate eligibility rule, issuance trigger, verification endpoint or
  credential entity exists anywhere in the Programmes module.

Phase 10H is superseded in full. Restoring any of the above requires a new,
separately approved requirement.

## 1. Full-Time Homeschooling & Part-Time Tuition — Confirmed, Unchanged

These remain product-level readings of the existing `curriculum_enrollments` categories (Primary/Supplementary, Phase 10D) — referred to here as "Academic programmes" to distinguish them from Extracurricular Programmes, but structurally identical to what Phase 10D already built. Their enrollment authorization is unchanged from Phase 10D: Organization Administrator or a full-management Parent/Guardian, because these affect the learner's formal academic record. No schema change.

## 2. Extracurricular Programme

`programmes`, with one addition to the prior revision — a formal Programme Category:

| Field (conceptual) | Purpose |
|---|---|
| `name`, `description` | What it is. |
| `category` | `academic` / `language` / `arts` / `music` / `stem` / `sport` / `technology` / `life_skills` / `enrichment` — TEXT+CHECK, not a lookup table. This mirrors `tenant_type`'s precedent (a comparably-sized, foundational taxonomy) rather than `roles`'/`curriculum_providers`' (vocabularies genuinely expected to grow at runtime). If the category list turns out to need frequent extension in practice, converting it to a lookup table later is a small, non-disruptive change — not a reason to over-build now. |
| `subject_id` | Nullable — optional link to a formal Subject, unchanged. |
| `organization_id`, `author_type`, `authoring_organization_id` | Unchanged ownership pattern from the prior revision. |
| `capacity` | Nullable — preserved exactly as designed, supporting both capacity-limited and unlimited programmes without a future schema change. |
| `schedule_description` | Unchanged — free text, not calendar-integrated. |
| ~~`issues_certificate`~~ | **Withdrawn — not implemented.** Certificates are architecturally removed (Section 0.1). |
| `status` | Unchanged draft/published/archived lifecycle. |

**New: `programme_instructors`** — the dedicated relationship the approval asked for, rather than an instructor field embedded on `programmes`:

| Field | Purpose |
|---|---|
| `programme_id` | The programme. |
| `user_role_id` | The assigned Teacher or Tutor's User Role — reuses the existing `user_roles` table, not a new identity concept. |
| `status` | `active` / `ended` — an instructor assignment has its own lifecycle, independent of the programme's or any enrollment's. |
| `assigned_at`, `ended_at` | Lifecycle timestamps. |

Supports multiple instructors per programme, and multiple programmes per instructor, from day one — no redesign needed if a programme later needs co-instructors or a scheduling handoff.

## 3. Programme Enrollment — Authorization, Refined

The lifecycle (Enrolled → Active → Completed → Withdrawn → Archived, confirmed sufficient for MVP) is unchanged. Authorization to *create* a Programme Enrollment now has two paths, both reusing existing mechanisms — no new role type, no bypass of existing permissions:

1. **Organization Administrator** (tenant-wide) or a **full-management Parent/Guardian** (their own linked child) — unchanged from the prior revision.
2. **New:** a **Teacher or Tutor who is an active instructor for that specific programme** (via `programme_instructors`) — but *only* for a Student they are **already** authorized to manage under the existing relationship model (an active `teacher_student_relationships` or `tutor_student_relationships` row). A Teacher assigned to Chess Club cannot enroll a Student they have no existing relationship with, even if that Student wants to join — both conditions must hold simultaneously.

This is a straightforward AND of two already-established checks (instructor assignment + existing relationship), not a new authorization concept.

## 4. Programme Completion

Unchanged in mechanism: completion is `programme_enrollments.status = 'completed'`
and nothing else — no separate entity, no certificate, no credential, no badge,
no achievement record. It is an internal enrollment status used for reporting
and for closing a place against capacity, and it is rendered to users as a
status only.

As implemented in Stage 2, the database enforces the lifecycle
`enrolled → active → completed | withdrawn → archived`; every other transition
is rejected by `app_private.enforce_programme_enrollment_lifecycle`, and only an
Organization Administrator may move an enrollment through it.

## 5. Ownership & RLS

Unchanged for `programmes`/`programme_enrollments` from the prior revision. `programme_instructors` follows the same shape as the three existing relationship tables (Phase 5): visible to the assigned instructor themselves and to the organization; writable only by an Organization Administrator (assigning/removing instructors is an administrative action, not something a Teacher/Tutor does to themselves).

---

## Architectural Decisions Made
1. "Academic programmes" (Full-Time/Part-Time) confirmed as existing `curriculum_enrollments` categories under a product-facing name — no new entity, unchanged from the original Phase 10F finding.
2. `programme_instructors` introduced as a dedicated relationship, enabling both the enrollment-authorization refinement and future multi-instructor/scheduling support without redesign.
3. Extracurricular Programme Enrollment authorization extended to instructor Teachers/Tutors, strictly bounded by their existing relationship with the target Student — reuses, rather than duplicates or bypasses, the established authorization framework.
4. Programme Category formalized as a nine-value TEXT+CHECK vocabulary, reasoned against the `tenant_type` precedent rather than the `roles`/`curriculum_providers` precedent.
5. ~~`issues_certificate` added to `programmes`~~ — **reversed**. Certificates, credentials and badges are architecturally removed; completion is an enrollment status only.

## Stage 2 Implementation Record

Delivered against this phase:

- `public.programmes`, `public.programme_instructors`, `public.programme_enrollments`,
  each `organization_id`-scoped, RLS-enabled, granted to `authenticated` and
  `service_role` only, with no `anon` grant and no `DELETE` grant.
- The nine-value category vocabulary as TEXT+CHECK, exactly as approved.
- Nullable `capacity` meaning unlimited; capacity counted from `enrolled` and
  `active` enrollments only, and it cannot be reduced below current occupancy.
- Atomic enrollment through `public.enroll_student_in_programme`, which takes a
  row lock on the programme before counting places, so the final place cannot be
  awarded twice under concurrency. The RPC re-runs the same authorization test
  the RLS insert policy applies, so the privileged path is not a bypass.
- The three-path enrollment authorization from Section 3, with the
  instructor path requiring an assigned `programme_instructors` row **and** an
  active `teacher_student_relationships` / `tutor_student_relationships` row for
  that same learner.
- Immutable ownership, terminal archival, undeletable instructor and enrollment
  history, and an audit row for every insert and update.
- UI at `/programmes` and `/programmes/$programmeId`, role-aware: only an
  Organization Administrator can author programmes, assign or end instructors and
  move enrollments through their lifecycle.

## Questions Requiring Approval
1. None outstanding. The nine-value Programme Category vocabulary is confirmed
   and implemented; certificate scope is removed.
