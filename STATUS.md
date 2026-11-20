# Repository Status

This is the **single live status document** for KT Intake. Other docs describe contracts and architecture; only this file states what is current, active, blocked, or next. A repository guard (`npm run repo:doctor`) rejects "active slice" / "pending merge" style status claims anywhere else outside `docs/archive/`.

Update it at every durable checkpoint and before handoff — see [`docs/playbooks/status-update.md`](docs/playbooks/status-update.md). Always re-verify against GitHub (main HEAD, open PRs/issues) before trusting it.

_Last updated: 2026-11-20 (Issue #353 merge closeout; main SHA `0616f0b`, Vercel production READY; documentation checkpoint branch `docs/353-merged-case-library-status`)._

## Product context

- Typical class: about **22 Students** in about **5 teams**. Individual (one workspace per Student) work must remain a first-class option.
- The repository is **public again** (2026-11-19) so CodeQL and Dependency Review can run while the audit work merges; the owner plans to make it private later with proper access. While public, the authored Case Study source in `templates/*.json` is readable on GitHub.
- Pre-production: no external production users; breaking cleanup is allowed when documented.

## Current phase

The secure Classroom foundation (#288–#296), live-class management (#312), staged-simulation engine (#313), universal targets (#318), debrief comparison (#319), join/mobile polish (#320), compatibility reset (#328), Administration/Maintenance (#329), and the startup hub (#330) are **merged and published**.

The **repository audit follow-through** merged via PR #344 (`41f002e`), followed by Dependabot #337, #338, #339, #311, #309:

- done: documentation consolidation (this file, playbooks, verbatim archive, drift guards); EULA data-usage wording; versioned advisory-locked schema; retry-safe repository init; real-Postgres (PGlite) tests; class-creation password; rate limits;
- **fixed production bugs found by the real-SQL tests**: Instructor team assignment and Student "Mark Ready" both failed in Postgres because of untyped SQL parameters (they had only ever run against in-memory fakes);
- next: final Case Library `main` deployment verified READY at `0616f0b`; real multi-device classroom smoke (#340) still required. Instructor controls #352, assignment #357 and protected asset engine #358 are merged. Load-reduction PR #359 also merged as `62cd9da`.

## Temporary product decisions

- **Case Studies are back in Work independently** (approved 2026-11-19, until the classroom experiences fully replace self-study). Microcomputer Cabinets, Paytrix, Mrs Walthers Sugar Donuts, Tamworth Petrochemical, and Red Sweat Mystery are published in the public manifest and applied behind the per-minute mode password, as before #299. They are downloadable from the deployed site. Switch: `scripts/standalone-public-case-studies.mjs`; removal steps in `templates/AGENTS.md`.

## KT official-case authoring workflow (#350)

- Done: PR #351 merged (`1075ba8`) and #350 closed. Standing guidance: `docs/case-study-authoring.md` and `docs/playbooks/author-kt-case-study.md`. Companion KT-repository PR #564 state is not tracked here. The in-progress status notes are archived in `docs/archive/kt-case-authoring-350-status-2026-11-19.md`.

## Case Library program (Issue #353)

**Delivery state (verified 2026-11-20):** Reader-first navigation, five original accessible diagrams, and two additional protected source-grounded Full PA cases have been **merged into Intake main and auto-deployed**. The current production deployment [`dpl_HLmo2H3LzgzLXjGx4udySugEZde9`](https://vercel.com/majorincidents-projects/intake) reports **READY** for exact GitHub `main` SHA `0616f0bfcb60131c6f3c904c461507467b35d65b`; runtime role-by-role manual smoke is still outstanding.

| Delivery | Merged PR | Squash commit | Acceptance |
| --- | --- | --- | --- |
| Dedicated Cases menu, PSDM/ATS/Legacy/MIM groups, participant-reading-first flow | [#354](https://github.com/MajorIncident/Intake/pull/354) | `a5d7e14` | CI, browser, CodeQL, dependency and manifests passed |
| Five source-grounded inline semantic diagrams | [#360](https://github.com/MajorIncident/Intake/pull/360) | `ba2fca6` | CI/browser passed after retrying an 8-minute Ubuntu font-install timeout |
| Distributor Complaints participant reading + complete protected official PA reference | [#361](https://github.com/MajorIncident/Intake/pull/361) | `8ea8341` | CI/browser passed, MPC not claimed as confirmed historical True Cause |
| Precision Problems participant reading + complete protected official PA reference | [#362](https://github.com/MajorIncident/Intake/pull/362) | `0616f0b` | CI/browser passed, official original receipt-table rows still missing from adapted reader |

- **Current inventory:** `docs/case-library-inventory.md` tracks **50 official distinct PA case/exercise families plus 1 Intake-native MIM** case. **Seven** Case Studies now have authored Full source records; five older cases are on the *temporary public Standalone allowlist*, while Distributor Complaints and Precision Problems are available only through the **authorized Classroom server catalog**. Consequently **44** official source families remain unauthored. Four older non-Red-Sweat saved solutions remain to be source-audited in [#348](https://github.com/MajorIncident/Intake/issues/348).
- **Reader content:** participant case appears first in the interface, separate from the completed Full reference. Square Donuts retains its later participant `The Problem` as a self-study disclosure. Source-grounded original flow diagrams exist for **Microcomputer Cabinets, Tamworth, Square Donuts, Red Sweat and Paytrix**; the original KT scanned figures/pages are not reproduced.
- **Privacy/provenance:** Classroom Student GET receives only learner-safe metadata, not Full `state`; staged exercises still rely on existing server-authorized release. The repository is currently **public**, so source JSON stored in `templates/*.json` is readable on GitHub despite server-only runtime delivery. Do not treat a password or hidden UI as copyright or data-access protection. No new original KT PDFs or licensed exhibits were published. Paytrix's non-canonical MIM provenance is documented in the KT repository via merged [#575](https://github.com/MajorIncident/kt-application-coach/pull/575) (`f722da1`); official PSDM/ATS registry and Skill rules unchanged.
- **Next Case Library work:** licensed protected original exhibits/participant source pages [#355](https://github.com/MajorIncident/Intake/issues/355), remaining PSDM/ATS/Legacy Full cases [#356](https://github.com/MajorIncident/Intake/issues/356) and wider #353 backlog, **Questioner/Information Source** per-participant authorization and request-gated figures [#363](https://github.com/MajorIncident/Intake/issues/363) before Data Debacle/Typhoon classroom content, plus real multi-device pilot [#340](https://github.com/MajorIncident/Intake/issues/340). Precision Problems' original brass-receipt table is still not rendered and must be obtained/verified from the authorized source; do not invent lots.
- **Audit and evidence:** [Issue #353 merged checkpoint](https://github.com/MajorIncident/Intake/issues/353#issuecomment-7035451798); historical per-tranche notes are preserved verbatim at [case-library-delivery-checkpoints-2026-11-20.md](docs/archive/case-library-delivery-checkpoints-2026-11-20.md). Green CI and a READY Vercel build are not a successful live Classroom role-by-role walkthrough.

## Pilot blockers (Student / Instructor modes for a real class)

Worked one at a time, in order:

1. **Environment** (human action, #340): Vercel Production needs `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) and a valid 43-character `INTAKE_ADMIN_TOKEN`; then a real multi-device smoke test (see `docs/playbooks/release-and-verify.md`).
2. ~~**Instructor "Leave class" orphans the class** (#341)~~ — **done (#344)**: Leave asks for confirmation and explains the class keeps running; new **End class** confirms, revokes the class server-side for everyone, then clears the device.
3. ~~**Instructor class controls** (#342)~~ — **done (PR #352, `9d7a200`)**: pause/allow joins, rename and guarded remove of teams, "Give each waiting Student their own workspace", one-time device-transfer code. Remaining: smoke-test steps 8a–8c after deploy.
4. ~~**Instructor Case Study assignment** (#343)~~ — **done (PR #357, `9873458`)**: **Case Study for workspaces** loads a protected Case Study into all or one workspace (server-projected collaboration revision, no Student password), never replacing Student work without confirmation; live mode password shown. Classroom schema v3. Remaining: smoke-test step 8d after deploy.
5. **Staged exercises not yet author-ready in production** — no approved authored Case Study has a `simulation`; protected asset engine #316 is merged but content, release/stage rights and #317 remain.
   - ~~#316~~ **done (PR #358, `ac2f689`)**: server-only asset registry (`templates/assets/` → `api/_protected-assets.manifest.js`), Student/Instructor asset routes authorized by the current staged release, semantic tables and protected images/document pages in the Student case reference. Contract: `docs/classroom-protected-assets.md`. The production registry is empty until #317.
   - #317 still needs product-owner-approved stage boundaries, official evidence pages/images, distribution rights and a tested simulation; the KT source repository and active Skill have been consulted, but this does not authorize shipping the original materials.
6. **Load/pilot readiness** — **merged via PR #359 (`62cd9da`)**: an idle connected Student now makes **1.10 requests/s (measured; was 2.80)** via an adaptive collaboration poll (0.9 s only while someone in the workspace is active, else 3 s), 5 s presence, and 5 s Student status/coaching/exercise polls (10 s with no exercise). A 22-Student class drops from ≈ 680,000 to ≈ 270,000–490,000 invocations per 3-hour session. `tests/e2e/load-budget.spec.mjs` guards the budget. Remaining human decision: Vercel plan (see Pending human actions).

## Open issues (verified 2026-11-20)

| Issue | State | Next requirement |
| --- | --- | --- |
| #317 First production staged KT Case Study | Open | Author/approve stage-specific evidence and media, then test real Classroom release |
| #340 Classroom production environment and multi-device smoke | Open | Human configuration and role-by-role live acceptance |
| #348 Existing saved Case Study Full-source audits | Open | Reconcile older exemplars against official case guidance |
| #353 Case Library program | Open | Continue the remaining official cases, participant media and case governance |
| #355 Protected licensed figures and participant document sections | Open | Approve/distribute original exhibits and stage-appropriate viewing |
| #356 First official PSDM case batch | Open | Distributor/Precision merged; Data Debacle and Typhoon pending Q/IS handling |
| #363 Questioner/Information Source role-safe reading | Open | Per-participant access and request-gated exhibits |

## Open pull requests (verified 2026-11-20)

| PR | State |
| --- | --- |
| #280 jsdom 30 major upgrade | Open Dependabot; grouped tooling review required |
| #281 eslint 10 major upgrade | Open Dependabot; grouped tooling review required |
| #310 eslint-plugin-jsdoc 65 major upgrade | Open Dependabot; grouped tooling review required |

Case Library PRs **#354, #360, #361, #362** are merged, not open. Load reduction **#359** was previously merged, and old superseded asset draft **#336** is closed unmerged. No additional Case Library merge is awaiting approval in this checkpoint.

## Pending human / environment actions

- **Before making the repo private again:** decide how CodeQL and Dependency Review will run. On a private repo without GitHub Code Security they fail with "not supported … GitHub Advanced Security" and block every merge (observed 2026-11-18). Options: enable GitHub Code Security, or remove those two from the `main` required checks and replace them with free equivalents (e.g. `npm audit --omit=dev --audit-level=high` in CI).

- **Vercel plan for real classes (blocker 6):** Hobby allows 1,000,000 invocations and 4 h Active CPU per month with Fluid compute (only 100,000 invocations without it) — roughly two to three 3-hour classes, and non-commercial only. Confirm Fluid compute is enabled, decide on a paid plan for regular classes, and run the 15-minute ≥ 5-device rehearsal in `docs/operations-capacity.md` to calibrate Active CPU.
- Configure Vercel env vars listed under blocker 1. Optional: `INTAKE_CLASS_CREATION_PASSWORD` (default `kepnertregoe`).
- GitHub "Automatically delete head branches" is enabled; prune stale `codex/*` branches only after checking none have open PRs.
- Create a GitHub milestone "Classroom pilot" (no API tool available to the agent).

## Known risks / watch items

- Browser E2E runs against a hand-written fixture server (`scripts/serve-browser-tests.mjs`), not the real `api/` handlers. Real-SQL coverage now lives in `tests/*.pglite.test.mjs`; extend it with every SQL change.
- **Lint is not actually enforced**: `npm run lint` runs `eslint` with no paths, which on ESLint 8 lints nothing. Linting the repo for real reports ~1,040 errors (957 missing-JSDoc). Fix together with the ESLint 10 / flat-config migration (#281) rather than piecemeal.
- Dev-only `npm audit` findings (ajv, flatted, minimatch via ESLint 8; source-map-js fixed by #311). Production dependencies: 0 vulnerabilities.
- Collaboration links grant equal edit access with no admin role; Classroom authorization layers over them.
- Polling load: about 1.1 requests/second per idle connected Student, ≈ 2 while their team is active — see `docs/operations-capacity.md`.
- Class creation is gated by a shared password, not accounts/SSO.

## Where history lives

- Classroom checkpoint ledger (#288–#330): `docs/archive/classroom-workstream-ledger.md`
- #312 / #313 / #318 / #319 tranche records: `docs/archive/`
- Program roadmap and dependency order: `docs/classroom-roadmap.md`
