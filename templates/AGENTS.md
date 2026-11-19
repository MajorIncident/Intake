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

## Complete Case Study authoring (product-owner decision, 2026-11-19)

**Required before authoring a KT official case:** follow [the step-by-step writing playbook](../docs/playbooks/author-kt-case-study.md) and [the complete field/source mapping](../docs/case-study-authoring.md). Those documents bind the Skill invocation/installation, KT source-repo retrieval, evidence precedence, impact-question meanings, allowable inferences, learner/final views, manifest/test gates and corrected Red Sweat #349 example. Do not begin from a generic model draft.

- Treat each Case Study's `state` as the **complete worked reference/exemplar**, not a learner-stage fragment. Populate every relevant `SerializedAppState` bucket as fully as source evidence permits: preface/evidence and impact, operations, WHAT/WHERE/WHEN/EXTENT IS / IS NOT and Distinctions/Changes, complete causal mechanisms, pair-by-pair cause test findings and explicit assumptions, Most Probable Cause versus confirmed True Cause, steps, actions/verification, handover, and (where contextually applicable) Major Incident Decision Analysis and Potential Problem Analysis. Include `appearance` and `notesWorkspace` when useful.
- **Author against the full Major Incident Management field surface** even if a case is pedagogically used in **General** Intake. For a non-incident KT PA, preserve `state.meta.intakeMode: "general"` so application opens in its appropriate lens; General hides Major Incident-only DOM groups but the authored full state remains available for the MIM view and Final debrief. Do not switch a historical non-MIM case into Major Incident solely to maximize visible fields.
- **Use the official KT case solution as the preferred answer.** Only fill gaps from the current generic KT process guidance, keeping inferred mechanisms and required assumptions separate from case facts. Do not add fictional Major Incident operations, extra Decision/Potential Problem Analyses, response actions, roles or invented metrics merely to occupy more fields. Unknown and inapplicable fields stay blank. Keep a single concise source note if needed; avoid repeated provenance disclaimers in every visible field. The three Impact inputs are **current impact** (who cannot do what now, without inventing inability), **future impact** (what could worsen), and **timeframe** (next deadline or consequential event). An observed symptom-onset time belongs in PA WHEN, not automatically in the Impact timeframe. Never invent named responders, dates, severity, impact counts, executed tests, approval authority, or medical effects.
- Each Possible Cause must describe a plausible mechanism and be destructively tested against **every supported factual close IS/IS NOT pair**. Label missing role/aircraft/route exposure details as assumptions, not natural explanations. Invalid pseudo-IS-NOT placeholders must not appear as factual comparators. Most Probable Cause prioritizes confirmation; confirmed True Cause needs evidence and a clearly distinct historical outcome or confirmation plan.
- Standalone **Intake → IS / IS NOT → D&C → Full** are the existing template projections; **Full is the final worked answer**. They are not the live class's server-controlled release schedule. Case Study actions and containment/debrief fields are omitted from introductory projections; Standard Templates retain their previous behavior. Classroom progression, authorization, evidence release, and optional `simulation` definitions stay owned by the existing staged-exercise system; **do not write a separate reveal engine into each Case Study**.
- All future Case Study PRs need regression tests for source completeness, mode projection, full round-trip of MIM-only buckets, and no early view exposing answer-key actions/confirmation. Richness is judged by case/source suitability; a non-applicable field can remain blank without reducing correctness.

## Security boundary

Authored JSON is build-time source, not a production static asset.

`npm run build:templates` validates **all** authored JSON and generates two explicit boundaries:

- `src/templates.manifest.js` — public browser manifest containing Standard Templates only, plus the temporary Standalone allowlist below;
- `api/protected-case-studies.manifest.js` — server-only Case Study metadata + payloads.

Never copy a Case Study into `src/templates.manifest.js`, `src/`, `main.js`, `components/`, or another browser-delivered file. Never import the server-only manifest from browser code.

`.vercelignore` excludes `templates/*.json` from deployment, and production uses the committed generated manifests. `npm run verify:protected-cases` checks that authored JSON stays excluded and protected Case Study IDs/names do not leak into public browser runtime assets.

Role policy remains separate from confidentiality:
- Standalone: public Standard Templates only, plus the temporary Standalone allowlist below;
- Student: public Standard Templates plus authorized protected Case Studies;
- Instructor: authorized protected Case Studies as teaching resources.

The rotating Case Study mode password is pedagogy only. Authorization comes from the active classroom capability.



## TEMPORARY: Case Studies in Work independently

Approved by the product owner on 2026-11-19 until the Student/Instructor experiences fully replace self-study.

- `scripts/standalone-public-case-studies.mjs` lists the Case Study IDs that are **also** published to the public manifest (currently Microcomputer Cabinets, Paytrix, Mrs Walthers Sugar Donuts, Tamworth Petrochemical, Red Sweat Mystery).
- Work independently lists them and applies the public copy behind the per-minute mode password (`<mode><minute>`, e.g. `full07`) — the pre-#299 behaviour. Connected Students/Instructors still receive them through the server-gated Classroom API.
- Consequence: those cases and their answers are downloadable from the deployed site. The mode password is pedagogy, not protection.
- Guards: only listed IDs may appear in the public manifest or `dist/`; a Case Study with a staged `simulation` can never be listed; `simulation` is never copied publicly.
- **To end the transition:** empty the list, run `npm run build:templates`, commit both manifests, and run `npm run quality`. Standalone automatically returns to Templates only.

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
