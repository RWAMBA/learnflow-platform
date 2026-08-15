# Platform — Phase 6: Backend Architecture

**Scope:** REST APIs, authentication, authorization, validation, error handling, rate limiting, caching strategy.
**Status:** Draft — pending approval before Phase 7 (UI/UX Design System).
**Builds on:** Phases 1–5 — approved. All prior decisions are authoritative except the revisions in Section 0.
**Altitude:** API contracts and strategy. Route Handler implementation code, actual Zod schemas, and middleware code are Phase 9/implementation work, not this document.

---

## 0. Carry-Forward Revisions from Phase 5

| # | Phase 5 Item | Phase 6 Status | Impact |
|---|---|---|---|
| 1 | Single polymorphic `relationships` table | Reversed to three dedicated tables per approval | Resource model (Section 2) exposes three distinct REST resources. |
| 2 | TEXT + CHECK controlled vocabulary | Confirmed, with one refinement: the role vocabulary specifically now lives in a `roles` lookup table | `/roles` added as a resource (Section 2). |
| 3 | One plan per Organization at MVP, extensible later | Confirmed | Section 3's subscription endpoints target the current one-plan model. |
| 4 | Live RLS-based authorization | Confirmed | Section 5 restates this as binding on the API layer too. |
| 5 | `role_assignments` renamed to `user_roles`; relationship tables restructured (direct `organization_id`, `parent_id`/`teacher_id`/`tutor_id`, `effective_from`/`effective_to`) | Applied throughout this document | Section 2's resource paths and Section 3's endpoint descriptions updated accordingly. "Role Assignment" terminology retired in favor of "User Role," resolving the naming question raised in the prior version of this document. |

---

## 1. API Architecture Overview

Given the approved stack (Next.js + Supabase), the Internal API has two layers, not one:

**Layer A — Supabase's auto-generated resource API (PostgREST).** Every table from Phase 5 is automatically exposed as a REST resource at `/rest/v1/<table_name>` (e.g., `/rest/v1/students`), gated entirely by the RLS policies already designed. Straightforward reads and simple single-row writes use this layer directly — no hand-written endpoint needed. This is the concrete reason plural, consistent table naming matters beyond style: it *is* the resource path for a large share of the Internal API.

**Layer B — Custom Next.js Route Handlers**, for anything that isn't simple single-table CRUD: multi-table transactions, side effects (sending an invitation email, writing a notification), or actions better modeled as a verb than a raw field update (accepting an invitation, submitting an assignment). These live under `/app/api/...`.

**Internal API** = both layers combined, consumed only by the Platform's own frontend (web now; native apps at V2). Never exposed to third parties.

**Public API** (V3, future) = a separate, explicitly versioned namespace (`/api/public/v1/...`) with its own curated resource model, its own authentication (API keys, not Supabase sessions), and its own rate limits — decoupled from the internal schema so internal refactors never break an external integrator (Section 10).

## 2. Resource Model

| Resource (plural) | Backing table(s) | Layer |
|---|---|---|
| `/organizations` | organizations | PostgREST (read/update) + custom (creation) |
| `/organization_memberships` | organization_memberships | PostgREST (read) + custom (invite/accept) |
| `/roles` | roles | PostgREST, read-only — platform-defined vocabulary |
| `/user_roles` | user_roles | PostgREST (read); writes only via the invite/accept flow |
| `/parent_student_relationships` | parent_student_relationships | PostgREST — RLS already encodes the business rules, so direct insert is usable |
| `/teacher_student_relationships` | teacher_student_relationships | Same pattern |
| `/tutor_student_relationships` | tutor_student_relationships | Same pattern |
| `/curricula` `/grades` `/pathways` `/subjects` `/competencies` `/lessons` | Content Spine tables | PostgREST, read-only at MVP (platform-curated) |
| `/students` | students | PostgREST (read) + custom (creation, which also bootstraps the first parent-student relationship) |
| `/assignments` | assignments | PostgREST (read) + custom action endpoints (submit, grade) |
| `/assessments` | assessments | Created only via the custom grade action, never direct insert |
| `/progress_records` | progress_records | PostgREST, read-only from the API's perspective |
| `/conversations` `/messages` | Communication tables | PostgREST + custom (start-conversation convenience) |
| `/plans` `/organization_subscriptions` | Subscription tables | PostgREST (read) + custom (assign plan) |
| `/notifications` | notifications | PostgREST |
| `/audit_logs` | audit_logs | PostgREST, platform-administrator only per RLS |

## 3. REST API Endpoints (by module)

**FR-1 Authentication** — handled entirely by the Supabase Auth SDK (`signUp`, `signInWithPassword`, `resetPasswordForEmail`); no custom endpoints needed.

**FR-2/FR-3 Organization & RBAC**

| Method | Path | Description |
|---|---|---|
| POST | `/api/organizations` | Custom — creates an Organization and the creator's first membership + User Role atomically |
| GET/PATCH | `/organizations/{id}` | PostgREST |
| POST | `/api/memberships/invite` | Custom — creates membership + pending User Role, sends invitation email |
| POST | `/api/memberships/{id}/accept` | Custom — accepts an invitation, activates the User Role |

**FR-4 Curriculum & Content** — `GET /curricula`, `/grades`, `/subjects`, `/lessons` (PostgREST, read-only at MVP).

**FR-5 Learning Delivery**

| Method | Path | Description |
|---|---|---|
| GET/POST | `/assignments` | PostgREST — insert gated by the Phase 5 RLS policy |
| POST | `/api/assignments/{id}/submit` | Custom — encapsulates the Not Started→In Progress→Submitted transition and its validation |
| POST | `/api/assignments/{id}/grade` | Custom — creates the Assessment and Progress record atomically, triggers notification (FR-6) |

**FR-6 Progress** — `GET /progress_records` (PostgREST, read-only; written only via the grade action above).

**FR-7 Communication**

| Method | Path | Description |
|---|---|---|
| POST | `/api/conversations/start` | Custom convenience — creates conversation + participants + first message in one call |
| GET/POST | `/messages` | PostgREST — insert gated by the whitelist RLS policy (Phase 5) |

**FR-8 Subscription** — `GET /plans`, `GET /organization_subscriptions` (PostgREST); `POST /api/organizations/{id}/subscription` (custom — validates entitlements, manual assignment at MVP).

**FR-9 Notifications** — `GET /notifications`, `PATCH /notifications/{id}` (PostgREST, mark read).

**FR-10 Reporting** — widget data (W-4, W-8, W-9) served from Postgres views over the underlying tables, exposed read-only through PostgREST rather than hand-written aggregation endpoints.

**FR-11 Platform Administration** — `GET /audit_logs` (PostgREST); `POST /api/organizations/{id}/suspend` (custom — platform-administrator-only tenant lifecycle action).

## 4. Authentication

- The session originates from Supabase Auth (FR-1). The Next.js frontend keeps it in httpOnly cookies via `@supabase/ssr` for server components/actions, and as a Bearer token for client-side calls.
- Both API layers carry the same Supabase-issued JWT to the same Postgres instance, so `auth.uid()` resolves identically whether a request went through PostgREST or a custom Route Handler.
- Custom Route Handlers resolve the authenticated user server-side, before any other logic runs.

## 5. Authorization

- RLS (Phase 5) is the single source of truth. Custom Route Handlers perform reads/writes through a client carrying the requesting user's own session — the same policies apply as if the call had gone directly through PostgREST.
- A service-role (RLS-bypassing) client is used only where RLS genuinely cannot express the operation — at MVP, this is limited to one background job: sweeping expired `pending_invitation` rows across the three relationship tables once they pass the `system_settings`-configured expiry window, since a scheduled job has no authenticated "current user." Any such job must manually replicate the equivalent authorization check, and its writes will record a null `updated_by` (Phase 5 Section: Risks) since there is no `auth.uid()` in that context.

## 6. Validation

- Custom Route Handler request bodies are validated against schemas mirroring the Phase 5 CHECK constraints (e.g., `role_subtype`, `permission_level` enumerations), rejecting invalid input with a clear message before it reaches the database.
- Direct PostgREST calls rely on the database's own CHECK/NOT NULL/foreign-key constraints as the enforcement floor. API-layer validation improves the error message; the constraint is what actually guarantees correctness — consistent with never trusting client input alone.

## 7. Error Handling

One error envelope across both layers, so the frontend doesn't need to know which layer served a given request:

```json
{
  "error": {
    "code": "relationship_invitation_expired",
    "message": "This invitation has expired.",
    "details": {}
  }
}
```

| Status | Meaning |
|---|---|
| 400 | Validation failure |
| 401 | Unauthenticated |
| 403 | Forbidden (RLS denial) |
| 404 | Not found |
| 409 | Conflict (e.g., a duplicate active relationship) |
| 422 | Business-rule violation |
| 429 | Rate limited |
| 500 | Unexpected error |

## 8. Rate Limiting

- Stricter limits on unauthenticated endpoints (registration, login, password reset) to blunt brute-force and enumeration attempts, per Phase 2's NFR-3.
- More generous limits on authenticated reads.
- Recommended approach: Vercel Edge Middleware with a token-bucket store (e.g., Upstash Redis, a common Vercel pairing) — a recommendation, not a locked-in vendor choice.
- The invitation-expiry sweep (Section 5) runs as a scheduled Supabase Edge Function, not a rate-limited user-facing endpoint.

## 9. Caching Strategy

- Content Spine data (curricula/grades/subjects/lessons) is platform-curated and changes infrequently at MVP — a strong candidate for Next.js's data cache/ISR, invalidated on the rare content edit.
- Personalized or frequently-changing data (progress, messages, notifications, dashboard widgets) is not cached, or cached with a very short TTL.
- Supabase Realtime is a good future fit for messages and notifications (push rather than poll) — a V1/V2 consideration, not required at MVP.

## 10. Public API Readiness (V3)

- Reserved namespace `/api/public/v1/...`, not implemented at MVP.
- Distinct authentication: per-integrator API keys, not Supabase session cookies.
- Distinct, curated resource contract, translated from the internal schema at the route layer rather than exposing internal tables directly — so an internal refactor (like the relationship-table restructuring applied in Phase 5) never becomes a breaking change for an external integrator.
- Metered separately from internal traffic, with its own rate limits.

---

## Phase 6 Review

### Architectural Decisions Made
1. The Internal API is two layers: Supabase's auto-generated PostgREST resource API for straightforward CRUD, plus a small set of custom Route Handlers for multi-table transactions, side effects, and verb-like state transitions.
2. Plural, consistent table naming has a direct technical consequence, not just a styling one — it's what PostgREST exposes as the resource path.
3. State transitions (submit, grade, accept-invitation) are dedicated action endpoints rather than raw PATCH-the-status-field calls.
4. Hard deletes are avoided in favor of status transitions, preserving the audit history required since Phase 4.
5. The Public API is deliberately deferred and decoupled from the internal schema from the start.
6. "User Role" (`user_roles`) is adopted as the final term, retiring "Role Assignment" throughout this document.

### Assumptions
1. Custom Route Handlers use the requesting user's own RLS-respecting session, not a service-role client, except for the one identified background job (invitation-expiry sweep).
2. Rate limiting is implemented at the edge with a token-bucket approach; no specific provider is locked in yet.

### Risks
1. **Service-role drift:** the invitation-expiry sweep is the one place authorization isn't purely RLS-driven; if more "no current user" jobs are added later, each re-implements checks that could drift from RLS over time.
2. **Dual-layer consistency:** maintaining both PostgREST passthrough and custom actions for overlapping resources (e.g., `assignments`) requires discipline to keep validation and error-handling aligned across both.
3. **Rate-limiting provider not yet selected:** Section 8's recommendation is illustrative; an actual choice, with its cost/ops implications, is needed before Phase 8.

### Questions Requiring Approval
1. Confirm custom Route Handlers should default to the requesting user's RLS-respecting session, reserving a service-role client only for identified background jobs.
2. Confirm state-changing actions (submit, grade, accept-invitation, end-relationship) as dedicated action endpoints rather than raw status-field PATCHes.
3. Confirm a rate-limiting provider (e.g., Vercel Middleware + Upstash Redis), or specify a preferred alternative.
4. Approve Phase 6 to proceed to Phase 7 (UI/UX Design System).
