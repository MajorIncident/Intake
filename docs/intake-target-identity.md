# Universal Intake Target Identity

## Status

Tracking issue: #318  
Active branch: `feature/universal-intake-target-identity`  
Base: `main` at `273ae6437c0898b9e35778587c7053580db14e22` (PR #324 merge)  
Current tranche: **318E — integrated acceptance and closeout**  
318A validated checkpoint: `5638a8211056954fe29eb1f5892a53517f62f0c7`  
318B GREEN checkpoint: `e716ee1f4933124caa052b1a21cfae097ca8d23e`  
318C implementation/validation head: `052125de3c73c963e91ab1054124983ed87f7403`  
318D GREEN checkpoint: `b312a23a2cc90a6d792d3f4a11ff47024e920ebd`

This document is the canonical contract for #318. It defines the semantic identity layer that coaching, future staged guidance, and #319 cross-team debrief comparison must share.

## Goal

Create one domain-neutral target system for Intake evidence.

A target identity answers **what part of the learner's reasoning this is**, independent of:
- template name or template ID;
- DOM ID, selector, position, or card order;
- Classroom workspace ID;
- staged-simulation presence;
- coaching feedback state.

Templates remain serialized Intake data. A new Template using existing Intake fields must require no #319-specific wiring.

## Core model

### 1. Static targets

Static targets have one durable domain ID across every Intake, for example:

- `problem.one-line`
- `impact.current`
- `kt.where-location`

A static target definition owns:

- stable `id`;
- human `label`;
- semantic `section`;
- `kind`;
- serialized evidence extractor;
- comparison-safe canonical projection;
- optional DOM rendering hook.

DOM hooks are presentation only. They are never the persistence/debrief identity.

### 2. Dynamic target families

Some reasoning objects are created by the learner and therefore cannot have a globally shared instance ID.

Possible Causes are the first dynamic family.

Each persisted Possible Cause already has a durable `cause.id` that survives normal save/load and does not depend on list position. #318 reuses that lifecycle identity rather than inventing another persisted identifier.

The semantic model is:

- family: `possible-cause`;
- instance identity: persisted `cause.id`;
- coaching target identity: a stable grammar-safe instance target derived from that cause ID;
- comparison family identity: `possible-cause`.

Important: two teams' independently created cause instance IDs do **not** imply that the causes correspond to one another. #319 may compare/display the family as per-team collections, but must not align dynamic instances across teams merely because of list position.

A staged authoring contract may reference the family-level semantic target for guidance. It cannot know a learner-created instance ID in advance.

### 3. Snapshot projection

The universal registry must be able to project evidence directly from a serialized Intake snapshot without mounting the DOM.

This is required for #319 because debrief comparison consumes current or immutable checkpoint snapshots.

A projection should provide enough stable metadata for consumers to render or compare safely, including:

- `id`;
- `familyId` when dynamic;
- label/section/kind;
- normalized evidence;
- a deterministic fingerprint;
- an `empty` signal;
- comparison-safe text/structure.

The projection layer must never mutate the source snapshot.

### 4. Live DOM resolution

Coaching still needs a mounted control/card so Instructor and Student feedback can render in context.

The same target definition may therefore expose a DOM resolver, but:
- target identity comes from the semantic registry;
- DOM resolution is optional;
- snapshot projection must work with no DOM;
- moving markup cannot rename a target.

## Existing target compatibility

The existing coaching target IDs are part of the compatibility contract.

#318 should preserve the current IDs wherever possible:
- 22 static coaching fields;
- KT row IDs derived from stable `ROWS[].id`.

`src/intakeTargets.js` is the semantic source of truth for the current static/KT target registry, snapshot projection, live placement resolution, and evidence fingerprints. `src/coachableFields.js` is a compatibility facade over that module so existing coaching imports and stored target IDs remain stable.

Existing feedback rows must continue to resolve after migration.

## Possible Cause evidence

A Possible Cause instance is a card-level coaching/debrief target in v1.

Its comparison/fingerprint evidence should be derived from persisted reasoning, not card position or presentation state. Include the meaningful cause fields and testing findings; exclude purely presentational flags such as whether the card is currently open/editing.

At minimum the canonical evidence must account for:
- suspect;
- accusation;
- impact;
- summary/hypothesis text when present;
- confidence;
- free-form evidence;
- row-keyed testing findings.

`editing` and `testingOpen` are presentation state and must not make feedback stale.

## Template compatibility and coverage

The target layer must distinguish between:

1. **target-bearing reasoning fields** — must be registered;
2. **workflow/infrastructure state** — explicitly outside coaching/debrief target identity unless later promoted.

Initial target-bearing domains:
- `pre` reasoning fields represented by the current registry;
- `impact` reasoning fields;
- containment action;
- Decision Analysis fields already coachable;
- Potential Problem/Risk fields already coachable;
- KT question rows;
- Possible Cause instances.

Examples of initially excluded workflow/infrastructure state:
- persistence metadata;
- theme;
- bridge role names/timestamps;
- detection/evidence checkboxes;
- communications cadence/log;
- Notes workspace chrome/items;
- checklist/actions workflow state;
- Classroom/session/coaching state.

Coverage must be executable, not prose-only.

Tests/build guards must:
- prove registry IDs are unique and stable;
- prove every static target has both snapshot projection and any required live resolver metadata;
- load every public Standard Template and project it through the target layer;
- reject duplicate/renamed target definitions;
- fail loudly when a new field is added to a target-bearing schema area without a target definition or explicit reviewed exclusion;
- validate staged `intakeTargetIds` against shared static/KT and family semantic IDs.

A new Template using existing fields must pass automatically.

## Coaching contract

Coaching remains a separate Classroom API/persistence channel.

#318 changes target semantics, not that separation:
- coaching feedback never enters `kt-intake-full-v2`;
- feedback revision remains independent from collaboration revision;
- reviewed workspace revision remains evidence context only;
- field/target fingerprint remains change-detection evidence;
- Student feedback is read-only;
- Instructor feedback remains class/workspace authorized.

Dynamic Possible Cause coaching must use the same feedback API and revision semantics as static targets.

## Staged guidance contract

`simulation.stages[].intakeTargetIds` is an optional consumer of the registry.

It must not create a second target namespace.

A staged case may select semantic target IDs to point learners toward relevant work, but:
- no target implies an answer;
- simulation is not required for coaching or #319;
- runtime target metadata remains outside Intake persistence/export/summary;
- dynamic learner-created instance IDs cannot be authored in advance.

#318 should establish shared validation/projection. Rich production staged case work remains deferred under #316/#317.

## #319 contract

#319 must consume this registry rather than templates or DOM.

For static targets:
- compare the same stable target ID across workspace snapshots.

For dynamic families:
- present/compare each workspace's collection;
- preserve instance IDs within a workspace;
- do not equate independent instances by ordinal position.

#319 remains read-only and must not copy, grade, or rewrite Intake state.

## Planned tranches

### 318A — architecture and coverage inventory

- freeze this target/family/snapshot contract;
- inventory current coaching IDs, serialized paths, Possible Cause lifecycle identity, Standard Template coverage, and staged target references;
- record compatibility/failure rules;
- no runtime behavior change.

### 318B — universal static registry and snapshot projection — complete

Implementation checkpoint: `ce5e8bccc12e367e780ad1e31cacb7e713b2a1d4`.

- `src/intakeTargets.js` now owns the domain-neutral static + KT registry;
- every existing coaching target ID and v1 fingerprint contract is preserved;
- static targets project evidence from serialized Intake paths without mounting the DOM;
- KT targets project by durable `questionId`, never serialized row position;
- Decision Analysis and Potential Problem/Risk targets project from their persisted nested structures, including the rollback/contingency fallback semantics;
- projection returns stable label/section/kind metadata, normalized evidence, comparison text, empty state, and deterministic fingerprint;
- live DOM/KT bindings remain optional rendering hooks on the same definitions;
- `coachableFields.js` delegates to the universal module as a compatibility facade;
- `tests/intakeTargets.unit.test.mjs` locks coaching compatibility, uniqueness, snapshot projection, KT row-order independence, nested workflow extraction, and unknown-target behavior;
- dynamic Possible Cause family work was completed in 318C.

### 318C — dynamic Possible Cause target family — complete

Validated runtime/test head: `052125de3c73c963e91ab1054124983ed87f7403`.

- dynamic family `possible-cause` is part of the universal target contract;
- instance target IDs are derived as `possible-cause.<cause.id>` from the already-persisted lifecycle identity;
- malformed/unsupported or duplicate instance IDs fail closed rather than being silently rewritten;
- card-level evidence/fingerprints include persisted reasoning and testing findings while excluding presentation-only `editing` / `testingOpen`;
- finding insertion order and card reorder do not change instance identity;
- snapshot projection exposes family + instance metadata without DOM mounting;
- live resolution maps by persisted `cause.id`, never list position;
- Instructor and Student Classroom coaching use the same existing feedback API/revision channel for dynamic targets;
- coaching panels reattach after Possible Cause card DOM rebuilds through presentation-only `intake:possible-causes-rendered`;
- Student dynamic feedback remains read-only and changed-since-review uses the same deterministic fingerprint contract;
- no coaching/API/storage/revision schema changed.

Validation on the runtime/test head:
- repository quality: **339 tests / 338 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **29 passed / 11 intentional skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 318D — Template/staged compatibility guards — complete

Validated implementation head: `b312a23a2cc90a6d792d3f4a11ff47024e920ebd`.

- every public Standard Template is projected through the universal target layer with no template-specific mapping;
- Standard Template generation runs executable target coverage validation;
- designated target-bearing schema areas fail loudly when a persisted field has neither a stable target definition nor an explicit reviewed exclusion;
- canonical normalized app-state is coverage-tested so future fields in covered reasoning areas cannot silently bypass #319;
- KT rows must resolve to registered `kt.<questionId>` targets;
- Possible Cause lifecycle IDs must be supported and unique for dynamic target projection;
- staged `intakeTargetIds` accept only shared static/KT IDs or registered family IDs such as `possible-cause`;
- learner/workspace dynamic instance IDs are intentionally unauthorable in staged definitions;
- no production Case Study content was added or changed.

Validation:
- repository quality: **345 tests / 344 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **29 passed / 11 intentional skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 318E — integrated acceptance and closeout

- Classroom coaching regression for static + dynamic targets;
- checkpoint/current snapshot projection acceptance for #319 readiness;
- accessibility/browser coverage where dynamic coaching UI changes require it;
- documentation/security/final gates.

## Non-goals

#318 does not:
- build the #319 debrief comparison UI;
- author a production staged Case Study;
- implement #316 protected rich assets;
- move coaching into Intake state;
- create template-specific target mappings;
- create a second Possible Cause persisted ID;
- infer correspondence between different teams' learner-created Possible Causes.

## Cold restart

Read:
- this document;
- issue #318;
- `docs/classroom-workstream.md`;
- `docs/classroom-roadmap.md`;
- root and `src/AGENTS.md`;
- `src/intakeTargets.js`;
- `src/coachableFields.js`;
- `src/classroomCoaching.js`;
- `src/kt.js`;
- `src/appState.js`;
- `src/storage.js`.

Continue the existing #318 branch/PR. Leave a mini milestone after every meaningful sub-slice and before long validation waits.
