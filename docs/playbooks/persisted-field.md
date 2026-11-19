# Adding a field saved with the Intake

The Intake snapshot (`kt-intake-full-v2`) is the product's core contract: it is saved locally, exported to files, synchronized in collaboration, used by Templates, and projected for coaching/debrief.

## Steps

1. Markup in `index.html` inside the right anchor (`index.AGENTS.md`), with label and helper text.
2. Owning module collects/applies it; extend `collectAppState()` / `applyAppState()` in `src/appState.js` and sanitization in `src/storage.js`.
3. Summary: wire it into `src/summary.js` (see `docs/summary-style-checklist.md`).
4. Targets: if the field is learner reasoning inside a covered area, add a target in `src/intakeTargets.js` or an explicit reviewed exclusion (`docs/intake-target-identity.md`).
5. `npm run update:storage-docs` and commit `docs/storage-schema.md`.
6. Regenerate Templates if needed: `npm run build:templates`.
7. Tests: round-trip (`collectAppState` → `applyAppState`), summary output, and target coverage.

## Guards that will catch you

`npm run verify:persistence`, `verify:summary`, `check:storage-docs`, `check:templates`, and the target-coverage tests. If a control is **not** Intake data (Classroom, Admin, presentation), mark it `data-persistence="local-only"` / `session-only` and `data-summary="exclude"` instead.
