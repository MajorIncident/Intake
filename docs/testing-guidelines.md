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

## Custom Node test loader & module stubs

Running `npm test` executes `node --test --loader ./tests/test-loader.mjs tests/**/*.test.mjs`. The `--loader` flag injects our custom loader before Node resolves any imports so tests see the same deterministic module surface regardless of the runtime state of `src/`.

- **Auto-generated stubs:** `tests/test-loader.mjs` intercepts imports for frequently mocked modules (e.g., `src/actionsStore.js`, `src/appState.js`, `src/kt.js`, `src/toast.js`). Instead of loading the real file it returns on-the-fly module source that proxies every export to a `globalThis.__<module>Mocks` object. This keeps Node's test runner lean while letting suites declare just the behaviours they need.
- **Conditional stubs:** Modules that are sometimes required (preface, comms, steps, file transfer, etc.) are only stubbed when explicitly requested. Set either `process.env.TEST_STUB_MODULES` or `globalThis.__testStubModules` to control this. Valid values include:
  - `TEST_STUB_MODULES="*"` – stub every conditional module.
  - `TEST_STUB_MODULES="preface,summary"` – stub only the listed kinds (case-sensitive, comma-separated).
  - `globalThis.__testStubModules = new Set(['steps']);` – configure from inside a suite before the module is imported.
- **Providing mocks:** Each stub expects a matching global. For example, stubbing `src/kt.js` requires `globalThis.__ktMocks` with functions like `configureKT` or `getPossibleCauses`. Minimal suites can provide only the functions they call; every other export falls back to harmless defaults (empty arrays/objects) unless the stub throws (actionsStore, kt, toast, etc.) to prevent silent omissions.
- **Error surfacing:** Missing mocks throw early (e.g., “`kt mocks not initialised`”) so the test clearly states which module needs coverage. Failing fast avoids debugging undefined values later in the suite.

The stubbed surfaces are intentionally thin, so avoid importing full runtime modules directly from tests. If a suite requires the real implementation, unset the relevant stub in `TEST_STUB_MODULES`/`__testStubModules` or import the module before changing those flags so Node caches the actual file.

### Environment variables & globals reference

- `TEST_STUB_MODULES`: CLI flag read by the loader before Node executes the entry file. Use it in `package.json` scripts or one-off commands (e.g., `TEST_STUB_MODULES=preface npm test`).
- `globalThis.__testStubModules`: Runtime switch for integration suites that need to stub modules after creating their own fixtures. Assign `'*'`, a `Set`, array, or object map of module kinds.
- Module-specific globals: each stub reads a `globalThis.__<name>Mocks` object (`__actionsStoreMocks`, `__appStateMocks`, `__ktMocks`, `__toastMocks`, `__prefaceMocks`, etc.). Populate these in your test `before` hook and reset them in `after`/`afterEach` so suites remain isolated.

## Installing DOM globals with `jsdom`

DOM integration tests often need browser globals that are missing from Node. Use `tests/helpers/jsdom-globals.js` to keep the setup consistent and reversible:

```js
import { JSDOM } from 'jsdom';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

let snapshot;

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  snapshot = installJsdomGlobals(dom.window);
});

afterEach(() => {
  restoreJsdomGlobals(snapshot);
});
```

`installJsdomGlobals(window)` mirrors `window`, `document`, DOM event constructors, and a navigator getter onto `globalThis`. It returns a snapshot you must pass to `restoreJsdomGlobals(snapshot)` so subsequent tests regain the original Node globals. Always wrap DOM-heavy tests with this helper instead of mutating `globalThis` directly—Node 22+ enforces descriptors on `navigator`, and the helper preserves the correct shape.

## Review checklist for new tests
- [ ] Confirm the test name and location follow the conventions above.
- [ ] Assert at least one observable change per requirement covered by the feature PR.
- [ ] Reset application state (via `applyAppState()` or equivalent) before the test exits.
- [ ] Update `package.json` or the test runner configuration if new suites require additional commands.
- [ ] Confirm required mocks (`globalThis.__ktMocks`, etc.) exist whenever the loader stubs a module.

## Troubleshooting the loader & jsdom helpers

- **“mocks not initialised” errors** – Provide the missing `globalThis.__<module>Mocks` object before importing the module. Example:
  ```js
  globalThis.__prefaceMocks = { initPreface: () => {} };
  const preface = await import('../src/preface.js');
  ```
- **Real modules required** – Unset the stub by leaving the module name out of `TEST_STUB_MODULES`/`__testStubModules` or import the module before changing those flags.
- **Navigator getter warnings** – Always pair `installJsdomGlobals` with `restoreJsdomGlobals`; forgetting to restore leaks jsdom’s navigator descriptor into other tests.
- **Missing DOM constructors** – If jsdom globals are needed only temporarily, still use the helper so event constructors (`CustomEvent`, `KeyboardEvent`, etc.) are installed consistently.

Need a refresher on the broader testing contract? Jump back to the [README “Testing & QA” section](../README.md#testing--qa) or review the architectural context in [`docs/architecture-overview.md`](docs/architecture-overview.md).

## `npm run verify:tests` guard workflow

The repository ships a diff-aware coverage guard, [`scripts/ensure-tests-cover-changes.js`](../scripts/ensure-tests-cover-changes.js), that backs the `npm run verify:tests` command referenced throughout this guide. Run it any time you edit runtime modules under `src/` or `components/` so missing coverage is caught before CI does.

- **Diff inspection logic:** The guard shells out to `git diff --name-only origin/$GITHUB_BASE_REF...HEAD` (falling back to `main` and, if necessary, `git status --porcelain`) to learn which files changed. When it sees runtime edits without a matching `tests/*.test.mjs` update it flags the gap.
- **Template dependency:** Missing suites are scaffolded by copying [`tests/template.feature.test.mjs`](../tests/template.feature.test.mjs) into `tests/auto-generated/<runtime-path>.feature.test.mjs`. Each stub is prefixed with a banner describing which file triggered it so you know where to focus.
- **CI enforcement:** The same command runs inside [`ci.yml`](../.github/workflows/ci.yml) before `npm test`. CI exits non-zero when runtime changes lack committed coverage, and the logs list the expected stub paths so you can recreate them locally.
- **Resolving failures:** When the guard fails locally or on CI, open the generated stub(s) under `tests/auto-generated/`, move them to the correct directory/name for your suite, and replace the skipped placeholder with assertions that cover the behaviour you introduced. Stage the finished test files, delete the auto-generated stub(s), and rerun `npm run verify:tests` until it exits successfully.
- **Cleanup expectation:** Auto-generated placeholders are temporary teaching aids. Once a real test exists in the appropriate folder, remove the corresponding file from `tests/auto-generated/` so future runs do not detect stale scaffolding.

Following this workflow ensures contributors understand the testing requirement without needing to read the script source, and it keeps CI and local development aligned on the coverage contract.
