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

| Anchor | Location | Purpose |
| ------ | -------- | ------- |
| `[styles]` | `index.html` | Wraps inline stylesheet placeholders extracted to `styles.css`. |
| `[header]` | `index.html` | Encapsulates the hero title and core metadata fields. |
| `[section:preface]` | `index.html` | Groups the bridge activation and object/deviation inputs managed by `src/preface.js`. |
| `[section:impact]` | `index.html` | Holds impact, containment, and communications fields used in `src/preface.js` and `src/comms.js`. |
| `[section:table]` | `index.html` | Contains the KT IS/IS NOT grid powered by `src/kt.js`. |
| `[section:summary]` | `index.html` | Hosts the generated narrative controlled by `src/summary.js`. |
| `[script:init]` | `index.html` | Marks where boot logic is wired; stays in sync with `main.js`. |
| `[script:storage]` | `index.html` | Notes storage helpers loaded from `src/storage.js`. |

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
