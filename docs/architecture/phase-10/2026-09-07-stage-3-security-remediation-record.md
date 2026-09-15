# LearnFlow — Stage 3 Security Remediation Record

**Date:** 7 September 2026
**Pull request:** #8 (`RWAMBA/learnflow-platform`)
**Branch:** `feature/phase10-stage3-public-website`
**Remediation base SHA:** `0faa73cce7d48a21a1309a8ad2b2228a1882e91a`

## Decision

Two subsequently discovered Stage 3 defects are merge blockers until the
forward-only remediation is reviewed, applied to the linked project and proved
on the exact PR head:

1. An authenticated Platform Administrator could update scanner-controlled
   `document_paths` and `malware_state`, and the Storage read policy did not
   require an attached document with a clean scan verdict.
2. The retention function changed workflow state but did not irreversibly
   de-identify expired submissions, remove private instructor documents, or
   have a scheduled execution path.

The earlier 2 September scope decisions remain binding for supported upload
formats and merchandise media. Its earlier review conclusion is historical and
must not be read as a current readiness verdict.

## Forward-only remediation

The remediation adds, without editing an applied migration:

- `20260907153000_harden_stage3_retention_and_scan_integrity.sql`;
- column-scoped administrator decision privileges while scanner verdicts and
  document paths remain service-controlled;
- a Platform Administrator Storage read policy requiring both an attached path
  and `malware_state = 'clean'`;
- a service-role-only, idempotent retention finalizer that replaces expired PII
  with canonical tombstones and clears consent evidence;
- an authenticated daily internal retention route that deletes private Storage
  objects before clearing their database references; and
- real-principal rollback tests for scan-field mutation denial, clean-only
  Storage visibility, retention redaction and RPC privileges.

Upload-failure cleanup also checks every existing application attachment before
removing an object, so a duplicate or concurrent request cannot delete evidence
that another transaction already attached.

## Delivery state and gates

The repository contains 44 uniquely ordered migrations after this remediation.
The two migrations introduced after the last reconciled live tail
`20260901192243` are:

- `20260907124000_record_instructor_document_scan_verdict.sql`; and
- `20260907153000_harden_stage3_retention_and_scan_integrity.sql`.

This record does not claim that either migration is live. Before merge, the
linked Supabase ledger must be independently verified, both pending migrations
must be applied and reconciled, the disposable principal workflows must pass on
the exact remote head, and the scheduled route must have `CRON_SECRET`
configured. Manual responsive and role-journey evidence remains a separate
required gate.

No migration was applied, and no deployment, publication or merge occurred as
part of preparing this remediation.
