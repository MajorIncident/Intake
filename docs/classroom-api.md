# Classroom API and Capability Contract

This document is the canonical server contract for Classroom Experience slice #291. It complements `docs/classroom-architecture.md` so future human or AI sessions can extend Student, Instructor, coaching, and protected Case Study work without reconstructing authorization decisions from code.

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
| Instructor class capability | Administer one class and list that class's workspaces | Yes, own class only | SHA-256 hash |
| Student join capability | Admit a join attempt into one class | **No** | SHA-256 hash |
| Assignment capability | Select one individual/group assignment inside the admitted class | **No** | SHA-256 hash |
| Student workspace capability | Edit/sync the resolved collaboration workspace | N/A | SHA-256 alias hash |
| Legacy Standalone workspace capability | Existing secret-link collaboration | N/A | SHA-256 hash |
| Instructor class capability | Read-only live observation and coaching administration for its class | Yes, own class only | SHA-256 hash |

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

### Student client consumption (#292)

The browser sends the Student join capability only in the Authorization header and the assignment capability only in the POST body. On success, both admission codes are discarded. The raw returned `workspaceToken` is retained under `kt-classroom-student-session-v1` solely for same-device resume.

The collaboration client attaches that workspace capability programmatically; classroom workspace capabilities are **not** written into `?workspace=` URLs. Classroom mode disables collaboration-link copying and legacy shared-session leaving so the Student controller remains the owner of resume/Leave-class lifecycle.

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

Slice #291 adds:

- `collaboration_workspace_capabilities`
- `classroom_classes`
- `classroom_workspaces`
- `classroom_memberships`
- `classroom_coaching_feedback`

The membership table has a composite foreign key to `classroom_workspaces(class_id, workspace_id)`, so class/workspace isolation is enforced by the database as well as by handler authorization.

Existing collaboration tables and secret links remain valid.

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

## Tests and cold restart

`tests/classroom-api.unit.test.mjs` exercises the authorization matrix using deterministic in-memory repositories from `tests/helpers/classroom-test-repositories.mjs`.

The repository test-change guard treats `api/` as runtime code, so future server changes require test changes.

For current execution state, read `docs/classroom-workstream.md`.
