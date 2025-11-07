# KT Intake – AI-Optimized Incident Analysis Template

KT Intake is a zero-backend Kepner–Tregoe (KT) incident workbook designed for rapid bridge facilitation, AI-assisted summaries, and resilient state restoration. The UI lives entirely in `index.html`, while behaviour is organised into ES modules that mirror each major feature of the app.

## Quickstart
- Clone or download this repository.
- Open `index.html` in any modern browser. No build step or server is required.
- The page will load previous work from `localStorage` (key: `kt-intake-full-v2`) and is immediately ready for edits, summary generation, or AI prompt creation.

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
| `main.js` | Entry point that imports every module, wires shared events, and runs `boot()`. |

## Development Guidelines
- Change only the module that owns the UI slice you are updating; avoid cross-module DOM mutations.
- Use `src/constants.js` for shared enums or immutable data instead of duplicating literals.
- When wiring new behaviour, export it from a module in `src/` and import it in `main.js`. `main.js` should stay focused on orchestration.
- Preserve anchor comments in `index.html` (e.g., `[styles]`, `[section:preface]`) so automation and documentation links remain stable.
- Keep the UI accessible: reuse layout classes, maintain contrast, and follow the Apple-like spacing guidance in `AGENTS.md`.

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
- Manual regression: open `index.html`, fill representative data, click **Generate Summary**, then refresh to ensure state persistence.
- Automated harnesses should use `collectAppState()` / `applyAppState()` for reliable snapshots and `generateSummary()` for output verification.
- Future end-to-end tests will live in Playwright/Cypress suites once introduced; keep module boundaries clean to simplify that work.

## Additional Documentation
- See `AGENTS.md` for global UI principles, module isolation rules, and contribution contracts.
- Refer to `index.AGENTS.md` when altering the HTML structure; it documents anchor expectations and storage invariants.
- For AI-specific onboarding notes, including module extension patterns, read `docs/AI-ONBOARDING.md`.
