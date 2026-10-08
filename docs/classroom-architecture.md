# Classroom Experience Architecture

## Purpose

This document is the durable architecture contract for the Classroom Experience program tracked by #288. It exists so a future human or AI session can resume the work without relying on prior chat history.

The program adds three **experience roles** to Intake:

- **Standalone** — local-first Intake, Templates, file import/export, summaries, and optional ad-hoc collaboration.
- **Student** — class-aware individual or group Intake workspaces, Templates + Case Studies, and instructor feedback.
- **Instructor** — class management, roster navigation, read-only live observation, and field-level coaching.

## Independent axes

Do not collapse these concepts into one mode.

| Axis | Meaning | Examples | Persistence |
| --- | --- | --- | --- |
| Experience role | Who is using the product / in what context | standalone, student, instructor | Separate experience/session preference; never part of Intake snapshot |
| Intake mode | Which problem-solving lens is active | General, IT, Pharma, Major Incident | Existing `meta.intakeMode` contract |
| Resource kind | What starter material is being used | Standard Template, Case Study | Existing template metadata |
| Workspace shape | Who shares one Intake snapshot | individual, group | Classroom/server metadata |
| Coaching status | Instructor evaluation of a coachable target | meets-standard, needs-improvement | Separate server-side coaching channel |

## Non-negotiable invariants

1. Experience role must never be written into `kt-intake-full-v2`, exported Intake files, summary output, or curated Intake payloads.
2. Standalone must remain usable with the classroom backend unavailable.
3. Existing intake modes remain workflow configuration and must not acquire Student/Instructor semantics.
4. Existing collaboration snapshot/revision/presence machinery is the basis for Student/team workspaces.
5. Instructor observation cannot mutate student Intake snapshots.
6. Coaching cannot share the Intake snapshot revision channel.
7. Student credentials cannot enumerate classmates or other workspaces.
8. Instructor access, student class admission, and Case Study unlock passwords are separate credential concepts.
9. Protected Case Study metadata/payloads must remain outside public browser/static assets and require Classroom authorization before server delivery.
10. Existing ad-hoc collaboration remains supported for Standalone unless a later explicitly approved migration replaces it.

## Target domain model

```text
Class
  id
  title
  instructor capability hash
  human Student join code
  status / expiry / retention metadata

  -> Classroom Participant [0..n]
       opaque participant id + display name
       Student class-session capability hash
       current workspace assignment (optional / Waiting)
       assignment revision
       current assignment-specific workspace-access hash (optional)

  -> Classroom Workspace [0..n]
       id
       kind: individual | group
       display label
       existing collaboration workspace reference

       -> existing collaboration snapshot / revision / presence

  -> Coaching Feedback [0..n]
       class + workspace + coachable target id
       status / note
       reviewed workspace revision
       reviewed field fingerprint
       independent feedback revision
       created/updated metadata

  -> Classroom Exercise / Stage State [#313]
       selected protected Case Study + pinned staged-definition identity
       exercise status / current stage / phase / optimistic revision
       optional Student-content release state
       per-workspace readiness
       immutable per-workspace debrief checkpoints
       Instructor-only facilitation/debrief material remains in protected definition
```

The **Classroom Workspace** references the existing collaboration workspace rather than duplicating its snapshot, revision, participant, or presence engine. #312 deliberately separates stable class participation from mutable workspace assignment so a Student can wait unassigned, move between teams, or be unassigned again without changing identity or merging team Intake state.

## Experience role lifecycle

Slice #289 established the role foundation and #330 now owns startup intent:

- canonical `standalone`, `student`, and `instructor` roles live in `src/experienceRoles.js`;
- a versioned local-only `kt-experience-role-v1` last-choice preference is owned by `src/experienceRoleController.js`;
- `src/startupExperienceHub.js` independently detects substantive saved Intake, current Student resume, and current Instructor resume and renders explicit Continue cards;
- ordinary launch remains unselected until the user chooses Continue / Work independently / Join a class / Run a class;
- a safe `#join=<human-code>` fragment highlights Join but does not bypass admission;
- only an explicit `?workspace=` collaboration capability routes directly to Standalone;
- **View → Experience** reopens the same hub without destroying current Intake/Classroom state;
- declarative `data-experience-surface` projection remains independent from Intake mode.

**Start Fresh** clears Intake state without clearing the last-choice role preference, but that preference no longer auto-routes a later launch.

The local experience preference and startup hub are **not authentication or authorization**. Student class admission and Instructor privileges remain server-enforced capabilities. Resume cards may display only non-secret local context and role/session navigation must never alter Intake serialization.

### Standalone

Standalone is the compatibility anchor.

- no account required;
- local Intake continues to boot from existing storage;
- Templates available;
- Case Studies absent from the normal resource UI;
- optional existing secret-link collaboration remains available;
- classroom APIs are not required for boot or editing.

### Student

Student mode adds class context around the normal Intake.

The normal #312 path is **display name + one human class code**. The code is admission-only: `POST /api/classes/admit` resolves one active class and mints a high-entropy Student class-session capability for exactly one participant. The client never lists classes, classmates, teams, or workspaces.

A Student may be admitted while **Waiting / unassigned**. In that state:
- `kt-classroom-student-session-v1` stores only the Student class-session capability plus public class/participant/current-assignment context;
- there is no collaboration workspace token and Intake remains hidden;
- the browser polls only its own assignment state.

When assigned, the Student exchanges the class-session capability through `POST /api/classes/student/access` for a fresh assignment-specific editable workspace capability. That workspace capability is memory-only, is attached programmatically to the existing collaboration controller, and is never placed in `?workspace=` or persisted in the live resume envelope.

On assignment revision change, the client leaves/discards old collaboration authority before requesting destination access. The destination team's current Intake is authoritative; old local/team work is never merged into it. Unassign disconnects collaboration and returns the Student to Waiting while retaining the stable class session.

A pre-class local snapshot remains separately recoverable under `kt-classroom-student-local-recovery-v1`. Terminal invalid/expired class-session access clears Classroom credentials and restores local recovery where appropriate.

The #292 **class join capability + assignment capability** flow remains available only as explicit legacy/recovery compatibility. No classroom metadata or capability belongs in the Intake snapshot.

### Instructor

Instructor mode is supervisory.

Slice #293 turns the earlier non-editing Instructor shell into a class-aware observer. The Instructor class capability opens exactly one class, returns only that class's workspace metadata, and is retained locally only for same-device resume.

The Instructor gets a searchable/filterable individual/team workspace rail and can rapidly switch the main observer among authorized workspaces. Selection polls the GET-only class observer endpoint; switching aborts/stales the previous request before a later response can replace the newly selected workspace.

Observed Student state reuses the normal Intake DOM rather than maintaining a second renderer. Because normal `applyAppState()` is intentionally allowed to update feature caches during import/restore, the observer applies Student state inside a localStorage preservation boundary and then projects every Student-owned control read-only/disabled. The Instructor's pre-observation local Intake is restored when leaving the role/class.

Instructor coaching writes still go through the separate coaching channel in #294, not the Student snapshot channel.

### Coaching channel

Coaching records are keyed by class + workspace + stable coaching target ID. They carry `meets-standard` / `needs-improvement`, an optional note, the reviewed Student workspace revision, a versioned field fingerprint, and their own per-target feedback revision.

The capability model has no stable named Instructor account, so the represented class Instructor authority is the reviewer context for this slice. Do not persist rotating Instructor capability hashes as if they were human identity.

Student feedback reads are authorized by the already-issued Student workspace capability and resolve membership server-side. Students never send a workspace selector and have no coaching write method.

Field-specific fingerprints, not whole-workspace revision comparisons, determine whether the target changed after review. The workspace revision remains useful context/audit evidence.

## Authentication and capability model

The collaboration/Classroom model is capability-based: possession of the correct secret grants only the authority represented by that capability, while raw secrets are never persisted where a hash suffices.

Primary #312 credential chain:

- **Instructor class capability** — administers exactly one class; may list that class's roster/workspaces, assign/reassign Students, observe read-only, coach, and access Instructor-scoped protected teaching resources.
- **Human Student join code** — low-entropy admission locator only; cannot enumerate or edit anything.
- **Student class-session capability** — high-entropy stable participant credential; may read only that Student's assignment state and request current assignment access.
- **Student workspace capability** — assignment-specific `classroom-student` editable alias into exactly one collaboration workspace; revoked/rotated on reassignment or unassign.
- **Case Study unlock password** — instructional progression control only; never server authentication.

Legacy compatibility chain:
- **Student class join capability + assignment capability** still authorize the older two-code admission endpoint and mint a per-participant editable workspace capability.

The Student class-session capability is never accepted by collaboration edit, Instructor observer, or Instructor coaching endpoints. The human join code is never accepted outside admission. Cross-class assignment attempts fail generically.

Raw bearer capabilities travel in Authorization headers or request bodies as appropriate, never API query strings. Private responses remain no-store/no-referrer.

`collaboration_workspace_capabilities` is deliberately an **editable alias** path. Only explicitly allowed edit kinds may resolve there; `classroom-student` is the Classroom edit kind. Instructor authority stays outside that alias table and uses separate server-enforced administration/GET-only observation paths so Instructor access cannot inherit snapshot PUT/PATCH capability.

## Student assignment

The server, not the browser, owns live assignment.

#312 models assignment on the class participant separately from admission:
- an admitted Student may have `workspace_id = null` and remain Waiting;
- Instructor `PATCH /api/classes/participants` assigns, reassigns, or unassigns only within the represented class;
- `assignment_revision` increments only on a real assignment change and gives the Student a monotonic change signal;
- old assignment-specific workspace authority is revoked before assignment metadata changes;
- destination access is minted only later when the Student requests current access;
- a stale old-team token must fail rather than being remapped to the destination workspace;
- no assignment operation reads, copies, or merges Intake snapshots;
- individual live workspaces remain single-participant; group workspaces support multiple distinct participant capabilities.

The Student own-status endpoint has no roster/workspace enumeration. Display name remains presentation metadata, not identity.

The legacy #291/#292 assignment-capability semantics remain supported behind the explicit two-code recovery path. Resume/recovery keys for both models stay outside `kt-intake-full-v2`, file export, templates, and summaries.

## Instructor observation

The observer needs current snapshots and presence without becoming an editor.

Preferred design:

- instructor class API returns authorized workspace metadata;
- selecting a workspace obtains read-only observation access;
- observation polling uses the same revision semantics as collaboration where possible;
- switching workspaces disposes old timers/subscriptions cleanly;
- instructor presence, if exposed to students, is a distinct observer concept and must not masquerade as an editable participant.

Server authorization must enforce read-only observation. UI disabling alone is not a security boundary.

## Coaching feedback

Coaching is separate from Intake state.

Canonical concepts:

- stable `targetId` for a coachable field/card;
- status: `meets-standard | needs-improvement`;
- optional note;
- reviewed Intake revision and/or field evidence;
- instructor metadata;
- timestamps;
- independent coaching revision/version.

This enables later features without changing the core contract:

- changed since review;
- unresolved feedback count;
- review history;
- instructor filters by coaching state;
- class-level progress views.

Student edits, template loads, collaboration conflicts, Save/Load, and restoring local Intake files must never erase coaching.

## Coachable target identifiers

Do not key feedback to CSS selectors or display labels.

Introduce stable semantic identifiers owned by the feature modules. A target registry can later expose metadata such as section, label, supported coaching, and current field revision/fingerprint.

Changing a target ID is a data migration.

## Templates and Case Studies

The existing `templateKind` distinction remains useful.

Implemented state (#295):

- `src/templates.manifest.js` is the public browser manifest and contains Standard Templates only.
- `api/protected-case-studies.manifest.js` is server-only generated content containing protected Case Study metadata + full payloads.
- All authored JSON remains under `templates/` for maintainers and is validated by `npm run build:templates`, but `.vercelignore` excludes `templates/*.json` from deployment so raw authoring files cannot be fetched as static assets.
- Student and Instructor clients receive protected catalog metadata only after Classroom authorization. Full Case Study state is fetched on demand with an authenticated POST and then projected through the same `MODE_RULES` path used by public Templates.
- `src/classroomCaseStudies.js` keeps authorized catalog/context in memory only and clears it when Classroom context disconnects.
- Standalone has no protected provider context and can operate with the Classroom backend unavailable.
- The rotating Case Study password remains pedagogy only; the Classroom capability is the confidentiality boundary.
- Instructor class capability currently authorizes the class teaching catalog. There is no separate case-assignment table yet; a future case-level assignment model can narrow teaching availability without changing the public/private bundle boundary.
- Once an authorized Student applies a Case Study, the projected content becomes that Student/team Intake and follows normal Intake/collaboration persistence. The boundary prevents unauthorized source retrieval; it is not DRM against an authorized learner.

## Server persistence

Continue the existing Neon/Vercel approach unless evidence justifies a platform migration.

The Classroom persistence model uses:

- `collaboration_workspace_capabilities` — explicitly editable aliases into existing collaboration workspaces;
- `classroom_classes` — class metadata/retention, Instructor capability hash, human Student join code, join-enable state, and expiry/revocation;
- `classroom_workspaces` — individual/group workspace metadata linked to existing collaboration workspaces;
- `classroom_participants` — live participant identity, optional current assignment, `assignment_revision`, Student class-session capability hash, and current workspace-access capability hash;
- `classroom_coaching_feedback` — separate class/workspace/target coaching channel.

#328 removes the pre-production Student join-token hash, workspace assignment-claim hash, and `classroom_memberships` table. Existing pre-production databases drop those obsolete structures during idempotent schema initialization.

Protected Case Study delivery (#295) adds no public/browser data table and remains server-gated. #313 Tranche 3 now adds exercise orchestration persistence separately from Intake snapshots and participant authorization:

- `classroom_exercises` — one exercise run, owning class, protected Case Study identity, pinned simulation version/fingerprint, lifecycle/stage/phase, optimistic revision, editing-policy state, and class-bounded expiry;
- `classroom_exercise_releases` — explicitly released optional Student content by exercise/stage/content ID;
- `classroom_exercise_workspace_state` — workspace/team Ready state plus collaboration-revision evidence;
- `classroom_exercise_checkpoints` — immutable pre-debrief workspace snapshot/revision evidence.

These tables do not replace or duplicate collaboration state. Checkpoints are historical facilitation evidence only; the live Intake remains in `collaboration_workspaces`. Normal Instructor exercise reads expose only checkpoint metadata. Snapshot bytes are available only through an explicit Instructor-authorized current-stage debrief inspection read, are rendered through the existing read-only observer surface, and never become live collaboration state or browser-persisted exercise state. Exercise state must not overload collaboration revision or coaching revision.

Schema initialization/migration must remain idempotent and documented. Browser boot for Standalone must never depend on Classroom schema creation.

## Security boundaries

Tests and code review must explicitly defend:

- student A cannot enumerate or load student/team B without authorization;
- one class cannot observe another class;
- instructor observer cannot update student Intake snapshot;
- student cannot write instructor coaching;
- Standalone cannot retrieve protected Case Study payloads;
- protected Case Study payloads are absent from public static assets;
- exported Intake data contains no classroom credentials;
- API failures do not degrade Standalone.

## Testing model

Keep the current Node/jsdom suite for deterministic module/API behavior.

Use #279 Playwright infrastructure for browser-level journeys. Classroom coverage accumulates as each slice lands and culminates in #296.

High-value browser/security journeys are listed in #296.

## Pre-production hardening direction

The repository is still pre-production and has no external production users to migrate. Compatibility that exists only because earlier development slices used a different Classroom credential or save-file model is therefore **not** a product requirement.

The approved target architecture is defined in `docs/preproduction-hardening.md` and issues #328–#330:

- #328 is the compatibility reset: one-code Student admission/class-session authority is the only Classroom Student model; public Instructor bearer-code recovery is removed; only the current Intake save schema is accepted;
- #329 implements separately authorized Administration / Maintenance inventory, Instructor recovery, and signed preview-first stale-data cleanup; the detailed runtime contract is `docs/admin-maintenance.md`, and Admin is not an experience role;
- #330 replaces implicit role restoration with explicit Continue / Work independently / Join a class / Run a class startup choices;
- #316/#317 resume only after that hardening sequence.

#328 is merged and published: obsolete access/schema/save compatibility is removed rather than hidden. Future work must not recreate it as a recovery mechanism; Instructor recovery belongs to the separate #329 Admin boundary.

## Migration philosophy

For pre-production hardening, prefer **simplification over indefinite compatibility**:

- preserve current user work only where it represents the intended production model;
- current Standalone collaboration remains a supported product capability;
- obsolete pre-production save formats may fail clearly instead of being migrated forever;
- destructive database/credential changes still require explicit scope, validation, and rollback/recovery planning even when backwards compatibility is intentionally dropped;
- after public production launch, compatibility expectations must be revisited before another breaking migration.

## Related issues

- Program: #288
- Experience role: #289
- Templates / Case Studies split: #290
- Class backend: #291
- Student experience: #292
- Instructor observer: #293
- Coaching: #294
- Protected cases: #295
- Classroom E2E / CI: #296
- Browser infrastructure: #279
- Pre-production compatibility reset: #328
- Admin / Maintenance lifecycle: #329
- Startup experience hub: #330
- Deferred rich staged assets: #316
- Deferred first production staged case: #317
