# KT Intake – AI-Optimized Incident Analysis Template

KT Intake is a zero-backend Kepner–Tregoe (KT) incident workbook designed for rapid bridge facilitation, AI-assisted summaries, and resilient state restoration. The UI lives entirely in `index.html`, while behaviour is organised into ES modules that mirror each major feature of the app.

## Quickstart
- Clone or download this repository.
- Open `index.html` in any modern browser. No build step or server is required.
- The page will load previous work from `localStorage` (keys: `kt-intake-full-v2` for the intake form and `kt-actions-by-analysis-v1` for action plans) and is immediately ready for edits, summary generation, or AI prompt creation.
- Use the header controls to **Save to File** (exports a JSON snapshot) or **Load from File** (imports a previously saved snapshot) when you need to move an intake between browsers or machines.
- Open the **Templates** drawer and click **Save current notes as template** to download the in-progress intake as curated template JSON. The prompt lets you choose between a **Case Study** template (password protected, multi-mode) or a **Standard** template (no password, always loads Full mode).

## Development Setup
AI contributors should run the following commands (or manual preview) whenever the described workstream applies so linting, templates, and docs stay current.

| Command | When to run it | Notes & references |
| --- | --- | --- |
| `npm ci` / `npm install` | Run once after cloning or whenever `package.json` changes. | Installs the pinned toolchain for scripts, tests, and template validation. See the onboarding details in [`docs/AI-ONBOARDING.md`](docs/AI-ONBOARDING.md). |
| `npm run dev` | During day-to-day feature work that touches `src/`, `components/`, or `scripts/`. | Starts the watcher so template manifests regenerate automatically; pair it with the guidance in [`docs/commenting-guide.md`](docs/commenting-guide.md) when wiring new anchors. |
| Open `index.html` directly | For quick manual QA or smoke tests that do not require the watcher. | The static file reflects the latest bundle after any build step, so you can double-check flows without Node running. |
| `npm run build` | Before opening a pull request or testing deployment changes. | Rebuilds the static bundle and regenerates `src/templates.manifest.js`. Mirrors the Vercel command noted below. |
| `npm run build:templates` | Immediately after editing JSON under `templates/` or `templates.manifest` logic. | Validates curated snapshots and should accompany any template-focused feature (see "Template manifest workflow" below). |
| `npm run verify:tests` | Any time you change runtime code under `src/` or `components/`. | Enforces the coverage contract described in [`docs/testing-guidelines.md`](docs/testing-guidelines.md) and scaffolds missing suites. |
| `npm run verify:summary` | Whenever you add or change form controls/options. | Ensures new inputs are wired into the Copy & Paste Summary, documented, and styled with the Apple-like rhythm. See [`docs/summary-style-checklist.md`](docs/summary-style-checklist.md). |
| `npm run verify:persistence` | When adding or editing inputs/captions that should survive reloads. | Confirms new controls tie into `src/appState.js` and `src/storage.js`, prompting template/state updates so saves/loads remain lossless. |
| `npm test` | Before committing or when adding new suites. | Runs the full test matrix (DOM + unit) so CI sees the same state you validated locally. |
| `npm run update:storage-docs` / `npm run check:storage-docs` | Run `update` whenever you alter persisted schema, then `check` before pushing. | Keeps [`docs/storage-schema.md`](docs/storage-schema.md) and [`docs/storage-schema.appendix.md`](docs/storage-schema.appendix.md) synced with new keys or shapes. |

## Entry Point & Boot Logic
- `index.html` declares the full UI layout and loads the JavaScript bundle via `<script type="module" src="main.js"></script>`.
- `main.js` waits for `DOMContentLoaded`, then calls `boot()`. This bootstraps every feature in order:
  1. Configure the KT table utilities (`configureKT`) with callbacks such as `autoResize`, `updatePrefaceTitles`, and `showToast`.
  2. Initialise the preface, communications log, KT table, steps drawer, and possible-causes UI.
  3. Wire the summary buttons and communication controls, plus Alt-key shortcuts for power users.
  4. Restore any previous session from `localStorage` via `restoreFromStorage()` → `applyAppState()`.
  5. Expose temporary global fallbacks (`window.onGenerateSummary`, etc.) so legacy bookmarks continue to work while modules take over.

## Module Architecture

See [`docs/architecture-overview.md`](docs/architecture-overview.md) for the boot sequence narrative, module ownership map, and detailed cross-module data-flow reference. The quick table below summarizes the primary runtime files.

| File | Purpose |
| ---- | ------- |
| `src/constants.js` | Deep-frozen config: KT table rows, phase metadata, finding modes, and step definitions. |
| `src/storage.js` | Helpers that persist and hydrate the entire UI state under `kt-intake-full-v2`. |
| `src/appState.js` | Collects and reapplies UI state across modules (`collectAppState`, `applyAppState`, `getSummaryState`). |
| `src/preface.js` | Manages bridge activation fields, mirror sync, detection chips, and token updates for `{OBJECT}` / `{DEVIATION}`. |
| `src/kt.js` | Builds the KT IS/IS NOT table, manages paired facts, possible causes, and related UI affordances. |
| `src/steps.js` | Controls the incident checklist drawer, keyboard shortcuts, and completion metrics. |
| `src/comms.js` | Handles comms logging, cadence timers, and restoring the communications pane. |
| `src/summary.js` | Generates formatted summaries and AI prompts; exposes `generateSummary()` and state providers. |
| `src/toast.js` | Minimal toast notification system used by comms and global alerts. |
| `src/fileTransfer.js` | Bridges `collectAppState()` / `applyAppState()` with Blob/FileReader APIs for Save/Load workflows. |
| `components/actions/ActionListCard.js` | Renders the action list card UI, wires inline editing, and notifies listeners when actions change. |
| `src/actionsStore.js` | Persists actions by analysis ID under `kt-actions-by-analysis-v1`, providing CRUD and sorting helpers for the card UI. |
| `main.js` | Entry point that imports every module, wires shared events, and runs `boot()`. |

### Storage keys

- `kt-intake-full-v2`: Primary snapshot containing the intake form, table, steps, communications log, and possible causes.
- `kt-actions-by-analysis-v1`: Dedicated action registry keyed by analysis ID that powers the action list card and owner audit trail.

Need to know which module owns a given storage field? Jump to the [Storage-to-Module Responsibility Map](docs/storage-schema.appendix.md#storage-to-module-responsibility-map) for a field-by-field lookup tied to the DOM anchors and runtime files that persist each value.

## Development Guidelines
- Change only the module that owns the UI slice you are updating; avoid cross-module DOM mutations.
- Use `src/constants.js` for shared enums or immutable data instead of duplicating literals.
- When wiring new behaviour, export it from a module in `src/` and import it in `main.js`. `main.js` should stay focused on orchestration.
- Preserve anchor comments in `index.html` (e.g., `[styles]`, `[section:preface]`) so automation and documentation links remain stable.
- Keep the UI accessible: reuse layout classes, maintain contrast, and follow the Apple-like spacing guidance in `AGENTS.md`.

### Template manifest workflow
- Curated starter templates now live as JSON snapshots under `templates/` (one file per template). Each file lists metadata (`id`, `name`, `description`, `templateKind`, `supportedModes`) plus a `SerializedAppState` payload.
- Run `npm run build:templates` after editing or adding template JSON. The script validates each snapshot and regenerates `src/templates.manifest.js`.
- `npm run dev` and `npm run build` automatically invoke the generator, so the manifest always stays in sync during local development.

### Vercel deployment
- Production deploys on Vercel now execute `npm run build && npm test` (see `vercel.json`). The build step regenerates `src/templates.manifest.js` so templates remain in sync, and the test pass acts as a guardrail for regressions before traffic hits the static bundle.
- When modifying the manifest workflow or required quality gates, update both the README and `vercel.json` so the documented steps mirror the actual build command.
- Use `vercel build` (or run `npm run build && npm test`) locally to mirror the hosted environment whenever you change deployment requirements.

## Documentation & anchor hygiene
- Add or update module docblocks and JSDoc summaries whenever you touch a runtime file. The patterns in [`docs/commenting-guide.md`](docs/commenting-guide.md) are canonical.
- Register every new anchor in the commenting guide and mirror the change in scoped `AGENTS.md` files so AI agents can locate feature boundaries quickly.
- Before merging a feature, confirm that affected README sections and any relevant `AGENTS.md` anchors reflect the change set. Treat doc refreshes as part of the feature, not a follow-up task.

## AI & Automation Notes
- State helpers provide a stable integration surface:
  ```js
  import { collectAppState, applyAppState, getSummaryState } from './src/appState.js';
  import { generateSummary } from './src/summary.js';

  const snapshot = collectAppState();
  // ... mutate the DOM, then roll everything back
  applyAppState(snapshot);

  // Produce a formatted narrative or AI prompt
  generateSummary('summary', 'prompt preamble');
  ```
- `collectAppState()` serialises the entire UI and should be called before tests mutate the DOM.
- `applyAppState()` rehydrates the UI, letting Playwright/Cypress tests verify round trips without manual input.
- `getSummaryState()` is injected into the summary module so assertions can compare the most recent export.
- The KT table exposes `configureKT()` to register callbacks. Pass only the dependencies your module needs; avoid hidden globals.

## Testing & QA
[![CI status](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![CodeQL security scan status](../../actions/workflows/codeql.yml/badge.svg)](../../actions/workflows/codeql.yml)

- **Automated coverage is mandatory:** Every feature pull request must add or update tests that assert the behaviours introduced or modified.
- **Security scanning is automatic:** GitHub CodeQL runs on every push to `main`, pull request, and a weekly schedule to flag JavaScript/TypeScript issues without manual setup.
- **Dependency review gate:** A GitHub dependency review workflow now blocks merges when a pull request introduces new high or critical advisories, so expect PRs to fail even if unit tests succeed until vulnerable dependencies are replaced or patched.
- **Run the coverage guard:** Execute `npm run verify:tests` after staging runtime changes. The guard ensures any updates under `src/` or `components/` are paired with refreshed suites in `tests/**/*.test.mjs`.
  - The command runs [`scripts/ensure-tests-cover-changes.js`](scripts/ensure-tests-cover-changes.js), which inspects your `git diff` (against `origin/$GITHUB_BASE_REF` or `main`) to see whether runtime files changed without touching `tests/*.test.mjs`.
  - When a gap exists, the guard copies `tests/template.feature.test.mjs` into `tests/auto-generated/<feature>.feature.test.mjs`, adds a banner describing which file triggered the stub, and exits non-zero so you fill in the test before continuing. Delete the generated stub once a real test lives in the proper suite.
  - CI executes the same guard (`npm run verify:tests`) ahead of the test run, so pull requests fail fast if runtime diffs land without coverage. Fix failures by running the guard locally, replacing each skipped placeholder with real assertions, and re-running the command until it exits cleanly.
- **Keep new UI controls summary-ready:** Run `npm run verify:summary` whenever you add inputs or dropdown options. The guard rejects changes that add form controls without also updating summary wiring, summary-focused tests, or the styling/documentation notes in [`docs/summary-style-checklist.md`](docs/summary-style-checklist.md).
- **Persist new inputs and captions:** Run `npm run verify:persistence` when introducing form fields or caption inputs. The guard scans diffs for new controls under `index.html`, `components/`, or `src/` and fails if `src/appState.js` / `src/storage.js` (or relevant templates) stay untouched, providing remediation steps to keep save/load flows lossless.
- **Choose the right suite:** Follow [`docs/testing-guidelines.md`](docs/testing-guidelines.md) to decide between unit and DOM integration tests, apply the naming/location conventions under `tests/`, and leverage the reusable template in `tests/template.feature.test.mjs` when starting new files.
- **Auto-generated stubs live in `tests/auto-generated/`:** When the guard detects missing coverage it copies `tests/template.feature.test.mjs` into a feature-specific stub so you can immediately replace the skipped test with meaningful assertions. Commit the file once it contains real coverage or delete it if you move the tests elsewhere.
- **Custom Node test loader:** `npm test` invokes `node --test --loader ./tests/test-loader.mjs ...` so suites can opt into module stubs and jsdom globals. Review the loader, `TEST_STUB_MODULES`, and `tests/helpers/jsdom-globals.js` workflow in [`docs/testing-guidelines.md`](docs/testing-guidelines.md#custom-node-test-loader--module-stubs).
- **Snapshot-friendly helpers:** Automated harnesses should call `collectAppState()` / `applyAppState()` for reliable state restoration and `generateSummary()` for output verification.
- **Manual regression:** Open `index.html`, fill representative data, click **Generate Summary**, then refresh to ensure state persistence.
- **Storage changes:** Run `npm run update:storage-docs` after altering persisted fields. CI can enforce freshness with `npm run check:storage-docs`.

Continuous integration runs automatically on pull requests and pushes to `main`, using the repository's Node.js version via `actions/setup-node` with npm caching for faster installs. The workflow executes `npm ci`, `npm test` (emitting JUnit results for artifact upload on failure), and `npm run check:storage-docs` so Codex-driven contributions keep tests and storage docs in sync.

## Additional Documentation
- See `AGENTS.md` for global UI principles, module isolation rules, and contribution contracts.
- Refer to `index.AGENTS.md` when altering the HTML structure; it documents anchor expectations and storage invariants.
- For AI-specific onboarding notes, including module extension patterns, read `docs/AI-ONBOARDING.md`.
- Consult `docs/commenting-guide.md` for required docblocks, anchor formats, and the merge checklist.
