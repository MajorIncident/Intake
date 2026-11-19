# Repository Status

This is the **single live status document** for KT Intake. Other docs describe contracts and architecture; only this file states what is current, active, blocked, or next. A repository guard (`npm run repo:doctor`) rejects "active slice" / "pending merge" style status claims anywhere else outside `docs/archive/`.

Update it at every durable checkpoint and before handoff — see [`docs/playbooks/status-update.md`](docs/playbooks/status-update.md). Always re-verify against GitHub (main HEAD, open PRs/issues) before trusting it.

_Last updated: 2026-11-18 (audit/hardening branch `claude/intake-repo-audit-qii780`, based on `main` at `cf4febb`)._

## Product context

- Typical class: about **22 Students** in about **5 teams**. Individual (one workspace per Student) work must remain a first-class option.
- The repository is **private** (changed 2026-11-18). Protected Case Study source is therefore no longer published on GitHub; the deployed-site boundary (`dist/` allowlist, server-only manifest) still applies.
- Pre-production: no external production users; breaking cleanup is allowed when documented.

## Current phase

The secure Classroom foundation (#288–#296), live-class management (#312), staged-simulation engine (#313), universal targets (#318), debrief comparison (#319), join/mobile polish (#320), compatibility reset (#328), Administration/Maintenance (#329), and the startup hub (#330) are **merged and published**.

Active work: **repository audit follow-through** on `claude/intake-repo-audit-qii780` (not yet merged to `main`):

- done: documentation consolidation (this file, playbooks, verbatim archive, drift guards); EULA data-usage wording; versioned advisory-locked schema; retry-safe repository init; real-Postgres (PGlite) tests; class-creation password; rate limits;
- **fixed production bugs found by the real-SQL tests**: Instructor team assignment and Student "Mark Ready" both failed in Postgres because of untyped SQL parameters (they had only ever run against in-memory fakes);
- next: Classroom pilot blockers below, one at a time.

## Temporary product decisions

- **Case Studies are back in Work independently** (approved 2026-11-19, until the classroom experiences fully replace self-study). Microcomputer Cabinets, Paytrix, Mrs Walthers Sugar Donuts, and Tamworth Petrochemical are published in the public manifest and applied behind the per-minute mode password, as before #299. They are downloadable from the deployed site. Switch: `scripts/standalone-public-case-studies.mjs`; removal steps in `templates/AGENTS.md`.

## Pilot blockers (Student / Instructor modes for a real class)

Worked one at a time, in order:

1. **Environment** (human action, #340): Vercel Production needs `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) and a valid 43-character `INTAKE_ADMIN_TOKEN`; then a real multi-device smoke test (see `docs/playbooks/release-and-verify.md`).
2. ~~**Instructor "Leave class" orphans the class** (#341)~~ — **fixed on this branch**: Leave asks for confirmation and explains the class keeps running; new **End class** confirms, revokes the class server-side for everyone, then clears the device. Closes when merged.
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
| #341 Pilot blocker 2: Leave class orphans the class | Fixed on branch | Closes on merge |
| #342 Pilot blocker 3: Instructor class controls | Open, next code blocker | Includes one-workspace-per-Student |
| #343 Pilot blocker 4: Instructor Case Study assignment | Open | |

## Open pull requests

| PR | Status |
| --- | --- |
| #336 Add protected staged asset delivery | Draft; was stacked on #335 (merged) — retarget/refresh against `main` before continuing |
| #337 / #309 / #311 Dependabot minor updates | #337 auto-merges when CI passes; #309 and #311 then need "Update branch" + merge one at a time (main requires up-to-date branches) |
| #281 eslint 10, #280 jsdom 30, #310 eslint-plugin-jsdoc 65 | Major bumps — do together in one tooling PR (see lint risk below) |

## Pending human / environment actions

- **Merges to `main` are blocked (since the repo became private, 2026-11-18):** CodeQL and Dependency Review now fail with "not supported on this repository … GitHub Advanced Security" and appear to be required checks. Decide one of: enable GitHub Code Security / Advanced Security for the private repo; or remove those two from the `main` ruleset and replace them with free equivalents (e.g. `npm audit --omit=dev --audit-level=high` in CI). Until then #309/#311/#337 and this branch cannot merge.

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
