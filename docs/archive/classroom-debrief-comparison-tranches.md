# Class debrief comparison (#319) tranche record

> Archived verbatim from `docs/classroom-debrief-comparison.md` to keep the active contract short. This is historical delivery evidence, not current requirements. Current state lives in `STATUS.md`.

### 319A — architecture and source inventory

- freeze this contract;
- inventory existing workspace/live/checkpoint/readiness/coaching sources;
- decide aggregate read model and no-persistence boundary;
- update roadmap/workstream/issue/PR;
- no runtime behavior change.

### 319B — derived comparison model — complete

Validated implementation head: `c6986b330fab31509c1697b3d77c8a5e907ef279`.

Implemented `src/classroomDebriefModel.js`:
- pure DOM/network/persistence-free comparison model;
- projects already-authorized current and immutable checkpoint snapshots through `projectIntakeTargets()`;
- preserves current/checkpoint workspace revisions and checkpoint metadata without returning raw snapshot copies;
- derives Ready/Working metadata without inventing a signal when none exists;
- summarizes coaching as neutral Meets standard / Needs improvement / Changed since review counts and per-target metadata while deliberately omitting coaching notes;
- filters staged recommendations through `isAuthorableIntakeTargetId()`, so static/KT/family IDs are accepted and runtime dynamic instance IDs are rejected;
- static/KT semantic selection returns at most one projection per workspace;
- family selection returns each workspace's independent dynamic collection and never aligns Possible Causes by text/order/instance ID across teams;
- source snapshots are not mutated.

Focused unit coverage proves:
- static + KT current/checkpoint projection;
- source non-mutation;
- honest missing-checkpoint behavior;
- dynamic Possible Cause per-workspace independence even when teams use identical wording;
- coaching changed-since-review semantics with aggregate-note exclusion;
- staged recommendation filtering;
- runtime dynamic instance IDs cannot become cross-team semantic selector IDs.

Validation:
- repository quality: **352 tests / 351 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **29 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 319C — Instructor-only debrief API — complete

Validated implementation head: `676ccbc963fb60c59851e3beda5962f2fdaa9ca5`.

Implemented:
- GET-only `/api/classes/debrief` inside the existing consolidated Classroom function/router; no new Vercel function was created;
- Instructor class capability is the only authority accepted by the route;
- class-scoped batch repository reads load current collaboration snapshots, compact coaching metadata, staged readiness, and current-stage checkpoint snapshots without browser-side N-workspace raw snapshot polling;
- raw live/checkpoint snapshots are consumed only server-side and projected through the 319B model before response;
- aggregate response excludes raw `snapshot` objects, coaching notes, internal workspace IDs, Student/assignment/join/collaboration capabilities, and editable authority;
- endpoint creates no persistence table and exposes no mutation method;
- ordinary classes with no current non-completed staged exercise still return current-live comparison; staged readiness/checkpoint context is nullable rather than synthesized;
- current staged debrief checkpoint snapshots are loaded with a class-scoped batch read rather than one explicit checkpoint request per workspace;
- the route is wired through `api/_classroomRouter.js` and `vercel.json` while preserving the existing Serverless Function budget.

Focused API/security coverage proves:
- projection-only aggregate response and private `no-store` / `no-referrer` headers;
- GET-only behavior rejects writes before repository access;
- current staged readiness plus immutable checkpoint projection;
- Student join, assignment/workspace, and legacy collaboration capabilities cannot read the comparison;
- valid Instructor authority receives only its represented class;
- Vercel rewrite/function-budget regression includes the new route.

Validation:
- repository quality: **355 tests / 354 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **29 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 319D — Instructor progress + target comparison UI — complete

Validated implementation head: `54845e82e71c69b471019d6f24f01b36d1077894`.

Implemented:
- new `src/classroomDebriefComparison.js` presentation-only controller consuming GET-only `/api/classes/debrief`;
- dedicated **Class debrief comparison** surface in the wide Instructor Intake area, separate from the fixed class rail;
- compact workspace progress cards plus semantic Intake target picker;
- current-live evidence matrix on desktop and single-column stacked workspace cards on narrow screens;
- static/KT target selection by shared semantic target ID and dynamic `possible-cause` family selection without cross-team instance alignment;
- progress/evidence **Observe** actions delegate to the existing `classroomInstructor.selectWorkspace()` read-only observer rather than applying aggregate comparison snapshots into Intake;
- comparison controls remain interactive while the observed Intake DOM stays read-only;
- comparison target state/cached model remain in memory only: no localStorage/sessionStorage key, Intake state, export, summary, Template, or collaboration revision participation;
- refresh/loading/error handling plus periodic GET refresh;
- deterministic browser fixture serves the real 319B model shape for the comparison endpoint;
- desktop comparison stays side-by-side, mobile stacks cleanly, and the page has no horizontal overflow;
- fixed a pre-existing content-box overflow on the global `.menu-bar` revealed by the new desktop acceptance test.

Focused coverage proves:
- target picker contains shared static/KT/family IDs but no runtime Possible Cause instance IDs;
- Instructor bearer authority is sent only to the debrief GET;
- live progress/evidence render correctly and dynamic Possible Cause collections remain per-workspace;
- observer drill-down works without persisting comparison state;
- transient refresh failures remain read-only/retryable;
- Instructor observer read-only projection excludes comparison controls;
- desktop/mobile browser journey covers target switching, observer drill-down, no debrief persistence key, responsive layout, and Axe serious/critical checks.

Validation:
- repository quality: **359 tests / 358 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **31 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 319E — checkpoint/staged/coaching integration — active

#### 319E-A — staged target recommendations — complete

Validated implementation head: `dd0f3d28f2741c89c714e0c23a8a475acbdc8de3`.

- extracted the staged simulation fingerprint into shared server-only `api/_classroomSimulation.js`, preserving the existing exercise export/contract;
- current-stage authored `intakeTargetIds` are derived from the existing protected Case Study manifest only when the exercise's stored simulation version **and fingerprint** still match the governed definition;
- definition drift, missing/non-staged cases, and missing stages fail closed to **no recommendations**;
- `/api/classes/debrief` passes the authored IDs through the 319B model, which still filters unknown/runtime-dynamic IDs through the universal target registry;
- recommendations remain advisory metadata only and do not affect authorization, scoring, editing, or target availability;
- ordinary non-staged classes continue to return an empty recommendation list.

Validation:
- repository quality: **361 tests / 360 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **31 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

#### 319E-B — explicit evidence mode + staged readiness — complete

Validated implementation head: `0121a6f4a657c030c56144af3616ff9167ac310c`.

- added presentation-only **Current / Checkpoint** mode only when at least one current-stage immutable checkpoint exists;
- checkpoint mode uses the 319B selector and reports **Checkpoint unavailable for this workspace** rather than falling back to live evidence;
- staged Ready / Working replaces ordinary activity wording only when staged readiness metadata exists; mixed/unknown stage state remains explicit;
- ordinary non-staged classes retain Active / Editing / revision presentation;
- stage-focus recommendations remain advisory target shortcuts and do not constrain the target picker;
- observer drill-down always opens the current live Intake, including from checkpoint comparison;
- target/mode state remains memory-only and resets safely if a later refresh has no checkpoint evidence;
- desktop/mobile browser acceptance covers staged recommendations, readiness, mode switching, and current-live drill-down.

Validation:
- repository quality: **363 tests / 362 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **31 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

#### 319E-C — coaching integration — complete

Validated implementation head: `0a83f4c26a462d663e346c2a024a42fb43f9b31a`.

- renders coaching status beside the exact reviewed evidence projection;
- static/KT evidence matches coaching by stable semantic target ID;
- dynamic Possible Causes match only their workspace-local runtime instance target ID, preserving cross-team independence;
- neutral badges show **Meets standard**, **Needs improvement**, and optional **Changed since review** only;
- coaching notes remain excluded from the aggregate response/presentation and are never surfaced in comparison;
- checkpoint mode labels coaching as **Current coaching** because changed-since-review is intentionally derived against current live evidence, not the historical checkpoint;
- no grades, rankings, combined team score, or comparative judgment is calculated;
- existing Instructor coaching remains the write/edit surface; the comparison remains read-only.

Validation:
- repository quality: **363 tests / 362 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **31 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

### 319F — integrated browser/accessibility/security closeout — complete

Validated implementation head: `1af0e13077c1ff75021ce782bcf798b15e8af150`.

Closeout evidence:
- multi-team real-browser comparison is covered on desktop and responsive mobile, including target switching and observer drill-down;
- staged recommendations, Ready / Working state, explicit Current / Checkpoint mode, checkpoint-unavailable behavior, and coaching badges are exercised in browser/feature coverage;
- Student browser sessions explicitly prove the Instructor comparison remains hidden and **never request** `/api/classes/debrief`;
- server/API coverage independently proves Student/join/assignment/workspace capabilities cannot read the aggregate route;
- keyboard/focus behavior uses native select/buttons plus focus-visible styling, and browser acceptance runs Axe with no serious/critical violations;
- comparison controls remain interactive while the selected Student Intake remains observer-read-only;
- a static architecture guard proves `classroomDebriefComparison.js` has no Intake app-state, storage, file-transfer, localStorage/sessionStorage, collect/apply, summary, or export dependency;
- comparison root and interactive controls remain explicitly `data-persistence="local-only"` and `data-summary="exclude"`;
- `main.js` gives the comparison controller only Instructor lifecycle authority plus existing observer navigation, never Student lifecycle or Intake save/apply callbacks;
- no new persistence table, editable capability, score/rank calculation, raw snapshot response, coaching-note exposure, or template-specific map was introduced;
- PR #326 remained mergeable with no unresolved review threads before the final documentation pass.

Validation:
- repository quality: **366 tests / 365 pass / 0 fail / 1 intentional skip**;
- Browser E2E: **31 passed / 11 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: **green**.

#319 implementation is complete. Do not begin #316/#317 or unrelated Classroom work on this branch. The only remaining action is final PR review/merge, followed by the normal merged-main publication/verification workflow if approved.

## Status block at merge time (archived verbatim)

Tracking issue: #319  
Active branch: `feature/classroom-debrief-comparison`  
Base: `main` at `ef6949100ddac28c646338ee55cb6e7a74beb067` (#318 / PR #325 merge)  
319A architecture checkpoint: `22d5d9ee056f6ddd70f7e5d9a97f2322c5d3c41f`  
319B GREEN implementation head: `c6986b330fab31509c1697b3d77c8a5e907ef279`  
319C GREEN implementation head: `676ccbc963fb60c59851e3beda5962f2fdaa9ca5`  
319D GREEN implementation head: `54845e82e71c69b471019d6f24f01b36d1077894`  
319E-A GREEN implementation head: `dd0f3d28f2741c89c714e0c23a8a475acbdc8de3`  
319E-B GREEN implementation head: `0121a6f4a657c030c56144af3616ff9167ac310c`  
319E-C GREEN implementation head: `0a83f4c26a462d663e346c2a024a42fb43f9b31a`  
319F GREEN implementation head: `1af0e13077c1ff75021ce782bcf798b15e8af150`  
Status: **implementation complete — pending PR #326 merge review**
