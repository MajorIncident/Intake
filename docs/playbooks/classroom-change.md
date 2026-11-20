# Changing Classroom behaviour (Student / Instructor / class / coaching / Case Studies)

## Read map — only what your change touches

| Area | Contract to read | Main code |
| --- | --- | --- |
| Any Classroom change | `docs/classroom-architecture.md` (invariants), `src/AGENTS.md` / `api/AGENTS.md` | — |
| Class creation, join code, admission, roster, assignment | `docs/classroom-api.md`, `docs/classroom-live-management.md` | `api/_classroom.js`, `src/classroomStudent.js`, `src/classroomInstructor.js` |
| Startup hub / resume / roles | `docs/preproduction-hardening.md` | `src/startupExperienceHub.js`, `src/experienceRoleController.js` |
| Coaching, targets, debrief comparison | `docs/intake-target-identity.md`, `docs/classroom-debrief-comparison.md` | `src/intakeTargets.js`, `src/classroomCoaching.js`, `src/classroomDebrief*.js` |
| Staged exercises | `docs/classroom-staged-simulation.md` | `api/_classroomExercise.js`, `src/classroomExercise*.js` |
| Staged images / document pages / tables | `docs/classroom-protected-assets.md` | `api/_classroomExerciseAssets.js`, `scripts/protected-assets-schema.mjs`, `src/classroomCaseContent.js` |
| Protected Case Studies | `templates/AGENTS.md`, `docs/classroom-api.md` (#295 section) | `api/_protectedCaseStudies.js`, `src/classroomCaseStudies.js` |
| Admin / recovery / purge | `docs/admin-maintenance.md` | `api/_admin.js`, `src/adminMaintenance.js` |

## Invariants checklist (tick each one you touched)

- [ ] Experience role / class / session state never enters `kt-intake-full-v2`, file export, summaries, or templates.
- [ ] Standalone still boots and edits with the Classroom backend unavailable.
- [ ] Student credentials (join code, class session, workspace capability) never enumerate other students or workspaces.
- [ ] Student class-session capability never edits collaboration directly; edit authority is per-assignment and revoked on move/unassign.
- [ ] Instructor observation stays read-only **on the server** (GET-only observer, never an editable alias).
- [ ] Coaching stays on its own API and revision channel.
- [ ] Protected Case Study content is server-gated; browser code never imports `api/protected-case-studies.manifest.js`.
- [ ] Future-stage and Instructor-only staged content is withheld by the server, not hidden in the UI.
- [ ] New inputs are marked `data-persistence="local-only"` (or `session-only`) and `data-summary="exclude"` unless they are genuinely Intake data.
- [ ] Bearer values never appear in URLs, logs, toasts, or DOM attributes.

## Tests to add

- Server: authorization matrix in `tests/classroom-api.unit.test.mjs` (in-memory repository) **and**, for SQL changes, the real-Postgres suite `tests/*.pglite.test.mjs`.
- Client: a `*.feature.test.mjs` for controller behaviour.
- Browser: extend `tests/e2e/` and the fixture `scripts/serve-browser-tests.mjs` when the user journey changes. The fixture is a hand-written mock; keep its semantics identical to the real handler.

## Docs to update in the same PR

The contract doc for the area (table above), `README.md` if user-visible, `docs/commenting-guide.md` for new anchors, and `STATUS.md`.
