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

Active work: **repository audit follow-through** on `claude/intake-repo-audit-qii780` — documentation consolidation, EULA accuracy, server hardening, real-database tests, then the Classroom pilot blockers below.

## Pilot blockers (Student / Instructor modes for a real class)

Worked one at a time, in order:

1. **Environment** (human action): Vercel Production needs `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) and a valid 43-character `INTAKE_ADMIN_TOKEN`; then a real multi-device smoke test (see `docs/playbooks/release-and-verify.md`).
2. **Instructor "Leave class" orphans the class** — no confirmation and no End class; the only Instructor credential is discarded.
3. **Instructor controls the API already supports but the UI does not expose** — joins on/off, end class, rename/delete teams, cross-device handoff, and "one workspace per Student" bulk setup.
4. **No Instructor-side Case Study assignment** — teams start empty; Students apply Case Studies themselves using a per-minute password the Instructor UI never shows.
5. **Staged exercises unusable in production** — no authored Case Study has a `simulation`; requires #316 then #317.
6. **Load/pilot readiness** — capacity check per `docs/operations-capacity.md`.

## Open issues

| Issue | Status | Notes |
| --- | --- | --- |
| #316 Protected staged assets + rich Student rendering | Open, next Classroom feature after pilot blockers 2–4 | Draft PR #336 holds only a contract document (classroom-protected-assets.md on that branch) |
| #317 First production staged KT Case Study | Open, blocked by #316 | Needs authoritative source material |

## Open pull requests

| PR | Status |
| --- | --- |
| #336 Add protected staged asset delivery | Draft; was stacked on #335 (merged) — retarget/refresh against `main` before continuing |
| #337 / #309 / #311 Dependabot minor updates | Being merged one at a time (each needs an up-to-date branch) |
| #281 eslint 10, #280 jsdom 30, #310 eslint-plugin-jsdoc 65 | Major bumps — do together in one tooling PR |

## Pending human / environment actions

- Configure Vercel env vars listed under blocker 1. Optional: `INTAKE_CLASS_CREATION_PASSWORD` (defaults to the documented classroom password).
- Enable GitHub "Automatically delete head branches" and prune the ~100 stale `codex/*` branches (verify each has no open PR first).
- Create a GitHub milestone "Classroom pilot" (no API tool available to the agent).

## Known risks / watch items

- Browser E2E runs against a hand-written fixture server (`scripts/serve-browser-tests.mjs`), not the real `api/` handlers; real-SQL coverage is being added under `tests/*.pglite.test.mjs`.
- Collaboration links grant equal edit access with no admin role; Classroom authorization layers over them.
- Polling load: roughly 2.8 requests/second per connected Student — see `docs/operations-capacity.md`.
- Class creation is gated by a shared password, not accounts/SSO.

## Where history lives

- Classroom checkpoint ledger (#288–#330): `docs/archive/classroom-workstream-ledger.md`
- #312 / #313 / #318 / #319 tranche records: `docs/archive/`
- Program roadmap and dependency order: `docs/classroom-roadmap.md`
