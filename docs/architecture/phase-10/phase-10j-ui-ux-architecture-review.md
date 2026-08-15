# LearnFlow — Phase 10J: UI/UX Architecture Review

**Scope:** Review every user journey affected by Phase 10A–10I against the approved Phase 7 design system — public website, Parent/Learner/Teacher/Tutor/Administrator/Independent-Learner dashboards, Career Pathways, Programme enrollment, curriculum selection, responsive design, accessibility.
**Status:** Approved and finalized — adaptive curriculum-selection flow, confirmed widget set, and the "UI is never the security boundary" principle carried into Phase 10K.
**Builds on:** Phases 1–9 and Phase 10A–10I — approved. All prior decisions are authoritative except the revisions in Section 0.

---

## 0. Carry-Forward from Phase 10I

The Fee Definition/billing model (Phase 10I) is the primary driver of new UI in this phase (Section 8) — everything else in Phase 10 already had at least a rough UI shape implied by its data model.

## 1. Design System Continuity — No New System Introduced

The Phase 7 design system (tokens, Inter, Lucide, the shadcn/ui component mapping, the amber-reserved-for-achievement rule, WCAG 2.2 AA baseline with AAA for educational content) applies to every new surface in Phase 10 without modification. This phase reviews *journeys*, not tokens — nothing here proposes a second visual language for the public website, Community, or Billing screens. Where a new component pattern is genuinely needed (Section 4's curriculum wizard), it's still built from existing shadcn/ui primitives per the Phase 7 mapping, not a new library.

## 2. New Dashboard Widgets

Extending Phase 4's Widget catalog and Dashboard Shell (Phase 7, Section 6) — new widgets, composed the same way existing ones are, not a new dashboard architecture:

| Widget | Shown to | Content |
|---|---|---|
| Career Aspiration | Student (self), Parent, Organization Administrator | Current aspiration + edit action, per Phase 10H's permission model |
| Community Feed | All roles, audience-filtered | Upcoming Events + recent Announcements the viewer's `audience_scope` permits (Phase 10G) |
| Programme Roster | Programme instructor (Teacher/Tutor with an active `programme_instructors` assignment) | Their assigned programmes' enrolled Students |
| Financial Overview | Organization Administrator (issuing and/or billed) | Outstanding invoices, recent payments (Phase 10I) |
| My Invoices | A `billed_to_profile_id` (a Parent or other billed individual) | Their own invoices/payments/receipts only, per Phase 10I's fourth visibility path |

Each follows the existing widget pattern exactly — a `Card`-based component, permission-filtered into the Dashboard Shell, nothing structurally new.

## 3. Independent Learner Dashboard — Already Solved

No new dashboard type is needed. An Independent Learner (Phase 10A/10D) holds both `org_admin` and `student` User Roles within their own self-created Organization, so they see the **merged Family-tenant Organization Administrator view** (Phase 3's original merge decision) layered with their own Student widgets (Today's Work, Subject Grid, Progress Summary) — exactly the same composition logic already built for a Parent who is also their child's administrator, just with themselves as both parties. Confirmed here as a review finding, not a new design.

## 4. Curriculum Selection Journey — Adaptive, Not a Fixed Number of Steps

Refined per approval from a rigid four-step wizard into an adaptive guided flow, since forcing every curriculum through the same fixed step count doesn't match how differently they're actually structured:

1. **Choose Curriculum** — Provider/Curriculum collapsed into one friendly choice ("Kenya CBC," "Cambridge International," "Pearson Edexcel," "American K-12 Pathway").
2. **Choose Education Stage**, shown whenever the selected curriculum has more than one — every curriculum confirmed so far does, so this step is visible in practice for all four, but the flow doesn't hardcode it as always-present.
3. **Choose Academic Level**, labeled in that curriculum's own terminology (Grade, Stage, Year — whatever the row's own display label is).
4. **Choose Track**, shown only when the selected Academic Level actually has one (Phase 10B, Section 3) — skipped entirely otherwise, not shown empty.

Visible step count varies by curriculum as a result — e.g., Kenya CBC Primary resolves in two visible steps after Curriculum (Stage, Level), while Kenya CBC Senior School resolves in three (Stage, Level, Track).

**Curriculum Version is always resolved automatically in the background** from the `is_current` version (Phase 10C) — never a normal user-facing step. The only reserved exception is a **future, Org-Admin-only advanced workflow for historical enrollment corrections** that genuinely need a non-current version (e.g., correcting a past record) — not exposed during ordinary learner enrollment, and not designed further in this phase.

## 5. Programme Enrollment Journey

A browsable, filterable catalog (by Programme Category, Phase 10F) separate from curriculum selection — reinforcing the Phase 10F finding that these are different kinds of enrollment, not a variation of the same flow. Enrollment itself is a single action, gated by the Phase 10F authorization rules (Org Admin, full-management Parent, or an assigned instructor for their own programme) already enforced at the data layer — the UI doesn't need its own permission logic, only to hide actions the viewer can't take.

## 6. Career Pathways UI

Deliberately minimal, matching Phase 10H's scope: a single editable field set (pathway type, field of interest, notes) with history shown underneath (past aspirations, not deleted — Phase 10H's "preserve history" principle made visible). No pathway-browsing or institution-matching UI, since none of that exists yet.

## 7. Community UI

An audience-scoped feed (Events + Announcements together, chronological), reusing `audience_scope` to determine what renders — no separate "which community am I in" navigation, since Community isn't a membership system to navigate (Phase 10G, Section 1). Event registration surfaces the three shapes from Phase 10G naturally: an authenticated viewer sees a normal "Register" action; a Parent viewing an event on behalf of a younger child sees a "Register [Child's name]" action per linked Student; the public marketing site (Section 9) surfaces public events with the existing anonymous-registration form pattern already used for `public_inquiries`.

## 8. Financial / Billing UI

A new Organization Administrator area (Invoices, Payments, Fee Definitions) and a new "My Invoices" surface for any `billed_to_profile_id`, per Phase 10I's four-path visibility model (Section 10 of that document) — this is the one area of Phase 10 introducing a genuinely new *section* of the app, not just new widgets, since Billing didn't have any UI footprint before this phase. Fee Definition management (creating/editing an Organization's own tuition/term/subject fee schedule) is an Organization Administrator-only screen, mirroring how curriculum-authoring screens are already scoped.

## 9. Public Website Continuity

The public site (Phase 10E) already uses the Phase 7 token system (Section 4 of that document) — this review confirms no departure from it. Guide articles, Testimonials, and FAQs share the same card/typography patterns already defined; the new Events listing (Phase 10E/10G) reuses the same public-page layout conventions rather than introducing a distinct "events site" look.

## 10. Responsive Design & Accessibility

Unchanged: Tailwind's default breakpoints, mobile-first, WCAG 2.2 AA baseline. One clarification worth stating explicitly: **Guide articles (Phase 10E) count as educational learning content** under the Phase 7 AAA rule (content-type-based, not role-based, per that phase's own scope), the same as lessons and assessments — a public Guide article explaining curriculum selection needs the same contrast treatment as an in-app lesson, since the rule was always about content type, not authentication state.

## 11. The UI Is Never the Security Boundary

A principle carried explicitly into Phase 10K, though it isn't new — it's been the design philosophy since Phase 5/6, and this phase's job is to confirm it still holds across every new Phase 10 domain, not to introduce it: the UI may use server-resolved permissions/capabilities to decide what to *show* (which is all Section 2's widget composition and Section 5/8's action-hiding actually do), but every protected action stays independently enforced through server-side authorization, RLS, tenant membership, and relationship checks. A user who manually attempts a request the UI would normally hide must still be denied — hiding a button is a convenience, never a permission.

---

## Summary of Completed UI/UX Architecture

No new design system, no new dashboard architecture, and no new accessibility framework were needed for any part of Phase 10 — the review's main finding is that Phase 4/7's widget-and-shell pattern absorbs almost everything cleanly. The two genuine exceptions are an adaptive curriculum-selection flow (replacing what would otherwise be an unusable ten-layer manual picker, with its visible step count varying by curriculum rather than fixed) and a new Billing section of the app (since financial data had no prior UI footprint at all). Independent Learner dashboards required no new design, confirming the Phase 3 Family-tenant merge decision generalizes correctly to this new actor type. The five confirmed widgets are treated as sufficient for MVP — new administrative domains (Public Inquiries, Instructor Applications, Fee Definitions, Events administration) get their own dedicated application sections rather than additional dashboard widgets by default.

## Refinements Made During This Phase
1. Five new dashboard widgets specified and confirmed final (Career Aspiration, Community Feed, Programme Roster, Financial Overview, My Invoices) — no further widgets added merely because a new domain exists.
2. Curriculum-selection flow refined from a fixed four-step wizard into an adaptive flow whose visible step count varies by curriculum, with Curriculum Version resolution always automatic and a future Org-Admin-only historical-correction workflow reserved but not designed.
3. Guide articles (Phase 10E) confirmed to fall under the AAA educational-content contrast rule (Phase 7).
4. The "UI is never the security boundary" principle made explicit and carried forward into Phase 10K.

## Assumptions & Risks
1. **Assumption:** Programme browsing and Curriculum selection remain visually and navigationally distinct, reinforcing rather than blurring the Phase 10F enrollment-category boundary.
2. **Risk:** the adaptive curriculum flow's step logic could grow more complex if a future fifth curriculum has a materially different shape than the four confirmed ones — acceptable now, worth revisiting if that happens.

## Remaining Approval Decisions
_None outstanding — Phase 10J is approved and finalized._

