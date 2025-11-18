# Templates Directory Guidelines

## Scope
Applies to all files inside `templates/`.

## JSON Template Structure
- Each file must export a single JSON object with the shape:
  ```json
  {
    "id": "unique-slug",
    "name": "Template Drawer Label",
    "description": "Short description",
    "templateKind": "case-study" | "standard",
    "supportedModes": ["intake", "is-is-not", "dc", "full"],
    "state": { /* SerializedAppState payload */ }
  }
  ```
- `supportedModes` may omit entries that do not make sense for a given template, but it must never be empty.
- `templateKind` controls authentication: `case-study` templates keep the rotating password flow while `standard` templates skip
  password prompts and always load in `full` mode.
- `state` must satisfy the `SerializedAppState` contract documented in `src/storage.js`.

## Editing Workflow
- After adding or updating JSON files, run `npm run build:templates` to regenerate `src/templates.manifest.js`.
- Keep metadata strings concise; the drawer truncates overly long labels.
