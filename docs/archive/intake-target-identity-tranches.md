# Universal Intake target identity (#318) tranche record

> Archived verbatim from `docs/intake-target-identity.md` to keep the active contract short. This is historical delivery evidence, not current requirements. Current state lives in `STATUS.md`.

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

### 318E — integrated acceptance and closeout — complete

Validated acceptance/audit head: `55da51daaf77b31de7218a5d78ca06a75a51444c`.

- snapshot-native current vs immutable checkpoint projection is accepted for static, KT, and dynamic targets;
- projection is non-mutating and preserves checkpoint evidence while current evidence/fingerprints can change independently;
- dynamic Possible Cause collections remain workspace-local: semantically similar causes from different workspaces are not aligned by ordinal position or text;
- real-browser Instructor -> Student dynamic Possible Cause coaching is covered end-to-end;
- Student feedback is read-only, performs no coaching write, survives cause-card DOM rebuild, and reports **Changed since review** against persisted cause identity;
- the same browser flow is covered by the existing serious/critical Axe assertion;
- acceptance exposed a real small-text contrast defect in the Possible Cause editing/testing UI; it was repaired without changing layout/domain/persistence behavior and the accessibility assertion remained enabled;
- full `main -> PR #325` audit confirms no `api/**`, `src/appState.js`, `src/storage.js`, summary/export, collaboration revision, or Intake persistence schema changes;
- coaching continues to use the existing separate class/workspace feedback API and independent feedback revision;
- Standard Template/public-manifest changes are validation-only and do not introduce template-specific target identity;
- staged validation consumes only shared static/KT or family IDs; protected production Case Study content was not added or modified;
- PR base remains the documented merged `main` SHA and there are no unresolved review threads.

Validation:
- repository quality: **346 tests / 345 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **29 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

## Status block at merge time (archived verbatim)

Tracking issue: #318  
Active branch: `feature/universal-intake-target-identity`  
Base: `main` at `273ae6437c0898b9e35778587c7053580db14e22` (PR #324 merge)  
Current tranche: **318E complete — final documentation/review readiness**  
318A validated checkpoint: `5638a8211056954fe29eb1f5892a53517f62f0c7`  
318B GREEN checkpoint: `e716ee1f4933124caa052b1a21cfae097ca8d23e`  
318C implementation/validation head: `052125de3c73c963e91ab1054124983ed87f7403`  
318D GREEN checkpoint: `b312a23a2cc90a6d792d3f4a11ff47024e920ebd`  
318E acceptance/audit head: `55da51daaf77b31de7218a5d78ca06a75a51444c`
