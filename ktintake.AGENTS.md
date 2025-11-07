# KT Intake Single-File Guidelines

## Scope
This file applies to `ktintake.html`. Follow these instructions when editing any portion of the intake application.

## File Layout & Anchors
`ktintake.html` is divided into named anchors. Only edit inside the matching start/end comments and keep the marker text unchanged.

- `[styles]` / `[vars]` – Global CSS variables and layout rules.
- `[header]` & `[section:*]` – Visual cards for each workflow stage (bridge activation, problem summary, evidence, baseline/current, impact, communications, KT table, possible causes, steps, summary output).
- `[script]` – Wraps all JavaScript.
  - `[rows]` – KT prompt definitions (`ROWS`).
  - `[script:table-build]` – Utilities that render and manage the KT IS/IS NOT table.
  - `[script:preface-refs]` & `[script:tokens]` – Helpers for shared field references and text-token replacement.
  - `[script:init]` – Bootstraps event listeners and page initialisation. Must call `initTable()` and `initStepsFeature()`.
  - `[script:export]` – Summary generation, clipboard flows, and toast messages.
  - `[script:storage]` – `localStorage` persistence (form fields, comm cadence, KT causes, steps drawer).
  - `[script:toast]` – Lightweight notification banner.

Preserve the order of these anchors. If you need a new section, duplicate the existing pattern: insert the markup between neighbouring anchors and provide matching comments such as `<!-- [section:new-feature] start -->` / `<!-- [section:new-feature] end -->`.

## Editing Contract
- Do **not** rename or delete anchor markers, tokens `{OBJECT}` or `{DEVIATION}`, or protected functions (`init()`, `initTable()`, `initStepsFeature()`, `generateSummary()`, `buildSummaryText()`).
- Keep the single-file structure. Prefer incremental edits rather than wholesale rewrites.
- Document any significant behavioural changes in this file so future contributors know how to work within the contract.

## Data Structures
- `ROWS` enumerates the KT questions and helper copy. Modify only when the KT playbook intentionally changes.
- `CAUSE_FINDING_MODES` and `STEP_DEFINITIONS` power possible-cause tracking and the steps drawer. Treat them as canonical data: update with caution and ensure summaries and persistence stay aligned.

## Adding UI or Fields
- Add new fields within the appropriate section card. Include clear labels, helper text, and ARIA attributes when relevant.
- Use existing utility classes (`.field`, `.grid`, `.chipset`, etc.) to maintain spacing and alignment.
- Store new values by extending `saveToStorage()` / `restoreFromStorage()` with consistent key names. Persisted keys should live under the top-level `ktIntake` object to avoid collisions.

## Extending Summaries
- Update `buildSummaryText()` and supporting helpers (such as `formatPossibleCausesSummary()` or `formatStepsSummary()`) when introducing new captured data.
- Match the existing bullet/paragraph formatting and keep the narrative order aligned with the on-screen workflow.
- When adding AI prompt variants, guard the behaviour with `generateSummary()` feature flags and reuse the copy structure already provided.

## Persistence & Tokens
- When introducing new token placeholders, document them here and update the token-fill helpers under `[script:tokens]`.
- Keep auto-save behaviour intact. Any new data should be wired into the serialization helpers and restored on load before UI rendering occurs.

## Sub-Guidelines
New modules or major UI sections should be accompanied by their own `AGENTS.md` files placed in a dedicated directory. Those sub-guidelines will override instructions here for their scope—state the relationship clearly in each document.

## Styling Updates
- All CSS referenced by `ktintake.html` now lives in `styles.css`. When adjusting component spacing, typography, or responsive behaviour, update that stylesheet and keep the `[styles]` anchor comment in the HTML as a pointer only.
- Maintain the variable definitions defined under `[vars]` and reuse established class names to avoid fragmenting the design system.
