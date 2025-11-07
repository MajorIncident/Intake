# KT Intake HTML Guidelines

## Scope
This file applies to `index.html`. Follow these instructions when editing any portion of the intake application.

## File Layout & Anchors
`index.html` is divided into named anchors. Only edit inside the matching start/end comments and keep the marker text unchanged.

- `[styles]` / `[vars]` – Anchor references for global CSS. The actual styles live in `styles.css` but the comments must remain.
- `[header]` & `[section:*]` – Visual cards for each workflow stage (bridge activation, problem summary, evidence, baseline/current, impact, communications, KT table, possible causes, steps, summary export).
- `[section:summary]` – Container for the latest generated summary text. Keep IDs intact for persistence and testing hooks.
- `[script]` – Reference block for the external ES module entry point.
  - `[rows]`, `[script:table-build]`, `[script:preface-refs]`, `[script:tokens]`, `[script:init]`, `[script:export]`, `[script:storage]`, `[script:toast]` – Historical anchors preserved for traceability. They now correspond to modules imported by `main.js`; do not remove them even though the code resides in `src/`.

Preserve the order of these anchors. If you need a new section, duplicate the existing pattern: insert markup between neighbouring anchors and provide matching comments such as `<!-- [section:new-feature] start -->` / `<!-- [section:new-feature] end -->`.

## Editing Contract
- Do **not** rename or delete anchor markers, tokens `{OBJECT}` or `{DEVIATION}`, or protected function names documented in `AGENTS.md`.
- Keep the DOM IDs and ARIA attributes stable. Tests and AI agents rely on them to replay state via `collectAppState()` / `applyAppState()`.
- All behaviour lives in modules under `src/`. Avoid inline scripts in the HTML; instead, export helpers from a module and import them in `main.js`.
- Only modify `main.js` to register new modules or top-level event wiring. Feature logic belongs beside the DOM it controls (`src/preface.js`, `src/kt.js`, etc.).
- When adjusting layout, reuse existing classes (`.card`, `.field`, `.grid`, `.chipset`, etc.) before introducing new ones.

## Data Structures & Persistence
- Immutable data such as `ROWS`, `CAUSE_FINDING_MODES`, and `STEP_DEFINITIONS` live in `src/constants.js`. Update them cautiously and ensure each change flows through summary generation and persistence.
- `collectAppState()` and `applyAppState()` coordinate the round-trip of UI state. When you add new fields, hook them into those helpers plus the serialization logic in `src/storage.js`.
- Local storage uses the key `kt-intake-full-v2`. Keep this identifier consistent so legacy data migrates correctly.

## Extending Behaviour
- New UI fields should include descriptive labels, helper text, and keyboard/focus affordances. Maintain semantic grouping with `<section>`, `<fieldset>`, and accessible legends.
- To surface new data in the summary, update the relevant formatter in `src/summary.js` and ensure the summary card IDs in the HTML stay unchanged.
- For AI prompt adjustments, prefer to add new summary modes via `generateSummary(mode, variant)` rather than introducing inline handlers.

## Testing Hooks
- Summary buttons (`#genSummaryBtn`, `#generateAiSummaryBtn`, `#commAIPromptBtn`) remain the canonical triggers. If you add variants, expose them through `generateSummary()` to keep the global fallbacks (`window.onGenerateSummary`, etc.) valid.
- Steps drawer controls (`#stepsBtn`, `#stepsCloseBtn`, `#stepsDrawer`) and communications actions must remain accessible for automated tests. Update `src/steps.js` or `src/comms.js` if structural changes are required.

## Styling Updates
- All CSS referenced by `index.html` now lives in `styles.css`. When adjusting component spacing, typography, or responsive behaviour, update that stylesheet and keep the `[styles]` anchor comment in the HTML as a pointer only.
- Maintain the variable definitions defined under `[vars]` and reuse established class names to avoid fragmenting the design system.
