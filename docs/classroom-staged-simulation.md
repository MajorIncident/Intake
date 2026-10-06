# Classroom Staged Simulation and Debrief Contract

## Purpose

This document is the canonical architecture/server contract for #313 — Instructor-orchestrated Case Study simulation and staged debrief.

#313 builds directly on the merged #312 live-class substrate at `b141d55050207e4cf7ce842a4452a220a5268968`.

The target experience is a facilitated class, not a self-paced LMS:

```text
Instructor starts/resumes live class
  -> selects a staged Case Study
  -> starts Stage 1
  -> Students receive only released case material
  -> teams reason and document in the same Intake
  -> teams may mark Ready for debrief
  -> Instructor observes/coaches
  -> Instructor begins debrief
  -> optional server-enforced edit freeze
  -> immutable pre-debrief checkpoints preserve team work
  -> Instructor facilitates discussion / teaching points
  -> Instructor advances the whole class
  -> newly released material appears automatically
  -> same Intake continues across stages
  -> final debrief / completion
```

The Instructor controls major transitions. Student/team work remains local to each authorized collaboration workspace.

## Scope of #313

Own:
- class-level exercise lifecycle;
- current stage and phase;
- server-gated progressive release of protected Case Study material;
- Instructor-only facilitation/debrief material;
- Student stage-aware case reference UI;
- team readiness and debrief checkpoints;
- optional server-enforced Student edit freeze;
- Instructor exercise console and progress signals;
- late-join and reassignment behavior;
- staged browser/security/accessibility acceptance.

Do not turn Intake into:
- a graded LMS;
- a general course-authoring system;
- an account/identity platform;
- a second collaboration engine;
- a place where Instructor-only solution material is serialized into Student Intake.

## Relationship to #312

#312 remains authoritative for:
- class identity;
- Instructor capability;
- human Student join code;
- Student class-session capability;
- Waiting / assignment state;
- team/individual workspaces;
- assignment-specific editable workspace capabilities;
- reassignment/unassign revocation;
- collaboration snapshots/revisions/presence;
- read-only Instructor observation;
- field-level coaching.

#313 layers exercise orchestration over those primitives. It must not reinterpret or duplicate them.

## Non-negotiable security invariants

1. Future-stage Student content is withheld **server-side**. It must not be sent to the browser and hidden with CSS, `hidden`, disabled controls, or client-side filtering.
2. Instructor facilitation notes, teaching points, model/exemplar reasoning, and answer material are never returned by Student endpoints unless a future explicit release action authorizes a specifically Student-safe item.
3. A human class join code is never exercise authorization.
4. A Student class-session capability may read only the represented Student's class-level exercise state/released Student material. It may not enumerate teams, classmates, Instructor notes, or future content.
5. Student workspace edit capability continues to authorize only the current collaboration workspace. It does not grant stage-control authority.
6. Student cannot start, pause, resume, debrief, advance, complete, or release exercise content.
7. Instructor may control only the class represented by the Instructor capability.
8. Exercise state is separate from `kt-intake-full-v2`, collaboration snapshot state, coaching state, exports, templates, and summaries.
9. Reassignment never copies/merges Intake snapshots and never carries team readiness/checkpoint state from the old workspace to the destination workspace.
10. Protected authored Case Study source and staged content remain absent from public browser/static assets.
11. Standalone remains backend-optional and unaffected.
12. Existing non-staged protected Case Study behavior remains compatible unless the represented class has an active staged exercise for that Case Study.

## Critical protected-content decision

The current #295 Case Study record contains a complete protected `state` suitable for applying a full Case Study/teaching artifact. For staged simulation this complete payload must be treated as **source/exemplar material**, not as the Student progressive-disclosure feed.

A staged Case Study must therefore have an explicit server-only simulation definition. Do **not** infer stages automatically from the filled `state`, and do not invent stage boundaries for official cases without authoritative case material.

Recommended authored shape for a `case-study` record:

```json
{
  "id": "case-id",
  "name": "Case name",
  "description": "Short teaching description",
  "templateKind": "case-study",
  "supportedModes": ["intake", "is-is-not", "dc", "full"],
  "state": { "...": "complete protected source/exemplar Intake" },
  "simulation": {
    "version": 1,
    "studentContent": [
      {
        "id": "briefing-1",
        "kind": "narrative",
        "title": "Initial briefing",
        "body": "Student-safe content"
      }
    ],
    "instructorContent": [
      {
        "id": "teach-1",
        "kind": "facilitation",
        "title": "Stage 1 teaching points",
        "body": "Instructor-only content"
      }
    ],
    "stages": [
      {
        "id": "stage-1",
        "title": "Clarify the situation",
        "studentObjective": "What the learner is trying to accomplish, without giving the answer.",
        "initialReleaseIds": ["briefing-1"],
        "optionalReleaseIds": [],
        "intakeTargetIds": ["problem.one-line"],
        "suggestedMinutes": 15,
        "instructorContentIds": ["teach-1"],
        "defaultDebriefEditPolicy": "frozen"
      }
    ]
  }
}
```

This is a contract shape, not permission to author official case staging from guesses. Production staged definitions should be source-faithful and explicitly reviewed.

### Student content block types

Start with a small allowlist rather than arbitrary HTML:
- `narrative` — titled plain/rich-safe text block;
- `image` — server-protected image/evidence reference with required alt text;
- `table` — structured headers/rows;
- `document-page` — future protected page/image/PDF-page reference;
- `prompt` — Student-safe question/instruction;
- `evidence` — discrete released fact/evidence item.

Do not allow executable markup, script, inline event handlers, arbitrary remote embeds, or public asset URLs that bypass Classroom authorization.

### Instructor content

Instructor-only content may include:
- facilitation notes;
- likely reasoning / teaching points;
- debrief prompts;
- anticipated misconceptions;
- exemplar/model reasoning;
- recommended timing;
- reveal guidance.

Instructor content IDs and payloads are omitted entirely from Student responses.

## Exercise domain model

Persist orchestration state separately from static Case Study definitions.

### classroom_exercises

One row represents one run of one Case Study in one class.

Recommended fields:
- `id`;
- `class_id`;
- `case_study_id`;
- `status: draft | active | paused | completed`;
- `current_stage_id` (nullable before start);
- `stage_phase: work | debrief`;
- `exercise_revision` positive monotonic integer;
- `student_editing_enabled` boolean;
- `started_at`;
- `completed_at`;
- `created_at`;
- `updated_at`.

A class may have historical completed exercises. At most one non-completed exercise should be active for a class unless a later product decision explicitly introduces parallel exercises.

The database stores the selected `case_study_id` and dynamic lifecycle state, not a second copy of the static stage definition.

### Released optional content

Initial stage release is deterministic from the stage definition.

Optional hints/supplemental evidence need durable state. Prefer an additive release table:

`classroom_exercise_releases`
- `exercise_id`;
- `stage_id`;
- `content_id`;
- `released_at`.

The server validates that a released ID belongs to the current stage's `optionalReleaseIds`. A Student response is the union of:
- all initial releases from completed/current stages that are intended to remain visible;
- explicitly released optional content;
- no future-stage content.

### Workspace stage state

Readiness is a **team/workspace** concept, not participant identity.

`classroom_exercise_workspace_state`
- `exercise_id`;
- `workspace_id`;
- `stage_id`;
- `ready_for_debrief` boolean;
- `ready_at`;
- `ready_workspace_revision`;
- timestamps.

A reassigned Student adopts the destination workspace's readiness state. Their old team's readiness stays with the old workspace.

### Immutable debrief checkpoints

A collaboration revision number alone is insufficient to reconstruct what a team believed before a debrief because collaboration currently retains only the live snapshot.

When the Instructor begins debrief, capture an immutable stage checkpoint for each active workspace:

`classroom_exercise_checkpoints`
- `exercise_id`;
- `stage_id`;
- `workspace_id`;
- `workspace_revision`;
- `snapshot` JSONB;
- `captured_at`.

Checkpoint snapshots are evidence for facilitation/comparison only:
- never become the live Intake automatically;
- never overwrite team work;
- are class/workspace scoped;
- inherit class retention;
- are never sent to another team;
- are not included in normal Intake Save/Load/export.

This gives future debrief tooling a trustworthy “what the team had at debrief start” view without requiring collaboration history as a prerequisite.

## Lifecycle state machine

### Draft

Exercise exists and the Instructor can inspect its full staged definition.

Student receives no staged exercise content.

Allowed Instructor transitions:
- start first stage;
- replace/cancel draft selection.

### Active + work

Students receive the cumulative Student-safe release through the current stage.

Student Intake editing is normally enabled.

Instructor may:
- release an optional current-stage content item;
- pause;
- begin debrief;
- observe/coach teams.

Teams may mark Ready for debrief while assigned.

### Paused

Current stage and phase remain unchanged; `status=paused` records the hold.

Pause is not automatically an edit freeze. The Instructor may choose the exercise editing policy independently.

Resume returns to the same phase.

### Active + debrief

Entering debrief:
1. validates expected exercise revision;
2. captures immutable workspace checkpoints exactly once for that stage;
3. applies the stage's default edit policy unless Instructor explicitly overrides it;
4. changes `stage_phase` to `debrief`;
5. increments exercise revision.

Student continues to see released case material and their own live Intake. If editing is frozen, the UI becomes read-only and the server rejects Student snapshot mutation.

Instructor may:
- facilitate using Instructor-only notes;
- observe checkpoint vs current work;
- coach;
- unfreeze/refreeze if policy permits;
- advance to the next stage;
- complete the exercise on the final stage.

### Advance

Advance is Instructor-only and optimistic-revision protected.

The server:
- validates current stage/phase;
- resolves the next stage from the immutable simulation definition;
- sets next `current_stage_id`;
- sets phase to `work`;
- restores the next stage's default editing policy;
- clears/creates workspace readiness for the new stage without changing Intake;
- increments exercise revision.

Student clients discover the new revision and fetch the new safe release.

### Completed

No future automatic release occurs.

Completion does **not** automatically release Instructor exemplar/model material. If learner-facing exemplar reveal is later desired, it must be an explicit separately authorized release.

## API direction

Use separate exercise endpoints rather than overloading assignment/status routes.

### Instructor

`POST /api/classes/exercise`
- Instructor class capability;
- create/select a draft exercise from a Case Study that has a valid `simulation` definition;
- reject non-staged cases for this path.

`GET /api/classes/exercise`
- Instructor class capability;
- return current exercise lifecycle plus complete staged definition including Instructor-only content.

`PATCH /api/classes/exercise`
- Instructor class capability;
- requires `expectedRevision` for state-changing actions;
- actions:
  - `start`;
  - `pause`;
  - `resume`;
  - `release-content`;
  - `begin-debrief`;
  - `set-editing`;
  - `advance`;
  - `complete`.

Return 409 on revision conflict; never perform a best-effort double advance.

Instructor controls use stable IDs in request bodies, not case/stage identifiers in URLs.

### Student

`GET /api/classes/exercise/student`
- Student **class-session capability**, not the human join code;
- deliberately class-level so a safely admitted late/unassigned Student can receive the current class release while Waiting;
- returns only:
  - public exercise identity;
  - current Student-visible stage title/objective;
  - status/phase/revision;
  - editing-enabled state;
  - cumulative released Student content;
  - represented Student's current workspace readiness if assigned;
- never returns future stage metadata, Instructor content IDs, Instructor content, exemplar `state`, other team readiness, or workspace enumeration.

`PUT /api/classes/exercise/student/ready`
- Student class-session capability;
- server resolves the represented participant's **current** assigned workspace;
- marks/unmarks readiness for current exercise/stage;
- rejects Waiting/unassigned Students;
- records current collaboration revision as evidence;
- stale pre-reassignment workspace authority cannot mark the old team ready.

Student stage reads are class-session authorized because stage release is class-level. Intake edits remain workspace-capability authorized.

## Existing protected Case Study endpoint interaction

This is a critical anti-bypass rule.

While a class has an active staged exercise for Case Study X:
- Student `POST /api/classes/case-studies/student` must **not** return Case Study X's complete `state`;
- the Student must use the staged exercise endpoint to receive only released content;
- Instructor `POST /api/classes/case-studies` may continue to receive the complete protected record;
- unrelated non-staged protected resources may retain current behavior unless a later product rule narrows them.

Do not rely on the Student drawer hiding the full-case Apply button. The server must close the full-payload bypass for the active staged case.

A completed exercise still does not imply automatic exemplar release.

## Server-enforced edit freeze

If the Instructor freezes Student editing:
- Student UI projects the Intake read-only and clearly says the class is paused/debriefing;
- existing presence/observation may continue;
- Student snapshot mutation through `PUT /api/workspaces/session` must be rejected server-side for `classroom-student` aliases in the frozen exercise;
- legacy Standalone collaboration is unaffected;
- Instructor observer remains read-only as before;
- unfreeze resumes the same collaboration workspace/revision.

Prefer a specific non-terminal response such as HTTP 423 with a stable machine-readable Classroom code. The collaboration controller must treat this as temporary read-only state, not invalid/expired authority.

No freeze is complete until the server write path enforces it.

## Student client lifecycle

The Student exercise controller is separate from `classroomStudent.js` assignment authority but consumes the active Student class-session capability.

Responsibilities:
- poll exercise revision/state;
- hold only currently released Student-safe content in memory;
- render current stage/phase;
- announce stage/pause/debrief changes accessibly;
- open case reference beside Intake without navigating away;
- expose team Ready control only while assigned;
- project temporary edit freeze;
- discard staged content on class disconnect/role switch.

Never persist protected staged content or exercise credentials into Intake state.

### Case reference UX

Preferred desktop direction:
- resizable or bounded side panel beside Intake;
- current stage header + objective;
- released content grouped in release order;
- obvious “new evidence” indication after Instructor release;
- Intake remains editable in the main pane when allowed.

Preferred narrow/mobile direction:
- accessible drawer/sheet;
- returns focus to the invoking control;
- no horizontal two-column dependency.

The exact layout is a UI tranche decision and must be verified in real browsers.

## Instructor exercise console

Extend the existing #312 live dashboard rather than building a second Instructor app.

The console should eventually show:
- selected Case Study;
- current stage + phase;
- exercise revision/status;
- elapsed/suggested time as advisory only;
- Start / Pause / Resume / Begin debrief / Advance / Complete controls;
- optional evidence/hint release controls;
- Freeze/Unfreeze editing control;
- team readiness;
- team activity/progress/coaching indicators;
- one-click read-only observation;
- Instructor-only stage notes/debrief prompts.

Accessible buttons/selects are the canonical controls. Keyboard operation must not depend on drag-and-drop.

## Late join

A newly admitted Student:
- receives a class-session capability as in #312;
- may read the **current** Student release from the exercise endpoint even while Waiting;
- receives no future or Instructor content;
- joins the current stage rather than replaying old transitions;
- when assigned, connects to the destination team's current Intake without changing class exercise state.

## Reassignment

Exercise stage is class-global.

When Student A moves Team A -> Team B:
- Student A's staged case release does not change;
- old Team A workspace authority is revoked by #312;
- Student A connects to Team B's current Intake;
- Team A readiness/checkpoints remain Team A;
- Student A inherits Team B's current readiness state;
- no checkpoint or Intake snapshot is copied between teams;
- future releases continue from the class exercise state.

## Failure and concurrency rules

- Every Instructor lifecycle mutation uses `expectedRevision`.
- Duplicate/retried begin-debrief must not create duplicate checkpoints.
- Duplicate/retried release-content must be idempotent.
- Duplicate/retried advance must not skip a stage.
- Student polling treats a newer exercise revision as authoritative.
- An out-of-order older response must never replace newer stage state in the browser.
- Case definition changes after an exercise starts must not silently reinterpret the running exercise. Initial implementation should rely on immutable deployed definition/version and record the simulation definition version on the exercise.
- If a staged definition is missing/corrupt after an exercise was created, fail closed: do not expose full Case Study state to Students.

## Accessibility requirements

- current stage and lifecycle changes announced through a polite live region;
- pause/freeze/debrief state is conveyed in text, not color alone;
- Student case panel is fully keyboard reachable and closable;
- all content block images require alt text;
- tables use semantic headers;
- Instructor controls have explicit accessible names and disabled/busy states;
- focus is intentionally managed after stage transitions/dialog actions;
- no timing requirement depends on a Student reacting within a fixed duration;
- real-browser axe serious/critical violations remain fatal.

## Browser acceptance journeys

Before #313 is mergeable, deterministic real-browser coverage should prove:

1. Instructor starts class, creates teams, selects a staged synthetic test case, and starts Stage 1.
2. Two Students see only Stage 1 content; a direct attempt to fetch Stage 2/future content fails.
3. Student full-payload request for the active staged case cannot bypass progressive disclosure.
4. Team A and Team B keep separate Intake work.
5. Team marks Ready; Instructor sees readiness without seeing another team's editable authority.
6. Late Student joins during Stage 1 and sees exactly the current cumulative release.
7. Instructor releases optional evidence; all Students receive it without page reload.
8. Instructor begins debrief; immutable team checkpoints are captured.
9. With freeze enabled, Student UI is read-only **and direct server PUT is rejected**.
10. Instructor observer/coaching still works during debrief.
11. Instructor advances to Stage 2; Students receive new content and retain their same team Intake.
12. Instructor moves a Student A -> B; stage access remains correct, old A edit authority fails, and destination Intake wins.
13. Unassigned Student remains in the current exercise safely but cannot mark a workspace Ready.
14. Instructor-only notes/model content never appear in Student responses, DOM, public browser assets, logs, or error messages.
15. Mobile case reference and all stage controls remain keyboard/screen-reader viable.

Use a **synthetic deterministic staged case in the test fixture** until authoritative production stage content has been explicitly supplied/reviewed. Do not fabricate official case pages merely to satisfy browser tests.

## Implementation sequence

### Tranche 1 — architecture / server contract
- this document;
- cold-start/workstream/roadmap/API-agent governance;
- no runtime/schema changes.

### Tranche 2 — staged Case Study authoring schema
- extend Case Study validator/server-only manifest for optional `simulation`;
- keep public manifest unchanged;
- add validation tests proving Student/Instructor separation;
- no production staged definition unless authoritative content exists.

### Tranche 3 — exercise persistence/repository
- additive exercise/release/workspace-state/checkpoint tables;
- repository methods;
- deterministic in-memory parity;
- optimistic revision and idempotency tests.

### Tranche 4 — exercise APIs
- Instructor create/read/lifecycle actions;
- Student class-session stage read;
- Student readiness;
- full-payload bypass closure for active staged case;
- authorization matrix.

### Tranche 5 — server-enforced editing policy
- classroom-student write guard;
- temporary lock response contract;
- no impact on Standalone collaboration.

### Tranche 6 — Instructor exercise console
- staged case selection;
- lifecycle/release/freeze controls;
- readiness/progress integrated with existing dashboard.

### Tranche 7 — Student case reference
- stage-aware side panel/drawer;
- released content only;
- ready/debrief/freeze UX;
- automatic revision transitions.

### Tranche 8 — checkpoints / debrief views
- stage checkpoint capture/inspection;
- Instructor facilitation prompts;
- preserve Student work; never overwrite with exemplar.

### Tranche 9 — integrated browser/security/accessibility acceptance
- complete multi-browser staged journey;
- unauthorized future/full payload checks;
- late join/reassignment;
- server freeze;
- mobile/a11y.

### Tranche 10 — final docs/security/merge readiness
- full diff audit;
- cold-start reconciliation;
- merge only from a green documented head.

## Rollback boundary

The first server changes should be additive:
- #312 class/participant/workspace behavior remains valid without an exercise;
- existing collaboration remains authoritative for live Intake;
- existing non-staged protected Case Studies remain supported;
- exercise tables/routes may be unused if the staged UI is rolled back;
- no destructive migration is required to disable #313.

Do not make Standalone or ordinary Classroom assignment boot depend on an active exercise.

## Exact first implementation action after this architecture tranche

Extend the authored Case Study schema and build validator with an **optional** server-only `simulation` definition, plus tests that prove:
- Standard Templates cannot carry protected simulation definitions into the public manifest;
- staged Case Study Student release and Instructor content are structurally distinct;
- stable content/stage IDs are unique and cross-references are valid;
- no existing Case Study is forced to become staged;
- existing generated manifests remain compatible.

Stop before persistence/API/UI work and return to a green gate.
