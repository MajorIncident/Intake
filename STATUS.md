# Repository Status

This is the **single live status document** for KT Intake. Other docs describe contracts and architecture; only this file states what is current, active, blocked, or next. A repository guard (`npm run repo:doctor`) rejects "active slice" / "pending merge" style status claims anywhere else outside `docs/archive/`.

Update it at every durable checkpoint and before handoff — see [`docs/playbooks/status-update.md`](docs/playbooks/status-update.md). Always re-verify against GitHub (main HEAD, open PRs/issues) before trusting it.

_Last updated: 2026-11-20 (pilot blocker 6 in draft PR #359, branch `claude/intake-repo-audit-qii780`, based on `main` at `ac2f689`)._

## Product context

- Typical class: about **22 Students** in about **5 teams**. Individual (one workspace per Student) work must remain a first-class option.
- The repository is **public again** (2026-11-19) so CodeQL and Dependency Review can run while the audit work merges; the owner plans to make it private later with proper access. While public, the authored Case Study source in `templates/*.json` is readable on GitHub.
- Pre-production: no external production users; breaking cleanup is allowed when documented.

## Current phase

The secure Classroom foundation (#288–#296), live-class management (#312), staged-simulation engine (#313), universal targets (#318), debrief comparison (#319), join/mobile polish (#320), compatibility reset (#328), Administration/Maintenance (#329), and the startup hub (#330) are **merged and published**.

The **repository audit follow-through** merged via PR #344 (`41f002e`), followed by Dependabot #337, #338, #339, #311, #309:

- done: documentation consolidation (this file, playbooks, verbatim archive, drift guards); EULA data-usage wording; versioned advisory-locked schema; retry-safe repository init; real-Postgres (PGlite) tests; class-creation password; rate limits;
- **fixed production bugs found by the real-SQL tests**: Instructor team assignment and Student "Mark Ready" both failed in Postgres because of untyped SQL parameters (they had only ever run against in-memory fakes);
- next: confirm the `main` deployment is READY and run the real-class smoke test (#340); #342 merged (PR #352, `9d7a200`); #343 merged (PR #357, `9873458`); #316 merged (PR #358, `ac2f689`); blocker 6 load reduction is in draft PR #359.

## Temporary product decisions

- **Case Studies are back in Work independently** (approved 2026-11-19, until the classroom experiences fully replace self-study). Microcomputer Cabinets, Paytrix, Mrs Walthers Sugar Donuts, Tamworth Petrochemical, and Red Sweat Mystery are published in the public manifest and applied behind the per-minute mode password, as before #299. They are downloadable from the deployed site. Switch: `scripts/standalone-public-case-studies.mjs`; removal steps in `templates/AGENTS.md`.

## KT official-case authoring workflow (#350)

- Done: PR #351 merged (`1075ba8`) and #350 closed. Standing guidance: `docs/case-study-authoring.md` and `docs/playbooks/author-kt-case-study.md`. Companion KT-repository PR #564 state is not tracked here. The in-progress status notes are archived in `docs/archive/kt-case-authoring-350-status-2026-11-19.md`.

## Pilot blockers (Student / Instructor modes for a real class)

Worked one at a time, in order:

1. **Environment** (human action, #340): Vercel Production needs `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) and a valid 43-character `INTAKE_ADMIN_TOKEN`; then a real multi-device smoke test (see `docs/playbooks/release-and-verify.md`).
2. ~~**Instructor "Leave class" orphans the class** (#341)~~ — **done (#344)**: Leave asks for confirmation and explains the class keeps running; new **End class** confirms, revokes the class server-side for everyone, then clears the device.
3. ~~**Instructor class controls** (#342)~~ — **done (PR #352, `9d7a200`)**: pause/allow joins, rename and guarded remove of teams, "Give each waiting Student their own workspace", one-time device-transfer code. Remaining: smoke-test steps 8a–8c after deploy.
4. ~~**Instructor Case Study assignment** (#343)~~ — **done (PR #357, `9873458`)**: **Case Study for workspaces** loads a protected Case Study into all or one workspace (server-projected collaboration revision, no Student password), never replacing Student work without confirmation; live mode password shown. Classroom schema v3. Remaining: smoke-test step 8d after deploy.
5. **Staged exercises unusable in production** — no authored Case Study has a `simulation`; requires #316 then #317.
   - ~~#316~~ **done (PR #358, `ac2f689`)**: server-only asset registry (`templates/assets/` → `api/_protected-assets.manifest.js`), Student/Instructor asset routes authorized by the current staged release, semantic tables and protected images/document pages in the Student case reference. Contract: `docs/classroom-protected-assets.md`. The production registry is empty until #317.
   - #317 is blocked on the product owner: it needs reviewed official source material (stage boundaries, evidence pages/images) from the KT source repository and the installed KT Application Coach Skill, neither of which this agent session has.
6. **Load/pilot readiness** — **in draft PR #359**: an idle connected Student now makes **1.10 requests/s (measured; was 2.80)** via an adaptive collaboration poll (0.9 s only while someone in the workspace is active, else 3 s), 5 s presence, and 5 s Student status/coaching/exercise polls (10 s with no exercise). A 22-Student class drops from ≈ 680,000 to ≈ 270,000–490,000 invocations per 3-hour session. `tests/e2e/load-budget.spec.mjs` guards the budget. Remaining human decision: Vercel plan (see Pending human actions).

## Open issues

| Issue | Status | Notes |
| --- | --- | --- |
| #317 First production staged KT Case Study | Open, blocked by #316 | Needs authoritative source material |
| #340 Pilot blocker 1: environment + real smoke test | Open | Human action |
| #348 Existing Case Study completeness audit | Open | Follow-up quality backlog; apply new KT authoring playbook before case changes |

## Open pull requests

| PR | Status |
| --- | --- |
| #359 Pilot blocker 6 load reduction | Draft; local quality 463 tests + browser 31 passed / 13 intentional skips |
| #336 Add protected staged asset delivery | Draft, superseded by merged PR #358 (its contract is `docs/classroom-protected-assets.md` on `main`). Owner may close it. |
| #281 eslint 10, #280 jsdom 30, #310 eslint-plugin-jsdoc 65 | Major bumps — do together in one tooling PR (see lint risk below) |

## Pending human / environment actions

- **Before making the repo private again:** decide how CodeQL and Dependency Review will run. On a private repo without GitHub Code Security they fail with "not supported … GitHub Advanced Security" and block every merge (observed 2026-11-18). Options: enable GitHub Code Security, or remove those two from the `main` required checks and replace them with free equivalents (e.g. `npm audit --omit=dev --audit-level=high` in CI).

- **Vercel plan for real classes (blocker 6):** Hobby allows 1,000,000 invocations and 4 h Active CPU per month with Fluid compute (only 100,000 invocations without it) — roughly two to three 3-hour classes, and non-commercial only. Confirm Fluid compute is enabled, decide on a paid plan for regular classes, and run the 15-minute ≥ 5-device rehearsal in `docs/operations-capacity.md` to calibrate Active CPU.
- Configure Vercel env vars listed under blocker 1. Optional: `INTAKE_CLASS_CREATION_PASSWORD` (default `kepnertregoe`).
- Enable GitHub "Automatically delete head branches" and prune the ~100 stale `codex/*` branches (verify each has no open PR first).
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
