# LearnFlow — Phase 10M: Curriculum Rights, Provenance and Availability Architecture

**Status:** Implementation specification — AWAITING CLAUDE ARCHITECTURE APPROVAL. Not independently architecture-approved.
**Type:** Additive. Does not rewrite or supersede Phase 10A–10L.
**Applies to:** Stage 1A–1C curriculum foundation, content spine and enrolment.

---

## 1. Purpose

Phase 10A–10L defined the universal curriculum hierarchy but did not define how LearnFlow proves it is
lawfully entitled to store, display, adapt or commercialise curriculum content. This document closes that
gap. It is the authoritative specification for source provenance, rights grants, content traceability,
availability gating, evidence handling and audit.

Two invariants govern everything below:

1. **Ownership classification is not proof of rights.** `author_type = platform | tenant | licensed`
   describes who owns a record. It never, on its own, authorises access.
2. **Availability is derived, never asserted.** No column, UI toggle or server function may declare a
   curriculum usable. Usability is computed from independent states (Section 6).

## 2. Source provenance model (`source_artifacts`)

A source artifact is a single, versioned, identifiable real-world document from which curriculum content
derives. Required attributes:

| Attribute | Meaning |
| --- | --- |
| `source_title` | Title of the document as published |
| `rights_holder` | Legal owner of the work |
| `authoritative_url` | Canonical publisher location, where one exists |
| `document_date` | Publication/version date of the document |
| `jurisdiction` | Legal territory the document originates from |
| `acquisition_method` | `unknown \| official_download \| licensed_supply \| direct_grant \| public_domain \| learnflow_authored` |
| `source_type` | `official_document \| publisher_material \| open_licensed \| learnflow_original \| other` |
| `checksum` | Digest of the acquired artifact, proving what was actually obtained |
| `original_artifact_path` | Private Storage path to the retained copy |
| `verification_status` | `unverified \| in_review \| verified \| rejected` |
| `edition`, `notes` | Supporting metadata |

Source artifacts are platform-controlled reference data. A new edition of a document is a **new artifact**,
never an in-place edit of an existing one.

## 3. Rights grants (`rights_grants`)

Rights are recorded separately from sources because one source may carry several grants over time, and a
grant may expire while the source remains unchanged. Each grant records:

- Licence/grant type: `unknown | open_licence | commercial_licence | written_permission | public_domain | learnflow_owned`
- Grant/reference identifier
- Private evidence document path (contract, licence, written permission)
- Explicit permission flags, each independently recorded:
  `storage`, `authenticated_display`, `public_display`, `download`, `transformation`, `translation`,
  `derivative_works`, `commercial_use`, `sublicensing`
- Attribution text, territory, restrictions
- Effective date and expiry date
- Reviewer identity and verification date, **assigned server-side**, never client-supplied

A grant with an expiry date in the past is treated as expired regardless of any cached status.

## 4. Content traceability (`source_artifact_links`)

Sources and grants are traced to content through a link table supporting the entity types
`curriculum_version`, `education_stage`, `academic_level`, `track`, `subject`, `curriculum_node`,
`learning_objective`, `lesson`, `learning_resource`.

Curriculum-version-level linkage is mandatory. Node/objective/lesson/resource-level linkage is required
wherever a version mixes content of differing provenance, so that a single restricted or expired source can
be isolated without withdrawing an entire curriculum.

## 5. Independent states

Publication lifecycle (`draft → review → published → archived`) is preserved unchanged. Three orthogonal
states are added and must never be collapsed into it:

- `content_readiness = none | partial | complete`
- `rights_status = unknown | review_required | authorized | restricted | expired`
- `activation_status = inactive | internal_preview | active`

Each is set independently. Publication does not imply readiness; readiness does not imply rights; rights do
not imply activation.

## 6. Publication guard

An ordinary user may access curriculum content only when **all** of the following hold for its version:

```
status = 'published'
AND is_current
AND content_readiness = 'complete'
AND rights_status = 'authorized'
AND activation_status = 'active'
AND rights_reviewed_at IS NOT NULL
AND a qualifying, unexpired rights grant exists
```

This is enforced in the database (`public.curriculum_version_is_available`, consumed by RLS and by
enrolment triggers), not in the UI. LearnFlow-original content is subject to the identical gate: it must
carry a verified `learnflow_owned` grant with recorded provenance. `author_type = platform` grants no bypass.

## 7. Evidence, audit and enforcement boundaries

- Rights evidence and retained source artifacts live in **private Storage** only. No public bucket, no
  public URL, no unsigned path.
- Only authenticated Platform Administrators may read evidence; access is mediated server-side.
- Every rights decision, change and expiry is written to an **immutable** audit log
  (`rights_audit_log`), protected by triggers that reject `UPDATE` and `DELETE`.
- Server functions perform fail-closed pre-checks. They **supplement** RLS and never substitute for it.
  Every rights and provenance table carries its own RLS policies and explicit grants.

## 8. Curriculum availability at Stage 1 completion

Until lawful content and rights are verified, the shipped state is:

| Curriculum | State |
| --- | --- |
| Kenya CBC | configured, rights review required |
| Cambridge International | configured, awaiting authorized data |
| Pearson Edexcel | configured, awaiting authorized data |
| LearnFlow U.S. K–12 pathway | configured, framework/source package pending |

Unavailable curricula must not appear in ordinary-user selectors, enrolment flows, learner content
navigation or curriculum-specific billing. Informational "coming soon" display is permitted only where it
cannot be used to reach unavailable content.

## 9. American standards

Common Core and NGSS are **standards frameworks**, not curriculum providers. They are represented through
`standards_frameworks` (versioned) and `standards_statements`, and related to LearnFlow content through
`objective_standard_crosswalk`. They never appear in the provider → curriculum → version hierarchy.

## 10. Authorized imports

Later licensed or authorized data is imported as a **new, source-backed curriculum version** through
`curriculum_import_batches`, with a dry-run validation pass preceding any write. Imports never overwrite
historical versions, and never rewrite the provenance of content already served to learners.

## 11. CBC scope

CBC covers Grades 1–12 only: Primary 1–6, Junior Secondary 7–9, Senior Secondary 10–12. PP1, PP2 and
Pre-Primary are out of scope and must be absent from ordinary product journeys. Historical dependencies are
preserved; out-of-scope records are made unavailable, never destructively deleted.
