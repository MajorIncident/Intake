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

## Implementation checkpoint — staged Case Study authoring schema

Tranche 2 is implemented before exercise persistence/API/UI.

Implemented:
- `scripts/staged-simulation-schema.mjs` defines simulation version 1 validation and canonical normalization;
- `scripts/build-templates-manifest.mjs` accepts optional `simulation` only on protected `case-study` resources and preserves it only in the server-only Case Study manifest;
- existing Case Studies without `simulation` remain valid and unchanged;
- Standard Templates are rejected if they attempt to carry `simulation`, protecting the public manifest boundary;
- Student content and Instructor content are separate namespaces and their IDs may not collide;
- stage IDs and content IDs must be stable lowercase slugs and unique;
- stage Student release references must resolve only to Student content;
- stage Instructor references must resolve only to Instructor content;
- one content item cannot be both initial and optional release in the same stage;
- orphan Student/Instructor content is rejected so protected material cannot silently ride along outside an explicit stage;
- version-1 definitions reject unknown fields instead of silently widening the contract;
- Student content kinds currently supported by the authoring contract are `narrative`, `prompt`, `evidence`, `image`, `table`, and `document-page`;
- protected image/document references use stable `assetId` values rather than arbitrary URLs;
- image/document blocks require accessible alternate text; table blocks require a rectangular string matrix;
- Instructor content kinds are `facilitation`, `debrief`, and `exemplar`;
- stage `defaultDebriefEditPolicy` is explicitly `open | frozen`.

Durable implementation commits:
- `46109491808bedfbf5e778d0979859b3cd96b56c` — version-1 staged simulation validator/normalizer;
- `1f716470cfdf95a64c00a8a99a62735133feae61` — optional simulation integration into the protected manifest build;
- `9322cecabe9a487e072dd279519b5f358f089ebd` — focused synthetic schema/cross-reference/security tests;
- `1e22806b8a1e50e94150a13ecf3b7083f0747667` — public/protected manifest boundary regression;
- `af6b6f21a8e4f25f014a8362857a1c15e252775b` — server-agent guardrails restored alongside real tests.

Validation on `af6b6f21...`:
- canonical repository quality: **260 tests / 259 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- Template Manifest Guard and Dependency Review: green;
- no production authored Case Study gained a staged definition, so existing generated protected/public resource behavior remains compatible.

**Exact next tranche:** implement additive exercise persistence/repository primitives only: `classroom_exercises`, optional-content releases, per-workspace stage readiness, immutable debrief checkpoints, optimistic exercise revision, idempotent checkpoint/release behavior, class scoping, retention/expiry, and deterministic in-memory parity. Do not add HTTP exercise routes, edit-freeze enforcement, or Instructor/Student UI in that tranche.

## Implementation checkpoint — exercise persistence / repository

Tranche 3 is implemented below the HTTP/UI layer.

Persistence:
- `classroom_exercises` stores one exercise run with public UUID, owning class, protected Case Study ID, pinned simulation version + SHA-256 definition fingerprint, lifecycle status/stage/phase, optimistic `exercise_revision`, editing-policy state, timestamps, and class-bounded expiry;
- a partial unique index permits at most one non-completed exercise per class;
- `classroom_exercise_releases` stores optional Student-content releases by exercise + stage + content ID;
- `classroom_exercise_workspace_state` stores team/workspace readiness and the collaboration revision observed when Ready was marked;
- `classroom_exercise_checkpoints` stores immutable per-workspace stage snapshots/revisions for debrief evidence;
- class/workspace composite foreign keys prevent cross-class workspace state/checkpoint rows;
- exercise rows inherit the owning class's absolute expiry; all repository access also requires the active, unexpired owning class.

Repository semantics:
- draft creation is idempotent at the class level: an existing non-completed exercise is returned rather than creating a parallel run;
- exercise lifecycle mutation requires the expected exercise revision and returns an explicit conflict without mutating on stale input;
- lifecycle mutations increment the revision once and retain start/completion timestamps;
- a new optional release is atomic with one exercise-revision increment;
- replaying the same optional release is an unchanged success and does not increment revision, even if the caller repeats its earlier expected revision;
- a different release with a stale revision conflicts;
- Student readiness resolves from the stable Student class session to the **currently assigned** workspace; Waiting Students cannot create workspace readiness;
- readiness remains attached to the old team after reassignment, while subsequent readiness writes attach to the destination team;
- checkpoint capture validates Instructor class + exercise + workspace scope and is first-write-wins for exercise + stage + workspace;
- replaying checkpoint capture returns the original revision/snapshot rather than overwriting debrief evidence;
- checkpoint snapshots are cloned in deterministic parity so later mutation of the source object cannot mutate captured evidence;
- no stage/lifecycle operation copies or merges live Intake snapshots.

Definition drift protection:
- each exercise pins the staged simulation schema version and a 64-character definition fingerprint supplied by the later API/service layer;
- a migration-safe fallback fingerprint of all zeroes is used only if an earlier schema-only table somehow existed before these columns; the API tranche must treat a fingerprint mismatch/sentinel as fail-closed rather than silently reinterpret a running exercise.

Durable implementation commits:
- `ea964de7afc002ca307a903db7e1493d56837f13` — additive exercise/release/workspace-state/checkpoint schema;
- `3e519b8f4ab136404ade550376af0c80e06574f1` — real Neon repository primitives;
- `8595e1ec1072b365e82f759494ea0edb25001a4c` — deterministic in-memory parity;
- `f7c1e580ca8fdc5e818e1f6974af374850f6d3a6` — focused repository contract tests;
- `09ffaa6c1ce081166240fe484bbccea6b29901f5`, `6979abc429c6d67169e044758cf394eb052ef85b`, `257981611cccea907a37bc8a037caa68cbb9bc88`, and `c01dfff2f2bd1f9d7625901860210cc00eee7051` — pin simulation definition identity and make those columns migration-safe.

Validation on the pre-definition-hardening implementation head `f7c1e58...`:
- repository quality: **265 tests / 264 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

The final documented head must rerun the same complete gate after definition-identity hardening.

## Exercise domain model

Persist orchestration state separately from static Case Study definitions.

### classroom_exercises

One row represents one run of one Case Study in one class.

Implemented fields include:
- internal `id` plus public UUID `public_id`;
- `class_id`;
- `case_study_id`;
- `simulation_version`;
- `simulation_fingerprint` — SHA-256 of the normalized staged definition supplied by the exercise service;
- `status: draft | active | paused | completed`;
- `current_stage_id` (nullable before start);
- `stage_phase: work | debrief`;
- `exercise_revision` positive monotonic integer;
- `student_editing_enabled` boolean;
- `started_at`;
- `completed_at`;
- `created_at`;
- `updated_at`;
- `expires_at` copied from the owning class.

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
- Case definition changes after an exercise starts must not silently reinterpret the running exercise. The exercise pins both simulation version and a definition fingerprint; later API reads/mutations must fail closed when the current server-only definition does not match that identity.
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

## Implementation checkpoint — exercise APIs / authorization

Tranche 4 is implemented on top of the additive exercise repository contract.

Routes:
- Instructor `POST /api/classes/exercise` creates/reuses the represented class's draft only for an explicitly staged protected Case Study and pins simulation version + canonical SHA-256 definition fingerprint;
- Instructor `GET /api/classes/exercise` returns the represented class's current exercise, releases, workspace readiness, checkpoints, and the complete Instructor-authorized staged definition;
- Instructor `PATCH /api/classes/exercise` supports `start`, `pause`, `resume`, `release-content`, `begin-debrief`, `advance`, and `complete`, all revision-safe and stage-order aware;
- Student `GET /api/classes/exercise/student` authenticates with the stable Student class-session capability and returns only the represented learner's public class/assignment context plus cumulative Student-safe content released through the current stage;
- Student `PUT /api/classes/exercise/student/ready` resolves the participant's current workspace server-side, records the server-observed collaboration revision when Ready is set, rejects Waiting, and fails closed if reassignment races the readiness write.

Progressive-disclosure / security semantics:
- every staged read or lifecycle mutation revalidates the pinned simulation version/fingerprint against the current protected definition and returns conflict on definition drift;
- Student payload construction never returns future-stage metadata, Instructor content IDs/content, exemplar/model material, or the complete protected Case Study `state`;
- optional content is released only for the current work phase and replay of the same release remains idempotent;
- entering debrief captures immutable current-workspace snapshots/revisions before later live edits;
- Student full protected Case Study retrieval is blocked for any class/case that has a staged exercise record, including after completion; completion is not an implicit exemplar reveal;
- unrelated protected non-staged resources retain their existing behavior;
- Instructor and Student credentials are not interchangeable and the human join code has no exercise authority;
- all staged responses remain `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Tranche 4 implementation/security-test checkpoint: `5afc0041db89348d97ca0986cab89491765d0e00`.

Tranche 4 validation:
- repository quality: **273 tests / 272 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — server-enforced Student editing policy

Tranche 5 makes the staged editing policy an actual server authorization boundary rather than a UI convention.

Write-path contract:
- only snapshot mutation through `PUT /api/workspaces/session` is gated; ordinary GET, presence, observation, coaching, staged reads, and readiness remain available;
- the collaboration repository first distinguishes an active `classroom-student` alias from a primary/Standalone workspace token;
- Standalone/primary collaboration therefore does not depend on Classroom policy resolution;
- a Classroom Student alias resolves its represented class/workspace and current non-completed staged exercise;
- if `student_editing_enabled=false`, the PUT returns **HTTP 423 Locked** with stable code `classroom-editing-locked`;
- a locked request does not change snapshot or collaboration revision;
- the real Neon mutation repeats the lock predicate inside the SQL UPDATE itself, so an Instructor freeze racing an already-started Student save fails closed rather than slipping through after a preflight check;
- both #312 live-participant aliases and legacy Classroom membership aliases are covered by the atomic scope lookup;
- classes with no staged exercise remain writable exactly as before.

Exercise-policy contract:
- entering debrief applies the stage's explicit `defaultDebriefEditPolicy`: `frozen` sets Student editing false, `open` leaves it true;
- Instructor `set-editing` is a revision-safe debrief-only server action for an explicit freeze/unfreeze override;
- Pause and Resume preserve the current editing policy; pausing is not itself a freeze and resuming a frozen debrief does not silently unlock it;
- advancing to the next work stage restores Student editing for work;
- completing an exercise removes it from current-exercise policy lookup, so the staged lock no longer applies after completion;
- staged Instructor/Student payloads may now truthfully expose `editFreezeEnforced: true` and the persisted `studentEditingEnabled` state.

Focused regression proves:
- Classroom Student write succeeds during work;
- Stage 1 debrief defaults frozen;
- direct frozen PUT returns 423;
- snapshot and revision remain unchanged after the rejected write;
- GET continues while frozen;
- Standalone write continues while the class is frozen;
- Pause -> Resume preserves the freeze;
- Instructor unfreeze increments exercise revision and restores Student writes.

Implementation checkpoint: `261b28d488538964ccd73132ed568d73628f6411`.

Validation:
- repository quality: **274 tests / 273 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — Tranche 6A Instructor console foundation

The first Instructor-console slice is implemented without adding lifecycle mutations yet.

Foundation contract:
- `GET /api/classes/exercise` returns an Instructor-authorized `availableCaseStudies` list containing only protected Case Studies with explicit staged `simulation` definitions;
- discovery items are summaries only: id/name/description/supported modes, with no `simulation`, protected source `state`, future Student content, or Instructor facilitation content;
- `src/classroomExerciseInstructor.js` owns the in-memory Instructor exercise client and reads the current exercise/discovery state on class connect;
- the controller never exposes the raw Instructor capability through public state and persists no exercise/capability data;
- the existing Instructor dashboard owns the new `[feature:instructor-exercise-console]` shell; Tranche 6A exposes status/current case/staged availability plus Refresh only;
- disconnect clears the console immediately; transient read errors keep the shell recoverable through explicit refresh.

Implementation checkpoint spans `2624f1e...` through `d20a303...`.

## Implementation checkpoint — Tranche 6B staged Case Study selection and draft creation

The console now creates the server-owned draft without adding lifecycle actions.

Draft-setup contract:
- the selector is populated only from the Instructor-authorized `availableCaseStudies` discovery list;
- create sends only the selected `caseStudyId` in an authenticated POST body;
- a successful create hydrates the returned draft and protected Instructor definition in memory, while public controller state exposes only the sanitized Case Study summary;
- an idempotent `created: false` response is treated as the represented existing draft rather than an error;
- once an exercise exists, selector/create controls are disabled;
- a 409 never retries the stale create request; the client performs an authoritative GET and renders the current exercise;
- draft setup releases no Student content and does not modify Intake/collaboration state;
- exercise state remains server-owned and is re-fetched on Instructor class resume/reload;
- selector/label/option controls are explicitly local-only and summary-excluded so repository guards do not force Classroom exercise state into Intake persistence or Copy & Paste Summary;
- deterministic browser coverage uses only a synthetic staged case in the browser fixture.

Implementation spans `6a69426...` through `5f3fb56...`, with synthetic fixture support at `c3440eb...`.

Validation note carried from 6A: its repository quality gate passed, but the four-browser integration journey hit the old 30-second Playwright test timeout. Its immediately prior green runtime was 26.1 seconds, so the acceptance-specific budget is now 45 seconds rather than removing assertions or weakening behavior.

## Implementation checkpoint — Tranche 6C Start/Pause/Resume and current-stage Instructor context

Lifecycle/pacing contract:
- Start is exposed only for a draft with no current stage and PATCHes `{ action: "start", expectedRevision }`;
- Pause is exposed only for an active exercise and Resume only for a paused exercise;
- every lifecycle mutation uses the currently observed positive `exerciseRevision`;
- a 409 mutation conflict performs one authoritative GET and renders that state; stale lifecycle intent is never automatically replayed;
- after Start, the console renders only the current stage's title, Student objective, suggested minutes, and Instructor content referenced by that stage's `instructorContentIds`;
- current-stage facilitation remains Instructor-only and memory-only;
- Pause is described as class pacing, explicitly distinct from the Student editing freeze policy that belongs to debrief;
- exercise state remains server-owned and is restored by GET on same-device Instructor resume/reload;
- deterministic browser acceptance uses the synthetic staged case only and proves Start -> Pause -> Resume -> reload.

Implementation spans `53ce2b7...` through `2888beb...`.

## Implementation checkpoint — Tranche 6D optional evidence release and team readiness/progress

Release/progress contract:
- optional release UI is derived only from the current stage's explicit `optionalReleaseIds` and the protected Instructor-authorized staged definition; future-stage optional Student content is not rendered as a release control;
- a new optional release PATCHes `{ action: "release-content", expectedRevision, contentId }` only while the represented exercise is active/current-stage work;
- an already-recorded release is idempotent and renders **Released** without a duplicate revision increment;
- a genuinely new stale release returns conflict and the client performs one authoritative GET; stale release intent is never automatically replayed;
- current-stage team progress is derived only from Instructor-authorized `workspaceState`; represented rows show Ready/Working while absence of a readiness row is reported honestly as no readiness signal yet;
- progress buttons reuse the existing Instructor `selectWorkspace()` observer/coaching flow rather than minting any new workspace authority or observer path;
- release/progress controls are local-only and summary-excluded; staged content, readiness, and capabilities remain outside Intake persistence/exports;
- deterministic browser acceptance uses only synthetic optional evidence/readiness and proves release -> Released, Ready progress, observer navigation, and server-backed state after reload;
- expansion of the Instructor console exposed a real nested-scroll usability bug in the rail. The inner workspace list no longer owns a competing scroll region, so the outer dashboard keeps workspace rows reachable/clickable without force-click workarounds.

Implementation spans `1de00a1...` through `2c8145b...`.

Validation on `2c8145b31f96403f59ff3b41d9396fd2a3ac86ed`:
- repository quality: **285 tests / 284 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — Tranche 6E Begin Debrief, checkpoint review, and editing policy

Debrief/edit-policy contract:
- **Begin debrief** is exposed only for an active exercise in current-stage work and PATCHes `{ action: "begin-debrief", expectedRevision }`;
- successful debrief entry consumes the server response after immutable checkpoint capture and renders only checkpoint workspace identity + captured workspace revision for the current stage;
- checkpoint snapshot bodies remain server-owned evidence: the browser controller sanitizes them away from public state and does not create an editable or persisted checkpoint copy;
- the console presents `studentEditingEnabled` independently from Pause/Resume so class pacing and Student write authorization remain visibly separate concepts;
- active debrief exposes **Freeze editing** when editing is allowed and **Allow editing** when editing is frozen; both use revision-safe `set-editing`;
- idempotent local policy requests do not issue unnecessary PATCHes, while a 409 on a real mutation performs one authoritative GET and never replays stale intent;
- the server-enforced HTTP 423 `classroom-editing-locked` boundary from Tranche 5 remains the actual authorization control; the Instructor toggle is not treated as client-side security;
- existing observer/coaching remains available through debrief, including while Student editing is frozen;
- real-browser acceptance proves work -> debrief checkpoint capture -> default frozen policy -> allow -> freeze -> reload with checkpoint/release/progress state restored.

Instructor workspace/mobile UX added in the same bounded slice:
- the existing class/team rail has an explicit accessible Collapse/Open control;
- desktop collapse reclaims horizontal Intake space;
- at <=700px the rail defaults collapsed to a compact class header instead of occupying the mobile page, but remains discoverable and can be reopened normally;
- tests use the real Open class panel control before mobile team switching; no forced-click workaround is used;
- broader Notes/mobile chrome alignment remains a follow-on: prefer compact discoverable launchers/default-collapsed behavior rather than making either workspace silently disappear.

Implementation spans `044e4f82...` through `61aa582...`.

Validation on `61aa582e9faee9a7e500796634c5cc06e256ff14`:
- repository quality: **288 tests / 287 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — Tranche 6F Advance/Complete and lifecycle completion

Final Instructor lifecycle contract:
- **Advance to next stage** is rendered only when the represented exercise is active, in debrief, and the protected Instructor-authorized simulation has a next authored stage;
- the client sends only `{ action: "advance", expectedRevision }`; it never chooses or submits an arbitrary next stage ID;
- successful Advance accepts the server's authoritative next stage, returns to work, and renders that stage's Student objective/timing plus only its referenced Instructor facilitation content;
- advancing restores the represented Student editing policy for work and hides debrief/checkpoint controls until the next debrief;
- **Complete exercise** is rendered only when active debrief is on the final authored stage and sends `{ action: "complete", expectedRevision }`;
- completion renders as **Completed** even though the persisted terminal stage phase remains `debrief`;
- terminal completion hides Pause/Advance/Complete and Freeze/Allow mutations, preserves final-stage checkpoint review, and states explicitly that completion does not release additional Student, Instructor-only, exemplar/model, or complete protected Case Study material;
- all lifecycle 409s continue to authoritative-refresh and never replay stale intent;
- existing observer/coaching remains usable while stages advance and after exercise completion as long as the Classroom session remains valid;
- deterministic browser fixture now owns two synthetic stages only and preserves prior-stage checkpoints when the later stage enters debrief;
- real-browser acceptance proves Stage 1 work -> Stage 1 debrief -> Advance -> Stage 2 work -> Stage 2 debrief -> Complete -> reload.

Implementation spans `e855df09...` through `e2f5534...`.

Validation on `e2f5534aa0e85bccc2bee0e73275c9b77d000f3d`:
- repository quality: **290 tests / 289 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — Tranche 7A Student current-stage case-reference foundation

Student reference contract:
- `src/classroomExerciseStudent.js` owns staged Student presentation separately from assignment/workspace authority;
- the client accepts only the stable live Student class-session capability in memory and GETs `/api/classes/exercise/student`; it never uses the rotating workspace capability to authorize staged reads and never requests the complete protected Case Study payload;
- `classroomStudent.js` now provides a stable live-session lifecycle alongside the existing workspace lifecycle. Team reassignment rotates collaboration authority without disconnecting/reconnecting the staged exercise client; terminal session loss, Leave Class, destroy, or Student-role exit clears it;
- payload projection permits only Student case summary, represented exercise status/phase/revision/editing state, current Student-visible stage title/objective, and cumulative released Student-safe content. Unknown future-stage or Instructor-only response fields are discarded before public state or DOM rendering;
- the case-reference module persists neither bearer capability nor staged content to Intake/localStorage/sessionStorage/export/summary/URL state;
- the learner sees explicit Work, Paused, Debrief/editing-open, Debrief/editing-frozen, or Completed status. Frozen debrief keeps released case material reviewable and explains the temporary write restriction, while the Tranche 5 server 423 boundary remains the enforcement control;
- successful polling refreshes authoritative exercise revisions and released material automatically; same-device class resume reconstructs the reference from the server rather than local staged-content storage;
- desktop uses a bounded companion surface only when there is enough width; narrow/mobile defaults the reference collapsed behind an accessible **Open case reference** control;
- real mobile acceptance discovered that the pre-existing fixed Student team/Notes workspace dock could overlap and intercept the reference control. Student narrow layouts now place that dock in normal document flow; the browser journey opens the case reference with a normal click and no forced event/z-index bypass;
- deterministic browser payloads expose Stage 1 safe briefing/optional evidence but not Stage 2 content or Instructor facilitation; focused tests also inject forbidden-looking future/Instructor fields and prove they do not appear in DOM/public controller state;
- 7A intentionally adds no readiness mutation.

Implementation spans `e307ca2...` through `91d7029...`.

Validation on `91d7029bec5cddaf251d02301a4fd1ce97dc908c`:
- repository quality: **295 tests / 294 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **26 passed / 8 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green.

## Implementation checkpoint — Tranche 7B Student Ready / Resume Working

Student readiness interaction contract:
- readiness controls exist only while the represented exercise is `active + work`, a current stage exists, and the Student has a current assignment;
- the browser uses only the stable Student class-session capability with `PUT /api/classes/exercise/student/ready` and sends exactly `{ ready: boolean }`;
- the client never submits a workspace identifier, workspace capability, or claimed workspace revision for readiness;
- Ready state is authoritative server state and displays `readyWorkspaceRevision`, which was observed by the server from the currently assigned collaboration workspace;
- **Resume working** clears readiness with `ready:false` while work remains active;
- Waiting, paused, debrief, and completed states expose no usable readiness action;
- assignment/phase conflicts return to one authoritative Student exercise read; stale Ready/Working intent is never replayed;
- readiness remains memory-only/local-only and is not merged into collaboration snapshot state, Intake export/summary, browser storage, or URLs.

Implementation spans `e43b84c...` through `247479f...`, with deterministic browser support through `d311b7b...`.

## Implementation checkpoint — Tranche 7C frozen-debrief Student Intake projection

Frozen Student UX contract:
- when the Student-safe staged response reports `stagePhase=debrief`, `studentEditingEnabled=false`, `editFreezeEnforced=true`, and the exercise is not completed, the existing Intake surface is projected read-only/disabled;
- this projection is not an authorization boundary: the server-side `PUT /api/workspaces/session` HTTP **423 Locked** / `classroom-editing-locked` policy from Tranche 5 remains authoritative;
- projection records original disabled/readOnly/tabindex/ARIA/contenteditable/draggable state and restores it when editing reopens, the exercise advances/completes, staged context disappears, or the Student session disconnects;
- a paused frozen debrief stays read-only because Pause/Resume deliberately preserves the current editing policy;
- `#studentExperienceNotice` controls are excluded so **Leave class** remains available during a freeze;
- Notes are intentionally included because `notesWorkspace` is serialized by `collectAppState()` and therefore participates in the same collaboration snapshot mutation boundary;
- released case-reference material remains readable throughout the freeze;
- integrated browser acceptance exercises the real Instructor lifecycle: staged Start -> frozen Begin Debrief -> Student read-only projection -> Instructor Allow Editing -> Student projection restoration.

Implementation spans `8d70e84...` through `50435c3...`.

Validation status for the combined 7B/7C implementation is finalized on the documented head after repository/browser/security checks complete. Repository quality already passed on implementation head `50435c30e7d43f906eeff88d32265ba585fad079`.

## Exact next implementation action

Implement **Tranche 8A — Instructor immutable checkpoint inspection versus current live work**.

Required next slice:
- checkpoint snapshots remain Instructor-authorized, class/workspace/stage scoped, memory-only, and excluded from Intake persistence/export/summary;
- expose an explicit Instructor action from the current-stage debrief checkpoint list to inspect the immutable snapshot captured at debrief start;
- reuse the existing read-only Intake rendering/observer surface instead of building a second form renderer;
- clearly label **Checkpoint at debrief start · Revision N** versus **Current live Intake** so facilitation can compare pre-discussion reasoning with subsequent live changes;
- inspecting a checkpoint must never overwrite, restore, merge, or mutate the live Student workspace and must not mint Student workspace authority;
- preserve the existing live observer/coaching path and provide an explicit action back to current live observation;
- do not reveal exemplar/model content, future-stage content, or another class/team's checkpoint;
- add focused controller tests plus integrated browser coverage for checkpoint -> live switching and workspace isolation.

Production official Case Study staging remains deferred until authoritative case pages/evidence/facilitation material is supplied and reviewed.
