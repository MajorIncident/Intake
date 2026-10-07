# Classroom Debrief Comparison Contract

## Status

Tracking issue: #319  
Active branch: `feature/classroom-debrief-comparison`  
Base: `main` at `ef6949100ddac28c646338ee55cb6e7a74beb067` (#318 / PR #325 merge)  
319A architecture checkpoint: `22d5d9ee056f6ddd70f7e5d9a97f2322c5d3c41f`  
319B GREEN implementation head: `c6986b330fab31509c1697b3d77c8a5e907ef279`  
Current tranche: **319C — Instructor-only debrief API**

This document is the canonical architecture contract for #319.

## Goal

Give an Instructor one read-only class debrief/progress surface that can answer:

- which teams are Ready / Working / active;
- which workspaces have a debrief checkpoint;
- how the same stable Intake target differs across teams;
- what changed between the immutable debrief checkpoint and current live Intake;
- where prior coaching exists and whether the reviewed evidence has changed;
- which targets the current staged exercise recommends, when an exercise exists.

The comparison must work for blank Intakes, Standard Templates, future Templates that use existing registered fields, and staged Case Studies.

## Non-negotiable boundaries

#319 is a **derived Instructor read model**, not a second collaboration system.

It must not:

- persist copied live/checkpoint snapshots;
- create a second target registry;
- key comparison identity to Template IDs, DOM IDs/selectors, card order, or workspace order;
- infer that Possible Cause instances from different teams correspond;
- expose another team's Intake or class roster to Students;
- create Student write authority;
- write coaching or Intake state from the comparison surface;
- turn coaching into a numerical grade;
- place comparison selections/state inside `kt-intake-full-v2`, exports, summaries, Standard Templates, or collaboration revisions;
- require a staged exercise in order to compare a class.

## Existing source-of-truth inventory

#319 should compose the following existing sources.

### Class/workspace metadata

`GET /api/classes/workspaces` and the class repository already provide class-scoped:

- workspace public ID;
- team/individual kind and label;
- participant count;
- active participant count;
- editing participant count;
- recent activity metadata.

The Instructor capability is already the authorization boundary.

### Current live Intake

`GET /api/classes/observe?workspaceId=...` already:

- validates the Instructor class capability;
- proves class/workspace ownership;
- resolves the internal collaboration workspace server-side;
- reads the current snapshot/revision/presence;
- never mints an editable Student workspace capability.

The underlying workspace repository is the live snapshot source of truth.

### Immutable debrief checkpoints

The staged exercise repository already stores first-write-wins per-workspace checkpoint snapshots.

Normal exercise reads expose checkpoint metadata only. Explicit checkpoint reads can retrieve snapshot bytes for an Instructor after class/workspace/stage authorization.

Checkpoint snapshots remain historical facilitation evidence and never replace live collaboration state.

### Ready / Working state

The staged exercise repository already stores workspace-scoped readiness plus the workspace revision captured when Ready was marked.

If no staged exercise exists, #319 must still work and simply omit staged readiness/checkpoint context.

### Coaching

`classroom_coaching_feedback` remains a separate Instructor-authored feedback channel.

#319 may summarize existing feedback status/change state, but:

- must not write feedback;
- must not increment feedback revision;
- must not increment collaboration revision;
- must not copy coaching into Intake state;
- should prefer compact status/change metadata in the comparison response and leave full note editing to the existing observer/coaching UI.

### Universal Intake targets

`src/intakeTargets.js` from #318 is the only semantic comparison contract.

For static/KT targets:
- compare the same stable target ID across workspace snapshots.

For dynamic families:
- Possible Causes use family `possible-cause`;
- preserve per-workspace instance IDs;
- render each team's collection independently;
- never align instances across teams by list position, similar text, or coincidental instance ID.

Projection must use `projectIntakeTargets()` / family-aware projection from serialized snapshots without mounting the DOM.

## Planned server read model

Add one Instructor-only, GET-only comparison endpoint:

`GET /api/classes/debrief`

Authorization:
- requires the Instructor class capability;
- resolves exactly that represented class;
- returns 404-style non-enumerating failure for unrelated/revoked class state;
- accepts no Student, assignment, collaboration, or workspace-edit capability.

The endpoint is a **derived response only**. It does not create a persistence table.

Recommended response shape:

```json
{
  "class": {
    "id": "class-public-id",
    "title": "Problem Solving 101",
    "expiresAt": "..."
  },
  "exercise": {
    "id": "exercise-public-id",
    "status": "active",
    "currentStageId": "stage-1",
    "stagePhase": "debrief",
    "recommendedTargetIds": ["problem.one-line", "kt.where-location", "possible-cause"]
  },
  "workspaces": [
    {
      "id": "workspace-public-id",
      "kind": "group",
      "label": "Team Alpha",
      "participantCount": 4,
      "activeParticipantCount": 2,
      "editingParticipantCount": 0,
      "lastSeenAt": "...",
      "ready": {
        "readyForDebrief": true,
        "workspaceRevision": 12
      },
      "current": {
        "workspaceRevision": 14,
        "updatedAt": "...",
        "targets": []
      },
      "checkpoint": {
        "stageId": "stage-1",
        "workspaceRevision": 12,
        "capturedAt": "...",
        "targets": []
      },
      "coaching": []
    }
  ]
}
```

Rules:

- `exercise` is nullable for an ordinary live class.
- `ready` and `checkpoint` are nullable when staged state does not exist.
- `current.targets` and `checkpoint.targets` contain comparison-safe #318 projections, not raw snapshots.
- static/KT targets include stable ID/label/section/kind/evidence/comparisonText/empty/fingerprint.
- dynamic targets additionally include `familyId` and `instanceId`.
- the response contains no Instructor token, Student token, assignment token, collaboration token, internal database/workspace ID, or editable authority.
- checkpoint snapshot bytes are consumed server-side for projection and are not returned raw.
- current raw snapshots are consumed server-side for projection and are not returned raw.
- no response field is written back into Intake persistence.
- endpoint responses are private/no-store and no-referrer like existing capability-bearing Classroom reads.

## Why one aggregate endpoint

The existing single-workspace observer remains the correct drill-down surface.

The comparison surface, however, must scale to a class without making the browser serially open every workspace and checkpoint. A class-scoped aggregate read:

- keeps authorization and cross-class isolation server-side;
- avoids N browser-held raw snapshots;
- avoids minting new workspace authority;
- projects only the evidence needed for comparison;
- can fetch existing live/checkpoint/coaching/readiness sources without duplicating them;
- keeps #319 independent from DOM/template structure.

The endpoint should reuse existing repository primitives where possible and add narrow class-batch reads only when repeated per-workspace repository calls would be wasteful.

## Comparison semantics

### Progress summary

Each workspace gets one compact progress record:

- Team / Individual label;
- member count;
- active/editing signal;
- Ready / Working / no staged signal;
- checkpoint captured/not captured + revision when available;
- current live revision;
- compact coaching counts such as Meets standard / Needs improvement / Changed since review.

These are facilitation signals, not grades.

### Selected target matrix

The Instructor chooses one or more semantic targets.

Desktop:
- workspaces form columns;
- selected targets form rows;
- each cell shows comparison-safe evidence;
- checkpoint/current mode is explicit;
- differences may be visually highlighted using fingerprints, but no score is calculated.

Narrow screens:
- avoid a giant horizontal table;
- show one selected target at a time with stacked workspace cards;
- preserve the same target/workspace semantics and keyboard order.

### Checkpoint vs current

For a workspace with a checkpoint:

- **Checkpoint** means immutable evidence captured at debrief start.
- **Current** means latest live collaboration snapshot.
- if fingerprints differ, show a neutral **Changed since checkpoint** signal;
- absence of a checkpoint is shown honestly, never synthesized from current state.

The comparison surface never overwrites or applies either snapshot to another team.

### Dynamic Possible Causes

When `possible-cause` is selected:

- each workspace cell/card renders that workspace's Possible Cause collection;
- preserve each projection's instance ID only inside that workspace;
- do not pair Team A cause 1 with Team B cause 1;
- do not pair causes by normalized text;
- allow drill-down to the existing workspace observer rather than inventing cross-team matching.

## Coaching summary semantics

For each workspace/target with existing Instructor feedback, the derived comparison response may include:

- target ID;
- status;
- feedback revision;
- reviewed workspace revision;
- whether the currently projected fingerprint differs from the reviewed fingerprint.

The matrix may show status/change badges.

Do not:
- expose an aggregate score;
- sort/rank teams by coaching status;
- edit coaching from the comparison matrix in v1;
- return full coaching notes unless a later explicit UX need justifies it.

Existing in-context coaching remains the editing surface.

## Staged recommendations

When a represented staged exercise has a current stage with authored `intakeTargetIds`:

- surface those shared static/KT/family IDs as **recommended targets**;
- they may preselect or prioritize the target picker;
- they are guidance only and never answer/grade learner work;
- a family ID such as `possible-cause` selects the per-workspace collection;
- learner-created dynamic instance IDs remain unauthorable;
- an ordinary class with no exercise still exposes the full registered target picker.

## Client ownership

Create a dedicated module, expected name:

`src/classroomDebriefComparison.js`

It should own:
- loading/refreshing the derived Instructor response;
- target selection/filtering;
- checkpoint/current presentation mode;
- progress and matrix rendering;
- drill-down callback into the existing `classroomInstructor.selectWorkspace()`;
- presentation-only local UI state.

It must not:
- call `applyAppState()` for comparison cells;
- own Instructor capability persistence;
- edit Student Intake/coaching;
- create a second observer;
- persist comparison selections into Intake state.

The existing observer remains the drill-down view.

## API/client lifecycle

Suggested lifecycle:

```text
Instructor class connected
  -> load normal roster/workspaces
  -> load debrief comparison
  -> project progress + target matrix
  -> periodic/manual refresh
  -> select workspace
      -> existing Instructor observer/coaching path

if staged exercise exists
  -> comparison response may include current-stage recommendations/readiness/checkpoints
  -> no exercise required for current-live comparison
```

Refresh must fail closed on rotated/revoked Instructor authority and must never replay a mutation because #319 has no mutation route.

## Testing contract

### Domain / projection

Prove:
- static/KT target identity is stable across teams/templates;
- checkpoint and current projections are non-mutating;
- empty evidence is represented explicitly;
- dynamic Possible Causes remain separate collections;
- no ordinal/text-based cross-team dynamic pairing exists.

### API/security

Prove:
- Instructor capability can read only its represented class;
- Student/join/assignment/workspace capabilities cannot call the debrief endpoint;
- cross-class workspace/checkpoint data cannot leak;
- no editable capability is returned;
- response contains projections, not raw current/checkpoint snapshots;
- endpoint is GET-only and no-store/no-referrer;
- no persistence/revision mutation occurs.

### Template compatibility

Reuse #318 executable coverage:
- every Standard Template projects through the same target layer;
- no #319 template-specific map exists;
- target-bearing schema changes still fail loudly through #318 guards.

### Browser/accessibility

Prove:
- Instructor can open class debrief comparison from a live class;
- progress records render multiple teams;
- target selection compares teams;
- checkpoint/current switching shows real differences;
- staged recommended targets are additive, not required;
- workspace drill-down reuses existing observer;
- Student UI has no class-comparison surface/route access;
- desktop and narrow layouts pass serious/critical Axe checks;
- keyboard users can select targets, switch evidence mode, and open a workspace.

## Planned tranches

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

### 319C — Instructor-only debrief API

- add GET-only `/api/classes/debrief` inside the consolidated Classroom function/router;
- reuse/add narrow class-batch repository reads;
- authorize only the Instructor capability;
- return comparison projections, not raw snapshots/edit authority;
- add API/security/cross-class tests.

### 319D — Instructor progress + target comparison UI

- add the dedicated comparison module and Instructor shell surface;
- render progress summary and target picker;
- desktop matrix + narrow stacked representation;
- current-live comparison first;
- reuse existing observer for drill-down.

### 319E — checkpoint/staged/coaching integration

- explicit checkpoint/current mode;
- staged target recommendations;
- coaching status/changed-since-review badges;
- preserve ordinary non-staged class behavior.

### 319F — integrated browser/accessibility/security closeout

- multi-team real-browser acceptance;
- Student non-exposure;
- keyboard/mobile/Axe coverage;
- full persistence/summary/export/security audit;
- exact-head repository/browser/security/template gates;
- final docs/review readiness.

## Rollback

#319 should remain additive:

- removing the comparison client/route must leave existing class roster, observer, coaching, staged simulation, and Student editing unchanged;
- no schema rollback should be required because #319 introduces no new persistence model;
- existing observer/checkpoint/coaching endpoints remain valid independent drill-down surfaces.

## Cold restart

Read:
- this document;
- issue #319;
- `docs/intake-target-identity.md`;
- `docs/classroom-workstream.md`;
- `docs/classroom-roadmap.md`;
- `docs/classroom-api.md`;
- root, `src/AGENTS.md`, and `api/AGENTS.md`;
- `src/intakeTargets.js`;
- `src/classroomInstructor.js`;
- `src/classroomExerciseInstructor.js`;
- existing Classroom coaching modules;
- the consolidated Classroom router/server modules.

Continue the existing #319 branch/PR. 319A/B are complete; begin 319C with the Instructor-only derived debrief API. Leave a mini milestone after every meaningful sub-slice and before long validation waits.
