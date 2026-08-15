# Platform — Phase 2: Product Requirements Document

**Scope:** Complete PRD per the master prompt's Phase 2 definition.
**Status:** Draft — pending approval before Phase 3 (Information Architecture).
**Builds on:** Phase 1 (Foundational Strategy) — approved. All Phase 1 decisions are authoritative except the revisions in Section 0.
**Altitude:** This document defines product requirements (what the system must do, and why). Information architecture, per-module detailed specs, database schema, backend/API design, visual design system, and infrastructure architecture are deliberately deferred to Phases 3–8.

---

## 0. Carry-Forward Revisions from Phase 1

| # | Phase 1 Decision | Phase 2 Revision (Approved) | Architectural Impact |
|---|---|---|---|
| 1 | Kenya launch market; global scale as long-term vision | Kenya-only MVP confirmed. Full internationalization architecture (locale, currency, timezone, translation-ready strings) now required starting at MVP, not deferred to V4. | i18n elevated from a V4 roadmap feature to an MVP non-functional requirement (Section 6, NFR-5). Affects Phase 5 schema and Phase 6 backend design from the start. |
| 2 | Three-tier subscription (Family / Tutor / Institution) | Confirmed. Plan/tier definitions must be data-driven so future tiers (e.g., Enterprise) can be added without redesign. | Plans modeled as configurable entities, not hardcoded logic (FR-8). Affects Phase 5 schema. |
| 3 | CBC-first curriculum | Confirmed. Architecture must support Cambridge, Edexcel, IB, US Curriculum, South African CAPS, and custom curricula without database redesign. | Curriculum Framework becomes a first-class, pluggable entity; CBC is the first instance, not a hardcoded structure (FR-4). Largest single architectural elevation from Phase 1 — directly shapes Phase 5. |
| 4 | Placeholder name "the Platform" | Confirmed as "Platform." Branding, naming, visual identity, and domain selection deferred to a separate project after the architecture is finalized. | Phase 7 (UI/UX design system) proceeds on tokens, components, and structure without a finalized brand identity. |
| 5 | Teacher/Tutor portals scoped to Phase 1 roadmap stage "V1" (post-MVP) | Moved into MVP scope and the MVP permission model. | MVP portal count goes from 3 to 5 role-facing portals (Student, Parent, Teacher, Tutor, Org/Super Admin). Raises new MVP-scope questions on messaging and content authorship (Section: Questions Requiring Approval). |
| 6 | Elimu Kenya referenced as inspiration | Confirmed as functional inspiration only. Original branding, UX, workflows, information architecture, design system, and implementation required; no imitation or reproduction of copyrighted or proprietary elements. | No practical change — already the master prompt's standing requirement. Reconfirmed for the record. |

**Updated roadmap stub** (full roadmap remains as approved in Phase 1 except where shown):

- **MVP (revised):** Student, Parent, Teacher, Tutor, and Organization/Super Admin portals; single tenant; CBC content delivery via a pluggable Curriculum Framework; progress tracking; assignments; data-driven schema ready for multiple tenants, currencies, and curricula, populated with one of each at launch.
- **V1 (revised):** Multi-tenant onboarding for additional organizations; billing integration (M-Pesa/Pesapal first, then Flutterwave and Stripe); messaging — scope pending confirmation (see Questions Requiring Approval).
- **V2–V4:** Unchanged from Phase 1.

---

## 1. Product Overview

Platform is a multi-tenant SaaS system for homeschooling and alternative education, launching as a single Kenya-based tenant with an architecture that supports additional tenants, curricula, currencies, and locales without redesign. It serves six roles — Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, and Super Administrator — through role-scoped portals built on Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase, and PostgreSQL, deployed on Vercel.

## 2. Goals and Objectives

**Business goals**
- Validate the Family/Tutor/Institution subscription model against real Kenyan usage before expanding tenants or countries.
- Establish a defensible technical differentiator (multi-tenant RBAC architecture) against incumbents identified in Phase 1.

**Product goals**
- Ship a working five-portal MVP (Student, Parent, Teacher, Tutor, Org/Super Admin) on one tenant without architectural shortcuts that block future multi-tenancy, multi-curriculum, or multi-currency support.
- Deliver CBC-aligned content delivery, assignment, and progress-tracking workflows usable by a real homeschooling household.

**User goals (by role)**
- **Student:** access assigned lessons and assignments, see own progress.
- **Parent/Guardian:** oversee one or more children, track progress, manage account/subscription.
- **Teacher/Tutor:** deliver content, assign and grade work, track assigned students' progress.
- **Organization Administrator:** manage the tenant's users, roles, and settings.
- **Super Administrator:** oversee platform-wide health, tenants, and support.

## 3. Scope

### 3.1 In Scope — MVP (Kenya, Single Tenant)
- Five role-facing portals: Student, Parent, Teacher, Tutor, Organization/Super Administrator.
- CBC curriculum content delivery, built on a pluggable Curriculum Framework data model.
- Progress tracking and assignments.
- Supabase Auth-based authentication; RLS-enforced schema.
- Data model prepared for future multi-tenancy, multi-curriculum, multi-currency/locale, and extensible subscription plans — even though MVP populates only one of each.

### 3.2 Explicitly Out of Scope — MVP
- Onboarding a second tenant (architecture supports it; execution is V1).
- Native Android/iOS apps (V2).
- AI Tutor, AI Quiz Generator, AI Lesson Planner (V3).
- Content marketplace, public API (V3).
- White-label deployments (V4).
- Full UI translation beyond the MVP launch language (architecture is translation-ready; translated content itself is a later content-ops task — see Questions Requiring Approval on launch language).
- Live payment processing (V1); MVP represents plans and entitlements but does not necessarily process real transactions (see Questions Requiring Approval).

### 3.3 Out of Scope — This Document (Deferred to Later Phases)
- Information architecture, sitemap, navigation, wireframes → Phase 3.
- Per-module detailed functional specifications, dashboards, workflows, permissions → Phase 4.
- Database schema, entity relationships, RLS policies → Phase 5.
- API design, backend architecture → Phase 6.
- Visual design system, typography, color, component library → Phase 7.
- Security, performance, infrastructure, deployment, and monitoring architecture → Phase 8.

## 4. User Personas

**Student**
- Age range: roughly 4–17, spanning CBC's pre-primary through senior secondary (Grades 10–12).
- Goal: complete assigned lessons/assessments, see own progress.
- Account model: created and owned by a Parent/Guardian; independent login for older students is unresolved (see Questions Requiring Approval).

**Parent/Guardian**
- Goal: oversee one or more children, track progress, manage communication and subscription.
- Context: primarily mobile access, consistent with the mobile-first usage pattern seen across Kenyan ed-tech incumbents in Phase 1.

**Teacher**
- Context: typically tenant-affiliated (school, academy, learning centre).
- Goal: deliver curriculum content, create/grade assignments, track class-level progress for assigned students within their tenant.

**Tutor**
- Context: independent; MVP scopes each Tutor account to a single tenant relationship (see Questions Requiring Approval on cross-tenant tutoring).
- Goal: manage a personal student roster, assign and track work, communicate with parents.

**Organization Administrator**
- Context: runs a tenant (school, academy, learning centre, NGO program).
- Goal: manage org users, assign roles, configure org settings, view org-level reporting.

**Super Administrator**
- Context: platform operator (internal team), not tenant-specific.
- Goal: oversee tenant lifecycle, platform health, audit logs, and support escalations across all tenants.

## 5. Functional Requirements

**FR-1 Authentication & Account Management**
- Email/password registration and login via Supabase Auth; email verification required for full access.
- Password reset flow.
- Role assignment occurs at account creation or organization-invite time.
- Parent/Guardian accounts create and manage linked Student profiles.
- Architecture supports future MFA; not required at MVP.

**FR-2 Organization & Tenant Management**
- Single active tenant at MVP; tenant entity fully modeled for future multiplicity.
- Tenant-level settings: name, default curriculum, default locale/currency, branding placeholder fields (unused at MVP).
- Organization Administrator manages org-level users, roles, and settings within their own tenant only.
- Super Administrator manages tenants at the platform level (creation, suspension, cross-tenant oversight) — largely latent at single-tenant MVP but must exist in the permission model.

**FR-3 User & Role Management (RBAC)**
- Six roles: Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator.
- Parent/Guardian links to multiple Student profiles (one household, multiple children).
- Teacher/Tutor links to multiple Student profiles within their tenant.
- Every role scoped to its own tenant; no cross-tenant visibility except Super Administrator.
- Whether one account may hold multiple roles (e.g., a Parent who is also a Tutor) is unresolved — see Questions Requiring Approval.

**FR-4 Curriculum & Content Management**
- Curriculum Framework modeled as a first-class, pluggable entity; CBC is the first implementation, not a hardcoded assumption.
- CBC structure supported at MVP: pre-primary, primary (Grades 1–6), junior secondary (Grades 7–9), senior secondary (Grades 10–12) with STEM / Social Sciences / Arts & Sports Science pathways at senior level.
- Subjects/Learning Areas, Grade Levels, and Competencies are modeled per Curriculum Framework, so Cambridge, Edexcel, IB, US Curriculum, CAPS, and custom frameworks can be added later without schema change.
- Content types: text, structured lesson units, file/media attachments (video-ready architecture; not necessarily authored at MVP).
- Content authorship source at MVP (platform-curated vs. tenant-authored vs. licensed) is unresolved — see Questions Requiring Approval.

**FR-5 Learning Delivery (Lessons & Assignments)**
- Sequenced lesson delivery aligned to curriculum, grade, and subject.
- Assignments created by Teacher/Tutor/Org Admin, assigned to specific Students.
- Self-paced Student access, with optional Parent/Teacher/Tutor pacing guidance.
- Assignment submission and feedback loop.

**FR-6 Progress Tracking & Assessment**
- Per-student mastery tracking by competency/learning area.
- Assessment/quiz results captured and attributed to competencies.
- Progress visible to Student, Parent (own children only), Teacher/Tutor (assigned students only), and Org Admin (tenant-wide).

**FR-7 Communication**
- Scope pending confirmation: basic Parent ↔ Teacher/Tutor messaging is recommended for MVP now that those portals exist in MVP, but this was not part of the original approval — see Questions Requiring Approval.
- Full discussion forums remain V2, unchanged from Phase 1.

**FR-8 Subscription & Plan Management**
- Three plan types at MVP: Family, Tutor, Institution, modeled as data-driven entities (not hardcoded), so new plans (e.g., Enterprise) can be added without redesign.
- Each plan defines: tenant-type eligibility, entitlements (e.g., student-profile limits, feature access), and price (amount + currency, multi-currency-ready).
- Live payment processing is V1-scope per the roadmap; MVP is assumed to represent plan assignment and entitlement enforcement without necessarily processing real transactions — see Questions Requiring Approval.

**FR-9 Notifications**
- In-app notifications: assignment due dates, new messages (if FR-7 is confirmed for MVP), progress milestones.
- Email notifications for account/security events (verification, password reset).
- SMS notification architecture is a future consideration, noted given the SMS-first distribution pattern of Eneza Education and M-Shule identified in Phase 1 — not committed MVP scope.

**FR-10 Reporting & Analytics (MVP-level)**
- Parent-facing: child's progress summary.
- Teacher/Tutor-facing: assigned students' progress summary.
- Org Admin-facing: tenant-wide usage summary.
- Deeper analytics dashboards remain V2, unchanged from Phase 1.

**FR-11 Platform Administration (Super Admin)**
- Tenant oversight, even with only one tenant active at MVP.
- Platform-wide user search/support tooling.
- Audit log visibility.

## 6. Non-Functional Requirements

**NFR-1 Performance:** target P95 API response under 500ms as an engineering design target (not a contractual SLA at this stage).

**NFR-2 Scalability:** MVP is explicitly single-tenant, but schema, indexing, and query design must not preclude the "millions of users, thousands of organizations" scale target set in Phase 1. Detailed in Phase 5.

**NFR-3 Security:** OWASP Top 10 alignment, RLS-enforced tenant isolation, least-privilege access, role-based authorization, audit logging, encryption in transit and at rest, secure file uploads, rate limiting, password reset, email verification, MFA-readiness — per the master prompt's Security Requirements, carried forward unchanged.

**NFR-4 Accessibility:** WCAG 2.2 conformance target, per the master prompt.

**NFR-5 Internationalization & Localization (elevated to MVP per Section 0):**
- All user-facing strings externalized and translation-ready from MVP, regardless of which language(s) actually ship at launch.
- Currency fields store an ISO currency code plus amount; multi-currency-ready even though only KES is active at MVP.
- Timestamps stored in UTC, rendered in the tenant's local timezone (Africa/Nairobi at MVP).
- Date and number formatting driven by locale configuration, not hardcoded.

**NFR-6 Privacy & Compliance:** architecture supports GDPR- and Kenya Data Protection Act-aligned capabilities — data subject access/export/erasure requests, consent capture (with particular attention to Student accounts, since Students are frequently minors), data-breach-response readiness, and data minimization. This PRD describes compliance-supporting capabilities; it is not a legal compliance certification, and formal legal review is assumed to happen separately before the platform processes real student data.

**NFR-7 Availability & Reliability:** recommended target of 99.5% uptime at MVP, scaling toward 99.9%+ as the platform matures — stated as a design target, not a guaranteed commitment.

## 7. Dependencies
- Supabase (Auth, Postgres, Storage) availability and feature set.
- Vercel for deployment/hosting; GitHub for version control — both fixed by the master prompt's technology stack.
- Sourcing of authoritative, KICD-aligned CBC content — an open dependency independent of engineering progress (see Risks).
- Future M-Pesa/Pesapal merchant accounts, needed before V1 billing goes live — not an MVP blocker.

## 8. Constraints
- No budget, team size, or delivery timeline has been specified; none is assumed.
- Technology stack is fixed per the master prompt (Next.js, React, TypeScript, Tailwind, shadcn/ui, Supabase, PostgreSQL, Supabase Auth, Supabase Storage, Vercel, GitHub) and is not reconsidered in this document.
- MVP is deliberately single-tenant by design, not a limitation requiring a workaround.

---

## Phase 2 Review

### Architectural Decisions Made
1. Curriculum Framework is modeled as a pluggable, multi-framework entity from MVP; CBC is the first implementation, not a hardcoded structure — the largest architectural change from Phase 1.
2. Subscription plans are modeled as data-driven entities (plan/tier table with entitlements and pricing), not hardcoded logic, so future tiers can be added without redesign.
3. Internationalization (locale, currency, timezone, translatable strings) is an MVP-level architectural requirement, not deferred to V4.
4. Teacher and Tutor portals, and their permission model, are part of MVP scope (moved from the Phase 1 roadmap's V1 stage).
5. "Platform" is the confirmed placeholder name; branding, naming, and domain work are out of scope for all remaining architecture phases and will be handled as a separate future project.
6. Functional requirements are numbered (FR-#, NFR-#) for traceability into Phase 4's detailed specifications.
7. This PRD stays at requirements level; screen-by-screen, field-by-field, and workflow-by-workflow detail is deliberately deferred to Phase 4.

### Assumptions
1. UI ships English-only at MVP; other languages are architecture-ready (NFR-5) but not necessarily translated at launch.
2. Each user account holds exactly one role at MVP.
3. Subscription plan assignment at MVP is manual/trial-based; live payment processing remains V1-scope, unchanged by the Teacher/Tutor move.
4. CBC content at MVP is platform-operator-curated rather than tenant-Teacher-authored, given single-tenant launch.
5. Tutor accounts are scoped to one tenant at MVP; cross-tenant tutoring is a future consideration.
6. A Student's account is created and owned by a Parent/Guardian at MVP for all grade levels, pending confirmation on independent login for older students.

### Risks
1. **Curriculum model complexity:** a genuinely generic Curriculum Framework — one that accommodates CBC's pathway-based senior structure alongside structurally different systems like IB or CAPS — is harder to design than a CBC-only schema. Phase 5 must balance genericity against shipping a working CBC implementation on schedule.
2. **MVP scope growth:** pulling Teacher and Tutor portals into MVP increases build surface (roles, permissions, at least partial communication capability) without an accompanying timeline or budget adjustment, since none has been specified.
3. **Content sourcing risk:** no confirmed source for authoritative, KICD-aligned CBC content exists yet. This is a content/operations dependency that can block a usable MVP regardless of engineering progress.
4. **Role-model ambiguity:** if the single-role-per-account assumption (Assumption 2) is wrong, the RBAC design in Phase 5 may need rework once real usage patterns (e.g., a user who is both a parent and an independent tutor) surface.
5. **Compliance scope limit:** the capabilities in NFR-6 support compliance but do not constitute legal certification. Recommend confirming a separate legal review is planned before the platform handles real student data, given the additional protections both GDPR and the Kenya Data Protection Act apply to children's data.

### Questions Requiring Approval
1. Confirm English-only UI at MVP launch, or require an additional language (e.g., Kiswahili) at launch.
2. Confirm one role per user account at MVP, or require support for a single account holding multiple roles.
3. Confirm billing stays V1-scope (manual/trial plan assignment at MVP) despite Teacher/Tutor moving into MVP.
4. Confirm whether basic Parent↔Teacher/Tutor messaging (FR-7) moves into MVP alongside the portals themselves, or stays at V1 as originally scoped.
5. Confirm the source of CBC content at MVP: platform-curated, tenant-authored, or licensed third-party.
6. Confirm Tutor accounts are single-tenant-scoped at MVP.
7. Confirm whether senior-secondary-age Students (Grades 10–12) receive independent login credentials alongside Parent/Guardian oversight, or whether all Student access stays fully Parent-mediated regardless of age.
8. Approve Phase 2 to proceed to Phase 3 (Information Architecture).
