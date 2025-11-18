# AI Onboarding – KT Intake Modular Architecture

This guide summarises the Milestone 2.3 modularisation so AI agents can confidently extend, test, and maintain the KT Intake app.

## Entry Point & Boot Sequence
1. `index.html` renders the full layout and loads the ES module entry via `<script type="module" src="main.js"></script>`.
2. `main.js` registers a `DOMContentLoaded` listener that calls `boot()`.
3. `boot()` performs the following in order:
   - Wires the KT helpers by calling `configureKT({ autoResize, updatePrefaceTitles, showToast, getObjectFull, getDeviationFull })`.
   - Initialises each feature module: `initPreface`, `initializeCommunications`, `initStepsFeature`, `initTable`, `ensurePossibleCausesUI`, and `renderCauses`.
   - Restores any saved snapshot from `localStorage` through `restoreFromStorage()` and `applyAppState()`.
   - Defaults bridge timing via `setBridgeOpenedNow()` if no timestamp exists, syncs mirror fields, then wires button events and keyboard shortcuts.
   - Exposes temporary globals (`window.onGenerateSummary`, etc.) for backward compatibility while the module version stabilises.

## Module Responsibilities
| Module | Key Exports |
| ------ | ----------- |
| `src/appState.js` | `collectAppState()`, `applyAppState()`, `getSummaryState()` for round-trip UI testing and summary hydration. |
| `src/comms.js` | `initializeCommunications()`, `logCommunication()`, `toggleLogVisibility()`, `setCadence()`, `setManualNextUpdate()`, `getCommunicationElements()`. |
| `src/constants.js` | `ROWS`, `STEP_DEFINITIONS`, `CAUSE_FINDING_MODES`, and other deep-frozen config. Never mutate these directly. |
| `src/kt.js` | `configureKT()`, `initTable()`, `ensurePossibleCausesUI()`, `renderCauses()` for the IS/IS NOT workflow. |
| `src/preface.js` | `initPreface()`, `autoResize()`, `updatePrefaceTitles()`, `startMirrorSync()`, `setBridgeOpenedNow()`, `getPrefaceState()`, `getObjectFull()`, `getDeviationFull()`. |
| `src/steps.js` | `initStepsFeature()` plus drawer utilities invoked from `main.js`. |
| `components/actions/ActionListCard.js` | `mountActionListCard()`, `refreshActionList()` render the remediation card and broadcast list updates. |
| `src/actionsStore.js` | `listActions()`, `createAction()`, `patchAction()`, `removeAction()`, `sortActions()` persisted under `kt-actions-by-analysis-v1`. |
| `src/storage.js` | `saveToStorage()` / `restoreFromStorage()` that operate on the `kt-intake-full-v2` key. |
| `src/summary.js` | `generateSummary()`, `setSummaryStateProvider()`, helpers that compose both clipboard output and AI prompts. |
| `src/toast.js` | `showToast()` for lightweight notifications reused by comms and bootstrapping.

## Working Agreement for AI Agents
- **Stay modular:** Add new behaviour by creating a file under `src/` and exporting named helpers. Only touch `main.js` to import and wire these helpers.
- **Respect DOM ownership:** Each module queries and mutates only the nodes in its feature area. If cross-feature data is required, share callbacks or extend `appState` rather than querying unrelated sections.
- **Keep anchors intact:** The comments in `index.html` (`[section:*]`, `[script:*]`, etc.) act as automation anchors. Never remove or rename them.
- **Document as you go:** Follow the patterns in [`docs/commenting-guide.md`](./commenting-guide.md) to add module docblocks, update the anchor catalogue, and refresh README/`AGENTS.md` anchors before merging.
- **Reuse constants:** Extend `src/constants.js` if new enumerations or immutable lists are required. Deep-freeze ensures downstream modules receive read-only copies.
- **Preserve storage compatibility:** When saving extra data, extend the shape emitted by `collectAppState()` and persisted by `saveToStorage()`. Always update `applyAppState()` so round-trip tests pass.
  - Review [`docs/storage-schema.md`](./storage-schema.md) whenever you change persisted shapes, run `npm run update:storage-docs` afterward, and run `npm run check:storage-docs` (or rely on the CI workflow) before submitting. Update any tests under `tests/` that assert on persisted state so they reflect the new schema.

## Example Workflows
### Generate a Summary Variant
```js
import { generateSummary } from './src/summary.js';

generateSummary('summary', 'prompt preamble'); // Clipboard + summary card update
```

### Snapshot and Restore UI State in Tests
```js
import { collectAppState, applyAppState } from './src/appState.js';

const snapshot = collectAppState();
// ...simulate user actions...
applyAppState(snapshot);
```

### Wire a New Module
```js
// src/newFeature.js
export function initNewFeature({ onSave }) {
  const control = document.querySelector('#newControl');
  control.addEventListener('change', () => {
    // ...feature logic...
    onSave();
  });
}
```
```js
// main.js
import { initNewFeature } from './src/newFeature.js';

function boot() {
  // existing setup...
  initNewFeature({ onSave: saveAppState });
}
```

## Testing & QA Notes
- Always run a manual smoke test by opening `index.html` in a modern browser, entering sample data, generating a summary, and refreshing to confirm persistence.
- Automated suites should rely on `collectAppState()` / `applyAppState()` for deterministic state setup and on `generateSummary()` for output verification.
- No server is required; the app is fully static. Use a simple `file://` load or a lightweight static host when integrating with tooling that requires HTTP.

## Safe Extension Checklist
1. Identify the owning module for the UI you are touching; update that module instead of `main.js`.
2. Import shared constants from `src/constants.js` rather than duplicating values.
3. Update serialization helpers when adding inputs so `kt-intake-full-v2` and `kt-actions-by-analysis-v1` remain consistent.
4. Add or update tests/scripts to call `collectAppState()` before mutating the DOM and `applyAppState()` afterward.
5. Verify summary outputs via `generateSummary()` so AI prompt formats remain stable.

Following this guide keeps the Milestone 2.3 modular architecture intact and ready for future automation.
