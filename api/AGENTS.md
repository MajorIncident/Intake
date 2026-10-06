# Collaboration and Classroom API Guidelines

## Scope

These rules apply to all server-only modules below `api/`.

## Baseline server rules

- Never return or log database connection values, raw capability hashes, authorization headers, or production Intake snapshots.
- Keep route files thin and inject repositories into handlers for deterministic tests.
- Schema changes must remain additive/idempotent and be documented in the README plus the owning architecture document.
- Validate method, authorization, identifiers, names, and payload size before expensive or mutating work.
- Responses containing capabilities or private Intake data use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Display names are presentation metadata, never identity or authorization.

## Classroom capability boundaries

Read `docs/classroom-api.md` and `docs/classroom-architecture.md` before modifying classroom endpoints.

The primary #312 classroom authorization chain is:

```text
Instructor class capability
  -> class administration + class-scoped roster/workspace listing
  -> read-only observation + coaching

human Student join code
  -> admission only
  -> high-entropy Student class-session capability
  -> own assignment state only
  -> fresh assignment-specific classroom-student workspace capability
  -> existing collaboration edit APIs
```

The legacy `Student join capability + assignment capability` chain remains an explicit two-code compatibility path.

Rules:

- Human join code and Student class-session capability must never enumerate classroom workspaces.
- Student class-session capability must never edit collaboration directly.
- Legacy Student join capability alone must never enumerate classroom workspaces.
- Legacy assignment capability must resolve only within the active class represented by the Student join capability.
- Instructor workspace listing must be scoped to exactly the class represented by the Instructor capability.
- Classroom workspaces reuse `collaboration_workspaces`; do not create a parallel snapshot/revision/presence engine.
- Raw bearer capabilities are returned only at creation/rotation. Persist only SHA-256 hashes.
- Classroom credentials never enter `kt-intake-full-v2`, exported Intake files, summaries, templates, or Case Study payloads.
- Individual assignment ownership uses the opaque participant UUID, never the display name.
- Live participants may be Waiting with no workspace authority; assignment is a separate server-authoritative state.

## Editable workspace alias rule

`collaboration_workspace_capabilities` is an **edit-capable alias** path into the existing collaboration handlers.

Today only `classroom-student` may resolve through that path.

Instructor observation for #293 must **not** be inserted as a workspace alias. `GET /api/classes/observe` is the canonical read-only path: it authenticates the Instructor class capability, proves class/workspace ownership, resolves the internal collaboration workspace server-side, and returns snapshot/presence without minting an edit alias. Routing Instructor observation through legacy collaboration PUT/PATCH would silently grant write access.

## Retention and revocation

- Classroom workspaces must not outlive their class; create them with the class's absolute expiry timestamp.
- Rotating a Student join or assignment capability stops future admission through the old token but does not eject already joined students.
- Revoking an assignment expires its underlying collaboration workspace.
- Revoking a class disables joins and expires all of its classroom workspaces.
- Existing Standalone secret-link collaboration remains backward compatible.

## Enumeration and errors

- Student-facing endpoints return only the resolved class/workspace after successful authorization; never return a class roster or workspace catalog.
- Cross-class join/assignment mismatches use a generic not-found response rather than revealing which secret was valid.
- Instructor APIs may enumerate only their own class.
- Coaching endpoints are a separate channel: Instructor capability may read/write feedback only in its class; Student workspace capability may read feedback only for its resolved membership and never write it.
- Coaching PUT/DELETE must never route through collaboration snapshot mutation or advance `collaboration_workspaces.revision`.
- Stable `targetId` values come from the client coaching registry; server validation must reject malformed IDs/status/note/fingerprint evidence.

## Protected Case Study delivery

- `api/protected-case-studies.manifest.js` is server-only generated content. Never import it from browser runtime modules.
- Instructor `/api/classes/case-studies` access is scoped by `getClassByInstructor()`.
- Student `/api/classes/case-studies/student` access is scoped by `getStudentContext()` using the already-issued classroom workspace capability; do not accept a Student workspace selector or legacy collaboration token as a substitute.
- GET returns metadata catalog only. POST accepts `caseStudyId` in the JSON body and may return the full protected payload after authorization.
- Protected content and identifiers must not be added to URL query strings, logs, analytics, or error telemetry.
- Protected responses are always `no-store` / `no-referrer`.
- The Case Study mode password is pedagogical only; server authorization must never depend on it.
- The four authored Case Study JSON files remain repository source for maintainers but are excluded from Vercel deployment by `.vercelignore`. Production functions consume the committed server-only generated manifest.

## Testing

Any runtime change under `api/` is included in the repository test-change guard.

Classroom API changes must preserve automated coverage for:

- class-scoped Instructor roster/workspace listing;
- Student non-enumeration and own-status-only reads;
- Waiting participant with zero workspace edit authority;
- cross-class assignment rejection;
- individual occupancy vs group sharing;
- assignment revision/idempotency semantics;
- reassignment/unassign revoking old workspace authority before destination access;
- stale old-team token rejection and no Intake snapshot merge;
- credential rotation and revocation;
- live and legacy classroom workspace tokens through the existing collaboration session API;
- edit-capability kind restrictions;
- legacy two-code Classroom and Standalone collaboration behavior;
- coaching class scoping, independent feedback revisions, Student read-only access, and zero Student snapshot-revision changes;
- protected Case Study Instructor class scoping, Student membership-bound access, rejection of legacy Standalone collaboration capabilities, metadata-only catalogs, POST-only payload selection, and private response headers.


## #312 live-class capability direction

Read `docs/classroom-live-management.md` before implementing #312.

The new capability chain is intentionally different from the legacy two-code admission path:

```text
human join code (admission locator only)
  -> high-entropy Student class-session capability
  -> own assignment-status API only
  -> assignment-specific classroom-student workspace capability
  -> existing collaboration edit APIs
```

Rules:
- never accept the human join code on workspace/observer/coaching/resource APIs;
- never accept the Student class-session capability on collaboration edit APIs;
- unassigned participants have no workspace edit capability;
- on assign/reassign/unassign, revoke the previous workspace-access capability before destination access is issued;
- never remap one still-active edit token from an old workspace to a new workspace;
- no assignment operation copies or merges Intake snapshots;
- keep legacy `/api/classes/join` and `classroom_memberships` working during the additive migration;
- Student status endpoints return only that Student's assignment; they never enumerate classmates/workspaces.
- `PATCH /api/classes/participants` must revoke any existing assignment-specific workspace capability before changing the participant's workspace assignment; destination access is issued only later through `POST /api/classes/student/access`.
- live Student coaching/protected-resource authorization must validate that the participant's stored workspace-access hash still corresponds to an active, unrevoked `classroom-student` collaboration capability; the stored hash alone is not sufficient authority.
- assignment changes use optimistic `assignment_revision` checks; a conflicting update may leave old access revoked, but must never leave old access valid or remap it to a new workspace.
- stale presence cleanup after reassignment uses internal workspace identity, not the revoked bearer token.
- individual live workspaces remain single-participant; cross-class destination assignment is rejected generically.

## #313 staged simulation direction

Read `docs/classroom-staged-simulation.md` before modifying exercise/stage/protected-resource behavior.

Rules:
- exercise lifecycle is class-scoped Instructor authority and remains separate from Intake snapshots, collaboration revision, and coaching revision;
- Student staged exercise reads authenticate with the stable Student class-session capability and return only the represented learner's class-level release/readiness context;
- a Student class-session token still does **not** authorize collaboration edits;
- future-stage material and Instructor-only facilitation/model/exemplar content must be omitted server-side from Student responses;
- never ship a complete staged Case Study to the browser and rely on UI hiding for progressive disclosure;
- existing protected Case Study `state` is complete source/exemplar material; when that case is the active staged exercise, the Student full-payload route must not bypass staged release;
- optional content release, debrief, and stage advance are Instructor-only and optimistic-revision protected;
- Student/team Ready state resolves the participant's current assignment server-side; stale pre-reassignment authority cannot mutate old-team exercise state;
- beginning debrief must capture idempotent immutable workspace checkpoints before any optional post-debrief edits;
- if Student editing is frozen, enforce it on the `classroom-student` collaboration snapshot write path; UI read-only projection alone is not authority;
- frozen Student snapshot PUT uses HTTP 423 with stable code `classroom-editing-locked`; the rejected request must not advance collaboration revision;
- the real workspace mutation must repeat the Classroom freeze predicate atomically with the UPDATE so a freeze racing a Student save fails closed; a preflight policy check alone is insufficient;
- Classroom freeze must not block workspace GET, presence, Instructor observation/coaching, Student staged reads/readiness, or Standalone/primary collaboration tokens;
- Pause/Resume preserve the current Student editing policy. Only stage debrief defaults and explicit Instructor debrief `set-editing` may change that policy;
- late joiners receive only the current cumulative Student release; reassignment changes workspace Intake/readiness, not class exercise stage;
- exercise persistence uses one non-completed exercise per class initially, optimistic `exercise_revision`, idempotent optional releases, workspace-scoped readiness, immutable first-write-wins debrief checkpoints, and class-bounded expiry;
- every running exercise pins the staged simulation version plus a definition fingerprint; later API reads/mutations must fail closed if the current protected definition does not match;
- checkpoint snapshots are facilitation evidence only and must never overwrite or become the live collaboration snapshot automatically;
- `student_editing_enabled=false` is now a server-enforced security boundary for `classroom-student` snapshot PUT; preserve that invariant when changing exercise or collaboration code;
- do not create production stage definitions from guessed official case boundaries. Synthetic deterministic staged content is acceptable in tests until authoritative material is supplied.

