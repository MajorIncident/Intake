# Classroom API and Capability Contract

This document is the canonical server contract for Classroom Experience slices #291–#295 and the #312 live-class management layer. It complements `docs/classroom-architecture.md` so future human or AI sessions can extend Student, Instructor, coaching, protected Case Study, live roster, and staged-simulation work without reconstructing authorization decisions from code.

## Core model

Classroom organizes the existing collaboration engine rather than duplicating Intake state:

```text
Class
  -> Classroom Workspace (individual | group)
       -> existing collaboration_workspaces row
       -> Classroom Memberships
            -> per-participant editable workspace capability
```

The classroom tables contain organization, assignment, retention, and authorization metadata. Intake snapshot, optimistic revision, team metadata, and presence remain owned by the existing collaboration tables.

## Capability matrix

| Capability | Purpose | Workspace enumeration | Server persistence |
| --- | --- | --- | --- |
| Instructor class capability | Administer one class, roster, assignments, observation, coaching, and protected teaching resources | Yes, own class only | SHA-256 hash |
| Human Student join code | Admission locator for the normal #312 live path; never edit authority | **No** | normalized code on class row |
| Student class-session capability | Resume one admitted participant and read only that participant's current assignment | **No** | SHA-256 hash |
| Student workspace capability | Edit/sync only the participant's currently assigned collaboration workspace | N/A | SHA-256 alias hash |
| Legacy Student join capability | Compatibility admission into one class for the older two-code path | **No** | SHA-256 hash |
| Legacy assignment capability | Compatibility selector for one individual/group workspace | **No** | SHA-256 hash |
| Legacy Standalone workspace capability | Existing secret-link collaboration | N/A | SHA-256 hash |

Possession of a capability is authority. Display name is not identity.

Raw capabilities are returned only when created or rotated and are never persisted server-side.

## Endpoints

### `POST /api/classes`

Creates a class from a title and returns:

- public class metadata;
- one raw Instructor capability;
- one raw Student join capability.

Class expiry uses `CLASS_EXPIRY_DAYS` when set to a positive integer, otherwise 30 days.

### `GET /api/classes`

Requires the Instructor capability in `Authorization: Bearer ...`.

Returns only that class's public metadata.

### `PATCH /api/classes`

Requires the Instructor capability.

Supported actions:

- `rotate-student-join`
- `rotate-instructor`
- `set-joins` with a boolean `enabled`

Rotation replaces the stored hash and returns only the newly generated raw capability.

### `DELETE /api/classes`

Requires the Instructor capability.

Revokes the class, disables new joins, revokes classroom assignments, and expires all underlying classroom collaboration workspaces immediately.

### `GET /api/classes/workspaces`

Requires the Instructor capability.

Returns workspace metadata only for the represented class. It never returns Student workspace capabilities, assignment hashes, or another class's records.

### `POST /api/classes/workspaces`

Requires the Instructor capability.

Request fields:

- `kind: "individual" | "group"`
- human-facing `label`
- optional initial Intake `snapshot`

The underlying collaboration workspace receives the class's exact absolute expiry, so classroom data cannot outlive the class.

The response returns public workspace metadata and one raw assignment capability. The randomly generated primary collaboration capability used to create the underlying row is intentionally not returned.

### `PATCH /api/classes/workspaces`

Requires the Instructor capability plus a public classroom workspace ID.

Supported actions:

- `rotate-assignment` — old assignment token stops new admission; already joined workspace capabilities continue.
- `revoke-assignment` — assignment is revoked and the underlying collaboration workspace is expired, invalidating existing classroom workspace access.

### `POST /api/classes/join`

Requires the Student join capability in `Authorization: Bearer ...`.

Body:

- `assignmentToken`
- opaque browser/device `participantId`
- optional `displayName`

The server verifies that the Student join capability and assignment capability belong to the same active class.

There is intentionally no GET/list operation on this endpoint.

On success the server:

1. resolves one authorized individual/group workspace;
2. enforces individual claim-once semantics where applicable;
3. mints a fresh per-participant editable workspace capability;
4. persists only its hash in `collaboration_workspace_capabilities`;
5. registers the participant through existing collaboration presence;
6. returns class/workspace context plus the raw workspace capability.

That returned capability is accepted by the existing `/api/workspaces/session` and `/api/workspaces/presence` handlers.

### Student client consumption (#292 legacy + #312 live)

The legacy two-code compatibility path still sends the Student join capability in the Authorization header and the assignment capability in the POST body. On legacy success, both admission codes are discarded and the returned `workspaceToken` remains in the dedicated `kt-classroom-student-session-v1` resume envelope exactly as before.

The normal #312 live-class path is different:

1. the browser sends display name + human join code to `POST /api/classes/admit`;
2. the human join code is discarded after admission;
3. the browser persists only the high-entropy `studentSessionToken` plus public class/participant/assignment context;
4. an unassigned Student stays in Waiting and does not connect collaboration;
5. the browser polls only `GET /api/classes/student` with the class-session capability;
6. while assigned, it exchanges that class-session capability at `POST /api/classes/student/access` for the current assignment-specific editable workspace capability;
7. that workspace capability is kept **memory-only** and is never written into the Student resume envelope or `?workspace=` URL;
8. on reload or assignment change, the browser reacquires fresh current-workspace access from the server;
9. on reassignment or unassign, the old collaboration session is left before destination/current access is obtained.

This means same-device live resume survives team movement without persisting stale team authority. The server remains authoritative for assignment revision and revokes the old workspace alias before the Student receives destination access.

Classroom mode continues to disable collaboration-link copying and legacy shared-session leaving so the Student controller owns resume, automatic reassignment, Waiting, and Leave-class lifecycle.

### `GET /api/classes/observe?workspaceId=<public-workspace-id>`

Requires the Instructor class capability in `Authorization: Bearer ...`.

The `workspaceId` query value is the non-secret public classroom workspace UUID returned by the instructor-only workspace list. The server first proves that the Instructor capability owns the class and that the requested workspace belongs to that same active class. Only then does it resolve the internal collaboration workspace ID server-side.

The response contains:

- public class metadata;
- public classroom workspace metadata;
- current Intake snapshot and revision;
- collaboration team label;
- recent participant presence/activity;
- workspace expiry/update timestamps.

It returns **no Student workspace capability and no editable alias**. The endpoint is GET-only. Student workspace capabilities, Student join capabilities, and Instructor credentials for another class cannot use it.

This is the canonical read-only observation path for #293. The browser polls this endpoint with the Instructor class capability; it must not call editable `/api/workspaces/session` or `/api/workspaces/presence` as an observer.

## Coaching feedback channel (#294)

Coaching is independent from the collaboration snapshot/revision stream.

### `GET /api/classes/coaching?workspaceId=<public-workspace-id>`

Requires the Instructor class capability. Returns coaching records for exactly one workspace in the represented class.

### `PUT /api/classes/coaching?workspaceId=<public-workspace-id>`

Requires the Instructor class capability. Body:

- `targetId` — stable target ID from the client coaching registry;
- `status` — `meets-standard` or `needs-improvement`;
- optional `note` (maximum 2000 characters);
- positive `reviewedWorkspaceRevision`;
- versioned `reviewedFieldFingerprint` such as `v1-0123456789abcdef`.

Creating a target starts `feedbackRevision` at 1. Updating the same class/workspace/target increments only that feedback record's revision.

### `DELETE /api/classes/coaching?workspaceId=<public-workspace-id>`

Requires the Instructor class capability and `targetId` in the body. Clearing feedback deletes only the coaching record.

### `GET /api/classes/coaching/student`

Requires the Student's issued classroom workspace capability. The server resolves membership from that capability hash; there is no workspace selector or enumeration operation. Students have no coaching write method.

The current product has no stable named Instructor account, so class Instructor authority is the reviewer context for #294. A rotating bearer-token hash is not stored as fake human identity.

Each record stores both the Student workspace revision visible when reviewed and a field-specific versioned fingerprint. The fingerprint is the primary evidence for **changed since review**, so unrelated edits elsewhere in the Intake do not stale every feedback record.

## Protected Case Study delivery (#295)

Protected Case Studies do not use the public template manifest and require an active Classroom capability before metadata or payload is returned.

### `GET /api/classes/case-studies`

Requires the Instructor class capability. Returns the protected Case Study catalog for the represented class context. Catalog entries contain only `id`, `name`, `description`, `templateKind`, and `supportedModes`; they do **not** contain `state`.

### `POST /api/classes/case-studies`

Requires the Instructor class capability. Body:

- `caseStudyId`

Returns the full protected Case Study record only after class authorization. Case selection belongs in the JSON body, never a URL/query string.

### `GET /api/classes/case-studies/student`

Requires the Student's issued classroom workspace capability. The server resolves active membership through `getStudentContext()`. It accepts no workspace selector and does not accept a legacy Standalone collaboration capability as substitute authority.

Returns the metadata-only protected catalog.

### `POST /api/classes/case-studies/student`

Uses the same Student membership authorization and accepts `caseStudyId` in the JSON body. On success it returns the full protected record for client-side projection through the canonical mode rules.

All protected Case Study responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The existing rotating Case Study mode password remains an instructional progression control in the Student drawer; it is not sent to or trusted by the server for authorization. An authorized client can request the raw Case Study payload directly, which is intentional: Classroom capability is the confidentiality boundary.

The build produces two generated resources:

- `src/templates.manifest.js` — public Standard Templates only;
- `api/protected-case-studies.manifest.js` — server-only Case Study metadata and payloads.

Authored `templates/*.json` files are excluded from Vercel uploads. Production functions consume the committed server-only manifest, while GitHub CI continues to validate all authored JSON and generated-file freshness.
## Staged exercise orchestration (#313)

#313 adds class-level exercise orchestration without changing collaboration authority.

### `POST /api/classes/exercise`

Requires the Instructor class capability.

Body:
- `caseStudyId` for a protected Case Study carrying an explicit server-only `simulation` definition.

Creates the represented class's draft exercise when no non-completed exercise exists. The exercise pins the normalized simulation version plus canonical SHA-256 definition fingerprint. Repeating the same selection returns the existing exercise; selecting a different case while another exercise is open conflicts.

### `GET /api/classes/exercise`

Requires the Instructor class capability.

Returns only the represented class's current non-completed exercise plus:
- complete Instructor-authorized staged definition;
- optional-content releases;
- workspace readiness/progress state;
- current-stage immutable debrief checkpoints.

Every read fails closed if the pinned simulation version/fingerprint no longer matches the current protected definition.

### `PATCH /api/classes/exercise`

Requires the Instructor class capability and positive `expectedRevision`.

Supported actions:
- `start`;
- `pause`;
- `resume`;
- `release-content` with current-stage optional `contentId`;
- `begin-debrief`;
- `advance`;
- `complete`.

Lifecycle changes use optimistic `exercise_revision`. Optional-content replay is idempotent; a stale request for a different release conflicts. `begin-debrief` captures immutable class/workspace-scoped snapshot/revision checkpoints before later live changes. Stage ordering comes from the pinned staged definition, never client-provided next-stage IDs.

**Tranche 4 does not yet claim an edit freeze.** Responses expose `editFreezeEnforced: false`; server enforcement on Student collaboration PUT is the next dedicated tranche.

### `GET /api/classes/exercise/student`

Requires the stable Student **class-session** capability, not a workspace edit capability or human join code.

Returns:
- represented public class/participant/current assignment context;
- public exercise identity/status/phase/revision;
- current Student-visible stage title/objective;
- cumulative released Student content through the current stage;
- represented workspace readiness when assigned.

It never returns future-stage metadata, Instructor content/IDs, complete Case Study `state`, another workspace's readiness, or workspace enumeration. Waiting Students can read the current class release safely.

### `PUT /api/classes/exercise/student/ready`

Requires the Student class-session capability.

Body:
- `ready: boolean`.

When setting Ready, the server resolves the participant's current assigned workspace and records the collaboration revision observed server-side. Waiting is rejected. A reassignment race conflicts rather than attaching readiness to the old workspace.

### Protected full-payload interaction

When a class has a staged exercise record for Case Study X, Student `POST /api/classes/case-studies/student` must not return X's complete protected payload. The Student must use the staged exercise endpoint instead. This block remains after exercise completion; completing a simulation is not an implicit exemplar/model-answer release. Instructor full protected access remains class-scoped and unchanged, and unrelated protected resources keep their existing behavior.

All exercise responses are private/no-store/no-referrer. Exercise state, releases, readiness, and checkpoints remain outside Intake serialization and collaboration revision state.

## Individual and group semantics

### Individual

The first participant UUID to successfully claim an individual assignment becomes its binding. A later join attempt with a different participant UUID fails generically.

This is still a capability model rather than an account identity system: deliberately sharing an already-issued workspace capability delegates that capability.

### Group

Multiple participant UUIDs may use the same assignment capability. Each successful participant receives a distinct workspace capability while all synchronize the same underlying collaboration workspace.

## Editable workspace aliases

`collaboration_workspace_capabilities` maps alternate token hashes to existing collaboration workspaces.

The legacy collaboration read/write handlers resolve only explicitly edit-capable kinds. Slice #291 permits:

```text
classroom-student
```

This prevents a future `classroom-observer` token from accidentally inheriting PUT/PATCH access. Instructor observation in #293 must use a separate read-only server path.

## Additive Neon schema

Slices #291–#294 establish:

- `collaboration_workspace_capabilities`
- `classroom_classes`
- `classroom_workspaces`
- `classroom_memberships`
- `classroom_coaching_feedback`

#312 adds the live-class participant/session layer through additive columns plus `classroom_participants`. The participant record is class-scoped and carries the current optional workspace assignment, monotonic `assignment_revision`, Student class-session capability hash, and current assignment-specific workspace-access hash. A participant may therefore exist safely in Waiting with no workspace authority.

The legacy membership table remains supported for two-code compatibility. Live assignment does not copy or merge collaboration snapshots; `classroom_workspaces` still points at the existing collaboration workspace that owns snapshot/revision/presence state.

Database foreign keys and handler authorization jointly enforce class/workspace isolation. Existing collaboration tables, Standalone secret links, and the legacy Classroom path remain valid.

#313 Tranche 3 adds persistence primitives but **no exercise HTTP routes yet**:

- `classroom_exercises` — class-scoped exercise run with protected Case Study ID, pinned simulation version + definition fingerprint, status/stage/phase, optimistic `exercise_revision`, editing-policy state, timestamps, and owning-class expiry;
- `classroom_exercise_releases` — idempotent optional-content release records;
- `classroom_exercise_workspace_state` — workspace-scoped Ready state and workspace-revision evidence;
- `classroom_exercise_checkpoints` — immutable exercise/stage/workspace snapshot + revision evidence captured for debrief.

At most one non-completed exercise exists per class in the initial model. Exercise mutation is optimistic-revision protected; replaying an already-recorded optional release does not advance revision. Ready state follows the workspace, not the participant, and checkpoint rows are first-write-wins. All repository access is class/workspace scoped and bounded by the class expiry.

No classroom credential is stored in browser Intake state.

## Rotation and revocation

| Action | Future joins | Existing Student workspace capability |
| --- | --- | --- |
| Rotate Student join | Old join token stops | Remains valid |
| Disable joins | Stops | Remains valid |
| Rotate assignment | Old assignment stops | Remains valid |
| Rotate Instructor | Old Instructor token stops | Remains valid |
| Revoke assignment | Stops | Invalidated by workspace expiry |
| Revoke class | Stops | Invalidated by workspace expiry |

## Security invariants

- Student join alone cannot enumerate workspaces.
- Assignment token is useless without the matching active class join capability.
- Cross-class join/assignment pairs fail with a generic not-found response.
- Instructor listing is class-scoped.
- Raw capabilities are never persisted or logged.
- Capability-bearing/private responses are `no-store` and `no-referrer`.
- Classroom workspaces cannot outlive class retention.
- Read-only Instructor observation must not use editable workspace aliases.
- Coaching writes must not call the collaboration snapshot update path or increment Student Intake revisions.
- Student workspace capabilities may read coaching only for their resolved membership and never write coaching.
- Existing Standalone collaboration remains unchanged.
- Case Study unlock passwords are unrelated to classroom authorization.
- Protected Case Study catalogs/payloads require Instructor-class or Student-membership authorization and are never returned to Standalone.
- Protected Case Study IDs/names/payloads must be absent from public browser assets; authored `templates/*.json` files must remain excluded from Vercel deployment.
- Protected Case Study selection uses authenticated POST bodies rather than query strings.

## Tests and cold restart

`tests/classroom-api.unit.test.mjs` exercises the core classroom authorization matrix using deterministic in-memory repositories from `tests/helpers/classroom-test-repositories.mjs`. `tests/protectedCaseStudies.api.test.mjs` covers protected Case Study Instructor/Student authorization, metadata-only catalogs, legacy-token rejection, POST payload delivery, and private response headers.

The repository test-change guard treats `api/` as runtime code, so future server changes require test changes.

For current execution state, read `docs/classroom-workstream.md`.


## #312 live-class management contract

The next-generation live-class contract is defined in `docs/classroom-live-management.md`.

Key direction:
- the human-facing join code is an admission locator, not a workspace bearer capability;
- admitted Students receive a stable high-entropy **class-session** capability;
- Students may exist in a waiting/unassigned state;
- Instructor assignment/reassignment is server-authoritative;
- editable workspace capabilities are assignment-specific and revoked on move/unassign;
- the Student class-session capability is never accepted by collaboration edit endpoints;
- destination workspace state wins on reassignment; no automatic Intake merge occurs;
- legacy two-code admission remains supported during the additive migration.

Implemented live-class endpoints are `POST /api/classes/admit`, `GET/PATCH /api/classes/participants`, `GET /api/classes/student`, and `POST /api/classes/student/access`. Existing `POST /api/classes/join` remains a compatibility path until a later explicit migration.

Student live-client semantics now implemented:
- normal Student entry is one human class code + display name;
- legacy two-code access remains available under an explicit recovery disclosure;
- Waiting retains the class-session capability but holds no collaboration edit authority;
- assignment-specific workspace tokens are memory-only and reacquired on reload/move;
- assignment revision changes trigger old-workspace disconnect before destination access;
- destination snapshot is loaded as authoritative; no old-team/local Intake merge occurs;
- unassign returns the Student to Waiting without requiring another human join code;
- terminal class-session failure clears the invalid session and restores pre-class local recovery where available;
- real-browser coverage proves Waiting -> Team Alpha -> same-device resume -> Team Beta -> Waiting and verifies stale Alpha/Beta workspace tokens return 404 after move/unassign.

Assignment semantics:
- `PATCH /api/classes/participants` is Instructor-only and accepts `participantId` plus a same-class `workspaceId`, or `workspaceId: null` to return the Student to waiting;
- assign/reassign/unassign increments `assignmentRevision` exactly when the assignment changes;
- repeating the same assignment is idempotent and does not increment the revision;
- the previous assignment-specific edit capability is revoked before assignment metadata changes;
- stale presence is removed from the old workspace by internal workspace ID after revocation;
- cross-class destinations are rejected without changing the participant assignment;
- individual workspaces remain single-participant;
- no assignment operation reads, copies, or merges Intake snapshots;
- the Student must exchange the stable class-session capability for a fresh destination workspace token after an assignment change;
- a live Student coaching/protected-resource context is valid only while the stored workspace-access hash also resolves to an active, unrevoked `classroom-student` collaboration alias.
