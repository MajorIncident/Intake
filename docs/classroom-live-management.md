# Classroom Live Management Architecture

## Purpose

This is the implementation contract for #312, the first post-foundation Classroom slice.

The #288 foundation proved secure Student/Instructor roles, collaboration, observation, coaching, protected Case Studies, and required real-browser CI. #312 changes the **operating model** from capability-oriented setup to an Instructor-run live class:

```text
Instructor starts class
  -> product shows one human-friendly Student join code
  -> Students enter the class and may wait unassigned
  -> Instructor creates teams / individual workspaces
  -> Instructor assigns or reassigns Students live
  -> Student automatically reconnects to the assigned workspace
  -> Instructor observes/coaches teams from one dashboard
```

#313 staged Case Study simulation builds on this substrate. Do not implement staged exercise state inside #312.

## Product invariants

1. **Start Class is the normal Instructor path.** A normal Instructor should not have to invent or type an Instructor bearer capability.
2. **Students type one human join code plus a display name.** The current class-capability + assignment-capability UI is transitional.
3. **The human join code is not workspace authorization.** It may admit a participant into one class, but cannot enumerate the class or edit an Intake.
4. **An admitted Student may be unassigned.** Late arrivals must be able to wait safely while a class/exercise is already running.
5. **Instructor assignment is server-authoritative.** Moving a Student changes the workspace they are authorized to edit.
6. **Reassignment never merges Intake snapshots.** The destination team's current Intake is authoritative; the old team's Intake stays with the old team.
7. **Old edit authority stops on reassignment.** A Student must not retain indefinite write access to a previous team.
8. **Instructor observation remains read-only.** Team management does not route Instructor authority through editable collaboration aliases.
9. **Coaching stays workspace-scoped.** Existing feedback remains attached to the workspace/reasoning it reviewed; reassignment does not silently copy it.
10. **Student credentials cannot enumerate classmates, teams, or other workspaces.**
11. **Standalone remains backend-optional and unchanged.**
12. **Legacy Classroom sessions remain compatible during migration.** Do not break existing saved Student/Instructor sessions in the first #312 server tranche.

## Why one stable workspace edit token is unsafe

Do **not** implement reassignment by simply moving one active Student edit token from Workspace A to Workspace B.

An old in-flight PUT may have been created from Workspace A state. If the same token suddenly resolves to Workspace B, that stale request could overwrite Team B with Team A's snapshot.

The safe contract is:

- Student **class session** capability is stable across assignment changes and is not accepted by collaboration edit endpoints.
- Student **workspace edit** capability is assignment-specific.
- Instructor reassignment revokes the old workspace edit capability before a new destination capability can be used.
- The Student obtains a fresh workspace capability after observing the new assignment.
- A late old request can therefore affect only its old workspace before revocation, or fail after revocation. It can never be reinterpreted as a write to the destination workspace.

## Human-facing join code

### Format

Target an 8-character unambiguous uppercase code, displayed in two groups such as:

```text
K7FM-P4Q2
```

Use an alphabet that avoids easily confused characters such as `0/O` and `1/I`. Normalize case and separators on input.

The exact alphabet is an implementation detail; the security properties are not:

- code is random and class-scoped;
- code is unique among active classes;
- code expires/revokes with the class;
- code can be rotated by the Instructor;
- joins can still be globally enabled/disabled per class.

### Security classification

The join code is an **admission locator**, not a privileged bearer capability.

It may be stored server-side in normalized form so the authorized Instructor dashboard can redisplay it. Possession of the code can at most attempt class admission; it cannot:

- list participants;
- list workspaces;
- observe Student Intake;
- retrieve protected Case Studies;
- write coaching;
- edit a workspace.

Public exposure may eventually justify rate limiting / abuse controls. That operational hardening is compatible with this contract.

## Capability model

### Instructor capability

High-entropy bearer returned once by class creation and persisted only in the Instructor's separate same-device Classroom session envelope.

Authority:
- administer exactly one class;
- read join code;
- list participants/workspaces;
- create/rename workspaces;
- assign/reassign/unassign participants;
- use existing observer/coaching/protected-teaching APIs.

It is never an editable collaboration alias.

### Student class-session capability

High-entropy bearer minted at admission.

Authority:
- read only that participant's class/assignment status;
- request a workspace access capability for the participant's **current** assignment;
- leave/revoke own class session if implemented.

It cannot enumerate participants or workspaces and is not accepted by `/api/workspaces/*`.

The Student client persists this token for same-device class resume.

### Student workspace capability

High-entropy, assignment-specific editable collaboration alias using the existing `classroom-student` capability kind.

Authority:
- existing collaboration session/presence APIs for exactly one current workspace;
- existing Student coaching/protected Case Study reads that resolve active membership.

On reassignment/unassignment, this capability is revoked before the Student can receive destination edit access.

## Additive persistence model

Do not mutate the legacy two-code membership contract destructively in the first tranche. Add the live-class model beside it, then move the UI after server behavior is proven.

### `classroom_classes`

Add a human-facing join code field, conceptually:

```text
student_join_code VARCHAR(...) UNIQUE
```

The existing high-entropy `student_join_token_hash` remains temporarily for the legacy `/api/classes/join` path.

### `classroom_participants`

New canonical live-class admission record:

```text
class_id                   BIGINT
participant_id             UUID
display_name               VARCHAR(60)
session_token_hash          CHAR(64) UNIQUE
workspace_id                BIGINT NULL
workspace_access_token_hash CHAR(64) UNIQUE NULL
assignment_revision         INTEGER NOT NULL DEFAULT 0
joined_at                   TIMESTAMPTZ
updated_at                  TIMESTAMPTZ
assigned_at                 TIMESTAMPTZ NULL
revoked_at                  TIMESTAMPTZ NULL

PRIMARY KEY (class_id, participant_id)
FOREIGN KEY (class_id, workspace_id)
  -> classroom_workspaces(class_id, workspace_id)
```

Interpretation:

- `workspace_id IS NULL` = waiting/unassigned;
- `assignment_revision` increments on every assign, reassign, or unassign;
- `session_token_hash` authorizes only Student class-session APIs;
- `workspace_access_token_hash` records the currently issued assignment-specific collaboration capability, if any;
- raw capabilities are never stored.

Existing `classroom_memberships` remains valid for legacy sessions until a later explicit migration/removal.

## Implementation checkpoint — additive persistence

Completed on #314 before any Student UI cutover:

- human join-code helpers enforce the eight-character unambiguous alphabet and normalize display separators/case;
- `classroom_classes.student_join_code` is additive and uniquely indexed when present;
- new `classroom_participants` persists admitted live-class participants separately from legacy `classroom_memberships`;
- a participant may exist with `workspace_id = NULL` as a first-class waiting/unassigned state;
- Student class-session capability hashes are independent from assignment-specific workspace-access hashes;
- re-admitting the same participant may rotate the class-session capability and update display name without inventing a workspace assignment;
- Instructor-scoped participant listing and Student-session lookup repository primitives are in place;
- legacy two-code admission and `classroom_memberships` remain unchanged.

Durable implementation commits:
- `99c31f2e9c59180ed297db96512b62b310692b4c` — additive schema/repository primitives;
- `fa6180ada0183dfc4b19790925e61deea60bdfbf` — participant composite FK preserves required class identity when a workspace is deleted;
- `5665637e6f550bebb861c73109e991b6e96a73c9` — deterministic in-memory participant/session model;
- `df3633d008bb7e352509e15c1964b7d27ebf441f` — focused join-code/waiting-roster/session-rotation tests.

Validation on `df3633d...`:
- canonical repository quality: **241 tests, 1 intentional skip**;
- required Browser E2E: **22 passed, 6 intentional project-scoped skips, 0 failed**;
- CodeQL, Dependency Review, and Template Manifest Guard: green.

**Exact next tranche:** implement the new live-class HTTP layer around these primitives:
- Start Class emits a generated human join code while preserving the legacy high-entropy join token for compatibility;
- `POST /api/classes/admit` creates/rotates a waiting Student class session;
- `GET /api/classes/student` returns only the represented Student's own assignment state;
- `POST /api/classes/student/access` issues assignment-specific edit authority only when assigned;
- `GET /api/classes/participants` gives only the Instructor their live roster.

Do not implement assign/reassign UI or cut over the current Student client until these APIs and their authorization tests are green.

## API contract

Names below are the intended #312 contract. Keep route files thin and handlers injectable.

### Existing `POST /api/classes` — Start Class

Normal Instructor Start Class calls the existing create endpoint with a title.

New response adds a human join code:

```json
{
  "class": { "id": "...", "title": "...", "joinsEnabled": true, "expiresAt": "..." },
  "instructorToken": "<high entropy>",
  "joinCode": "K7FM-P4Q2"
}
```

During compatibility migration, the server may also return the existing legacy `studentJoinToken`; the new Instructor UI must not depend on or present it.

Instructor client:
- persists `instructorToken` in the existing Instructor session envelope;
- immediately enters the dashboard;
- displays/copies the Student join code;
- supports join-code rotation and joins on/off.

### `POST /api/classes/admit` — Student admission

No Instructor/workspace capability is accepted.

Request:

```json
{
  "joinCode": "K7FM-P4Q2",
  "participantId": "<local opaque UUID>",
  "displayName": "Alex"
}
```

Success returns only the represented Student's class/session context:

```json
{
  "class": { "id": "...", "title": "...", "expiresAt": "..." },
  "participant": {
    "id": "...",
    "displayName": "Alex",
    "assignmentRevision": 0
  },
  "assignment": null,
  "studentSessionToken": "<high entropy>"
}
```

Admission creates the waiting participant immediately. Re-admission by the same class + participant ID may update display name and rotate that participant's Student session capability while preserving current assignment.

Failures remain generic enough to avoid class enumeration.

### `GET /api/classes/participants` — Instructor roster

Instructor capability only.

Returns admitted participants including unassigned/late arrivals and current assignment metadata, but no raw capability values.

Representative record:

```json
{
  "id": "...",
  "displayName": "Alex",
  "joinedAt": "...",
  "assignmentRevision": 3,
  "assignment": {
    "id": "...",
    "kind": "group",
    "label": "Team B"
  },
  "activity": {
    "state": "editing",
    "lastSeenAt": "..."
  }
}
```

Activity is derived from the currently assigned collaboration workspace when available.

### `PATCH /api/classes/participants` — assign / reassign / unassign

Instructor capability only.

Request:

```json
{
  "participantId": "...",
  "workspaceId": "..."
}
```

Use `workspaceId: null` to return a Student to the waiting/unassigned state.

Server transaction/ordering requirements:

1. prove participant and destination belong to the Instructor's class;
2. capture the old workspace + old workspace-access hash;
3. revoke the old `classroom-student` workspace capability;
4. remove stale presence from the old workspace;
5. update participant `workspace_id`;
6. clear `workspace_access_token_hash`;
7. increment `assignment_revision`;
8. commit the new assignment metadata.

Do **not** copy or merge snapshots.

### `GET /api/classes/student` — Student assignment status

Requires Student class-session capability.

Returns only that Student's own status:

```json
{
  "class": { "id": "...", "title": "...", "expiresAt": "..." },
  "participant": {
    "id": "...",
    "displayName": "Alex",
    "assignmentRevision": 3
  },
  "assignment": {
    "id": "...",
    "kind": "group",
    "label": "Team B"
  }
}
```

For waiting Students, `assignment` is `null`.

A later optimization may support `afterAssignmentRevision` / 204 long-poll semantics. It must never add a workspace list.

### `POST /api/classes/student/access` — obtain current workspace access

Requires Student class-session capability.

If unassigned, return a clear authenticated waiting/unassigned response.

If assigned:

1. generate a fresh high-entropy workspace capability;
2. create a `classroom-student` alias for the current workspace;
3. store only its hash as the participant's current `workspace_access_token_hash`;
4. revoke any prior active workspace-access capability;
5. return the raw token once with assignment metadata/revision.

If a response is lost, retry may safely rotate again. No raw token needs server persistence.

The Student client requests access:
- after initial assignment;
- after assignment revision changes;
- on resume when its locally cached workspace access is missing/stale.

## Implementation checkpoint — live HTTP admission/status/access

Completed on #314 after the additive persistence tranche and before any Student UI cutover.

Implemented:
- Start Class now generates and returns a formatted human Student join code while preserving the legacy high-entropy `studentJoinToken` for compatibility;
- `POST /api/classes/admit` accepts only join code + participant ID + display name and returns a high-entropy Student class-session token;
- admitted Students may remain waiting/unassigned with no collaboration edit authority;
- `GET /api/classes/participants` is Instructor-only and lists only the represented class;
- `GET /api/classes/student` returns only the represented Student's own assignment state and never a roster/workspace catalog;
- `POST /api/classes/student/access` exchanges a Student class-session token for a fresh assignment-specific `classroom-student` workspace capability only when assigned;
- rotating current workspace access revokes the prior edit token;
- the class-session token itself is not accepted by collaboration workspace APIs;
- live workspace-access tokens now resolve through the existing Student coaching/protected-resource membership boundary, while legacy membership tokens continue to work;
- workspace-access issuance checks class/workspace/assignment revision before persisting the token so a concurrent assignment change cannot silently bind stale access to the wrong team.

Durable implementation commits:
- `746559e67620aab3457b6cda90e42168d5350dde` — Start Class join code + live workspace-access repository path + live/legacy Student context resolution;
- `1b81d4a4c80a7fe16cee5523d6c13811f51f20b3` — deterministic repository parity for live access;
- `2d6f92d05c693c35818e4457685c311c66a65807` — live admission/roster/status/access handlers;
- `11a83da6d96588022b8879b3c5ca1e6961e75ed8` through `dc698c1103285efe95932c253f6cdbd1172b3227` — Vercel route entrypoints;
- `04f95f24dd63d2ce75260034d75c9c514d07e84e` — focused HTTP authorization tests.

Validation on `04f95f2...`:
- repository quality: **244 tests / 243 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **22 passed / 6 intentional project-scoped skips / 0 failed**;
- CodeQL, Dependency Review, and Template Manifest Guard: green.

**Exact next tranche:** implement Instructor assign/reassign/unassign repository + HTTP semantics before building the live management UI. The critical acceptance proof is:
1. assign waiting Student -> access token edits destination workspace;
2. reassign A -> B -> old A token is revoked before B access can be issued;
3. unassign -> old token is revoked and Student returns to waiting;
4. cross-class destination assignment is rejected;
5. no assignment operation copies or merges Intake snapshots;
6. stale Team A authority can never become Team B authority.

## Student client lifecycle

### Waiting

After admission:
- retain Student class-session capability;
- discard the human join code;
- show class/participant context and a waiting-for-assignment state;
- do not connect collaboration;
- poll only the Student assignment-status endpoint.

### Assigned

When assignment appears:
- request current workspace access;
- connect the existing collaboration controller with the returned assignment-specific token;
- show the normal Student Intake and class/team chrome.

### Reassigned

When `assignmentRevision` changes:

1. stop/leave old collaboration locally;
2. discard old local workspace access token;
3. request current workspace access;
4. connect to destination workspace from a clean collaboration revision;
5. render destination snapshot as authoritative;
6. notify the learner that the Instructor moved them.

Never merge old local/team Intake into the destination.

### Unassigned after work has begun

Disconnect collaboration and return to waiting state. Keep the Student class-session capability so the Instructor can assign them again without a new join code.

### Terminal class/session failure

Retain the existing safe recovery philosophy: clear invalid Classroom credentials and restore pre-class local Intake where appropriate.

## Instructor experience contract

### Start Class

Instructor experience should offer:
- **Start a class** as the primary path;
- optional **Resume/Open existing class** as recovery/advanced path;
- title input;
- immediate dashboard after creation;
- prominent Student join code with copy/share affordance.

A QR/share link can be added after the code contract is stable. If a join code is included in a URL later, prefer a client-side fragment or another design that avoids accidental referrer/log leakage.

### Live roster and teams

Dashboard should expose:
- Waiting / Unassigned;
- each team/individual workspace;
- participant count and names;
- active/editing state;
- coaching / needs-improvement / changed-since-review signals where available.

Instructor can:
- create/rename workspaces;
- assign a waiting Student;
- move a Student between teams;
- unassign a Student;
- observe/coach the selected team.

Drag-and-drop may be offered, but accessible buttons/keyboard interaction are the canonical contract.

## Reassignment content policy

When moving Student A from Team A to Team B:

- Team A keeps its existing Intake unchanged;
- Team B keeps its existing Intake unchanged;
- Student A begins seeing/editing Team B after reconnect;
- Student A's local copy does not overwrite Team B;
- no automatic field merge is attempted;
- coaching records remain attached to the workspace they reviewed.

This is intentionally predictable for a facilitated exercise.

## Compatibility plan

The first #312 server tranche is additive.

Keep working:
- legacy `POST /api/classes/join`;
- legacy `classroom_memberships`;
- existing Student saved workspace sessions;
- existing Instructor bearer resume;
- current observation/coaching/protected-resource paths.

New Student UI moves to admit/status/access only after:
- repository/API tests prove assignment/reassignment safety;
- new protected Case Study/coaching Student authorization accepts the new workspace-access path;
- browser fixture supports waiting/assign/reassign.

Do not delete legacy tables/routes in #312 unless a separate migration explicitly proves no supported client depends on them.

## Security tests required before UI cutover

Server/API:
- join-code normalization and active-class uniqueness;
- invalid/expired/rotated join code rejected generically;
- join code cannot enumerate participants/workspaces;
- admitted unassigned Student cannot access collaboration;
- Student class-session token cannot access collaboration directly;
- Instructor lists only own class participants;
- cross-class workspace assignment rejected;
- assign -> workspace access works;
- reassign -> old workspace token fails and new destination token works;
- unassign -> old workspace token fails and no new access is issued;
- stale old-team request can never resolve as destination-team write;
- another Student's session token cannot fetch this Student's status;
- legacy two-code admission still passes;
- new workspace-access token still works with coaching and protected Case Study Student reads.

Browser:
- Instructor starts class and sees one Student-facing code;
- Student joins and waits unassigned;
- late Student joins after class work begins;
- Instructor creates Team A / Team B and assigns Students;
- two Team A Students sync one Intake; Team B remains isolated;
- Instructor moves Student A -> B; Student reconnects to B and old A edit access stops;
- accessible non-drag assignment path works;
- Instructor observer/coaching continues across team changes.

## Rollback boundary

Because the first implementation is additive:
- old class/join/workspace APIs remain available;
- existing collaboration schema remains authoritative for Intake snapshots;
- new participant/join-code structures can be left unused if the new UI must be rolled back;
- Student UI should not cut over until new API tests and browser fixture are green.

Schema/data cleanup, if ever required, is a later migration—not part of an emergency rollback.

## Relationship to staged simulation

#313 consumes this contract:

- class exists and has a human Student join path;
- Instructor owns a live roster;
- teams/workspaces can change during class;
- Students have a stable class session independent of current workspace;
- assignment changes are observable and safe.

Only after those are stable should #313 add exercise/stage state and progressive protected Case Study release.
