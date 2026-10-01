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
- `templateKind` is a resource-kind axis, not an experience role. `standard` records are reusable Templates; `case-study` records are Case Studies.
- `src/templateAvailability.js` controls normal-UI visibility by experience role without duplicating this registry: Standalone = standard only, Student = both, Instructor = case-study teaching resources only.
- For Student application, `case-study` resources keep the rotating mode password while `standard` Templates skip password prompts and always load in `full` mode.
- **Security:** Case Study JSON is still compiled into the public static manifest until #295. Role hiding and the rotating password are not confidentiality or authentication controls.
- `state` must satisfy the `SerializedAppState` contract documented in `src/storage.js`.

## Editing Workflow
- After adding or updating JSON files, run `npm run build:templates` to regenerate `src/templates.manifest.js`.
- Keep metadata strings concise; the drawer truncates overly long labels.
