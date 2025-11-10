# KT Intake – AI-Optimized Incident Analysis Template

KT Intake is a zero-backend Kepner–Tregoe (KT) incident workbook designed for rapid bridge facilitation, AI-assisted summaries, and resilient state restoration. The UI lives entirely in `index.html`, while behaviour is organised into ES modules that mirror each major feature of the app.

## Quickstart
- Clone or download this repository.
- Open `index.html` in any modern browser. No build step or server is required.
- The page will load previous work from `localStorage` (keys: `kt-intake-full-v2` for the intake form and `kt-actions-by-analysis-v1` for action plans) and is immediately ready for edits, summary generation, or AI prompt creation.
- Use the header controls to **Save to File** (exports a JSON snapshot) or **Load from File** (imports a previously saved snapshot) when you need to move an intake between browsers or machines.

## Entry Point & Boot Logic
- `index.html` declares the full UI layout and loads the JavaScript bundle via `<script type="module" src="main.js"></script>`.
- `main.js` waits for `DOMContentLoaded`, then calls `boot()`. This bootstraps every feature in order:
  1. Configure the KT table utilities (`configureKT`) with callbacks such as `autoResize`, `updatePrefaceTitles`, and `showToast`.
  2. Initialise the preface, communications log, KT table, steps drawer, and possible-causes UI.
  3. Wire the summary buttons and communication controls, plus Alt-key shortcuts for power users.
  4. Restore any previous session from `localStorage` via `restoreFromStorage()` → `applyAppState()`.
  5. Expose temporary global fallbacks (`window.onGenerateSummary`, etc.) so legacy bookmarks continue to work while modules take over.

## Module Architecture
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

## Development Guidelines
- Change only the module that owns the UI slice you are updating; avoid cross-module DOM mutations.
- Use `src/constants.js` for shared enums or immutable data instead of duplicating literals.
- When wiring new behaviour, export it from a module in `src/` and import it in `main.js`. `main.js` should stay focused on orchestration.
- Preserve anchor comments in `index.html` (e.g., `[styles]`, `[section:preface]`) so automation and documentation links remain stable.
- Keep the UI accessible: reuse layout classes, maintain contrast, and follow the Apple-like spacing guidance in `AGENTS.md`.

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

- **Automated coverage is mandatory:** Every feature pull request must add or update tests that assert the behaviours introduced or modified.
- **Run the coverage guard:** Execute `npm run verify:tests` after staging runtime changes. The guard ensures any updates under `src/` or `components/` are paired with refreshed suites in `tests/**/*.test.mjs`.
- **Choose the right suite:** Follow [`docs/testing-guidelines.md`](docs/testing-guidelines.md) to decide between unit and DOM integration tests, apply the naming/location conventions under `tests/`, and leverage the reusable template in `tests/template.feature.test.mjs` when starting new files.
- **Auto-generated stubs live in `tests/auto-generated/`:** When the guard detects missing coverage it copies `tests/template.feature.test.mjs` into a feature-specific stub so you can immediately replace the skipped test with meaningful assertions. Commit the file once it contains real coverage or delete it if you move the tests elsewhere.
- **Snapshot-friendly helpers:** Automated harnesses should call `collectAppState()` / `applyAppState()` for reliable state restoration and `generateSummary()` for output verification.
- **Manual regression:** Open `index.html`, fill representative data, click **Generate Summary**, then refresh to ensure state persistence.
- **Storage changes:** Run `npm run update:storage-docs` after altering persisted fields. CI can enforce freshness with `npm run check:storage-docs`.

Continuous integration runs automatically on pull requests and pushes to `main`, using the repository's Node.js version via `actions/setup-node` with npm caching for faster installs. The workflow executes `npm ci`, `npm test` (emitting JUnit results for artifact upload on failure), and `npm run check:storage-docs` so Codex-driven contributions keep tests and storage docs in sync.

## Additional Documentation
- See `AGENTS.md` for global UI principles, module isolation rules, and contribution contracts.
- Refer to `index.AGENTS.md` when altering the HTML structure; it documents anchor expectations and storage invariants.
- For AI-specific onboarding notes, including module extension patterns, read `docs/AI-ONBOARDING.md`.
- Consult `docs/commenting-guide.md` for required docblocks, anchor formats, and the merge checklist.
