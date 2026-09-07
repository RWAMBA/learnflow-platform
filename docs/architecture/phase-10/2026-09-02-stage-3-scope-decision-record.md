# LearnFlow — Stage 3 Binding Scope Decision Record

**Date:** 2 September 2026
**Pull request:** #8 (`RWAMBA/learnflow-platform`)
**Branch:** `feature/phase10-stage3-public-website`
**Starting SHA:** `4719945843ba45db9d8ca7381174d1ee3458539e`
**Starting tree:** `5a229817856dd27837992494c4b238dbe191f4f4`
**Live Supabase project:** `smvlwwevgtwkdndxfmtp`
**Repository/live migration ledger:** 42 / 42, zero pending; ledger tail `20260901192243`

---

## 1. Review conclusion being closed

Claude's final architecture and security review of PR #8 found **no independently
merge-blocking code or security defect**. The review was blocked only on two
undocumented scope questions, which this record closes:

1. The instructor-document upload contract differs from an earlier proposal —
   classified as a **secure but undocumented scope deviation**.
2. Merchandise media — classified as an **undocumented omitted capability**.

Also confirmed by that review:

- The corrected fixed-UTC `date_trunc` deduplication implementation is complete and correct.
- The GitHub Advanced Security agentic-review startup failure is **non-blocking** (Section 5).

## 2. Binding decision 1 — Instructor-document contract

The shipped contract is approved as the intentional Stage 3 scope:

- Private Storage bucket: `instructor-applications`
- Bucket maximum file size: **5242880 bytes**
- Accepted MIME types:
  - `application/pdf`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Supported extensions: `.pdf`, `.docx`

Stage 3 supports the current CV/document-upload journey **only**:

- Certificate uploads are **not** part of Stage 3.
- Passport photograph or headshot uploads are **not** part of Stage 3.
- JPEG and PNG uploads are **not** part of Stage 3.
- The earlier **10,485,760-byte PDF/JPEG/PNG proposal is superseded**.

### Why this is deliberate privacy-minimizing scope reduction

Instructor applications are unauthenticated submissions of sensitive personal
data with no applicant-side read path. Accepting fewer document classes, fewer
formats and a smaller size ceiling reduces the volume and sensitivity of PII the
platform holds (no biometric-grade headshots, no credential images), narrows the
parser/content-type attack surface, and keeps the retention obligation
proportionate to the recruitment decision actually being made. The narrower
scope is **data minimization by design, not an accidental omission**.

### Controls that remain binding

- The bucket remains **private**.
- Server-controlled upload tickets (client never chooses the destination path or holds a Storage credential).
- Quarantine controls, authorization checks and rate limiting on ticket issuance.
- Download restricted to Platform Administrators.

### Future-change requirements

Adding certificates, photographs, image formats, or a larger size limit requires
a **new architecture decision and a security review** covering: PII/retention
impact, content-type and magic-byte validation, bucket policy and RLS review,
CI prelude bucket-contract update, and tests. The current bucket configuration,
application validation and CI prelude **must not** be changed merely to restore
the superseded proposal.

## 3. Binding decision 2 — Merchandise media

Stage 3 merchandise is approved as a **text-first catalogue and inquiry
feature**.

- No `merchandise-images` Storage bucket is required in Stage 3.
- No merchandise-media upload journey is required in Stage 3.
- No arbitrary external-image URL workflow is approved in Stage 3.
- `merchandise_items.media_path` is a **reserved, nullable forward-compatibility
  field**. It does not represent a currently supported capability, and
  production merchandise records must not depend on it.
- The CMS and product documentation must not claim that merchandise images can
  currently be uploaded or managed.

### Why merchandise media is deferred

Merchandise is enquiry-only with no cart or checkout, so imagery adds no
transactional value in Stage 3 while introducing a new public-read Storage
surface, upload authority, media validation, and moderation burden. Deferring it
keeps the public attack surface minimal and leaves the schema forward-compatible
at zero runtime cost.

### Verified non-contradiction at this SHA

`merchandise_items.media_path` appears only in generated Supabase types. It is
not surfaced as a CMS control (`src/features/public-site/admin-fields.ts`,
`src/routes/_authenticated/admin.content.tsx`), is not part of the public-site
Zod schemas, and is not read by the public merchandise routes
(`src/routes/merchandise.index.tsx`, `src/routes/merchandise.$slug.tsx`).

### Future-change requirements

Merchandise media requires a **separate additive implementation** with explicit
Storage or URL authority, validation rules, RLS/privilege review, tests, and
architecture approval.

## 4. Scope of this execution

- **No application code, database schema, live Supabase data, Storage
  configuration or applied migration was changed.** Documentation only.
- Applied Stage 3 migration checksums are unchanged:
  - `20260901192051_80bed8f4-790a-4eec-8df4-86b34c456735.sql` — `35bfa3135aa8fca8f8ba0d727059ce3aafd5600c9f78273d325972595f0f716d`
  - `20260901192243_75f341b0-ce7d-4901-81af-0361efefbc09.sql` — `2aa0722bddcee65aad711f4f5bfbb7e6a9741b415a337310a389a84d59c368f2`
- **Public deployment remains deferred** (no Lovable Publish; Vercel + Namecheap
  after remaining stages pass).
- **Stage 4 (Community) cannot start** until PR #8 receives final approval and
  is merged.

## 5. GitHub Advanced Security decision

The separate GitHub Advanced Security agentic-review run is **non-blocking for
PR #8**: the reported failure occurred at `session.create` while requesting an
unavailable model, **before any source analysis began**. Its source-analysis
result is therefore neither successful nor failed — no analysis started, so no
finding may be inferred in either direction. The successful **CodeQL
static-analysis checks remain separate, valid evidence**.

## 6. Superseded material

The earlier instructor-upload proposal (10,485,760 bytes; PDF/JPEG/PNG;
certificate and passport-photograph uploads) and any implied merchandise-image
capability are **superseded by this record** for Stage 3. Historical text is
retained in the Phase 10E and Phase 10L documents and marked as superseded
rather than deleted.
