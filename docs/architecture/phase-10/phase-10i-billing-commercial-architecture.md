# LearnFlow — Phase 10I: Billing & Commercial Architecture

**Scope:** Programme pricing, term billing, consultation fees, merchandise workflow, future payment gateway integration, subscriptions, invoices, receipts.
**Status:** Approved and finalized — a three-way billed-party model with immutable snapshots, a first-class Fee Definition/Pricing Schedule concept (replacing the earlier simple `programmes.price_amount` approach), a most-specific-wins matching precedence with explicit conflict handling, and a corrected four-path financial-visibility model. See below.
**Builds on:** Phases 1–9 and Phase 10A–10H — approved.

---

## 0. What Changed From the Prior Draft

The prior revision's "Programme Pricing" (Section 6) — a simple `price_amount` column on `programmes` — is **withdrawn** in favor of the Fee Definition concept below (Section 6). The reason: Full-Time Homeschooling and Part-Time Tuition were deliberately modeled through `curriculum_enrollments`, not `programmes` (Phase 10D/10F), so a price field on `programmes` alone could never represent tuition or term fees — only extracurricular pricing. A single, properly normalized pricing mechanism covering all education-service fees is the correct fix, not a second parallel pricing field bolted onto `programmes`.

## 1. The Two Billing Directions — Unchanged Core Insight

Still the central organizing fact of this phase: **Platform → Organization** (LearnFlow bills an Organization for its SaaS subscription) and **Organization → Member/Family** (a School, Academy, or Learning Centre bills a specific Parent/member within itself for tuition, programme fees, or other education-service charges) remain structurally distinct. What's refined is *how* the billed party is represented (Section 2).

## 2. Billed-Party Model, Refined

`billed_to_organization_id` is no longer required on every invoice. Three billed-party shapes are supported, exactly one populated per invoice:

1. **An Organization** — `billed_to_organization_id` set (e.g., LearnFlow billing a School for its subscription).
2. **A specific Profile/member** — `billed_to_profile_id` set (intra-organization billing — a School billing one of its own enrolled families). This profile is the true billed party; `issuing_organization_id` remains whichever Organization issued the invoice — the two are never conflated, and no new tenant Organization is created merely to represent a billing recipient.
3. **An external customer with no LearnFlow account** — `billed_to_inquiry_id`, referencing the originating `public_inquiries` row (Phase 10E) for a Consultation or Merchandise charge from someone who never created a Profile.

**Immutable recipient snapshot, mandatory on every invoice regardless of which shape above applies:** `bill_to_name`, `bill_to_email`, `bill_to_phone`, captured at issuance. If the linked Profile, Organization, or inquiry record is later edited, already-issued invoices do not change — they reflect what was true at the time of billing, not a live join.

## 3. Invoices & Line Items — Immutability Made Explicit

`invoices`: `issuing_organization_id` (nullable), the three billed-party fields plus snapshot fields (Section 2), `invoice_number`, `status`, `currency`, `total_amount`, `issued_at`, `due_at`, `paid_at`.

**`status = 'paid'` is a derived state, not a freely-settable one** (Section 11) — it reflects verified payment totals reaching the invoice total, not a manual staff toggle.

`invoice_line_items`: `invoice_id`, `description`, `unit_amount`, `quantity`, `line_total`, `source_type`, `source_id`. Per this revision's clarification, `source_type`/`source_id` is **optional provenance only** — it records what business event caused the charge, for traceability and reporting, but the line item's own `description`/`unit_amount`/`quantity`/`line_total` are the authoritative, immutable financial record. If the underlying Programme, Fee Definition, subscription plan, or merchandise item is edited or repriced later, every already-issued invoice referencing it is completely unaffected — the line item already has its own permanent copy of the numbers.

## 4. Payments — Recorded, Not Processed

Unchanged from the prior revision: `payments` (`invoice_id`, `amount`, `currency`, `payment_method`, `recorded_by_profile_id`, `paid_at`, `reference_note`, `status`) records payment activity manually at MVP. Refined per this revision: **payment currency must match invoice currency** (no in-record conversion), and **one invoice may have multiple or partial payments** — `payments` was always a one-to-many child of `invoices`, and this revision makes that explicit rather than assumed.

## 5. Receipts

Unchanged in shape, refined in trigger condition: a Receipt corresponds to a **verified** Payment specifically, not any recorded one — a payment marked `recorded` but not yet `verified` does not yet produce a receipt.

## 6. Fee Definition / Pricing Schedule — New, Replacing Simple Programme Pricing

The actual education-service pricing mechanism, deliberately kept simple — a configurable schedule, not a rules engine:

| Field (conceptual) | Purpose |
|---|---|
| `issuing_organization_id` | Nullable — null means a LearnFlow-suggested/default fee schedule; populated means a specific Organization's own pricing. |
| `fee_type` | `homeschooling_tuition` / `tuition_part_time` / `term_fee` / `subject_fee` / `programme_fee` / `registration_fee` / `custom`. |
| `name`, `description` | What it is. |
| `amount`, `currency` | Fixed-precision monetary value (Section 11). |
| `billing_frequency` | `one_time` / `per_term` / `per_academic_period` / `monthly` / `annual`. |
| `effective_from`, `effective_to` | Nullable end date — open-ended if still in effect. |
| `applies_organization_wide` | Boolean, refined per approval. |
| `curriculum_id`, `academic_level_id`, `subject_id`, `programme_id` | All nullable applicability filters. |
| `status` | The same draft/published/archived lifecycle used throughout Phase 10. |

**Applicability rule, refined to eliminate ambiguity:** a Fee Definition must satisfy exactly one of two states — **(A)** one or more of the four applicability filters is populated (a scoped fee — e.g., Grade-10-CBC tuition, Mathematics tutoring, Chess Club), or **(B)** `applies_organization_wide = true` with zero filters populated (a genuine broad fee — registration, administrative, materials, annual service charges). An entirely unscoped Fee Definition with `applies_organization_wide = false` is not a valid state — it would be indistinguishable from an incomplete configuration, not an intentional broad fee. A Chess Club fee (Phase 10F's original pricing need) lives here with `programme_id` populated, not on `programmes` itself.

**Matching precedence for MVP**, confirmed as "most specific wins," with concrete rules:
- Matching happens **within one `fee_type` at a time** — different fee types (e.g., tuition and a registration fee) can both legitimately apply to the same billing context simultaneously, each producing its own invoice line item.
- A Fee Definition is a candidate only when **every filter it has populated matches the billing context** — a definition with `curriculum_id` + `academic_level_id` set needs both to match; one with only `academic_level_id` set needs just that.
- Specificity is counted by number of matching populated filters; `applies_organization_wide = true` is the least-specific fallback within its fee type.
- **Two equally-specific active definitions matching the same context and effective period is a configuration conflict, not a silent tiebreak** — this must surface for an authorized administrator to resolve, never be resolved by arbitrary selection. The exact enforcement mechanism (a validation check at Fee Definition creation time, a runtime detection at invoicing time, or both) is carried forward to Phase 10L, not designed here — consistent with not building a dynamic pricing engine at this stage.

An `invoice_line_items` row referencing a Fee Definition uses `source_type = 'fee_definition'` — still just provenance (Section 3); the line item's own snapshot is what's authoritative. **Deliberately not built:** dynamic/rules-based pricing, discounts, or proration — a Fee Definition is matched and applied once, at the point an invoice line item is created.

**Kept structurally separate from `plans`/`organization_subscriptions`** (Phase 5), per this revision's explicit instruction — those represent LearnFlow's SaaS relationship with an Organization; Fee Definitions represent that Organization's own education-service pricing for its learners/families. No shared table, no shared identifiers between the two — only the shared downstream Invoice/Payment/Receipt infrastructure they both eventually flow through.

## 7. Four Distinct Commercial Concepts, One Shared Infrastructure

Preserved explicitly, not merged: **(1)** LearnFlow SaaS subscriptions (`plans`/`organization_subscriptions`), **(2)** learner/family education-service fees (Fee Definitions, Section 6), **(3)** Consultation charges, **(4)** Merchandise charges. All four can produce Invoices, Payments, and Receipts through the identical shared mechanism (Sections 3–5) — but they are never the same commercial product, and nothing in this design treats them as interchangeable.

## 8. Connecting to Existing Billable Sources

- **Subscriptions** — `source_type = 'subscription'`, `issuing_organization_id` null (platform-issued).
- **Education-service fees** (tuition, term fees, subject fees, programme fees) — `source_type = 'fee_definition'`, referencing the matched Fee Definition (Section 6).
- **Consultation fees** — `source_type = 'consultation'`, referencing the `public_inquiries` row.
- **Merchandise** — `source_type = 'merchandise'`, referencing the relevant `public_inquiries`/`merchandise_items` records.

## 9. Payment Gateway Integration — Explicitly Future, Reaffirmed

Unchanged: M-Pesa, Pesapal, Flutterwave, Stripe, webhooks, and automated reconciliation are not introduced in this phase. `payments.payment_method` keeps its ready vocabulary; the architecture stays gateway-neutral so a provider can be selected later without redesigning `invoices`/`payments`/`receipts`.

## 10. Ownership & RLS — Four Visibility Paths, Not Two

Refined per this revision — financial-data access is not limited to administrators, since the billed party must be able to see their own records:

1. **Platform Administrator** — appropriate platform-level financial administration access.
2. **Issuing Organization Administrator** — records their Organization issued.
3. **Billed Organization Administrator** — records billed to their Organization.
4. **The specific `billed_to_profile_id`** — their own applicable invoice/payment/receipt records, and only their own.

**Teachers and Tutors get no financial-data access by virtue of their instructional role.** If a Teacher or Tutor happens to also be a `billed_to_profile_id` on some invoice (e.g., they're independently paying for their own child's tuition as a Parent), their access to *that* invoice derives entirely from being the billed party — never from being a Teacher/Tutor.

## 11. Financial Integrity Requirements (carried forward to Phase 10L)

- One Invoice may have multiple or partial Payments.
- Payment currency must match Invoice currency at MVP.
- Invoice `paid` status is derived from verified payment totals, not a freely-settable manual status.
- Receipts correspond to *verified* Payments specifically.
- Issued invoice financial values are historical records, not casually mutated after issuance.
- Monetary values use fixed-precision numeric types with an explicit currency code — never floating-point arithmetic, consistent with how `plans.price_amount` was already defined back in Phase 5.
- Validation that a line item's `source_id` actually corresponds to its declared `source_type`.

## 12. MVP vs. Future

**MVP:** the full record-keeping model above — invoices, immutable line items, manually-recorded payments, verified-payment-triggered receipts, Fee Definitions for education-service pricing, four-path financial visibility.
**Future:** live payment gateway integration, automated invoice generation, real merchandise checkout, calendar-integrated consultation booking with fee collection, dynamic/rules-based pricing, multi-currency conversion.

---

## Summary of Completed Architecture

Billing remains a record-keeping system, not a payment processor. This revision replaces an under-scoped "price field on Programmes" with a proper Fee Definition concept that actually covers the fees that matter most (tuition, term fees, subject fees) — while keeping it explicitly separate from LearnFlow's own SaaS subscription model, since conflating the two would have been a real conceptual error. The billed-party model now supports Organizations, specific Profiles, and external non-account customers without ever fabricating a fake tenant Organization to represent a billing recipient, and every issued invoice preserves an immutable snapshot of both who was billed and what they were charged.

## Refinements Made During This Phase
1. Programme pricing withdrawn from `programmes.price_amount` in favor of Fee Definitions — an explicit correction of this phase's own earlier draft, not an external requirement layered on top.
2. Billed party expanded from a single required Organization reference to three mutually exclusive shapes (Organization, Profile, external inquiry), plus a mandatory immutable name/email/phone snapshot.
3. Line item provenance (`source_type`/`source_id`) reclassified as optional traceability, not the authoritative financial value — each line item now explicitly owns its own permanent snapshot.
4. Financial-data visibility expanded from two paths (issuing/platform admin) to four, adding the billed Organization and the billed Profile themselves.
5. `paid` status and receipt issuance are now explicitly derived from verified payment activity, not freely settable.
6. Fee Definition applicability finalized: either `applies_organization_wide = true` with no filters, or at least one populated filter — an entirely unscoped, non-organization-wide definition is not a valid state.
7. Fee Definition matching precedence finalized: most-specific-wins within one `fee_type`, with equally-specific conflicting matches treated as a configuration error requiring administrator resolution, never a silent tiebreak.

## Assumptions & Risks
1. **Risk, unresolved by design (intentionally):** the exact mechanism for detecting and surfacing equally-specific Fee Definition conflicts (Section 6) is carried to Phase 10L, not solved here — this document establishes the *principle* (never silently choose), not the implementation.
2. **Risk:** three billed-party shapes plus a snapshot is more fields than a typical invoice table — accepted as directly serving an explicit requirement (no fake tenants for billing recipients), not incidental complexity.

## Remaining Approval Decisions
1. Approve Phase 10I as finalized and proceed to Phase 10J (already approved) / Phase 10K (Security & Authorization Review).
