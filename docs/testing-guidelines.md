# Testing Guidelines

This project relies on automated tests to keep the zero-backend KT Intake experience stable. Every feature pull request must either add new coverage or update existing tests so that the newly introduced behaviour is verified. Use the guidance below to decide which style of test to add and how to structure the files inside `tests/`.

## Selecting the right test type
- **Unit tests**: Create or update a unit test when the behaviour can be validated by calling exported helpers without touching the DOM. Examples include state migrations, data formatters, pure reducers, and summary generators. Keep these tests fast, deterministic, and isolated from browser globals.
- **DOM integration tests**: Add a DOM integration test whenever behaviour spans multiple modules, updates UI anchors, or mutates the application state through user-like interactions. These tests can render snippets of the DOM, exercise event listeners, and verify that state snapshots align with expectations.
- **Mixed updates**: If a change affects both a pure helper and the UI wiring, cover each side in the appropriate suite. A unit test should confirm the helper’s contract while a DOM integration test proves the end-to-end user workflow.

## Working with `collectAppState()` and `applyAppState()`
The application exposes snapshot helpers that make DOM integration tests reliable:

```js
import { collectAppState, applyAppState } from '../src/appState.js';

const baseline = collectAppState();
// mutate the DOM or run feature logic here
applyAppState(baseline);
```

Follow these practices when using the helpers:
- **Capture before changes**: Call `collectAppState()` immediately after rendering your fixture so you can restore the UI to a known state at the end of the test.
- **Restore after assertions**: Use `applyAppState()` in a `try`/`finally` block (or the test framework’s teardown hook) to guarantee the snapshot is re-applied even if an assertion fails.
- **Snapshot comparisons**: When a feature should persist UI edits, collect a second snapshot after the interaction and compare it to the expected structure before restoring the original baseline.

## Naming and location conventions
- Place every automated test in the repository-level `tests/` directory. Create subdirectories (e.g., `tests/dom/`) if the suite grows, but keep all test files under this root.
- Name files with the suffix `.test.mjs`. Use prefixes to clarify scope:
  - `*.unit.test.mjs` for pure helper coverage.
  - `*.dom.test.mjs` for DOM-centric integration flows.
  - `*.feature.test.mjs` when validating a user-visible feature end-to-end.
- Mirror the module names you are exercising so that `migrateAppState` continues to live in `tests/migrateAppState.test.mjs`, while a DOM test for the preface module might live in `tests/preface.dom.test.mjs`.
- Use the provided template (`tests/template.feature.test.mjs`) as a starting point for new files so imports, teardown helpers, and naming stay consistent.

## Review checklist for new tests
- [ ] Confirm the test name and location follow the conventions above.
- [ ] Assert at least one observable change per requirement covered by the feature PR.
- [ ] Reset application state (via `applyAppState()` or equivalent) before the test exits.
- [ ] Update `package.json` or the test runner configuration if new suites require additional commands.
