# Homeschooling SaaS Platform — Phase 1: Foundational Strategy

**Scope:** Executive Summary, Vision, Mission, Business Model, Target Users, Competitive Analysis, Success Metrics, Product Roadmap.
**Status:** Draft — pending approval before Phase 2 (PRD).

---

## 1. Executive Summary

The Platform is a multi-tenant SaaS system for homeschooling and alternative education, launching in Kenya with an architecture designed to scale across Africa and internationally. It serves six user roles across any number of tenant organizations — homeschooling families, independent tutors, private schools, homeschool academies, learning centres, and educational NGOs — through dedicated Student, Parent, Teacher, Tutor, Organization Administrator, and Super Administrator portals.

The MVP ships with a single active tenant. The schema, authentication model, and row-level security design support additional tenants from day one, so onboarding new organizations later requires configuration, not re-architecture.

Kenya's Competency-Based Curriculum (CBC) reached a structural milestone in January 2026: its first cohort — approximately 1.2 million learners — moved from Junior Secondary into the newly created Senior Secondary level (Grades 10–12), split into STEM, Social Sciences, and Arts & Sports Science pathways. This transition, layered on an already-active homeschool and supplementary-learning market, is the immediate context the Platform enters.

The competitive landscape (Section 6) splits into reach-optimized, low-bandwidth tools built for the mass public-school-adjacent market (Eneza Education, M-Shule, Ubongo) and homeschool-specific service businesses built around human tutors rather than software (Elimu Kenya, Elimu Plus). No identified competitor combines organization-level multi-tenancy, full role-based portals, and one architecture serving families, tutors, schools, academies, and NGOs at once. That gap is the Platform's initial thesis.

## 2. Vision

To be the operating infrastructure for homeschooling and alternative education in Africa — the system every parent, tutor, school administrator, and academy relies on to deliver personalized, competency-based learning, whether they manage one child or ten thousand.

## 3. Mission

Give any educational actor — a parent, an independent tutor, a school administrator, or an NGO program lead — the tools to onboard learners, deliver curriculum-aligned instruction, track mastery, and run their organization, without needing an engineering team of their own.

## 4. Business Model

**Structure:** B2B2C SaaS. The commercial relationship sits at the tenant (organization) level; individual users (students, parents, teachers) are managed inside that tenant.

**Tenant classes the architecture must support** (not all priced separately at MVP): Family, Independent Tutor, Private School, Homeschool Academy/Co-op, Learning Centre, NGO/Institutional.

**Proposed subscription tiers:**
- **Family** — flat monthly/annual fee per household, covers a bounded number of student profiles.
- **Tutor** — per-tutor fee, includes a bounded number of managed students, metered pricing beyond that threshold.
- **Institution/Enterprise** — per-organization pricing (seat- or student-based), includes the Organization Administrator portal, tenant branding, and organization-level analytics.

**Future revenue lines** (architecture-ready, not built at MVP): commission on third-party content through a future marketplace, exam/certification-related fees, white-label licensing for institutions wanting their own branded instance.

**Payments:** KES via M-Pesa and Pesapal at launch; Flutterwave for broader African currency coverage; Stripe for card-based and international billing. The data model must not preclude multi-currency, multi-rail billing later, even though only one rail may be wired up at MVP.

**Adoption strategy:** a limited free tier (one student profile, restricted content library) is recommended to lower the barrier for individual families — the low-cost, low-friction model Eneza Education and M-Shule have already validated in this exact market.

## 5. Target Users

**Primary (MVP beachhead):** Homeschooling families in Kenya. Parent/guardian as account owner and administrator; children as learners.

**Secondary (architecture-ready, onboarded post-MVP):**
- Independent/private tutors managing students across multiple households.
- Private schools running hybrid, blended, or fully online programs.
- Homeschool academies and co-ops (families pooling resources under one organization).
- Learning centres adding a digital layer to in-person coaching.
- Educational NGOs, including programs serving refugee or out-of-school populations — a segment Eneza Education already serves in Kakuma and Dadaab.

**Confirmed roles for RBAC/portal design:** Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator (platform level).

## 6. Competitive Analysis

Note on naming: "elimu" is the Swahili word for "education," so several unrelated organizations use it. The master prompt's reference to "Elimu Kenya" is assumed to mean the service at elimukenya.africa. Elimu Plus, Elimu Nyumbani, and eLimu/Elimuhub are separate, similarly-named organizations also active in this market and are included below for completeness — confirm this identification is correct.

| Platform | Reach | Delivery Model | Primary Segment | Key Strength | Gap vs. Proposed Platform |
|---|---|---|---|---|---|
| Eneza Education (Shupavu291) | Kenya; also Rwanda, Ghana, Côte d'Ivoire, Sierra Leone | SMS/USSD + web, airtime billing, Safaricom partnership since 2013 | Low-connectivity, public-school-adjacent learners | 12M+ learners reached historically; works on basic feature phones, no internet required | No multi-tenant/org model; no role-based portals; lightweight quiz/Q&A format, not a full LMS |
| M-Shule | Kenya | AI-adaptive SMS learning, primary grades | Primary learners in low-connectivity areas | Adaptive-personalization pioneer in an SMS-only context; strong parent/teacher reporting loop | Primary-grade only; SMS-only content depth; no institutional/multi-tenant layer |
| Ubongo | ~18 African countries | Free TV, radio, and mobile edutainment | Early learners (3–14) and caregivers | Tens of millions of monthly viewers; strong localisation across languages | Not an LMS — no accounts, progress tracking, assessment, or organization management |
| uLesson | Nigeria-origin; now ~9 African countries incl. Kenya, plus US/UK | Video-lesson subscription, optional tablet hardware | Secondary exam-prep learners (WAEC/NECO/JAMB-oriented) | Deep curriculum-exam mapping; reported ~$25.6M raised; AI homework help; offline access | Single-learner B2C model; no organization/tenant layer; not homeschool-workflow-specific |
| Elimu Kenya | Kenya | Human-tutor consultation + curriculum placement | Parents starting homeschooling | Deep curriculum-advisory expertise across CBC, Cambridge, Edexcel, ACT/GED | Service business, not software; not self-serve or scalable without linear tutor hiring |
| Elimu Plus | Kenya (Nairobi-centric, some in-home) | Full-time online/in-home homeschooling, proprietary LMS | Full-time homeschool families (British + Kenyan curricula) | Proprietary LMS; in-home teacher option; exam-registration support | High-touch, teacher-capacity-limited; not built as a licensable platform for other organizations |
| CBC Edu Kenya | Kenya | Paid revision content + free AI tutor ("Soma") | Individual CBC students (Grade 10 cohort) | CBC- and AI-native; low per-unit pricing (KSh 100/subject) | Single-tenant consumer product; no parent/teacher/org portals; revision-content scope only |

**Positioning summary:** incumbents cluster into reach-first, low-bandwidth tools for the mass public-school-adjacent market (Eneza, M-Shule, Ubongo) and homeschool-specific human-tutor service businesses (Elimu Kenya, Elimu Plus). uLesson and CBC Edu Kenya are closest to a modern app-based model but remain single-learner consumer products with no organization-level tenancy. No identified competitor combines multi-tenant architecture, full role-based portals, and one system serving families, tutors, schools, academies, and NGOs simultaneously.

**Data gap:** Insufficient data to verify the total size of Kenya's homeschooling population specifically. No independent, current source quantifying it was found; treat as an open research item (see Risks).

## 7. Success Metrics

**Business**
- MRR/ARR growth, by tenant class
- Tenant activation rate (organizations completing onboarding with ≥1 active learner)
- Net revenue retention and churn, by tenant class
- CAC and LTV, by tenant class

**Product/engagement**
- Learner activation rate (student profiles completing a first lesson/assessment within 7 days)
- DAU/MAU, by portal type
- Assignment/lesson completion rate
- Session frequency and duration

**Learning outcomes**
- Competency mastery rate per learning area
- Assessment pass/improvement rate over time
- Progress velocity (competencies mastered per active month)

**Platform health**
- Uptime against SLA
- P95 API latency
- Support ticket volume and median resolution time
- Cross-tenant data exposure incidents (target: zero)

## 8. Product Roadmap

**MVP — single tenant:** Student and Parent portals, Organization/Super Admin portal, curriculum-aligned content delivery, progress tracking, assignments, Supabase Auth, RLS-enforced multi-tenant-ready schema populated with one tenant.

**V1 — multi-tenant activation:** Tutor portal, Teacher portal, organization-onboarding flow for additional tenants, billing integration (M-Pesa/Pesapal first, then Flutterwave and Stripe), parent/teacher/tutor messaging.

**V2 — reach and assessment:** Android and iOS apps, PWA with offline mode, examinations engine, digital certificates, discussion forums, teacher/org/parent analytics dashboards.

**V3 — intelligence layer:** AI Tutor, AI Quiz Generator, AI Lesson Planner (architecture prepared from MVP; features shipped here), adaptive learning paths, content marketplace, public API.

**V4 — global readiness:** White-label deployments, full internationalization (language, currency, regional formatting), microservices extraction evaluated only if the Supabase-based monolith hits scaling limits.

No calendar dates are attached, since no timeline or budget was provided (see Assumptions).

---

## Phase 1 Review

### Architectural Decisions Made
1. Tenant abstraction is "Organization," not "School" — Family, Independent Tutor, Private School, Academy/Co-op, Learning Centre, and NGO are all valid tenant types.
2. Six confirmed portal/role types: Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator.
3. Monetization path: tiered SaaS subscription (Family / Tutor / Institution) at MVP; marketplace, certification, and white-label revenue deferred to post-MVP.
4. Curriculum priority: CBC first, Cambridge/Edexcel/US-curriculum support second.
5. Roadmap uses relative phase labels (MVP → V1 → V2 → V3 → V4), not calendar dates.
6. Competitive differentiation is the multi-tenant, full-RBAC architecture itself — not content volume or media production, where incumbents (Ubongo, uLesson) already outscale a new entrant.

### Assumptions
1. Kenya is the initial launch market; expansion sequence assumed as Kenya → East Africa → pan-African → global. The master prompt specifies "Africa… scale globally" but not a first country; Kenya is inferred from the Elimu Kenya reference, the Kenya Data Protection Act mention, and the M-Pesa/Pesapal payment requirements.
2. No product/brand name is defined. This document uses "the Platform" as a placeholder; branding is a cross-cutting requirement in the master prompt, not tied to a specific numbered phase.
3. No budget, team size, or timeline was provided; the roadmap is sequenced by dependency, not date.
4. Teacher and Tutor portal sequencing (MVP vs. V1) is provisional, pending Phase 4 functional-specification scoping.
5. Reliable, independent sizing data for Kenya's homeschool population was not found; treated as an open research item, not estimated.
6. "Elimu Kenya" in the master prompt is assumed to refer to elimukenya.africa, not the similarly-named Elimu Plus, Elimu Nyumbani, or eLimu/Elimuhub.

### Risks
1. **Regulatory ambiguity:** Kenyan law neither explicitly authorizes nor prohibits homeschooling. It sits under the 2013 Basic Education Act and the Alternative Education Policy without direct mention; EACH (East Africa Christian Home-educators) is still engaging government on formal legal status. Market risk, not technical.
2. **Incumbent distribution advantage:** Eneza Education and M-Shule hold telecom-level partnerships (e.g., Safaricom) and years of trust in the low-bandwidth market that a new entrant cannot replicate quickly.
3. **Fast-moving direct competition:** CBC Edu Kenya already ships a named AI tutor ("Soma") for the exact 2026 CBC Senior Secondary cohort this platform would target. The AI-tutoring differentiation window may close faster than the roadmap's V3 timeline assumes.
4. **Multi-tenant scope discipline:** the architecture must support "millions of users, thousands of organizations" while the MVP ships single-tenant. Under- or over-designing the tenant boundary now risks the exact future re-architecture the master prompt requires avoiding.
5. **Payment-rail complexity:** M-Pesa, Pesapal, Flutterwave, and Stripe span different currencies, settlement models, and compliance regimes. Full integration is deferred to Phase 6; the business model above assumes this is solvable within the proposed tiers.
6. **Unverified market sizing:** no confirmed figure exists for Kenya's homeschool population specifically, so the business model's revenue assumptions cannot yet be checked against a real TAM/SAM/SOM.

### Questions Requiring Approval
1. Confirm Kenya as the initial launch market, rather than a simultaneous multi-country launch.
2. Confirm the three-tier subscription structure (Family / Tutor / Institution) as the monetization model.
3. Confirm CBC as the primary curriculum priority, with Cambridge/Edexcel/US as secondary.
4. Define a product/brand name now, or continue with "the Platform" until a dedicated branding step.
5. Confirm Teacher/Tutor portals as V1 scope, or pull them into MVP.
6. Confirm the "Elimu Kenya" identification in Section 6.
7. Approve Phase 1 to proceed to Phase 2 (PRD).

## Appendix: Sources
- Eneza Education / Shupavu291 — gust.com, engineeringforchange.org, borgenproject.org, unesco.org, finca.org, crunchbase.com, idpfoundation.org, ke.linkedin.com, carbongroup.global
- M-Shule — disruptafrica.com, techinafrica.com, ewb.ca, solve.mit.edu, uil.unesco.org, sewfonline.com, edtechhub.org
- Ubongo — ubongo.org, wise-qatar.org, medium.com, hundred.org, en.wikipedia.org
- uLesson — businessday.ng, allafrica.com, nairametrics.com, ulesson.com, brands.ng
- Elimu Kenya / Elimu Plus / Elimu Nyumbani / EACH — elimukenya.africa, elimuplus.co.ke, elimunyumbani.org, cambrilearn.com, schoolhouseteachers.com, elimuhub.simdif.com
- Kenya CBC structure (2026 rollout) — peopledaily.digital, schoolsinkenya.co.ke, eduplace.co.ke, kiwimbi.org, senseicollege.co.ke
- CBC Edu Kenya (AI tutor "Soma") — cbcedukenya.com
