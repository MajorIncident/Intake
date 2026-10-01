# AI Onboarding – KT Intake Modular Architecture

This guide describes the current modular architecture so a fresh AI coding session can confidently extend, test, and maintain KT Intake. Do not assume a previous chat's branch, PR, deployment, or repository state; follow the Cold Start Protocol in the root `AGENTS.md` first.

For any work in the Standalone / Student / Instructor program (#288), also read `docs/classroom-architecture.md`, `docs/classroom-roadmap.md`, and `docs/classroom-workstream.md` before editing. For class/API authorization work, also read `docs/classroom-api.md` and `api/AGENTS.md`. Those files are the durable source for program invariants, dependency order, capability boundaries, and the exact continuation point.

## Entry Point & Boot Sequence
1. `index.html` renders the full layout and loads the ES module entry via `<script type="module" src="main.js"></script>`.
2. `main.js` registers a `DOMContentLoaded` listener that calls `boot()`.
3. `boot()` restores the independent product experience through `initExperienceRoleController()` before configuring the Intake feature modules. Existing saved Intakes / collaboration links become Standalone; genuinely new browsers receive the required chooser.
4. `boot()` then performs the Intake initialization:
   - Wires the KT helpers by calling `configureKT({ autoResize, updatePrefaceTitles, showToast, getObjectFull, getDeviationFull })`.
   - Initialises each feature module: `initPreface`, `initializeCommunications`, `initStepsFeature`, `initTable`, `ensurePossibleCausesUI`, and `renderCauses`.
   - Restores any saved snapshot from `localStorage` through `restoreFromStorage()` and `applyAppState()`.
   - Defaults bridge timing via `setBridgeOpenedNow()` if no timestamp exists, syncs mirror fields, then wires button events and keyboard shortcuts.
   - Exposes temporary globals (`window.onGenerateSummary`, etc.) for backward compatibility while the module version stabilises.

## Module Responsibilities
| Module | Key Exports |
| ------ | ----------- |
| `src/appState.js` | `collectAppState()`, `applyAppState()`, `getSummaryState()` for round-trip UI testing and summary hydration. |
| `src/experienceRoles.js` | Canonical Standalone / Student / Instructor IDs, labels, and declarative product-surface policy. |
| `src/experienceRoleController.js` | First-run chooser, role resume/switching, backward-compatible Standalone migration, and local-only `kt-experience-role-v1` preference. |
| `src/classroomStudent.js` | Student class admission/resume/exit plus coaching-connect lifecycle hooks. |
| `src/classroomInstructor.js` | Instructor class resume, roster, read-only observation, and coaching-observation lifecycle hooks. |
| `src/coachableFields.js` | Stable coaching target IDs and versioned field fingerprints; DOM placement is deliberately separate from persistence identity. |
| `src/classroomCoaching.js` | Instructor coaching controls and Student read-only feedback rendering through the separate coaching API. |
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
| `api/_workspace.js` | Existing collaboration persistence/handlers plus explicitly edit-capable workspace aliases. Only `classroom-student` aliases may resolve through legacy read/write collaboration endpoints. |
| `api/_classroom.js` | Class schema/capabilities, class-scoped observation, Student admission, rotation/revocation, and separate Instructor-write/Student-read coaching feedback APIs. |

## Working Agreement for AI Agents
- **Stay modular:** Add new behaviour by creating a file under `src/` and exporting named helpers. Only touch `main.js` to import and wire these helpers.
- **Respect DOM ownership:** Each module queries and mutates only the nodes in its feature area. If cross-feature data is required, share callbacks or extend `appState` rather than querying unrelated sections.
- **Keep anchors intact:** The comments in `index.html` (`[section:*]`, `[script:*]`, etc.) act as automation anchors. Never remove or rename them.
- **Document as you go:** Follow the patterns in [`docs/commenting-guide.md`](./commenting-guide.md) to add module docblocks, update the anchor catalogue, and refresh README/`AGENTS.md` anchors before merging.
- **Reuse constants:** Extend `src/constants.js` if new enumerations or immutable lists are required. Deep-freeze ensures downstream modules receive read-only copies.
- **Preserve storage compatibility:** When saving extra Intake data, extend the shape emitted by `collectAppState()` and persisted by `saveToStorage()`. Experience/class/session context is different: experience role is explicitly stored outside SerializedAppState under `kt-experience-role-v1` and must remain excluded from Intake exports/templates/summaries. Always update `applyAppState()` so round-trip tests pass.
  - Review [`docs/storage-schema.md`](./storage-schema.md) whenever you change persisted shapes, run `npm run update:storage-docs` afterward, and run `npm run check:storage-docs` (or rely on the CI workflow) before submitting. Update any tests under `tests/` that assert on persisted state so they reflect the new schema.


## Working in Delivery-Safe Parts

For any task that is more than a small edit, assume the chat or a connector response can fail mid-session.

Use these defaults:

1. **Name the part before coding** — examples: "server contract", "stable registry", "Instructor UI", "Student UI", "tests/docs", "final gates".
2. **Make the part independently coherent** — avoid coupling a half-finished server mutation and a half-finished UI mutation in one checkpoint.
3. **Commit before moving on** — once a part is coherent, put it on the branch and record the SHA.
4. **Refresh the live restart document** — include the exact next action, not merely "continue work".
5. **Keep PR metadata current** — the active PR should explain what is already implemented and what remains.
6. **Run focused validation as parts land**, then run the canonical quality gate on the final documented head.
7. **Use small orchestration calls** for repository writes. If a code-generation script becomes large enough that a syntax error or timeout would obscure what happened, split it by concern or file group.

### When a message/tool delivery fails

Do not immediately rerun the previous write. First verify GitHub:

- branch HEAD;
- latest commits;
- PR head SHA/body;
- issue/workstream continuation point.

Then continue from the persisted state. A delivery timeout can happen **after** a commit succeeded.

If a generated mutation failed before GitHub wrote anything, confirm the branch still points to the prior SHA and retry as a smaller batch.

### Minimum durable handoff record

Before a long validation pass, context switch, or end of session, GitHub should contain:

```text
Active issue:
Active PR:
Branch / base:
HEAD SHA:
Completed checkpoints:
Intentionally not implemented:
Validation already passed:
Validation still running / required:
Known risk:
Exact next action:
```

If those fields cannot be filled from repository state, pause feature expansion and repair the handoff documentation first.

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
- Core local intake workflows can still run browser-first, but collaboration uses Vercel Functions under `api/` and Neon persistence. Use a deployed/HTTP environment with the required database variable when testing shared sessions; do not infer collaboration health from a `file://` smoke test.

## Safe Extension Checklist
1. Identify the owning module for the UI you are touching; update that module instead of `main.js`.
2. Import shared constants from `src/constants.js` rather than duplicating values.
3. Update serialization helpers when adding inputs so `kt-intake-full-v2` and `kt-actions-by-analysis-v1` remain consistent.
4. Add or update tests/scripts to call `collectAppState()` before mutating the DOM and `applyAppState()` afterward.
5. Verify summary outputs via `generateSummary()` so AI prompt formats remain stable.

Following this guide, the scoped `AGENTS.md` files, and `docs/REPOSITORY-OPERATIONS.md` keeps the current architecture explicit and ready for future automation.
