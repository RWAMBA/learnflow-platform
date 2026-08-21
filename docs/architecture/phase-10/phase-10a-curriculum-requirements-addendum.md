# LearnFlow — Phase 10A: Curriculum Requirements Addendum

**Scope:** Validate the expanded functional requirements for multi-curriculum and platform expansion. Requirements-level only — no architecture or schema design (that begins at Phase 10B).
**Status:** Draft — pending approval before Phase 10B (Universal Curriculum Architecture).
**Builds on:** Phases 1–9 (approved, and substantially implemented in the current Lovable/GitHub codebase). All prior decisions remain authoritative unless flagged below.

**Naming note:** this document uses "LearnFlow," matching the repository and this phase's own document header. Phase 2 formally deferred branding to a separate project, so this is flagged as an observation, not a silent override — confirm whether "LearnFlow" now replaces "the Platform" placeholder going forward, or whether that deferral still stands.

---

## 1. What's Being Added

Four curricula (Kenya CBC/CBE — already built; Cambridge International; Pearson Edexcel; American Curriculum) coexisting on one platform, plus five product domains (Public Website, Learning Management System, School Management System, Community, Learner Progression/Career Pathways). This is a substantial expansion beyond the Phase 1–9 scope, which was deliberately bounded to a single-tenant, Kenya-CBC, homeschool-first SaaS MVP. That original scoping discipline is exactly why Phases 1–9 shipped a coherent, working system — Section 9 below proposes how to extend the same discipline to this expansion rather than taking on all five domains at once.

## 2. Supported Curricula

| Curriculum              | Status                                  | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kenya CBC/CBE           | Already built                           | Treating "CBE" (Competency-Based Education, the pedagogical philosophy) as synonymous with "CBC" (Kenya's specific curriculum) for architecture purposes — flagged as an assumption, not a verified equivalence.                                                                                                                                                                                                                                                       |
| Cambridge International | New, in scope                           | A real, standardized system (Cambridge Primary through AS & A Level). General structure is known; exact current stage/subject definitions should be verified against Cambridge's published framework in Phase 10B, not assumed from memory.                                                                                                                                                                                                                            |
| Pearson Edexcel         | New, in scope                           | Similarly standardized (International GCSE, International A Level, BTEC). Same verification note as Cambridge.                                                                                                                                                                                                                                                                                                                                                         |
| American Curriculum     | New, in scope — **needs clarification** | Unlike the other three, "American Curriculum" is not a single standardized system or awarding body. U.S. homeschooling typically follows a mix of state standards, specific publisher curricula, or accredited umbrella/correspondence schools. Before Phase 10B can model this, clarify what's actually meant: a specific named program/accreditor, or a generic U.S.-style K-12 structure (grade levels, credit hours, GPA) the platform should support generically. |

## 3. Product Scope — The Five Domains

| Domain                                | Relationship to existing architecture                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Learning Management System            | Builds directly on what exists — curriculum, lessons, assignments, assessments, and progress tracking are already substantially implemented for CBC.                                |
| School Management System              | Partial overlap — organizations, memberships, and subscriptions already have a foundation; Enrollment, Scheduling, and Reporting/Administration beyond what exists are largely new. |
| Public Website                        | Genuinely new territory — unauthenticated, content/SEO-driven, a different access and likely rendering model from the authenticated app.                                            |
| Community                             | Genuinely new — events, announcements, and participation tracking don't yet exist.                                                                                                  |
| Learner Progression / Career Pathways | Genuinely new, and the source document itself flags this as needing "future institutional exploration" — the least product-defined of the five.                                     |

## 4. Educational Programmes

Full-Time Homeschooling is the existing core model (Curriculum → Grade → Subject → Lesson → Assignment → Assessment → Progress) and needs no new concept. Part-Time Tuition and Extracurricular Activities (French, German, Chess, Music) do not fit that spine cleanly — a chess club has no "competency," "pathway," or formal assessment in the CBC sense. **This implies a lighter-weight "Programme" concept needs to sit alongside the Content Spine, not inside it** — a genuine architectural question for Phase 10B, flagged here at the requirements level.

## 5. Independent Learners vs. Parent-Managed Learners

**Parent-managed learners** are the existing model and need no new concept.

**Independent learners** are new, and this is the single most architecturally consequential open question in this addendum. The current schema assumes every Student belongs to exactly one Organization (`students.organization_id` is `not null`) and is either Parent-mediated or, for senior-secondary Students, independently logged in while still linked to a Parent/Guardian. An "Independent Learner" (likely an adult, or a learner managing themselves without a Parent/Guardian relationship at all) could mean either:

- **(Recommended)** An Independent Learner is a Student who is a member of their own, self-created `family`-type Organization, holding the Student role directly, with no separate Parent/Guardian relationship required — reuses the existing multi-tenant model entirely, no schema-level redesign.
- A genuinely org-less "platform-level individual user," bypassing the Organization model — a structurally new pattern with real multi-tenant implications, only worth taking on if the recommended option above proves insufficient.

Flagged for confirmation; the recommended option is the lower-risk starting assumption for Phase 10B.

## 6. Public Website Requirements

Home, About, Services, Testimonials, Guide, FAQs, Contact, Consultation Booking, Instructor Recruitment, Merchandise, SEO. Two things worth surfacing now rather than discovering in Phase 10E:

- This is architecturally a different surface — public, unauthenticated, SEO-sensitive — from the authenticated SaaS app. Whether it lives in the same codebase as public routes, or as a genuinely separate site (common practice for marketing sites, sometimes on a different subdomain or even a different tool), is an open question for Phase 10E.
- "Merchandise" implies real e-commerce (listings, cart, checkout) and "Instructor Recruitment"/"Consultation Booking" imply lead-capture and lightweight applicant/booking workflows — these are real functional surfaces, not just static pages.

## 7. Community Requirements

Networking Events and Announcements are new entities. Extracurricular Activities ties directly to the Programme concept in Section 4. "Community Participation" is vague as stated — clarify whether this means RSVP/attendance tracking, discussion/forum-style interaction, or simple visibility into who's involved, since these have very different architectural footprints. Notifications already exists and extends naturally.

## 8. Career Pathways Scope

University, TVET, Degree/Diploma/Certificate progression. The source document itself flags this as needing "future institutional exploration" and assigns it explicit MVP-vs-future scoping in Phase 10H. Recommend treating this entire domain as **future/exploratory** for this Phase 10 cycle — "is this real university-application integration, or an internal aspirations/pathway-tracking feature for students" are two very different products, and neither has been defined yet.

## 9. Recommended MVP vs. Future Scope for Phase 10

**Phase 10 MVP (recommended):**

- The curriculum-agnostic engine itself (CBC + Cambridge + Edexcel + a clarified American Curriculum) — the highest-value, most directly architecture-relevant piece, and already next in sequence (Phase 10B).
- Parent-managed learners — unchanged.
- Independent learners — basic support via the recommended self-organization pattern (Section 5).
- A lightweight Programme concept for Part-Time Tuition / Extracurricular Activities, sitting alongside the Content Spine.

**Phase 10 Future (recommended, sequenced after the above stabilizes):**

- Public Website — recommend as a separate, parallel workstream rather than blocking the core platform's architecture evolution.
- Full School Management System (Enrollment, Scheduling, Billing, Reporting, Administration beyond what exists) — build incrementally on top of the curriculum-agnostic engine once it's stable, not simultaneously with it.
- Community — its own module, after the curriculum engine.
- Career Pathways — genuinely exploratory, pending real product definition.
- Merchandise/e-commerce and payment gateway integration — deferred, consistent with the already-approved Phase 2/6 position that live billing is a later-phase concern, not MVP.

---

## Architectural Decisions Made

1. Kenya CBC/CBE, Cambridge International, and Pearson Edexcel are confirmed in scope for the curriculum-agnostic engine; American Curriculum is confirmed in scope but not yet defined precisely enough to design against.
2. Independent Learners are recommended to be modeled as Students within a self-created `family`-type Organization, reusing the existing multi-tenant model rather than introducing an org-less user pattern.
3. Extracurricular/part-time offerings need a new, lighter "Programme" concept alongside — not inside — the existing Content Spine.
4. Public Website, full School Management System, Community, and Career Pathways are recommended as sequenced _after_ the curriculum-agnostic engine, not built in parallel with it.

## Assumptions

1. "LearnFlow" is the working project name from this point forward (see the naming note above).
2. CBE and CBC are treated as the same system for architecture purposes.
3. Merchandise, consultation booking, and instructor recruitment are treated as real functional workflows (not static pages) once their domain is reached.

## Risks

1. **Scope breadth:** five domains plus four curricula is, collectively, the scope of several separate products. Treating all of it as equally urgent risks losing the incremental discipline that made Phases 1–9 successful — Section 9's sequencing is the mitigation, not a formality.
2. **"American Curriculum" ambiguity**, if left unresolved, will force Phase 10B to either guess at a structure or stall — needs an answer before that phase.
3. **Independent Learner modeling choice** (Section 5) has real downstream schema implications; confirming the recommended (lower-risk) option now avoids rework in Phase 10C.

## Questions Requiring Approval

1. Confirm "LearnFlow" as the standing project name going forward.
2. Clarify what "American Curriculum" should mean architecturally: a specific named program/accreditor, or a generic U.S.-style K-12 structure.
3. Confirm the recommended Independent Learner model (self-organization pattern) versus a genuinely org-less user pattern.
4. Confirm "Community Participation" scope (RSVP/attendance vs. discussion/forum vs. visibility-only).
5. Confirm the recommended MVP vs. Future sequencing in Section 9.
6. Approve Phase 10A to proceed to Phase 10B (Universal Curriculum Architecture).
