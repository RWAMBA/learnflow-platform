# LearnFlow — Phase 10C: Database Impact Review

**Scope:** Concrete schema impact of the Phase 10B curriculum hierarchy — existing tables requiring modification, new tables, relationships, indexes, constraints, versioning strategy, ownership, RLS implications. No SQL (that begins only when explicitly requested, per the Phase 10 brief).
**Status:** Draft — pending approval before Phase 10D (Learner Enrollment & Academic Progression).
**Builds on:** Phases 1–9 and Phase 10A–10B — approved. All prior decisions are authoritative except the revisions in Section 0.
**Evidence note:** Section 10 draws on the repository state shared earlier in this conversation. A live re-fetch of `github.com/RWAMBA/learnflow-platform` was attempted for this phase and blocked by GitHub's robots.txt on the web interface; nothing below claims to be independently re-verified against the current live repository beyond that earlier snapshot.

---

## 0. Carry-Forward from Phase 10B

| #   | Decision                                                                                                                                                                             | Status                                                                                                                                                                                                                      | Impact                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Subjects stay scoped per Academic Level; cross-level grouping for reporting only                                                                                                     | Confirmed                                                                                                                                                                                                                   | New `subject_groups` table (Section 2).                                  |
| 2   | Draft→Published→Archived applies to Curriculum Version, Education Stage, Academic Level, Subject, Curriculum Node, Learning Objective, Lesson, Learning Resource, **and Assessment** | Confirmed — broader than Phase 10B's own proposal, which had left Assessment as a later refinement. Elevated to this phase's scope accordingly (Section 1).                                                                 | Assessment reclassified from "could change later" to part of this build. |
| 3   | LearnFlow stands in as Provider for the American pathway at MVP; provider/standards extensibility must not require redesign later                                                    | Confirmed, with an important distinction surfaced in Section 7: "new provider" and "new standards framework" (Common Core, NGSS, state standards) are architecturally different kinds of extension, not the same mechanism. |
| 4   | Independent Learner uses the existing `org_admin` role, no new role type                                                                                                             | Confirmed                                                                                                                                                                                                                   | No schema impact.                                                        |
| 5   | Curriculum vs. Curriculum Version distinction                                                                                                                                        | **Already inherent in the Phase 10B model** — Curriculum ("CBC") and Curriculum Version ("CBC 2024," "CBC 2027") were already separate layers. Confirmed explicitly, no redesign needed.                                    |

## 1. Existing Tables Requiring Modification

| Table             | Classification                               | Change                                                                                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `curricula`       | **MUST CHANGE**                              | Gains `provider_id` FK to the new `curriculum_providers`. Already had no hardcoded CHECK on `code` — genuinely extensible as-is, just needed a parent.                                                                                                                                                                               |
| `grades`          | **MUST CHANGE**                              | Renamed `academic_levels`; `curriculum_id` FK replaced with `education_stage_id`.                                                                                                                                                                                                                                                    |
| `pathways`        | **SHOULD CHANGE**                            | Renamed `tracks` — "Pathway" is CBC-specific terminology; reusing it silently for Cambridge subject-combinations or American electives would be misleading. Same reasoning as the earlier `competencies → learning_objectives` rename. Flagged for confirmation.                                                                     |
| `subjects`        | **SHOULD CHANGE**                            | `grade_id` → `academic_level_id`; `pathway_id` → `track_id`; gains `subject_group_id` (new FK, Section 2).                                                                                                                                                                                                                           |
| `competencies`    | **MUST CHANGE**                              | Renamed `learning_objectives`; `subject_id` FK replaced with `curriculum_node_id`.                                                                                                                                                                                                                                                   |
| `lessons`         | **SHOULD CHANGE**                            | `subject_id` FK replaced with `curriculum_node_id`. Existing `author_type`/`authoring_organization_id`/`content_type`/`content_body`/`storage_path` carry forward unchanged. Per the earlier repository snapshot, `status`/`published_at` already exist here — this table may already be closer to its target shape than the others. |
| `assessments`     | **MUST CHANGE** (elevated per Section 0, #2) | Gains an optional `learning_objective_id` FK for standalone/reference assessments, plus `status`/`published_at`. The existing `assignment_id`-linked path is unchanged.                                                                                                                                                              |
| `organizations`   | **DO NOT CHANGE**                            | `branding jsonb` already exists as an unused placeholder (Phase 5) — the Phase 10A branding-configurability requirement is satisfied by _using_ it, not changing its shape.                                                                                                                                                          |
| `system_settings` | **DO NOT CHANGE**                            | Already a generic key-value table; platform-wide brand defaults (name, logo, domain, contact, primary color) are new _rows_, not a schema change — the same mechanism already used for `relationship_invitation_expiry_days`.                                                                                                        |

## 2. New Tables

| Table                                                                                                | Purpose                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `curriculum_providers`                                                                               | KICD, Cambridge International, Pearson, LearnFlow (as generic-pathway provider). A genuine lookup table — new providers are inserts, never a CHECK-constraint edit, satisfying Decision 3. |
| `curriculum_versions`                                                                                | Dated/labeled revisions of a Curriculum.                                                                                                                                                   |
| `education_stages`                                                                                   | Broad phase within a Curriculum Version (Section 4 of Phase 10B).                                                                                                                          |
| `curriculum_nodes`                                                                                   | Self-referencing (`parent_node_id`), the recursive content-organization unit within a Subject.                                                                                             |
| `learning_resources`                                                                                 | Supplementary material, mirroring `lessons`' ownership pattern (`author_type`, `authoring_organization_id`).                                                                               |
| `subject_groups`                                                                                     | The cross-level grouping mechanism from Decision 1 — e.g., a "Mathematics" group tying Grade 7/8/9 Mathematics `subjects` rows together for reporting, without merging their content.      |
| _(reserved, not built this phase)_ `standards_frameworks` + an objective-to-standard crosswalk table | The future mechanism for Common Core/NGSS/state standards (Section 7) — named and reserved now so the extension path is concrete, but not part of this build.                              |

## 3. Relationships & Foreign Keys

| Relationship                                 | Implementation                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider → Curriculum                        | `curricula.provider_id → curriculum_providers.id`                                                                                                                                                          |
| Curriculum → Curriculum Version              | `curriculum_versions.curriculum_id → curricula.id`                                                                                                                                                         |
| Curriculum Version → Education Stage         | `education_stages.curriculum_version_id → curriculum_versions.id`                                                                                                                                          |
| Education Stage → Academic Level             | `academic_levels.education_stage_id → education_stages.id`                                                                                                                                                 |
| Academic Level → Subject                     | `subjects.academic_level_id → academic_levels.id`                                                                                                                                                          |
| Academic Level → Track (optional)            | `academic_level_tracks` junction, or `subjects.track_id → tracks.id` where a track filters subject availability — exact shape is an implementation detail, not resolved differently by this being SQL-free |
| Subject → Subject Group                      | `subjects.subject_group_id → subject_groups.id` (nullable — not every subject needs grouping)                                                                                                              |
| Subject → Curriculum Node                    | `curriculum_nodes.subject_id → subjects.id`                                                                                                                                                                |
| Curriculum Node → Curriculum Node            | `curriculum_nodes.parent_node_id → curriculum_nodes.id` (nullable — null means top-level within the subject)                                                                                               |
| Curriculum Node → Learning Objective         | `learning_objectives.curriculum_node_id → curriculum_nodes.id`                                                                                                                                             |
| Curriculum Node → Lesson / Learning Resource | `lessons.curriculum_node_id`, `learning_resources.curriculum_node_id`                                                                                                                                      |
| Learning Objective → Assessment              | `assessments.learning_objective_id → learning_objectives.id` (nullable — only for standalone/reference assessments; the existing `assignment_id` link is unchanged)                                        |

## 4. Indexes (candidates)

- `academic_levels(education_stage_id)`
- `subjects(academic_level_id, subject_group_id)`
- `curriculum_nodes(subject_id)` and `curriculum_nodes(parent_node_id)` — the second is the one that matters most: every "get this node's children" query depends on it, and the recursive tree makes this the hottest new access pattern in the whole hierarchy.
- `learning_objectives(curriculum_node_id)`
- `lessons(curriculum_node_id, status)` and `learning_resources(curriculum_node_id, status)`
- `assessments(learning_objective_id)`
- `curriculum_versions(curriculum_id, is_current)`

## 5. Constraints

- Every newly-lifecycled table: `status text not null default 'draft' check (status in ('draft','published','archived'))` — stays TEXT+CHECK, not a new lookup table, for the same reason `roles`/`curriculum_providers` are lookup tables and `status` fields elsewhere in the schema are not: statuses are a small, stable vocabulary nobody needs to self-serve extend at runtime; providers and roles are exactly the kind of vocabulary that does.
- `curriculum_versions`: only one `is_current = true` row per `curriculum_id` — a partial unique index (`unique index on curriculum_id where is_current = true`) is the standard Postgres mechanism, not a plain `unique` constraint.
- **`curriculum_nodes` cycle prevention is a real, non-trivial gap.** A plain foreign key cannot stop a node from becoming its own ancestor through a longer chain. Postgres `CHECK` constraints can't run recursive queries either. This needs either a depth-limited validation trigger or application-level validation on node creation/move — flagged honestly now rather than assumed away, since it's the one place in this design where "just add a constraint" doesn't actually solve the problem.

## 6. Versioning Strategy

A Curriculum Version is never mutated once published — a revision is a new `curriculum_versions` row, not an edit to an existing one. This is what makes Phase 10D's "historical academic records" requirement possible: a Student's enrollment and progress records need to reference the _specific_ Curriculum Version and Academic Level they studied under, so a future CBC revision doesn't retroactively alter what a past record means. That reference point (a formal "curriculum enrollment" concept tying a Student to a specific Curriculum Version) doesn't exist yet in the current schema — flagged here as a direct dependency for Phase 10D, not solved in this phase.

## 7. Curriculum Ownership — Three Distinct Axes

These are genuinely different kinds of extensibility and shouldn't be conflated into one mechanism:

1. **New Provider** (a hypothetical future exam board or curriculum authority) — solved by `curriculum_providers` and `curricula` being real lookup tables (Section 2), never CHECK-constrained enums. Adding one is an insert.
2. **New Standards Framework** (Common Core, NGSS, state standards) — a _different_ shape of extension. These are not curricula with their own Provider→Version→Stage tree; they're cross-cutting alignment tags that many different American curricula/publishers reference against the same Learning Objectives. The reserved `standards_frameworks` + crosswalk table (Section 2) is the right future mechanism — not a new Provider row. Confirm this distinction before Phase 10D/10L, since building the wrong one (treating Common Core as a "Provider") would misrepresent what it actually is.
3. **Content Ownership** (platform-curated vs. tenant-authored vs. licensed) — the existing `author_type`/`authoring_organization_id` pattern already on `lessons`, now extended to `learning_resources`. No new mechanism.

## 8. RLS Implications

Most of this hierarchy — Provider, Curriculum, Version, Stage, Level, Subject, Curriculum Node, Learning Objective — is **platform-level reference data, not tenant-scoped**. This is a genuinely simpler RLS story than the tenant-scoped tables from Phase 5:

- **Read:** any authenticated user (or even public/unauthenticated, since curriculum structure isn't sensitive) — not filtered by `auth_organization_ids()` the way `students` or the relationship tables are.
- **Write:** `is_platform_admin()` for platform-curated content, or the existing `can_author_curriculum`-style check (already present in the repository per the earlier snapshot) scoped to the authoring organization, for tenant-authored variants.

`lessons` and `learning_resources` keep the existing ownership-aware policy shape already established for `lessons`. `assessments` keeps its existing tenant-scoped policy where linked to a real graded Assignment; a standalone reference Assessment (linked only to a Learning Objective, no Assignment) follows the platform-level pattern instead.

One gap surfaced in passing, unrelated to curriculum specifically: `system_settings` doesn't appear to have an explicit RLS policy of its own in the approved Phase 5 design (it was implicitly grouped under "follows the same pattern" rather than spelled out) — worth closing directly (read: any authenticated user; write: platform administrator) regardless of the branding feature, since it's a real gap either way.

## 9. Branding Configurability — Schema Impact

No new tables, no altered tables. `system_settings` holds platform-wide defaults (`platform_brand_name`, `platform_logo_url`, `platform_domain`, `platform_contact_email`, `platform_primary_color`, etc.) as new key-value rows. `organizations.branding` (already exists, currently unused) holds per-tenant white-label overrides. Both mechanisms already existed in the approved Phase 5 schema before this expansion was scoped — worth noting as validation that the original design anticipated this need correctly.

## 10. Reconciliation with the Existing Implementation

Based on the repository snapshot shared earlier in this conversation (not independently re-verified live, per the note at the top): the codebase already contains a `topics` table, a `learning_objectives` table, and a `draft/published/archived` workflow on `subjects` and `lessons`, added ahead of the original MVP scope. `learning_objectives` as a name is already correct and needs no further rename. Whether the existing `topics` table can become `curriculum_nodes` directly, or needs restructuring to support genuine recursive nesting (`parent_node_id`) and multi-curriculum scope (it was very likely built CBC-only), can't be confirmed without inspecting the live migration files directly — recommend either sharing the current `supabase/migrations/` contents directly in this conversation, or granting a fetchable (non-robots-blocked) access path, before Phase 10L commits to a specific migration sequence.

---

## Architectural Decisions Made

1. `pathways` renamed `tracks`, generalizing CBC-specific terminology the same way `competencies` was generalized to `learning_objectives` — flagged for the same explicit confirmation.
2. `subject_groups` introduced as the concrete mechanism for Decision 1's cross-level reporting/continuity requirement.
3. Assessment is elevated into this phase's build (full lifecycle + optional standalone Learning Objective link), per the broadened Draft→Published→Archived scope from Phase 10B's approval.
4. Provider/standards extensibility is explicitly split into three distinct mechanisms (Section 7) rather than one — new Provider, new Standards Framework, and content ownership are not the same kind of extension point.
5. `curriculum_nodes` cycle prevention is identified as a real gap requiring a trigger or application-level check, not assumed solvable by a constraint alone.
6. `organizations.branding` and `system_settings` require no schema change to satisfy the Phase 10A branding-configurability requirement — both already exist for this purpose.
7. A `system_settings` RLS policy gap is surfaced and should be closed independent of this expansion.

## Assumptions

1. The existing `topics`/`learning_objectives` tables in the live implementation are CBC-scoped and will need restructuring to serve the full multi-curriculum hierarchy — stated as a reasonable inference from the earlier snapshot, not a confirmed fact.
2. Curriculum enrollment (tying a Student to a specific Curriculum Version) does not yet exist as its own concept and is Phase 10D's responsibility, not this phase's.
3. Track-to-Subject filtering (Section 3) is a real requirement but its exact shape (junction table vs. direct FK) is left open pending Phase 10D/10L implementation detail.

## Risks

1. **Migration risk against the live `topics` table** is the largest unresolved item in this phase — building `curriculum_nodes` as a parallel new table without reconciling the existing one risks duplicate, drifting curriculum-organization concepts in the same codebase.
2. **Cycle prevention on `curriculum_nodes`** is unresolved technically, not just unstated — needs a concrete decision (trigger vs. depth-limited validation) before Phase 10L can sequence the migration safely.
3. **Conflating "new Provider" with "new Standards Framework"** (Section 7) is an easy mistake to make later under time pressure; worth keeping this distinction visible in Phase 10D/10L rather than only living in this document.

## Questions Requiring Approval

1. Confirm renaming `pathways` to `tracks`.
2. Confirm the three-way split of curriculum ownership/extensibility (new Provider vs. new Standards Framework vs. content ownership) as three separate mechanisms, not one.
3. Confirm `curriculum_nodes` cycle prevention should be handled via a validation trigger (recommended) rather than deferred as an unenforced risk.
4. Share the current `supabase/migrations/` contents directly, or provide another accessible path, so Phase 10L can reconcile the existing `topics` table against `curriculum_nodes` with confidence rather than inference.
5. Approve Phase 10C to proceed to Phase 10D (Learner Enrollment & Academic Progression).
