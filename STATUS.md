# Repository Status

This is the **single live status document** for KT Intake. Other docs describe contracts and architecture; only this file states what is current, active, blocked, or next. A repository guard (`npm run repo:doctor`) rejects "active slice" / "pending merge" style status claims anywhere else outside `docs/archive/`.

Update it at every durable checkpoint and before handoff — see [`docs/playbooks/status-update.md`](docs/playbooks/status-update.md). Always re-verify against GitHub (main HEAD, open PRs/issues) before trusting it.

_Last updated: 2026-11-19 (Issue #350 / PR #351 documentation branch `docs/350-kt-case-authoring-playbook`, based on `main` at `ce3dd06`)._

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

## KT official-case authoring workflow (Issue #350 / PR #351)

- **Accepted source precedent:** Red Sweat Mystery official-solution correction [#349](https://github.com/MajorIncident/Intake/pull/349) is **merged** at `ce3dd06` on `main` (2026-11-19); its exact production deployment state has not been rechecked in this documentation slice. The earlier #346/#347 content mistakes are retained as anti-patterns.
- **Current documentation work:** [Issue #350](https://github.com/MajorIncident/Intake/issues/350), [PR #351](https://github.com/MajorIncident/Intake/pull/351), branch `docs/350-kt-case-authoring-playbook` based on `main` `ce3dd06`. New `docs/case-study-authoring.md` and `docs/playbooks/author-kt-case-study.md`; discovery links in root/template `AGENTS.md`, playbook index and README.
- **Companion KT-repository work:** [KT issue #563](https://github.com/MajorIncident/kt-application-coach/issues/563), [KT PR #564](https://github.com/MajorIncident/kt-application-coach/pull/564). They document invoking/installing the canonical Skill and the official case-source side; Intake owns JSON field mapping and CI.
- **Product-owner authoring decisions codified:** official KT case answer first; use the installed Skill or request installation, fetch case authority/participant/instructor evidence, map current/future/deadline Impact correctly, keep symptom onset in KT WHEN, write factual paired IS/IS NOT/D&C, test mechanisms and confirm the True Cause. **Full = final solution.** Use the complete MIM state surface where relevant but do not fabricate operations, DA/PPA, task registers or repeated provenance caveats. Classroom already owns stage release; public Standalone full-answer rights remain separately governed.
- **Scope:** docs only; no authored Case Study payload, generated manifest, server, database, skill source or release changes. Documentation and path checks committed; canonical `npm run quality` + `npm run test:browser` and PR policy checks must be verified on exact head in GitHub CI. Do not claim production acceptance or a new Skill release from these PRs.
- **Next:** verify exact-head CI and repo-hygiene guards for Intake #351 and KT #564; reconcile any doc links/check failures; obtain owner approval/merge decisions, update status at merge, and leave both docs as the cold-start route for future official KT case requests.

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
| #350 KT-to-Intake case-writing playbook | Open | Documentation PR #351; companion KT repo #563 / #564 |

## Open pull requests

| PR | Status |
| --- | --- |
| #351 Official KT-to-Intake Case Study authoring documentation | Open; docs-only branch, exact-head CI/owner review required |
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
