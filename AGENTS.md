# Intake Repository Guidelines

## Scope
This file applies to the entire repository unless a more specific `AGENTS.md` file exists deeper in the directory tree. Follow these guidelines when editing or adding files anywhere in the project.

## UI/UX Principles
- **Apple-like spacing:** Use generous whitespace, especially around sections, cards, and form controls. Maintain consistent padding and margins (e.g., multiples of 8px) to create a calm, breathable layout.
- **Typography hierarchy:** Favor clean sans-serif fonts with clear size steps. Headings should scale down gradually, and body text should remain highly legible. Use weight, size, and color to signal hierarchy while keeping the palette minimal.
- **Progressive disclosure:** Reveal information and advanced inputs gradually. Present primary actions and essential fields first, and defer complex or optional inputs to expandable sections or secondary cards.
- **Accessible contrast and feedback:** Ensure sufficient color contrast, provide clear focus states, and pair iconography with text labels so interactions remain inclusive.

## Modular JavaScript Architecture
- All runtime logic is organised into ES modules inside `src/`. Each module owns its DOM queries, event listeners, and state helpers for a single feature area (preface, KT table, comms, steps, etc.).
- `main.js` is the orchestration entry point. It should only import modules, run `boot()`, and wire shared events. Do not place feature-specific code directly in `main.js` unless you are connecting a brand-new module.
- When introducing new behaviour, create a module in `src/` and export only what is required. Import that module in `main.js` (or a sibling module) to keep responsibilities isolated.
- Reuse exports from existing modules instead of duplicating functionality. For shared config, extend `src/constants.js` so enums remain centralised and deep-frozen.
- Preserve the localStorage contract: all state persists under the key `kt-intake-full-v2`. Use the helpers from `src/storage.js` and `src/appState.js` (`collectAppState`, `applyAppState`, `getSummaryState`).
- Example pattern for AI agents and tests:
  ```js
  import { collectAppState, applyAppState } from './src/appState.js';
  import { generateSummary } from './src/summary.js';

  const before = collectAppState();
  // ...simulate changes...
  generateSummary('summary', 'prompt preamble');
  applyAppState(before);
  ```
- Keep modules free from cross-feature DOM edits. If two features must collaborate, share callbacks or data through `appState`, not ad-hoc selectors.

## Styling
- All shared CSS rules live in `styles.css`. Add layout variables, component rules, and responsive tweaks there while keeping the `[styles]` anchor comment in `ktintake.html` intact.
- Reuse the defined CSS variables (the `[vars]` block) and existing component classes before introducing new ones to uphold the Apple-like visual rhythm described above.

## Editing Contract & Protected Elements
- **Anchors & tokens:** `ktintake.html` is segmented by anchors such as `[styles]`, `[rows]`, `[script:init]`, and `[script:storage]`. Keep every anchor marker intact and insert changes inside the appropriate region. Never rename or delete tokens including `{OBJECT}` and `{DEVIATION}`.
- **Protected data:** `ROWS`, `STEP_DEFINITIONS`, and the other immutable collections in `src/constants.js` underpin the entire workflow. Extend them thoughtfully and document any changes in a scoped `AGENTS.md`.
- **Function invariants:** Core lifecycle helpers—`boot()`, `configureKT()`, `initTable()`, `initStepsFeature()`, `generateSummary()`, and `buildSummaryText()`—must retain their names and responsibilities. Extend behaviour via internal helpers rather than renaming or removing these entry points.

## Feature & Summary Extensions
- **UI additions:** Pair any new inputs with descriptive labels, helper text, and sensible storage keys. Follow the spacing guidance above and prefer semantic HTML elements.
- **Persistence:** When storing new data, extend the existing collectors in `src/appState.js` and `src/storage.js`. Document schema changes in module-level comments or scoped `AGENTS.md` files.
- **Summary output:** Update `buildSummaryText()` and helper formatters (e.g., `formatPossibleCausesSummary()`) when introducing new captured data. Match the tone, ordering, and bullet structure already used.

## Using Sub-Guidelines
- Specialized editing rules for `ktintake.html` live in `ktintake.AGENTS.md`. Review that file before modifying the intake page.
- If you introduce new modules or directories, include a scoped `AGENTS.md` that clarifies local conventions and how they interact with the global contract above. State the intent and scope at the top of each document so future contributors understand its coverage.
