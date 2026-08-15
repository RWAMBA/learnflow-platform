# Platform — Phase 8: Security, Performance & Infrastructure Architecture

**Scope:** Security architecture, performance architecture, infrastructure architecture, monitoring strategy, logging strategy, deployment strategy, CI/CD recommendations, backup strategy, disaster recovery strategy.
**Status:** Approved. Refinements applied: nonce-based CSP, dedicated security-event logging, and a phased PITR rollout (Supabase Free plan + standard backups at MVP, PITR enabled later at a defined production-usage trigger, no architectural change required to upgrade).
**Builds on:** Phases 1–7 — approved. All prior decisions are authoritative except the revisions in Section 0.

---

## 0. Carry-Forward Revisions from Phase 7

| # | Phase 7 Item | Phase 8 Status | Impact |
|---|---|---|---|
| 1 | Service-role scope broadened (Phase 6→7): trusted background jobs, scheduled tasks, administrative maintenance, other explicitly privileged operations | Enumerated explicitly (Section 1) as a closed, named list — not an open-ended escape hatch | Every service-role use is a named, audited exception. |
| 2 | Rate limiting: Vercel Middleware + Upstash Redis, must stay modular/swappable | Reflected in Section 3 as an abstracted dependency behind a single interface | New endpoints call one internal function, never the Upstash SDK directly. |

## 1. Security Architecture

**Authorization boundary.** RLS (Phase 5) remains the single source of truth; nothing here introduces a parallel authorization path.

**Service-role enumeration.** Per the approved broadened scope, every legitimate service-role use is named explicitly, not left open-ended:
- The relationship-invitation expiry sweep (Phase 6).
- Scheduled maintenance jobs (e.g., materialized-view refreshes, once Phase 5's flagged performance work is implemented).
- Platform-administrator tooling that genuinely needs cross-tenant reach beyond what `platform_admins`-gated RLS already allows (e.g., a data-migration script).
Any new service-role use must be added to this list explicitly — it is a reviewed exception, not a default.

**Transport & headers.** TLS everywhere (Vercel/Supabase default this); HSTS; standard security headers (`X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors, `Referrer-Policy`). **Content Security Policy is nonce-based**, not a static allowlist: middleware generates a fresh cryptographic nonce per request, sets it in the `Content-Security-Policy` header (`script-src 'nonce-{value}' 'strict-dynamic'`), and Next.js's own script tags carry the matching nonce so they execute while any injected inline script without it does not — a materially stronger posture than a domain-allowlist CSP, which is bypassable through known gadget techniques on many allowlisted hosts.

**Secrets.** Supabase service-role key and any third-party API keys live only in Vercel environment variables, never in client-bundled code; the anon/public key is the only Supabase key ever shipped to the browser, consistent with RLS being the actual security boundary rather than key secrecy.

**File uploads.** The `assignment-submissions` bucket (Phase 5) accepts Student-originated uploads — the platform's main untrusted-file surface. Enforce a file-type allowlist, a size limit, and treat this as the highest-priority target for abuse (oversized files, disguised executables) before general launch hardening elsewhere.

**Authentication hardening.** Supabase Auth's built-in protections (rate-limited auth endpoints, email verification) plus the Phase 6 rate-limiting layer on login/registration/password-reset specifically. MFA is schema-ready (Phase 5) but not required at MVP.

**Minors' data.** Given Students are frequently minors, session handling on Student-facing devices deserves extra care: a shorter idle-session timeout is recommended specifically for Student sessions on the (often shared, per Phase 3's persona) household device, on top of the relationship-based RLS that already governs who can see a given Student's data.

**Zero Trust, in practice.** Every request — whether from the Next.js frontend, a Route Handler, or a scheduled job — is authorized independently at the data layer regardless of network origin; there is no "trusted internal network" assumption anywhere in this architecture. This was already true by construction from Phase 5/6; this section makes it explicit as a named property, not a new requirement.

**Dependency hygiene.** Automated dependency updates and vulnerability scanning (e.g., Dependabot or Renovate, GitHub's native tooling) on the same repository housing the Next.js app and Supabase migrations.

## 2. Performance Architecture

- **Caching:** per Phase 6, Section 9 — Content Spine data cached aggressively (ISR), personalized data not cached or cached briefly. Not repeated here.
- **Database connection handling:** Supabase's connection pooler (transaction-mode PgBouncer) is used for all serverless/edge function connections — a Next.js deployment on Vercel opens many short-lived connections, and unpooled direct connections are a well-known way to exhaust Postgres's connection limit under load.
- **Query performance:** the indexes defined in Phase 5 cover the known access patterns; `EXPLAIN ANALYZE` review is a standing practice before each significant schema or query change, not a one-time exercise (this closes the loop on the performance risk flagged repeatedly since Phase 5).
- **Read replicas:** a future lever if the "millions of users" target from Phase 1 is approached — not MVP scope, consistent with not over-building ahead of actual load.
- **Frontend performance:** Next.js ISR/SSG for Content Spine pages, `next/image` for any media, route-level code splitting. Performance budgets are set for **mid-range Android devices on 3G/4G**, not high-end devices on fiber, given the mobile-first usage pattern identified in Phase 1's competitive research — a deliberately different baseline than a typical SaaS performance target.
- **CDN:** Vercel's edge network for static assets and pages; Supabase Storage's CDN for public buckets (`avatars`, `lesson-content`).

## 3. Infrastructure Architecture

- **Frontend/API:** Vercel, with production, per-PR preview, and local development environments.
- **Database/Auth/Storage:** separate Supabase projects per environment (development, staging, production) — not shared schemas within one project — for real isolation between environments.
- **Background jobs:** Supabase Edge Functions on a schedule, for the invitation-expiry sweep and any future maintenance jobs from Section 1's enumerated list.
- **Rate limiting:** Upstash Redis via Vercel Middleware, called through a single internal `checkRateLimit()`-style function — never the Upstash SDK directly from individual routes — so the approved modularity requirement (swappable without redesigning the API layer) is a real property of the code, not just a stated intention.
- **Email:** Resend, approved for platform-generated emails — invitations, assignment reminders, notifications, and future workflow messaging. Supabase Auth continues to handle authentication-related emails (verification, password reset) directly; the two are deliberately not merged onto one provider.
- **Region selection:** Supabase currently has no AWS region within Africa; the lowest-latency currently-available options for East Africa are typically in Europe (Frankfurt) or South Asia (Mumbai) — recommend a quick latency test from a Nairobi vantage point before committing, and re-evaluate if an African region becomes available later, since Supabase ties a project to its region at creation (changing later means migrating to a new project).
- **Domain/DNS:** deferred with the branding project (Phase 2); trivial to attach once a domain is chosen — Vercel handles this natively.

## 4. Monitoring Strategy

- **Frontend/API health:** Vercel Analytics and Speed Insights for Core Web Vitals, tracked against the mobile-first performance budgets in Section 2.
- **Error tracking:** Sentry, approved, given its strong native Next.js integration.
- **Database health:** Supabase's built-in dashboard for query performance and connection counts, plus the standing `EXPLAIN ANALYZE` practice from Section 2.
- **Uptime:** external synthetic monitoring against the Phase 2 NFR-7 target (99.5% at MVP, trending toward 99.9%+).
- **Product/business metrics:** the Phase 1 Success Metrics (MRR, tenant activation, DAU/MAU, mastery/progress velocity) are largely derivable directly from the Phase 5 schema at MVP scale; a dedicated analytics tool is a later-stage need, not an MVP requirement.

## 5. Logging Strategy

- **Product-level audit trail:** `audit_logs` (Phase 5) — who did what to which entity, retained indefinitely given its compliance relevance (Phase 2 NFR-6).
- **Security-event log:** a separate, dedicated category from the business audit trail — `security_events` (Phase 5), covering signals that something may be going wrong rather than a legitimate action that happened: repeated failed authentication attempts, account lockouts, suspicious invitation activity (e.g., a burst of invitations from one account, or to many distinct emails in a short window), and excessive password-reset requests. Visible to the platform administrator only, including for events inside a given tenant — triage of security signals is a platform-level function, not something an Organization Administrator sees for their own tenant at MVP. Complements, and does not replace, `audit_logs`.
- **Infrastructure-level logs:** Vercel's own request/function logs and Supabase's own Postgres/Auth logs — a third, separate concern from both of the above.
- **Structured logging:** custom Route Handlers and Edge Functions log in JSON, tagged with a request ID that correlates a single user action across both API layers from Phase 6.
- **PII discipline:** infrastructure-level logs never contain full request/response bodies with Student or Parent personal data — only entity IDs and action types. `audit_logs` and `security_events` are the two places structured, queryable history of sensitive events belongs, by design, and both are RLS-gated (Phase 5).

## 6. Deployment Strategy

- Git-integrated deployment on Vercel: every pull request gets a preview deployment; merging to `main` deploys to production.
- Database migrations are version-controlled Supabase CLI migration files in the same repository as the Next.js app, applied via CI before the corresponding deploy — sequenced carefully given the schema's real foreign-key dependencies (Phase 5's own table order, and its deferred `ALTER TABLE` for the organizations→curricula link, are exactly the kind of ordering a real migration script must preserve).
- Environments: local development (Supabase local CLI, per Phase 5's "validate before production" note), staging (shared Supabase project, used for the RLS test suite in Section 7), production.

## 7. CI/CD Recommendations

- GitHub Actions for the pipeline (pairs with GitHub, per the approved stack): lint → typecheck → unit tests → apply migrations to a test database → **RLS policy test suite** → build → deploy preview → (optional) end-to-end tests against the preview → manual or automatic promotion to production on merge.
- **RLS policy test suite** is the concrete resolution to the "untested SQL" risk carried since Phase 5: for each policy, an automated test asserts both the allow case (the intended actor succeeds) and the deny case (every other actor is rejected), run in CI before every deploy — not just a documented illustrative example.

## 8. Backup Strategy

- **Phased, not immediate:** the architecture fully supports Supabase Point-in-Time Recovery (PITR), but PITR itself is a paid-tier feature not enabled at launch. MVP and early production run on the **Supabase Free plan**, relying instead on regular database backups, version-controlled migrations (Section 6), GitHub source control, and documented recovery procedures.
- **Upgrade trigger:** PITR is enabled once the platform reaches sustained production usage — active organizations, real customer data, and information whose loss would carry material operational or financial impact — not on a fixed calendar date.
- **No architectural change on upgrade:** enabling PITR is a Supabase plan/settings change only; nothing in the schema, RLS, or application code depends on which backup tier is active, so the upgrade path requires no redesign.
- Backup retention aligned with the Phase 2 NFR-6 compliance posture; note that a data-subject erasure request isn't fully satisfied the moment the live row is deleted — it also needs a defined point at which older backups containing that data age out, which should be documented as an explicit policy, not left implicit, regardless of which backup tier is active.
- Storage buckets rely on Supabase Storage's own underlying durability; no separate application-level backup process is needed for them at MVP.

## 9. Disaster Recovery Strategy

- **Recovery Point Objective (approved):** 24 hours at MVP via daily backups on the Supabase Free plan, improving to under one hour once PITR is enabled at the Section 8 upgrade trigger. Targets may strengthen further as scale and customer requirements evolve.
- **Recovery Time Objective (approved):** same-day recovery at MVP.
- **Primary single point of failure:** the Vercel edge network is inherently multi-region for the frontend/API layer already; the Supabase Postgres instance (single-region at MVP) is the actual DR-relevant single point of failure. Multi-region Postgres/read-replica failover is a future scaling lever (Phase 1's "millions of users" horizon), not MVP scope.
- **DR drills:** recommend a periodic (e.g., quarterly) restore-from-backup drill to confirm backups are actually restorable, not merely taken.

---

## Phase 8 Review

### Architectural Decisions Made
1. Service-role usage is an explicitly enumerated, named list (Section 1), not an open-ended exception — directly operationalizing the Phase 6→7 authorization-scope broadening.
2. Rate limiting is abstracted behind one internal function rather than called ad hoc, making the previously-approved "modular/swappable" requirement a code-level property.
3. Performance budgets target mid-range Android devices on 3G/4G, not high-end/fiber, given Phase 1's market research.
4. Separate Supabase projects per environment (dev/staging/production), not shared schemas within one project.
5. An automated RLS test suite in CI (Section 7) is the concrete resolution to the "untested SQL" risk carried since Phase 5.
6. Sentry (error tracking) and Resend (platform-generated email, kept separate from Supabase Auth's own authentication emails) are approved additions to the stack.
7. RPO (24h, improving to <1h once PITR is enabled) and RTO (same-day) are approved MVP targets.
8. The platform launches on the Supabase Free plan with standard backups; PITR is architecturally supported now but enabled later, at a defined production-usage trigger, with no redesign required to upgrade.
9. Content Security Policy is nonce-based, not a static domain allowlist (Section 1).
10. A dedicated `security_events` table (Phase 5) separates security signals (failed logins, lockouts, suspicious invitation activity, excessive password-reset requests) from the business `audit_logs` trail, visible to the platform administrator only.

### Assumptions
1. No African AWS region is currently available through Supabase; Frankfurt or Mumbai are the likely lowest-latency current options for Kenya, pending an actual latency test.
2. Backup retention must still define an explicit data-subject-erasure/backup-aging policy — approved PITR doesn't by itself answer how long backups containing erased data persist.
3. Security-event severity (`info`/`warning`/`critical`) and the specific thresholds that trigger `warning`/`critical` (e.g., how many failed logins constitute a lockout) are not yet defined — implementation-level tuning, not resolved in this document.

### Risks
1. **Single-region database:** until a read-replica or multi-region strategy is warranted, a Supabase regional outage is a full-platform outage — an accepted, explicit MVP trade-off.
2. **New third-party dependencies:** Sentry, Resend, and Upstash Redis are all real operational dependencies and cost lines beyond the originally fixed stack, not just configuration flags.
3. **`security_events` has no automated response yet** — it's a log a platform administrator must actively review; genuine automated alerting/lockout behavior (e.g., actually locking an account after N failed attempts) is implementation work this document flags but doesn't build.
4. **Nonce-based CSP has real implementation cost:** it requires every server-rendered page to thread the per-request nonce through consistently; a single missed script tag breaks under a strict policy rather than degrading gracefully.
5. **Free-plan RPO exposure:** until the Section 8 PITR trigger is reached, real recovery granularity is bounded by the daily backup cadence (up to 24 hours of loss), not the tighter figure PITR would eventually provide — an accepted, explicit early-stage trade-off, not an oversight.

### Questions Requiring Approval
_Resolved by this approval. The one open, deliberately deferred item — specific `security_events` severity thresholds and the sustained-usage trigger point for enabling PITR — is implementation-time tuning, not an architectural decision, and is noted in Assumptions/Risks rather than blocking Phase 9._

Phase 8 is approved. Proceeding to Phase 9.
