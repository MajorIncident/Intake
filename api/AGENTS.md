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

The classroom authorization chain is:

```text
Instructor class capability
  -> class administration + class-scoped workspace listing

Student join capability + assignment capability
  -> one authorized individual/group workspace
  -> newly minted per-participant editable workspace capability
```

Rules:

- Student join capability alone must never enumerate classroom workspaces.
- Assignment capability must resolve only within the active class represented by the Student join capability.
- Instructor workspace listing must be scoped to exactly the class represented by the Instructor capability.
- Classroom workspaces reuse `collaboration_workspaces`; do not create a parallel snapshot/revision/presence engine.
- Raw bearer capabilities are returned only at creation/rotation. Persist only SHA-256 hashes.
- Classroom credentials never enter `kt-intake-full-v2`, exported Intake files, summaries, templates, or Case Study payloads.
- Individual assignment ownership uses the opaque participant UUID, never the display name.

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

## Testing

Any runtime change under `api/` is included in the repository test-change guard.

Classroom API changes must preserve automated coverage for:

- class-scoped Instructor listing;
- Student non-enumeration;
- cross-class assignment rejection;
- individual claim-once vs group sharing;
- credential rotation and revocation;
- classroom workspace token reuse through the existing collaboration session API;
- edit-capability kind restrictions;
- legacy Standalone collaboration behavior.
- coaching class scoping, independent feedback revisions, Student read-only access, and zero Student snapshot-revision changes.
