# LearnFlow — Stage 3 Completeness Remediation Record

**Date:** 15 September 2026
**Pull request:** #8 (`RWAMBA/learnflow-platform`)
**Branch:** `feature/phase10-stage3-public-website`
**Remediation base SHA:** `08de5f7dddfafad2c7a519d08d9406fc120e71bf`

## Decision

The final completeness review found two remaining merge blockers:

1. a valid upload ticket could leave an unattached private instructor document
   in Storage indefinitely if the application was never submitted; and
2. the About, Services and Why Choose Us routes still shipped substantive
   marketing claims outside the Stage 3 CMS ownership boundary.

## Forward-only remediation

The remediation adds `20260915130000_reclaim_abandoned_instructor_uploads.sql`.
Its service-role-only selector returns at most 500 instructor-upload objects
that are older than 24 hours and are not referenced by any application. The
existing authenticated daily retention route removes those objects through the
Storage API before continuing ordinary submission retention. The 24-hour
threshold is deliberately longer than the 15-minute upload-claim lifetime, and
the attachment anti-join prevents attached evidence from being selected.

Real-principal proof covers the RPC privilege boundary and verifies that an old
attached clean document is retained while an old unattached upload is selected.
The affected informational routes now keep only structural headings in source;
substantive page copy remains owned by published CMS records.

## Delivery state and gates

The repository contains 45 uniquely ordered migrations after this remediation.
This record does not claim that the new migration is live. Before PR #8 may
merge, the linked ledger must be reconciled, the pending migration applied, and
all exact-head CI and product-evidence gates must pass.

No migration was applied, and no deployment, publication or merge occurred
while preparing this remediation.
