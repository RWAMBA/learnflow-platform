# LearnFlow — Phase 10H: Career Pathways Architecture

> **SUPERSEDED — SCOPE ARCHITECTURALLY REMOVED (Stage 2, approved).**
>
> LearnFlow supports **school-level education only**. University, TVET, degree,
> diploma, certificate, credential, admissions, higher-education exploration,
> progression, career aspiration and career-pathway functionality are
> **architecturally removed, not deferred**. No table, relationship, route, API,
> permission, dashboard, badge, achievement record or UI in this document may be
> implemented. This file is retained for historical traceability only.
>
> Restoring any concept below requires a new, separately approved requirement.

**Scope:** University, TVET, Degree, Diploma, Certificate progression, academic completion, and future institutional exploration.
**Status:** Approved, with refinements applied in this revision (issuer-identity model, Career Aspiration permissions, certificate integrity rules). See below.
**Builds on:** Phases 1–9 and Phase 10A–10G — approved.

---

## 0. Carry-Forward from Phase 10G

Event publish/archive authority split and the two Phase 10L implementation items (`event_registrations` structural constraints; anonymous-registration abuse protection) — unaffected by this phase, still tracked forward.

## 1. Certificates — Issuer Identity, Refined

**The original `issued_by` (a `user_role_id`) was a real design inconsistency**, not just a minor gap: every `user_role` is tenant-scoped by construction (Phase 5), but a Platform Administrator is deliberately modeled _outside_ that chain (`platform_admins`, also Phase 5) — so a platform-issued certificate could never have satisfied that field without contradicting the project's own Platform Administrator separation principle. Corrected to:

- **`issued_by_profile_id`** — the authenticated person's raw identity (`profiles`), not their tenant role. Works identically whether the issuer is a tenant Organization Administrator or a Platform Administrator.
- **`issuing_organization_id`** — nullable. Populated for an Organization-issued certificate; absent for a LearnFlow/platform-issued one.

This is the same shape now confirmed for `invoices` in Phase 10I (Section 1), for the identical reason.

## 2. Certificate Integrity Rules (carried forward to Phase 10L)

- A `curriculum_completion` certificate must reference `curriculum_enrollment_id`.
- A `programme_completion` certificate must reference `programme_enrollment_id`.
- These two references must never both be populated in conflict with each other.
- A `custom` certificate may legitimately have neither.
- Where an enrollment reference exists, the learner on that enrollment must match `certificates.student_id` — a referential consistency check, not just a foreign key.
- Revoked certificates are never deleted, only marked `status = 'revoked'` — consistent with the "preserve history, don't hard-delete" principle already used for relationships and curriculum versions throughout Phase 10.

These are real constraints requiring either database-level checks or application-level validation at implementation time — recorded here as requirements, not yet enforced at this conceptual stage.

## 3. Public Certificate Verification — Refined Mechanism

Response fields, confirmed exactly as specified: **Verification Status** (Valid/Revoked), recipient display name (first name + last initial), certificate/completion title, issue date. Never the learner's full legal name, email, phone, internal Student ID, Organization membership details, enrollment identifiers, grades, or assessment records.

**Mechanism, refined:** not a general anonymous SELECT policy on `certificates` — a **narrowly-scoped public server-side function/RPC** that accepts only a verification code and returns exclusively the four approved fields. A raw table-level SELECT policy, even one filtered by code, is a weaker boundary than a function that can never return anything beyond its fixed projection. The verification code itself must be **high-entropy and non-sequential** (a proper random token, not an incrementing ID) so it can't be enumerated or guessed — carried forward to Phase 10L as an explicit requirement, not a detail to be decided casually during implementation.

## 4. Career Aspiration — Permission Model, Refined

Not a mirror of formal academic-record edit rights, because aspirations are learner-directed planning information, not official academic results:

- An **independently logged-in Student** may create and update their **own** Career Aspirations.
- A **Parent/Guardian** with the appropriate existing management permission may create and update Career Aspirations for their linked learner.
- An **Organization Administrator** may create and update Career Aspirations for learners within their Organization.
- **Teachers and Tutors do not get this right by default**, even for learners they teach — teaching a subject doesn't imply authority over a student's personal career planning.

Still no new role or standalone permission system — this reuses the existing identity (self, via `students.user_role_id` where independent login applies), relationship (Parent↔Student), and tenant (Organization Administrator) mechanisms, just composed differently than a straight mirror of academic-record rights would have been.

## 5. Academic Completion — Unchanged

Still exactly `curriculum_enrollments.status = 'completed'` at a curriculum's final Academic Level (Phase 10D). No new concept, no change from the prior revision.

## 6. MVP Boundary — Confirmed

Career Pathways at MVP remains Career Aspiration tracking only. Real university/TVET catalogues, institutional partnerships, applications, admissions integrations, referral tracking, and tertiary-course delivery remain future functionality requiring their own validated requirements before any architecture is built against them — not silently introduced here or in any later phase without that validation happening first.

## 7. Ownership & RLS

- `certificates`: full-record read is tenant-scoped via `student_id`, same relationship-based visibility used throughout (Parent/Teacher-Tutor/Organization Administrator, as appropriate). The verification path (Section 3) is a separate, much narrower public mechanism — not the same policy, not the same data.
- `career_aspirations`: write access per Section 4's three-actor model; read access follows the same tenant/relationship-scoped visibility as the rest of a Student's record.

---

## Summary of Completed Architecture

Certificates are fully designed, including a corrected issuer-identity model that resolves a real inconsistency with the Platform Administrator separation established in Phase 5, and a deliberately narrow, privacy-minimized public verification mechanism. Career Aspiration tracking has a permission model reasoned specifically for what it actually is (learner-directed planning, not academic record) rather than defaulting to an existing pattern that didn't quite fit. Academic Completion required no new work. The MVP boundary for this domain — aspiration tracking, not institutional integration — is confirmed and explicit.

## Refinements Made During This Phase

1. Certificate issuer changed from `issued_by` (`user_role_id`) to `issued_by_profile_id` + nullable `issuing_organization_id`, fixing a real conflict with the Phase 5 Platform Administrator separation principle.
2. Public certificate verification confirmed to use a narrow server-side function returning a fixed four-field projection, not a filtered table SELECT policy.
3. Career Aspiration permissions redesigned around what the data actually is (self, Parent, Organization Administrator — explicitly not Teacher/Tutor by default) rather than mirroring academic-record rights.
4. Five concrete certificate integrity rules (Section 2) recorded for Phase 10L enforcement.

## Assumptions & Risks

1. **Assumption:** an independently logged-in Student's right to manage their own aspirations doesn't require any additional relationship check beyond their own identity — it's their own data about themselves.
2. **Risk, carried forward:** verification-code entropy and the narrow-RPC-not-raw-SELECT requirement (Section 3) are both real implementation obligations, not automatically satisfied by this design — flagged explicitly so Phase 10L treats them as requirements, not implementation-detail suggestions.

## Remaining Approval Decisions

1. Approve Phase 10H (as refined) and proceed to Phase 10I (Billing & Commercial Architecture).
