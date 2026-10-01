# Templates Directory Guidelines

## Scope
Applies to all authored JSON files inside `templates/`.

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
- `supportedModes` may omit entries that do not make sense for a resource, but it must never be empty.
- `templateKind` is a resource-kind axis, not an experience role. `standard` records are reusable Templates; `case-study` records are protected teaching resources.
- `state` must satisfy the `SerializedAppState` contract documented in `src/storage.js`.

## Security boundary

Authored JSON is build-time source, not a production static asset.

`npm run build:templates` validates **all** authored JSON and generates two explicit boundaries:

- `src/templates.manifest.js` — public browser manifest containing Standard Templates only;
- `api/protected-case-studies.manifest.js` — server-only Case Study metadata + payloads.

Never copy a Case Study into `src/templates.manifest.js`, `src/`, `main.js`, `components/`, or another browser-delivered file. Never import the server-only manifest from browser code.

`.vercelignore` excludes `templates/*.json` from deployment, and production uses the committed generated manifests. `npm run verify:protected-cases` checks that authored JSON stays excluded and protected Case Study IDs/names do not leak into public browser runtime assets.

Role policy remains separate from confidentiality:
- Standalone: public Standard Templates only;
- Student: public Standard Templates plus authorized protected Case Studies;
- Instructor: authorized protected Case Studies as teaching resources.

The rotating Case Study mode password is pedagogy only. Authorization comes from the active classroom capability.

## Editing Workflow
1. Edit/add the authored JSON under `templates/`.
2. Run `npm run build:templates`.
3. Run `npm run verify:protected-cases`.
4. Run `npm run quality` before PR handoff.
5. Commit the authored JSON **and both generated manifests** together.

Keep metadata strings concise; the drawer truncates overly long labels.
