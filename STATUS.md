# Repository Status

This is the **single live status document** for KT Intake. Other docs describe contracts and architecture; only this file states what is current, active, blocked, or next. A repository guard (`npm run repo:doctor`) rejects "active slice" / "pending merge" style status claims anywhere else outside `docs/archive/`.

Update it at every durable checkpoint and before handoff — see [`docs/playbooks/status-update.md`](docs/playbooks/status-update.md). Always re-verify against GitHub (main HEAD, open PRs/issues) before trusting it.

_Last updated: 2026-11-19 (Issue #353 / PR #354 first Case Library tranche; branch `feature/353-case-library-navigation-and-reader`, current tests pending)._

## Product context

- Typical class: about **22 Students** in about **5 teams**. Individual (one workspace per Student) work must remain a first-class option.
- The repository is **public again** (2026-11-19) so CodeQL and Dependency Review can run while the audit work merges; the owner plans to make it private later with proper access. While public, the authored Case Study source in `templates/*.json` is readable on GitHub.
- Pre-production: no external production users; breaking cleanup is allowed when documented.

## Current phase

The secure Classroom foundation (#288–#296), live-class management (#312), staged-simulation engine (#313), universal targets (#318), debrief comparison (#319), join/mobile polish (#320), compatibility reset (#328), Administration/Maintenance (#329), and the startup hub (#330) are **merged and published**.

The **repository audit follow-through** merged via PR #344 (`41f002e`), followed by Dependabot #337, #338, #339, #311, #309:

- done: documentation consolidation (this file, playbooks, verbatim archive, drift guards); EULA data-usage wording; versioned advisory-locked schema; retry-safe repository init; real-Postgres (PGlite) tests; class-creation password; rate limits;
- **fixed production bugs found by the real-SQL tests**: Instructor team assignment and Student "Mark Ready" both failed in Postgres because of untyped SQL parameters (they had only ever run against in-memory fakes);
- next: confirm the `main` deployment is READY, run the real-class smoke test (#340), then Classroom pilot blocker #342.

## Temporary product decisions

- **Case Studies are back in Work independently** (approved 2026-11-19, until the classroom experiences fully replace self-study). Microcomputer Cabinets, Paytrix, Mrs Walthers Sugar Donuts, Tamworth Petrochemical, and Red Sweat Mystery are published in the public manifest and applied behind the per-minute mode password, as before #299. They are downloadable from the deployed site. Switch: `scripts/standalone-public-case-studies.mjs`; removal steps in `templates/AGENTS.md`.

## Case Library program (Issue #353 / PR #354)

- **Master tracker:** [Issue #353](https://github.com/MajorIncident/Intake/issues/353). First implementation PR: [#354](https://github.com/MajorIncident/Intake/pull/354), branch `feature/353-case-library-navigation-and-reader`, based on `main` `1075ba8`. Separate open [PR #352](https://github.com/MajorIncident/Intake/pull/352) addresses Instructor class controls; avoid changing its areas without reviewing the diff.
- **Committed tranche 1:** dedicated **Cases** menu opening a source-grouped, searchable in-app Case Library within the authorized Templates drawer; PSDM/ATS/Legacy/MIM filters and a readable inline participant briefing. Five existing cases now carry `libraryGroup` and text-only `participantCase`: Red Sweat, Microcomputer Cabinets and Tamworth (PSDM), Mrs. Walther's Square Donuts (ATS), Paytrix (MIM). Square Donuts text is factory orientation only, not its later staged problem reveal.
- **Inventory:** `docs/case-library-inventory.md` lists 50 distinct official PA case/exercise families (10 PSDM, 4 extra ATS, 20 legacy loose, 16 New Rational Manager PA/human-performance under Legacy) plus 1 MIM native. Only the five existing Intake cases appear in the interface; **46** official KT cases remain unauthored and four existing non-Red-Sweat solutions still need complete official-source audits. Do not label inventory entries complete or publicly accessible.
- **Security:** authorized Classroom GET metadata includes only source group and learner-safe `participantCase` text, **never Full `state`**; staged cases omit `participantCase` and continue to use existing server-released stage content. Standalone sees only temporary allowlisted public cases, which already expose their Full answer in the public bundle. New inline preview renderer uses `textContent`, has no remote embeds/images, and does not persist into `kt-intake-full-v2`. Original KT figures/pages require explicit publication rights plus protected media support in [#316](https://github.com/MajorIncident/Intake/issues/316) / draft [#336](https://github.com/MajorIncident/Intake/pull/336) before adding.
- **Testing and evidence:** source JSON + both manifests regenerated and committed, targeted API/DOM/regression assertions added. First exact-head GitHub `tests` CI failed on `verify:summary` because the new search input lacked explicit local-only metadata; corrected by adding `data-persistence="local-only" data-summary="exclude"` on the input. **CI on the current head is pending**; no production deploy/manual live browser acceptance is claimed. Run `npm run quality`, `npm run test:browser`, `npm run verify:protected-cases`; check exact-head gates and correct further failures.
- **Scope and next tranche:** PR #354 is the navigation/participant-text foundation **not the 50 completed cases or imagery**. Subtasks now tracked as [#355](https://github.com/MajorIncident/Intake/issues/355) (protected inline imagery and source reading) and [#356](https://github.com/MajorIncident/Intake/issues/356) (first official PSDM case-writing batch). After green tests and reviewed merge, pursue protected rich in-page media/authorization (T2) and small official-source case-writing batches (T3+). Use [Case Study authoring contract](docs/case-study-authoring.md) and KT Skill first. Preserve Classroom stage release, code/media rights and one complete Full source per case.
- **Cold restart:** refresh issue #353, PR #354 current head/checks and this file. Continue with docs/anchor, manifest/gate verification, UI smoke, update the PR and master issue. Explicit user merge decision required; no silent production rollout.

## Pilot blockers (Student / Instructor modes for a real class)

Worked one at a time, in order:

1. **Environment** (human action, #340): Vercel Production needs `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) and a valid 43-character `INTAKE_ADMIN_TOKEN`; then a real multi-device smoke test (see `docs/playbooks/release-and-verify.md`).
2. ~~**Instructor "Leave class" orphans the class** (#341)~~ — **done (#344)**: Leave asks for confirmation and explains the class keeps running; new **End class** confirms, revokes the class server-side for everyone, then clears the device.
3. **Instructor controls the API already supports but the UI does not expose** (#342) — joins on/off, end class, rename/delete teams, cross-device handoff, and "one workspace per Student" bulk setup.
4. **No Instructor-side Case Study assignment** (#343) — teams start empty; Students apply Case Studies themselves using a per-minute password the Instructor UI never shows.
5. **Staged exercises unusable in production** — no authored Case Study has a `simulation`; requires #316 then #317.
6. **Load/pilot readiness** — capacity check per `docs/operations-capacity.md`.

## Open issues

| Issue | Status | Notes |
| --- | --- | --- |
| #316 Protected staged assets + rich Student rendering | Open, next Classroom feature after pilot blockers 2–4 | Draft PR #336 holds only a contract document (classroom-protected-assets.md on that branch) |
| #317 First production staged KT Case Study | Open, blocked by #316 | Needs authoritative source material |
| #340 Pilot blocker 1: environment + real smoke test | Open | Human action |
| #342 Pilot blocker 3: Instructor class controls | Open, next code blocker | Includes one-workspace-per-Student |
| #343 Pilot blocker 4: Instructor Case Study assignment | Open | |
| #348 Existing Case Study completeness audit | Open | Follow-up quality backlog; apply new KT authoring playbook before case changes |
| #353 Case Library program | Open | PR #354 T1 navigation/inline reader; T2 media and T3+ case batches remain |

## Open pull requests

| PR | Status |
| --- | --- |
| #354 Case Library navigation and participant reader | Open; first tranche; exact-head CI/browser acceptance pending |
| #352 Instructor class controls | Open; parallel branch, review before overlapping UI changes |
| #336 Add protected staged asset delivery | Draft; was stacked on #335 (merged) — retarget/refresh against `main` before continuing |
| #281 eslint 10, #280 jsdom 30, #310 eslint-plugin-jsdoc 65 | Major bumps — do together in one tooling PR (see lint risk below) |

## Pending human / environment actions

- **Before making the repo private again:** decide how CodeQL and Dependency Review will run. On a private repo without GitHub Code Security they fail with "not supported … GitHub Advanced Security" and block every merge (observed 2026-11-18). Options: enable GitHub Code Security, or remove those two from the `main` required checks and replace them with free equivalents (e.g. `npm audit --omit=dev --audit-level=high` in CI).

- Configure Vercel env vars listed under blocker 1. Optional: `INTAKE_CLASS_CREATION_PASSWORD` (default `kepnertregoe`).
- Enable GitHub "Automatically delete head branches" and prune the ~100 stale `codex/*` branches (verify each has no open PR first).
- Create a GitHub milestone "Classroom pilot" (no API tool available to the agent).

## Known risks / watch items

- Browser E2E runs against a hand-written fixture server (`scripts/serve-browser-tests.mjs`), not the real `api/` handlers. Real-SQL coverage now lives in `tests/*.pglite.test.mjs`; extend it with every SQL change.
- **Lint is not actually enforced**: `npm run lint` runs `eslint` with no paths, which on ESLint 8 lints nothing. Linting the repo for real reports ~1,040 errors (957 missing-JSDoc). Fix together with the ESLint 10 / flat-config migration (#281) rather than piecemeal.
- Dev-only `npm audit` findings (ajv, flatted, minimatch via ESLint 8; source-map-js fixed by #311). Production dependencies: 0 vulnerabilities.
- Collaboration links grant equal edit access with no admin role; Classroom authorization layers over them.
- Polling load: roughly 2.8 requests/second per connected Student — see `docs/operations-capacity.md`.
- Class creation is gated by a shared password, not accounts/SSO.

## Where history lives

- Classroom checkpoint ledger (#288–#330): `docs/archive/classroom-workstream-ledger.md`
- #312 / #313 / #318 / #319 tranche records: `docs/archive/`
- Program roadmap and dependency order: `docs/classroom-roadmap.md`
