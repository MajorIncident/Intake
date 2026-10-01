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
9. Hiding Case Studies from Standalone is not a confidentiality boundary; protected Case Study payloads must ultimately be removed from the public bundle.
10. Existing ad-hoc collaboration remains supported for Standalone unless a later explicitly approved migration replaces it.

## Target domain model

```text
Class
  id
  title
  instructor capability(s)
  student join capability / join code policy
  status / expiry / retention metadata
  case-study assignments (later)

  -> Classroom Workspace [1..n]
       id
       kind: individual | group
       display name
       existing collaboration workspace reference
       membership / assignment metadata

       -> Participant [1..n]
            device/profile identity + display name
            existing collaboration presence/activity

       -> Coaching Feedback [0..n]
            coachable target id
            status
            note
            reviewed snapshot revision / evidence
            created/updated metadata
```

The **Classroom Workspace** should reference or extend the existing collaboration workspace rather than duplicate its snapshot, revision, participant, or presence model.

## Experience role lifecycle

Slice #289 implements the role foundation with:

- canonical `standalone`, `student`, and `instructor` roles in `src/experienceRoles.js`;
- a versioned local-only `kt-experience-role-v1` preference owned by `src/experienceRoleController.js`;
- a required first-run chooser for a genuinely new browser;
- silent Standalone migration when an existing `kt-intake-full-v2` snapshot or existing `?workspace=` collaboration URL is present;
- **View → Experience** as the durable route back to role selection;
- declarative `data-experience-surface` projection rather than Intake-mode conditionals.

Returning users resume the stored role. **Start Fresh** deliberately clears Intake state without clearing the role preference.

The local experience preference is **not authentication or authorization**. Student class admission and Instructor privileges remain future server-enforced capabilities (#291 onward). Role/session preferences must never alter Intake serialization.

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

A student joins a class and is resolved to exactly one authorized classroom workspace. That workspace may represent the student alone or a team.

Student UI may display class, team/workspace, instructor, and participant context, but none of that belongs in the Intake snapshot.

Student workspace editing must continue through the existing collaboration synchronization engine.

### Instructor

Instructor mode is supervisory.

In slice #289, Instructor renders only a non-editing shell and hides the normal editable Intake surfaces. That shell carries no class data and grants no privilege. The class roster/workspace navigator and server-enforced observer authorization arrive in later slices.

The eventual instructor sees a class roster/workspace navigator and can rapidly switch the main observer among authorized individual/team workspaces.

The observed Intake should reuse the normal rendering model where practical, but all student-owned Intake controls must be non-editable in instructor observation.

Instructor coaching writes go through the coaching channel, not the snapshot channel.

## Authentication and capability model

The current collaboration model is capability-based: possession of a secret workspace token grants access, and only a hash is persisted server-side. Classroom work should preserve that capability-oriented simplicity initially while separating privileges.

Minimum credential types:

- **Instructor class capability** — class administration/roster observation/coaching.
- **Student class join capability or code** — admission into a class; cannot enumerate class workspaces.
- **Workspace capability** — existing collaboration access used after the server resolves the student's authorized workspace.
- **Case Study unlock password** — instructional gating only; never authentication.

Raw bearer capabilities should not be persisted server-side where a hash suffices. Avoid secrets in query strings where possible; preserve no-store/referrer protections.

## Student assignment

The API, not the client, decides which workspace a student may join.

Supported shapes:

- individual: one student -> one workspace;
- group: multiple students -> one workspace.

A student flow may ask for a display name and, only where policy allows, an instructor-configured team selection. It must not obtain an unrestricted workspace list.

Resume data on a device should contain only what is necessary to reconnect; it must not leak instructor or cross-workspace secrets into exported Intake JSON.

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

Transitional state:

- Standard Template content may remain client-bundled.
- Case Study content may initially remain bundled while role-based UI separation lands.
- Documentation must explicitly state that this is visibility, not confidentiality.

Target state:

- public manifest contains Standard Templates only;
- protected Case Study metadata/payloads are delivered by authorized server endpoints;
- Standalone production assets contain no protected case payloads;
- Student/Instructor authorization is evaluated before case content is returned;
- rotating Case Study passwords may remain as instructional progression controls if useful.

## Server persistence

Continue the existing Neon/Vercel approach unless evidence justifies a platform migration.

Expected domain additions may include:

- classes;
- class capabilities / capability hashes;
- classroom workspace relationships;
- student membership/assignment records;
- coaching feedback;
- case assignments/access metadata.

Schema initialization/migration must be idempotent and documented. Avoid making browser boot depend on schema creation for Standalone.

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

## Migration philosophy

Prefer additive migrations.

- Existing `kt-intake-full-v2` snapshots must continue loading.
- Existing Standalone users should not lose work.
- Existing shared workspace links should remain valid.
- New classroom persistence should be separate until an explicit migration is needed.
- Any destructive schema or credential migration requires rollback instructions.

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
