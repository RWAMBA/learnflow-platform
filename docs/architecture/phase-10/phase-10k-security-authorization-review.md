# LearnFlow — Phase 10K: Security & Authorization Review

**Scope:** RLS, Supabase Auth, platform vs. tenant data, curriculum ownership, instructor applications, consultation/merchandise forms, Community permissions, Programme permissions — reviewed across every domain introduced in Phase 10A–10J. No SQL, migrations, implementation code, or Lovable prompts in this phase.
**Status:** Approved and finalized, with the RLS classification corrected in this revision — see Section 0.
**Builds on:** Phases 1–9 and Phase 10A–10J — approved, all finalized.

---

## 0. Corrections Applied in This Revision

The prior draft's RLS census grouped curriculum structure, authored content, and commercial pricing data under one overly broad "platform-level content" pattern, and stated a "seven patterns" count that didn't actually match what was enumerated. Both are corrected here:

1. **True platform/global reference data** is now separated from **mixed-ownership authored content** — the earlier draft's biggest gap: a tenant-authored Lesson, Learning Resource, or Programme must never become cross-tenant readable merely because it's `published`. "Published" only means broadly visible for _platform-owned_ content; for organization-owned content, it only means "ready within that organization," and visibility still requires organization membership regardless of status.
2. **Fee Definitions** are reclassified as commercial configuration, not generic content — Organization-specific ones are Organization Administrator (issuing org) plus Platform Administrator oversight only, never broadly readable, and never implicitly accessible just because a Parent can see an invoice line item that references one.
3. **Events vs. Announcements write authority** is corrected for ambiguity (fixed directly in Phase 10G, Section 7) — Programme instructor delegation applies only to Events tied to their own assigned programme, never to Announcements.
4. **`event_registrations`** gets a more precise actor list, with attendance updates restricted to the organizer/admin context, never self-reported by the registrant (also fixed in Phase 10G, Section 7).
5. **Recursive cycle prevention** extends to `academic_periods` (Phase 10D), not only `curriculum_nodes` — both are self-referencing hierarchies with the identical structural risk; this was an oversight in the original design, not a newly-introduced requirement.
6. **`system_settings`** gets a differentiated read policy — branding/public-display settings may be broadly exposed; security-sensitive or operational settings stay restricted to Platform Administrators or narrowly controlled application access, not a blanket "any authenticated user" read.
7. **The pattern count is recalculated honestly, not preserved at an arbitrary number.** After the corrections above, there are twelve distinct patterns, not seven — the earlier count was simply wrong, and the architectural principle that matters is reuse of established mechanisms, not hitting a round number.

## 1. RLS Pattern Census, Corrected

| #   | Pattern                                                    | Tables                                                                                                                                                                               | Read                                                                                                                                                                                                                                                                                                                            | Write                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | True platform/global reference data                        | `curriculum_providers`, `curricula`, `curriculum_versions`, `education_stages`, `academic_levels`, `tracks`, `subjects`, `subject_groups`, `curriculum_nodes`, `learning_objectives` | Any active session, or public for published rows — never tenant-authored, always platform-defined                                                                                                                                                                                                                               | `is_platform_admin()` only                                                                                                                                                                                            |
| 2   | Mixed-ownership authored content                           | `lessons`, `learning_resources`, `programmes`                                                                                                                                        | Platform-owned + published: broad. **Organization-owned: scoped to the owning Organization only, regardless of status — never cross-tenant, published or not.**                                                                                                                                                                 | `is_platform_admin()` for platform-owned; the authoring Organization's authorized author, scoped to their own `authoring_organization_id`, for tenant-owned                                                           |
| 3   | Tenant-scoped, relationship-filtered operational data      | `academic_periods`, `curriculum_enrollments`, `programme_enrollments`, `career_aspirations`                                                                                          | `auth_organization_ids()` plus Parent/Teacher-Tutor/Org-Admin relationship visibility (Phase 5's established shape)                                                                                                                                                                                                             | Creator-scoped per each phase's specific rule                                                                                                                                                                         |
| 4   | Commercial configuration                                   | `fee_definitions`                                                                                                                                                                    | Organization-specific: issuing Organization Administrator + Platform Administrator oversight only — **not** Teachers, Tutors, Parents, Students, or ordinary members, regardless of what invoices they can see. Platform-default definitions may be exposed to Organization Administrators as templates, not globally readable. | Issuing Organization Administrator (own org) or `is_platform_admin()` (platform defaults)                                                                                                                             |
| 5   | Public-write, staff-read                                   | `public_inquiries`                                                                                                                                                                   | `is_platform_admin()` only                                                                                                                                                                                                                                                                                                      | Anonymous insert permitted                                                                                                                                                                                            |
| 6   | Mixed registration shapes, organizer-restricted attendance | `event_registrations`                                                                                                                                                                | Registrant (own), Parent (registrations they created for their learner), Organization Administrator (their org's Events), active Programme instructor (their programme's Events), Platform Administrator (platform-wide)                                                                                                        | Attendance updates restricted to the organizer/admin context, never the registrant themselves                                                                                                                         |
| 7   | Strictly private                                           | `instructor_application_details`                                                                                                                                                     | `is_platform_admin()` only, zero applicant access                                                                                                                                                                                                                                                                               | Server-side only                                                                                                                                                                                                      |
| 8   | Narrow public function, not raw SELECT                     | `certificates` (verification path specifically)                                                                                                                                      | Anyone, via a fixed four-field RPC projection only                                                                                                                                                                                                                                                                              | N/A — the full record follows pattern 3's relationship-based visibility separately                                                                                                                                    |
| 9   | Financial, four-path visibility                            | `invoices`, `invoice_line_items`, `payments`, `receipts`                                                                                                                             | Platform Admin, issuing Org Admin, billed Org Admin, billed Profile                                                                                                                                                                                                                                                             | Issuing party only                                                                                                                                                                                                    |
| 10  | Audience-scoped, split by action                           | `events`, `announcements`                                                                                                                                                            | Filtered by `audience_scope` + age-appropriate rules                                                                                                                                                                                                                                                                            | Announcements: Org/Platform Admin only. Events — create/edit: Org/Platform Admin or an assigned Programme instructor (their programme's Events only); publish/archive: Org/Platform Admin only, never the instructor. |
| 11  | Instructor-relationship-scoped                             | `programme_instructors`                                                                                                                                                              | Assigned instructor + their Organization                                                                                                                                                                                                                                                                                        | Organization Administrator only                                                                                                                                                                                       |
| 12  | Platform configuration, sensitivity-differentiated         | `system_settings`                                                                                                                                                                    | Branding/public-display keys: broadly readable. Security-sensitive/operational keys: Platform Administrator or narrowly controlled application access only — not a blanket authenticated-read policy.                                                                                                                           | `is_platform_admin()` only                                                                                                                                                                                            |

## 2. Supabase Auth — New Actors, Unchanged Core Model

Unchanged from the prior revision: live RLS resolution, no cached JWT role claims, Supabase Auth for credentials. Anonymous public inquirers/registrants and instructor applicants remain deliberately unauthenticated by design; Independent Learners remain fully normal authenticated actors under the existing multi-role model.

## 3. Platform Data vs. Tenant Data — the Boundary, Now Precisely Stated

The corrected census (Section 1) makes the boundary sharper than the prior draft did: **curriculum structure** (pattern 1) is always platform data. **Content authored against that structure** (pattern 2) can be platform _or_ tenant data, and tenant-owned content never crosses tenant lines regardless of publication status. **Commercial pricing configuration** (pattern 4) is tenant-administrative data, narrower than ordinary tenant-operational data (pattern 3) — a Parent can see their own invoice without ever being able to browse the fee schedule that produced it.

## 4. Curriculum Ownership — Security Implications, Restated

Adding a Curriculum Provider or Curriculum remains a platform-admin action (pattern 1, write). Authoring a Lesson or Learning Resource within an existing curriculum is available to an authorized tenant author, strictly scoped to their own Organization (pattern 2) — and now explicitly confirmed never to leak across tenants via the `published` status. A Teacher/Tutor has no curriculum-authoring rights by default, unchanged from Phase 5.

## 5. Sensitive Data Handling — Confirmed Intact

Instructor applications (private bucket, server-mediated upload, zero applicant access, admin-only) and Consultation/Merchandise inquiries (admin-only read, anonymous write) are unchanged from the prior revision. The anonymous-write abuse-protection requirement applies to every such surface, not only event registration (Section 8).

## 6. Community & Programme Permissions — Corrected and Confirmed

Events and Announcements now have unambiguous, separately-stated write authority (Section 1, pattern 10; fixed directly in Phase 10G). Programme Enrollment's instructor-plus-existing-relationship rule (Phase 10F) is unchanged and confirmed intact.

## 7. The UI-Is-Never-the-Boundary Principle, Re-Audited

Re-checked against the corrected census: dashboard widgets, the curriculum wizard, the Programme catalog, and the Community feed all still only decide what to _render_, never what's _allowed_ — the corrected Fee Definition and authored-content visibility rules (Sections 1, 3) are enforced identically whether or not the UI would have shown the option. No exceptions found.

## 8. Consolidated Security Requirements Carried to Phase 10L

**Data integrity**

- `curriculum_nodes` cycle prevention via a validation trigger.
- **`academic_periods` cycle prevention** — the same structural risk, added in this revision.
- `event_registrations` structural shape constraints (no invalid mixed/empty states).
- Certificate reference/integrity constraints (enrollment-reference-required-by-type, no conflicting references, custom may have neither, learner-match validation, revoked never deleted).
- Fee Definition applicability constraints (`applies_organization_wide` XOR at least one filter).
- Fee Definition equal-specificity conflict detection (surfaced for admin resolution, never silently tie-broken).
- `invoice_line_items.source_type`/`source_id` validation.
- Reconciliation of the existing `topics` table against `curriculum_nodes` before finalizing migration sequencing.

**Financial integrity**

- Partial/multiple Payments per Invoice; matching Payment/Invoice currency; `paid` status derived from verified Payments, never a free manual toggle; Receipts generated only from verified Payments; issued Invoice values immutable; fixed-precision monetary representation throughout, never floating point.

**Abuse / public surfaces**

- Server-side validation, rate limiting, duplicate-submission controls, and bot/spam mitigation on every anonymous-write surface (`public_inquiries`, public `event_registrations`).
- High-entropy, non-sequential Certificate verification codes, returned only through the narrow verification RPC — never a filtered table SELECT.
- Server-mediated Instructor Application uploads into private Storage — never direct anonymous client writes.

**Migration discipline**

- Controlled deprecation/backfill/verification of `students.grade_id`/`students.pathway_id` — never a same-step drop.
- Reconciliation with the existing live migration history before any destructive or renaming migration.

---

## Summary of Completed Security & Authorization Architecture

The corrected census now properly distinguishes twelve authorization patterns instead of an inaccurately-counted seven, with the two most consequential corrections being that tenant-authored content never leaks across tenants via publication status, and that commercial pricing configuration is treated as administratively sensitive rather than generic readable content. Every actor and action across all twelve patterns still reuses mechanisms established since Phase 5/6 — no new authorization system was introduced anywhere in Phase 10, including in this correction pass.

## Refinements Made During This Phase

1. Curriculum structure and authored content split into two separate patterns, closing a real potential cross-tenant content leak.
2. Fee Definitions reclassified as commercial configuration with its own narrow visibility pattern.
3. Events/Announcements write authority disambiguated directly in Phase 10G.
4. `event_registrations` actor list refined, with attendance restricted to the organizer/admin context.
5. `academic_periods` added to the cycle-prevention requirement alongside `curriculum_nodes`.
6. `system_settings` given a sensitivity-differentiated read policy instead of a blanket authenticated-read rule.
7. The pattern count corrected to an accurate twelve.

## Remaining Approval Decisions

1. Approve Phase 10K (as corrected) and proceed to Phase 10L (Implementation Strategy) — the final phase of the Phase 10 sequence.
