# LearnFlow — Phase 10G: Community Architecture

**Scope:** Networking events (public and member-only), announcements, event attendance, age-appropriate learner access, and the bounded-context boundaries separating Community from Messaging, Curriculum, Programme Management, and Academic workflows. Clubs/interest groups and event feedback are explicitly future scope.
**Status:** Approved and finalized. Refinements incorporated: `is_public` boolean generalized into `audience_scope`; `event_registrations` formalized into three shapes; attendance tracked as a field on the registration row; Event/Announcement write authority disambiguated (Phase 10K correction).
**Builds on:** Phases 1–9 and Phase 10A–10F — approved.

---

## 0. Carry-Forward from Phase 10F

`programme_instructors` (Phase 10F) is reused directly in this phase's authorization model (Section 2) — the same instructor-assignment relationship that governs Programme Enrollment now also governs who may create Events tied to that programme. No other carry-forward items affect this phase.

## 1. The Core Design Decision

Community does **not** introduce a parallel membership system. "Parent community," "Teacher/Tutor community," and "Learner community" are not new tables of members — they are **audience filters computed from the existing role and relationship model**: a Parent community member is simply anyone holding an active `parent_guardian` User Role in that Organization. This is the decision that keeps Community a genuine bounded context rather than a second, competing authorization system, and it's the reason nothing in this phase introduces a new identity or membership concept anywhere.

## 2. Events, Extended From the Phase 10E Stub

**`events`** — the Phase 10E `is_public` boolean is refined into a richer `audience_scope`: `public` / `organization_all` / `parents_only` / `teachers_tutors_only` / `learners_only`. A boolean couldn't express "member-only" with any further precision; one enumerated field can, without a combinatorial explosion of flags. `is_public` isn't lost — it's now exactly `audience_scope = 'public'`. Also gains an optional `programme_id` (nullable — a loose link where an event genuinely belongs to a programme, e.g., "Chess Club's monthly tournament," never required).

**`event_registrations`** — refined to represent three distinct registration shapes, exactly one populated per row:
1. **Self-registration** — `user_role_id` set (Parent, Teacher, Tutor, or a senior-secondary independent-login Student registering themselves), `student_id` null.
2. **Parent/guardian registering a managed Student** — `user_role_id` set to the registering adult, `student_id` set to the child. This is how a younger Student (no independent login) participates at all — always through their Parent, never directly.
3. **Anonymous public registration** (Phase 10E, unchanged) — `registrant_name`/`registrant_email` set, both role fields null.

Also gains `attended_at` (nullable) directly on the registration row — attendance is naturally one-to-one with a registration, so this doesn't need a separate table.

## 3. Announcements

New `announcements`: `organization_id` (nullable — platform-wide or Organization-specific, same pattern used throughout Phase 10), `title`, `body`, `audience_scope` (the identical vocabulary from Section 2, not a parallel one), `status` (the same draft/published/archived lifecycle used everywhere in Phase 10), `published_at`. Read-only broadcasts — no registration or response concept, deliberately simpler than Events.

## 4. Age-Appropriate Access for Learners

This is the part of the phase that most directly answers the approval's explicit concern:

- A **younger Student** (no independent login, per the existing Phase 4/5 rule) has **zero direct Community access as an actor**. They don't see events or announcements themselves. Any Community participation on their behalf — registering them for a `learners_only` or `organization_all` event — is performed *by* their Parent, using the registration shape already built for exactly this in Section 2. This is not a new restriction invented for Community; it's the same Parent-mediation principle already governing this age group everywhere else in the platform.
- A **senior-secondary, independently-logged-in Student** may access Community, but strictly limited to `public`, `organization_all`, and `learners_only` audience scopes. They never see `parents_only` or `teachers_tutors_only` content, regardless of their independent-login status — logging in independently grants a Student their own dashboard and messaging, not membership in the Parent or Teacher/Tutor community.

No age-verification system is introduced. This reuses the tenant-configurable independent-login eligibility (Phase 4) and the `audience_scope` enum (Section 2) — two mechanisms that already exist — rather than adding a third.

## 5. Bounded Context Boundaries

- **Community ↔ Messaging:** fully separate. Community introduces no chat or direct-messaging capability of its own. A question about an event goes through the existing Messaging system, and only where the asker already has a messaging-eligible relationship with the recipient (Phase 4's whitelist) — Community does not create new communication channels between people who don't already have one.
- **Community ↔ Curriculum/Academic:** fully separate. `curriculum_enrollments` and `progress_records` are untouched by this phase. An event may optionally reference a Subject for discovery purposes only — never required, never a dependency.
- **Community ↔ Programme Management:** related, not merged. A Programme (Phase 10F — ongoing, enrollment-based) and an Event (time-boxed, single or recurring occasion) remain distinct concepts. The only coupling point is the optional `events.programme_id` (Section 2), and the instructor-assignment authorization it enables (Section 7) — nothing else crosses between the two domains.

## 6. Explicitly Future, Not Designed Now

Clubs and interest groups, and event feedback/engagement features, are named in the brief as future scope and are not designed in this phase — reserved, not built, to avoid scope creep beyond what was actually asked for.

## 7. Ownership & RLS

- `events` / `announcements`: read scoped by `audience_scope` and `status = 'published'` — `public` open to anyone (including anonymous), `organization_all` to any active member (`auth_organization_ids()`), `parents_only` to active `parent_guardian` role holders, `teachers_tutors_only` to active `teacher`/`tutor` role holders, `learners_only` to senior-secondary independent-login Students only (Section 4).
- **Write authority, stated separately for each, to avoid any ambiguity:**
  - **Announcements:** Organization Administrator (organization-specific) or `is_platform_admin()` (platform-wide) — full stop. No instructor delegation of any kind.
  - **Events — create/edit:** `is_platform_admin()`, the Organization Administrator, **or** an active Programme instructor (via `programme_instructors`, Phase 10F) — but only for Events tied to a programme they are *currently* assigned to. This delegation is specific to Events tied to their own programme; it does not extend to Announcements, and does not extend to other Organizations' Events or unrelated programmes' Events.
  - **Events — publish/archive:** Organization Administrator (organization-specific) or `is_platform_admin()` (platform-wide) only — never the instructor, regardless of who created the event.
- **`event_registrations`**, refined actor list:
  - A registrant reads their own registration.
  - A Parent/Guardian reads registrations they created for their linked learner.
  - An Organization Administrator reads/manages registrations for Events belonging to their Organization.
  - An active Programme instructor reads the roster and performs attendance operations for Events tied to a programme they actively instruct.
  - A Platform Administrator administers platform-wide registrations.
  - **Attendance updates (`attended_at`) are restricted to the authorized event organizer/admin context** — an Organization Administrator, `is_platform_admin()`, or the relevant Programme instructor — never the registrant themselves. Self-reported attendance would defeat the purpose of tracking it.

No new permission system anywhere in this section — every actor and every action reuses the existing role, tenant, relationship, and `programme_instructors` mechanisms already established.
- `event_registrations`: INSERT permitted for the three shapes in Section 2; where `student_id` is populated by someone other than the student, RLS additionally verifies an active `parent_student_relationships` row connecting the registering adult to that specific Student — the same check already used to authorize Assignment creation on a Parent's behalf (Phase 5).

---

## Summary of Completed Architecture

Community is built as a genuine bounded context: it reuses the existing role/relationship model for all audience determination (Section 1), extends the Phase 10E Events stub with a proper `audience_scope` and three well-defined registration shapes rather than a single ambiguous "public" flag (Section 2), adds Announcements on the identical audience model (Section 3), and enforces age-appropriate access using mechanisms that already exist elsewhere in the platform rather than inventing new ones (Section 4). It stays deliberately separate from Messaging, Curriculum, and Academic workflows, with exactly one narrow, optional coupling point to Programme Management (Section 5).

## Refinements Made During This Phase
1. Phase 10E's `events.is_public` boolean generalized into `audience_scope`, an enumerated field — `is_public` is preserved conceptually as one of its values, not discarded. Confirmed as sufficient for MVP; deliberately not expanded into a many-to-many audience-tag model now, though nothing in this design blocks adding one later if real requirements justify it.
2. `event_registrations` formalized into three explicit, mutually exclusive shapes (self, parent-for-child, anonymous) rather than the looser either/or the Phase 10E stub described.
3. Attendance tracked as a single nullable field on the existing registration row, not a new table.
4. Event write authority split by action per approval: Programme instructors may create and edit Events for programmes they're actively assigned to, but publish/archive authority stays with the Organization Administrator (org-specific) or Platform Administrator (platform-wide) — never the instructor.

## Assumptions & Risks
1. **Assumption:** younger learners never get their own audience scope — their Community presence is always mediated through a Parent registration, never a distinct "younger learner" access tier.
2. **Confirmed, not a risk:** independent login changes account autonomy, not role or authorization semantics — a senior-secondary Student's own login never expands which `audience_scope` values they can see.
3. **Carried forward to Phase 10L (implementation-level, not architectural):**
   - The three `event_registrations` shapes need structural database constraints preventing invalid mixed or empty states — a real requirement, not yet enforced at this conceptual stage.
   - Anonymous public Event registrations need production-grade abuse protection (server-side validation, rate limiting, duplicate-registration controls, spam/bot mitigation) complementing RLS, not replacing it.

## Remaining Approval Decisions
1. Approve Phase 10G (as refined) and proceed to Phase 10H (Career Pathways Architecture).
