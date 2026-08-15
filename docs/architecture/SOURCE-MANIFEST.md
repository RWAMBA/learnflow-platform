# LearnFlow Architecture Source Restoration Manifest

## Purpose

This package restores the authoritative Phase 1–9 and Phase 10A–10L planning corpus that was absent from the repository during Claude's consolidated audit. The phase documents are copied byte-for-byte from the user's stored originals. Only revision suffixes such as `(1)` and `(2)` were removed from destination filenames so each phase has one canonical repository path.

## Authority and interpretation rules

1. The current repository and live Supabase schema remain the implementation baseline. These historical planning documents do not override verified current implementation facts.
2. The actual application framework is TanStack Start + React 19 + TypeScript + Vite. Historical Next.js, Vercel, Upstash, Sentry, or Resend references are requirements or earlier assumptions to audit, not authorization to migrate frameworks or add services silently.
3. Later approved refinements supersede earlier drafts when they conflict. Phase 10L confirms that Phase 10A–10L were reviewed and approved.
4. Existing data and migrations must be reconciled before implementation. In particular, the current `student_curriculum_assignments` table must be evaluated separately from the planned version- and academic-period-aware `curriculum_enrollments` model.
5. No SQL, migration, schema mutation, or application feature is authorized merely by committing this documentation package. The next authorized action is Claude's read-only completion of the previously blocked audit sections.

## Restored files and SHA-256

| Canonical repository path | SHA-256 |
|---|---|
| `phase-1-9/phase-1-foundational-strategy.md` | `4996627db3d5a245a0b8b1f76ac652a679da9ad480d23dd81f5b153ef9a93494` |
| `phase-1-9/phase-2-prd.md` | `ac53812067b17b8dc85a3b77a4729ff2c81c7baa664af7c4f5070485fcc1abb4` |
| `phase-1-9/phase-3-information-architecture.md` | `4dea3405876585a6d9c6ed9148fdbeb6f3e491f06f1f9abe06100e2c5c8f9e63` |
| `phase-1-9/phase-4-functional-specifications.md` | `9ab7d76592c75e10792994080ab5940a6c2d012eaa58adf53483f3cd8812e70c` |
| `phase-1-9/phase-5-database-architecture.md` | `530979bf6fb63f09275af71c85fe8d003bb585c99f2cbf7529a90a1179dd20f9` |
| `phase-1-9/phase-6-backend-architecture.md` | `4c3f87dc92dd94185e2e9f1aa9d193058ef0e875e4c812205ea3014e2347c0cb` |
| `phase-1-9/phase-7-ui-ux-design-system.md` | `06bd0560f8e3da168e87ff46127f3c7c288b3b601ecf5b4a978b1b2b1d854acd` |
| `phase-1-9/phase-8-security-performance-infrastructure.md` | `b13da5da3caf2e5f9a8d4647962409b00f51460f9ee5b94f1cfa70f5238b4965` |
| `phase-1-9/phase-9-lovable-mvp-prompt.md` | `4623e95125fe0459611da2b28a0d6f3eef437ba94de02a4a5daf2c685a4fad88` |
| `project-implementation-manifest.md` | `768cd20049bd2a6591215d7097d2604f49f9231b840dfc60e75a260d59bd00b6` |
| `phase-10/phase-10a-curriculum-requirements-addendum.md` | `a5a95fcfc00a9db7fe07510cb7ea16e928631338c1fdd11290b0ac88ababbe31` |
| `phase-10/phase-10b-universal-curriculum-architecture.md` | `d6784bb3fc21ace60ac2e5ec348d443b2da445ca1e02fc40875af23a14563d1a` |
| `phase-10/phase-10c-database-impact-review.md` | `0e18c2e01b16b8da262b0298d0034e04d1fd22149a2f20e0c29f60dbba0c1cb1` |
| `phase-10/phase-10d-learner-enrollment-progression.md` | `bad2e3c58bfdc02d62c20a0e7709308af7faf4309a6a828d99c9c1284057bae2` |
| `phase-10/phase-10e-public-website-architecture.md` | `3583a71a1e9448825cb189569bd318b2faa7791497f30c3b5ac253a31516a6b5` |
| `phase-10/phase-10f-programme-architecture.md` | `f91593e319c8410b606f59f770c0b6c271b6a059915a15e1fec28bcdbb54412a` |
| `phase-10/phase-10g-community-architecture.md` | `0f7f469c53ece1b54bb483733c78846db29e8ea03f58edf6638076e371a2ee68` |
| `phase-10/phase-10h-career-pathways-architecture.md` | `cd93498929c3aab504c4f98c7b9c250086fd7f1748508996be43b1b28f35fa02` |
| `phase-10/phase-10i-billing-commercial-architecture.md` | `a60edf6718f512725a0c636e18f9b683b74eee252594ab7f1febaa154bd304cc` |
| `phase-10/phase-10j-ui-ux-architecture-review.md` | `cffcacc9ce853b37ee990398828856f1bbbfbd431183aad5609e69cf2c2e91f6` |
| `phase-10/phase-10k-security-authorization-review.md` | `cc894f6c47695322f56a7720418b76830658dbd4ae833c9a889b357227f7d492` |
| `phase-10/phase-10l-implementation-strategy.md` | `54ab442812c8d48c25a1dbf903cac1c26ac97a06612a75f81e30bf133a4c6bf6` |

## Revision selection

Where the Library contained several revisions, this package uses the latest refinement that downstream documents identify as approved or finalized: Phase 5 revision 2, Phase 8 revision 1, Phase 9's byte-identical revision 2, Phase 10D revision 1, 10E revision 1, 10F revision 1, 10G revision 2, 10H revision 1, 10I revision 2, 10J revision 1, 10K revision 2, and 10L revision 2.

## Next audit action

After these files are committed, rerun only Sections 7 and 13 of Claude's existing consolidated audit. Preserve all already-completed baseline findings. The output must produce the exact Stage 1A scope against the current repository and schema without creating SQL, migrations, application code, or a Lovable build prompt.
