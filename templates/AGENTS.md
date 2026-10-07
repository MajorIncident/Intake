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
- Standard Template state is also checked by the universal Intake target coverage guard. Fields added inside designated target-bearing reasoning areas must register one stable target definition or an explicit reviewed workflow/infrastructure exclusion; do not add template-specific debrief mappings.

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



## Optional staged simulation definition (#313)

A protected `case-study` may later add a server-only `simulation` object validated by `scripts/build-templates-manifest.mjs`. Standard Templates must not use this field.

Keep three concepts separate:
- `state` — complete protected source/exemplar Intake payload;
- `simulation.studentContent` — only content blocks eligible for controlled Student release;
- `simulation.instructorContent` — facilitation/debrief/model material that Student endpoints must never return.

`simulation.stages` references stable content IDs. Stage/content IDs must be unique and cross-references valid. Future-stage Student content must remain server-gated, not preloaded into browser assets. `simulation.stages[].intakeTargetIds` must come from the universal Intake target namespace: registered static/KT IDs or registered family IDs such as `possible-cause`. Never author learner/workspace-specific dynamic instance IDs such as `possible-cause.<cause.id>`.

Do not infer or fabricate official stage boundaries from a completed `state`. Until authoritative case pages/evidence/facilitation material is supplied and reviewed, use synthetic staged definitions only in deterministic tests/fixtures rather than production authored Case Studies.

Read `docs/classroom-staged-simulation.md` for the full lifecycle and authorization contract before adding or editing staged content.

## Editing Workflow
1. Edit/add the authored JSON under `templates/`.
2. Run `npm run build:templates`.
3. Run `npm run verify:protected-cases`.
4. Run `npm run quality` before PR handoff.
5. Commit the authored JSON **and both generated manifests** together.

Keep metadata strings concise; the drawer truncates overly long labels.
