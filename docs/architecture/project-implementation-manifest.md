# Platform — Project Implementation Manifest

**Purpose:** The concise, authoritative reference for Lovable, Cursor, and future development. This summarizes the outcome of Phases 1–9; it does not restate their full detail. Each section links to the phase document that holds the complete version.

---

## 1. Final Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Icons / Font | Lucide / Inter |
| Backend | Supabase (Postgres, Auth, Storage); PostgREST + custom Next.js Route Handlers |
| Deployment | Vercel |
| Source control / CI | GitHub, GitHub Actions |
| Error tracking | Sentry |
| Transactional email | Resend (platform-generated emails); Supabase Auth (verification/reset emails) |
| Rate limiting | Vercel Middleware + Upstash Redis, behind a single internal interface |

## 2. Approved Architectural Decisions

- **Multi-tenant B2B2C SaaS.** One active tenant at MVP, seeded as `tenant_type = 'family'` — a seed-data choice only. The architecture fully supports Independent Tutor, Private School, Homeschool Academy, Learning Centre, and NGO tenants without redesign.
- **Six roles** (Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator), with multi-role-per-user support via `user_roles`. Super Administrator is platform-scoped (`platform_admins`), not tenant-scoped.
- **Relationship-centric architecture.** Three dedicated tables — `parent_student_relationships`, `teacher_student_relationships`, `tutor_student_relationships` — not a polymorphic model. Teachers/Tutors can never self-associate with a Student; only an Organization Administrator or a `full_management` Parent/Guardian can create these relationships. Enforced at the database layer via RLS.
- **Curriculum-agnostic Content Spine.** CBC is the first implementation; Cambridge, Edexcel, IB, US Curriculum, and CAPS can be added without schema redesign.
- **Subscription:** Family / Tutor / Institution tiers, data-driven (`plans` table), manual assignment at MVP — no live payment processing yet.
- **Internationalization-ready, English-only at launch.** Externalized strings, ISO currency codes, UTC-stored timestamps — all in place from MVP even though only English/KES/Africa-Nairobi ship first.
- **Independent Student login** only for senior-secondary (Grades 10–12), gated by a tenant-configurable flag; younger Students are fully Parent-mediated at MVP.
- **RLS is the sole authorization boundary**, resolved live on every request — never via cached JWT claims.
- **Branding, naming, visual identity, and domain are explicitly deferred** to a separate future project. "Platform" is the placeholder name everywhere.

## 3. Database Overview

25 tables in six categories:

| Category | Tables |
|---|---|
| Identity | `profiles`, `platform_admins` |
| Membership / Role Assignment | `organizations`, `organization_memberships`, `roles`, `user_roles` |
| Platform Configuration | `system_settings` |
| Core Business — Content Spine | `curricula`, `grades`, `pathways`, `subjects`, `competencies`, `lessons` |
| Core Business — Student & Learning | `students`, `assignments`, `assessments`, `progress_records` |
| Relationship (Junction) | `parent_student_relationships`, `teacher_student_relationships`, `tutor_student_relationships` |
| Communication | `conversations`, `conversation_participants`, `messages` |
| Subscription | `plans`, `organization_subscriptions` |
| Notification / Audit / Security | `notifications`, `audit_logs`, `security_events` |

Tenant isolation: `organization_id` is a **direct** column on every tenant-scoped table, filtered by RLS through `auth_organization_ids()`. Full DDL, indexes, RLS policies, and the tenant-isolation explanation: **`phase-5-database-architecture.md`**.

## 4. API Overview

Two-layer Internal API:
- **Supabase PostgREST** (auto-generated, RLS-gated) for straightforward single-table reads/writes — most of the surface.
- **Custom Next.js Route Handlers** for multi-table transactions and verb-like actions: organization/membership creation, invite/accept, assignment submit/grade, conversation start.

**Public API** (`/api/public/v1/...`) is reserved but not built at MVP (V3). Full endpoint list, error envelope, and rate-limiting approach: **`phase-6-backend-architecture.md`**.

## 5. UI / Component Architecture

- shadcn/ui + Tailwind, theming via CSS variables (deep forest green primary; amber reserved strictly for achievements/certifications/celebratory UI, never routine secondary actions).
- One shared **Dashboard Shell** composed from a reusable widget catalog, not six separate hardcoded dashboards. Family-tenant Organization Administrator view merges into the Parent widget set (presentation-layer only; RBAC unchanged underneath).
- WCAG 2.2 AA platform-wide; AAA specifically for educational learning content (lessons, assessments, assignments, reading interfaces), regardless of viewing role.
- Mobile-first responsive (Tailwind default breakpoints), short/purposeful motion only, authentic illustration guidance.
- Full tokens, typography, component mapping: **`phase-7-ui-ux-design-system.md`**.

## 6. Security Architecture

- RLS as the sole authorization boundary; the Supabase service-role client is restricted to a named, enumerated set of background/administrative operations — never a general-purpose escape hatch.
- Nonce-based Content Security Policy plus standard security headers; TLS/HSTS everywhere.
- `security_events` (platform-administrator-only) is a distinct log from the business `audit_logs` trail, covering failed logins, lockouts, suspicious invitation activity, and excessive password-reset requests.
- File-upload hardening (type allowlist, size limit) on the Student-facing `assignment-submissions` bucket, the platform's primary untrusted-upload surface.
- Shorter session timeout recommended for Student sessions on shared devices.
- Full detail: **`phase-8-security-performance-infrastructure.md`**.

## 7. Infrastructure

- Vercel for frontend/API (production, per-PR preview, local dev); separate Supabase projects per environment.
- **Supabase Free plan at MVP and early production**, relying on standard daily backups, version-controlled migrations, GitHub source control, and documented recovery procedures. **PITR is enabled later**, at the point of sustained production usage with real customer data — an infrastructure/plan change only, requiring no redesign.
- No AWS region within Africa is currently available via Supabase; Frankfurt or Mumbai are the likely lowest-latency current options for Kenya, pending an actual latency test.
- CI/CD via GitHub Actions: lint → typecheck → tests → migrations → **automated RLS policy test suite** → build → deploy.
- Full detail: **`phase-8-security-performance-infrastructure.md`**.

## 8. Environment Variables

**Public** (`NEXT_PUBLIC_*`, safe in the client bundle):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SENTRY_DSN`

**Server-only** (must never reach the client bundle):
- `SUPABASE_SERVICE_ROLE_KEY` — used exclusively by the named service-role operations in Section 6
- `RESEND_API_KEY`
- `SENTRY_AUTH_TOKEN` — build-time source-map upload only
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 9. External Integrations

**Active at MVP:** Supabase, Vercel, GitHub/GitHub Actions, Upstash Redis, Sentry, Resend.
**Not yet integrated (deferred):** M-Pesa, Pesapal, Flutterwave, Stripe (live billing, V1); any AI provider (V3).

## 10. Deferred Roadmap Items

| Item | Target |
|---|---|
| Branding, naming, visual identity, domain selection | Separate future project |
| Self-service onboarding of additional Organizations | V1 |
| Live payment processing (M-Pesa/Pesapal/Flutterwave/Stripe) | V1 |
| Native Android/iOS apps, PWA offline mode | V2 |
| Discussion forums, group messaging | V2 |
| Examinations engine | V2 |
| ~~Digital certificates / credentials / career pathways~~ | **Removed from the architecture**, not deferred — a new separately approved requirement is needed to restore any of it |
| AI Tutor, AI Quiz Generator, AI Lesson Planner, adaptive learning | V3 |
| Content marketplace, Public API | V3 |
| White-label deployments, full additional-language/currency support | V4 |
| Younger-Student independent login (tenant-configurable) | Architecture-ready, not built |
| Cross-tenant Tutor relationships | Architecture-ready, not built |
| Tenant-authored / licensed third-party curriculum content | Architecture-ready, not built |
| Multiple concurrent subscription plans, add-ons, seat licensing | Architecture-ready, not built |
| Read replicas / multi-region database | Future scaling lever |
| Supabase PITR | Enabled at defined production-usage trigger |

## 11. Document Index

| Document | Contents |
|---|---|
| `phase-1-foundational-strategy.md` | Executive summary, vision, mission, business model, target users, competitive analysis, success metrics, roadmap |
| `phase-2-prd.md` | Product requirements, scope, personas, functional/non-functional requirements |
| `phase-3-information-architecture.md` | Relationship model, sitemap, navigation, dashboard hierarchy, user journeys |
| `phase-4-functional-specifications.md` | Relationship entities, modular dashboard architecture, module-by-module specs, permission matrix, workflows |
| `phase-5-database-architecture.md` | Complete PostgreSQL schema, RLS policies, tenant isolation, storage buckets |
| `phase-6-backend-architecture.md` | REST API design, authentication, authorization, validation, error handling, rate limiting, caching |
| `phase-7-ui-ux-design-system.md` | Typography, color, icons, components, tokens, responsive/accessibility rules |
| `phase-8-security-performance-infrastructure.md` | Security, performance, infrastructure, monitoring, logging, deployment, CI/CD, backup, DR |
| `phase-9-lovable-mvp-prompt.md` | The paste-ready Lovable prompt (schema + design system + scope + rules) |
| `project-implementation-manifest.md` | This document |

---

The master architecture and planning phase is complete. Two approved follow-on items are ready whenever you have them: an architectural review of Lovable's generated output against this manifest and the phase documents, and a Cursor continuation brief. Both need Lovable's actual output as a starting point — share it when ready.
