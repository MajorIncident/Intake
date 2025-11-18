## Template payloads and drawer workflow

The storage schema documentation doubles as the contract for curated template payloads. Templates are authored as JSON files under `templates/`, then compiled into `src/templates.manifest.js` via `npm run build:templates`. The runtime drawer (`src/templates.js`) hydrates that manifest, normalises each template's stored `SerializedAppState`, and projects a payload per mode so the UI can safely prefill new intakes.

### Authoring checklist

1. Start from an existing template JSON file so required keys (`id`, `name`, `description`, `templateKind`, `supportedModes`, and `state`) stay in place.
2. Ensure `state` mirrors the fields listed above, including nested objects for `pre`, `impact`, `ops`, `steps`, and `actions`.
3. Keep drawer labels short—the template list truncates anything overly long.
4. Run `npm run build:templates` after editing JSON so `src/templates.manifest.js` refreshes.
5. Run `npm run update:storage-docs` to verify new fields are documented.

### Drawer workflow

- `src/templates.js` normalises template payloads, guaranteeing arrays are cloned and booleans such as `steps.drawerOpen` default to `false`.
- Mode projections enforce the `MODE_RULES` contract—fields hidden in a mode are reset to safe defaults before the drawer sends state to the app. The KT table honours the same per-column `tableFields` map so IS / IS NOT only prefills IS/IS NOT, D&C adds distinctions/changes while keeping causes/actions empty, and Full exposes all rows plus actions.
- Actions and steps collections are scrubbed before exposure so tests and runtime code can assume they conform to the schema defined above.

Keeping these guardrails in the appendix allows future guidance for template authors to live beside the generated schema without being overwritten each time the docs regenerate.
