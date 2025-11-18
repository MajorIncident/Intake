# Commenting & Anchor Guide

This guide defines how contributors document modules, annotate functions, and maintain anchors across the Intake app. Follow it alongside the repository-wide instructions in `AGENTS.md`.

## Module docblocks
- Begin every runtime module (`src/`, `components/`, automation helpers) with a docblock that describes its purpose, the major exports, and the anchors or storage keys it manages.
- Summaries should reference related modules so responsibilities remain clear. For example, call out that `src/storage.js` owns migrations for the `kt-intake-full-v2` key, `src/actionsStore.js` normalises actions under `kt-actions-by-analysis-v1`, and `src/appState.js` collects the shape that storage persists.
- Keep docblocks short but specific. Include links to README sections or additional docs when they exist.

### Template
```js
/**
 * @module src/exampleModule
 * @description Short sentence explaining what the module orchestrates and which anchors it touches.
 * @see docs/commenting-guide.md for anchor/label conventions.
 */
```

## Function & method annotations
- Each exported function, class, and method must carry a JSDoc block with a one-line summary, parameter annotations, and a return description.
- Internal helpers that change shared state (`collectAppState`, `saveToStorage`, etc.) should also receive a summary so tests and AI agents can map responsibilities without spelunking the implementation.
- Keep wording action-oriented ("Collects", "Persists", "Builds") and describe side effects (e.g., DOM mutations, storage writes).

### Template
```js
/**
 * Builds the incident summary card and copies the output to the clipboard.
 * @param {HTMLElement} mount - Container that displays the generated summary.
 * @param {string} promptPreamble - Lead-in text that personalises the AI prompt.
 * @returns {void}
 */
export function generateSummary(mount, promptPreamble) {
  // ...
}
```

## Anchor catalogue
Anchors keep HTML and documentation in sync. Preserve existing tokens and register any new ones here.

| Anchor | Location | Purpose | Owning module(s) | Key DOM IDs / Storage keys |
| ------ | -------- | ------- | ---------------- | ------------------------- |
| `[styles]` | `index.html` (`<head>`) | Placeholder for inline style tokens that now live in `styles.css`. | `styles.css` | — (no DOM nodes or storage tied to this anchor). |
| `[header]` | `index.html` | Encapsulates the hero title plus toolbar controls for comms, steps, file transfer, templates, and summary triggers. | `src/commsDrawer.js`, `src/steps.js`, `src/fileTransfer.js`, `src/templatesDrawer.js`, `src/summary.js` | `docTitle`, `commsBtn`, `stepsBtn`, `stepsDrawer`, `stepsCompletedLabel`, `startFreshBtn`, `saveToFileBtn`, `loadFromFileBtn`, `genSummaryBtn`; persisted via `kt-intake-full-v2`. |
| `[feature:templates-drawer]` | `index.html` header toolbar | Wraps the Templates launcher, backdrop, and drawer UI for selecting and applying curated payloads. | `src/templatesDrawer.js`, `src/templates.js` | `templatesBtn`, `templatesDrawer`, `templatesBackdrop`, `templatesList`, `templatesModeGroup`, `templatesPassword`, `templatesSaveBtn`, `templatesApplyBtn`; applies state back to `kt-intake-full-v2`. |
| `[section:preface]` | `index.html` main wrap | Groups the problem summary, object/deviation notes, detection timeline, and baseline evidence fields. | `src/preface.js`, `src/appState.js` | `oneLine`, `objectPrefill`, `proof`, `detectMonitoring`, `detectUserReport`, `detectAutomation`, `detectOther`, `evScreenshot`, `evLogs`, `evMetrics`, `evRepro`, `evOther`, `healthy`, `now`; all serialized into `kt-intake-full-v2`. |
| `[subtitle]` | `index.html` main wrap | Provides the editable document subtitle that is mirrored into summaries and exports. | `src/preface.js`, `src/summary.js` | `docSubtitle`; persisted as part of `kt-intake-full-v2`. |
| `[section:impact]` | `index.html` main wrap | Holds impact analysis cards plus containment stage selection and description. | `src/preface.js` | `impactNow`, `impactFuture`, `impactTime`, `containAssessing`, `containStoppingImpact`, `containStabilized`, `containFixInProgress`, `containRestoring`, `containMonitoring`, `containClosed`, `containDesc`; all stored under `kt-intake-full-v2`. |
| `[section:table]` | `index.html` main wrap | Contains the KT IS / IS NOT focus toggles, analysis table, and Possible Causes workspace. | `src/kt.js`, `src/constants.js` | `kt-is-is-not`, `ktTable`, focus toggle buttons with `data-focus-mode`, `causeList`, `addCauseBtn`; state captured via `kt-intake-full-v2`. |
| `[section:summary]` | `index.html` main wrap | Hosts the rendered summary output for copy/paste workflows. | `src/summary.js` | `summaryCard`, `summaryPre`; reflects content generated from `kt-intake-full-v2`. |
| `[script]` | `index.html` footer | Signals where the ES module entry (`main.js`) wires boot logic, persistence, and shared helpers. | `main.js`, `src/storage.js`, `src/appState.js` | Imports modules that persist to `kt-intake-full-v2` and `kt-actions-by-analysis-v1`. |

### Adding new anchors
- Use the format `<!-- [feature:your-anchor] start -->` / `<!-- [feature:your-anchor] end -->`.
- Document the new anchor in this table with its owning module and why it exists.
- Update any relevant README or scoped `AGENTS.md` files so other contributors can discover the anchor quickly.

## Storage keys & schema documentation
- Primary intake state lives under the `kt-intake-full-v2` key (see `src/storage.js`), while the action list persists separately via `kt-actions-by-analysis-v1` in `src/actionsStore.js`.
- When adding a new storage key or expanding the schema:
  1. Describe the change in the owning module’s docblock and link to the relevant anchor.
  2. Update `docs/storage-schema.md` via `npm run update:storage-docs` so the structured schema reflects new fields.
  3. Record the new key and its purpose in the "Storage keys" section of the README (add the section if it does not exist yet).
  4. Note the change in any scoped `AGENTS.md` that governs the feature area.

## Checklist before merging
Use this checklist whenever you touch documentation, anchors, or storage:

- [ ] Module docblocks updated (or added) for changed files.
- [ ] JSDoc summaries added/updated for exported functions.
- [ ] Anchors follow the `<!-- [feature:name] -->` format and are registered in this guide.
- [ ] README and relevant `AGENTS.md` files refreshed to mention new anchors, modules, or storage keys.
- [ ] `docs/storage-schema.md` regenerated if persisted data changed.
- [ ] Links back to this guide verified.

Keeping these artefacts aligned ensures AI contributors and humans can trace responsibilities without guesswork.
