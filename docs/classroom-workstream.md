# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file in every classroom-related PR before handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history.

## Current phase

#293 is merged. #294 coaching feedback is active on `feature/classroom-coaching-feedback`. The first checkpoint establishes a separate coaching revision channel and Student read-only feedback authorization.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Open | #297 merged | Architecture/governance foundation is now on `main` |
| Experience role | #289 | Complete | PR #298 / `feature/classroom-experience-roles` | Runtime/tests/docs complete; canonical CI, dependency review, template guard, and CodeQL green |
| Templates / Case Studies | #290 | Complete | PR #299 / `feature/classroom-resource-split` | 171 tests: 170 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Class domain/API | #291 | Complete | PR #300 / `feature/classroom-domain-api` | Combined #290+#291 head: 183 tests, 182 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Student join/resume | #292 | Complete | PR #302 / `feature/classroom-student-experience` | 194 tests: 193 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Instructor observer | #293 | Complete | PR #305 merged | 208 tests: 207 pass, 0 fail, 1 skip; repository gates green |
| Coaching | #294 | In progress | `feature/classroom-coaching-feedback` | Separate feedback table/revisions + Instructor write/Student read authorization implemented |
| Protected cases | #295 | Not started | — | Requires #290 + #291 |
| Browser E2E/CI | #296 | Not started | — | Uses #279 infrastructure |
| Browser test foundation | #279 | Existing open issue | — | Shared Playwright/accessibility foundation |

## Current architecture decisions

- Experience role, intake mode, and resource kind are separate axes.
- Standalone remains the backwards-compatible local-first product.
- Student/team workspaces reuse existing collaboration snapshot/revision/presence behavior.
- Instructor observes student Intake read-only.
- Coaching is a separate persistence/revision channel.
- Classroom credentials never belong in exported Intake state.
- Case Study password is instructional gating, not authentication.
- Protected Case Study payloads ultimately move out of the public client bundle.

See `docs/classroom-architecture.md` for the full contract.

## Cold restart checklist

1. Inspect current `main` HEAD and all open PRs/issues matching #288–#296 and #279.
2. Read:
   - root `AGENTS.md`;
   - `docs/classroom-architecture.md`;
   - `docs/classroom-roadmap.md`;
   - `docs/classroom-api.md` for server/class work;
   - `api/AGENTS.md` for server/class work;
   - this file;
   - `docs/AI-ONBOARDING.md`;
   - `docs/REPOSITORY-OPERATIONS.md`.
3. Identify the earliest incomplete slice whose dependencies are satisfied.
4. If an implementation PR is already open, continue that PR rather than creating competing work.
5. Refresh the branch from its documented base before editing.
6. Run/inspect `npm run quality`.
7. Before handoff, update this table, record validation, and write the exact next action below.

## Active work

#297–#305 are merged to `main`. #294 is active on `feature/classroom-coaching-feedback`.

## Last completed action

Merged #302 / completed #292. Current `main` includes Student class admission, same-device resume, class context, pre-class recovery, and collaboration-engine reuse. Final #302 validation completed 194 tests (193 pass, 0 fail, 1 intentional skip) with green CI, CodeQL, Dependency Review, and Template Manifest Guard.

## Next recommended action

Continue #294 on `feature/classroom-coaching-feedback`. Server contract: Instructor GET/PUT/DELETE `/api/classes/coaching?workspaceId=...`; Student GET-only `/api/classes/coaching/student` authorized by the issued Student workspace capability. Next: stable coachable-target registry + fingerprints, then Instructor controls and Student in-context feedback UI.

## Completed #300 implementation

- Canonical server contract: `docs/classroom-api.md`.
- Server rules: `api/AGENTS.md`.
- Class/admin/join logic: `api/_classroom.js` and `api/classes/*`.
- Additive Neon tables: `classroom_classes`, `classroom_workspaces`, `classroom_memberships`, plus `collaboration_workspace_capabilities`.
- Student admission requires class-join + assignment capability; Student join has no list operation.
- Instructor workspace listing is class-scoped.
- Individual assignments bind the first participant UUID; group assignments permit multiple participants.
- Successful Student join mints a per-participant `classroom-student` edit alias accepted by the existing collaboration session/presence engine.
- Editable alias resolution is restricted to explicit edit kinds; future Instructor observer tokens must use a separate read-only server path.
- Classroom workspaces inherit the class's absolute expiry.
- Membership has a DB-level composite class/workspace foreign key.
- Instructor/Student-join/assignment capabilities support rotation; class/assignment revocation is server-side.
- `api/` now participates in the changed-runtime test coverage guard.
- Authorization coverage lives in `tests/classroom-api.unit.test.mjs` with deterministic in-memory repositories.

- Final combined #290 + #291 validation completed 183 tests (182 pass, 0 fail, 1 intentional skip); CI, CodeQL, Dependency Review, and Template Manifest Guard are green.

## Completed #302 implementation

- Student admission UI uses class join + assignment capabilities and display name; it never enumerates workspaces.
- `src/classroomStudent.js` owns join, same-device resume, class context, role switching, terminal recovery, and Leave class.
- `kt-classroom-student-session-v1` retains only the issued per-participant workspace capability plus public class/workspace/participant context.
- Student join and assignment capabilities are discarded after successful admission.
- `kt-classroom-student-local-recovery-v1` preserves the pre-class local Intake so Leave class / terminal revocation can restore it.
- Classroom workspace capability is attached programmatically to `src/collaboration.js`; it never enters `?workspace=`.
- Classroom mode disables direct link copying, legacy shared-session leave, and team rename controls.
- Switching away from Student disconnects live class sync but keeps resume; switching back resumes.
- Student Intake controls stay hidden until a class workspace is connected.
- Automated coverage is in `tests/classroomStudent.unit.test.mjs`, `tests/classroomStudent.feature.test.mjs`, and collaboration regression tests.
- Final #302 validation: 194 tests (193 pass, 0 fail, 1 intentional skip), with CI, CodeQL, Dependency Review, and Template Manifest Guard green.

## Active #293 implementation

- Branch: `feature/classroom-instructor-observer`.
- Read-only endpoint: `GET /api/classes/observe?workspaceId=<public UUID>`.
- Authorization: Instructor class capability only; the server verifies class/workspace ownership before reading the collaboration workspace.
- The observer returns snapshot/revision + recent participant activity but **never** a Student workspace capability.
- The observer is GET-only and does not route through editable `/api/workspaces/session` or `/api/workspaces/presence`.
- Planned client: persist Instructor capability outside Intake state, list own-class workspaces, search/filter a left rail, poll one selected workspace, apply it into the existing Intake DOM under a read-only projection, and restore pre-observation local Intake when leaving Instructor.
- Coaching remains out of scope until #294.
- Final validated #293 implementation head before documentation consolidation: 208 tests (207 pass, 0 fail, 1 intentional skip); CI, Dependency Review, and Template Manifest Guard green, with CodeQL completing independently.
- Client checkpoint:
  - `src/classroomInstructor.js` owns Instructor same-device resume, class roster polling, search/filter, selection, and observer polling;
  - the Instructor capability is retained only in `kt-classroom-instructor-session-v1`, outside Intake state;
  - selected Student snapshots render through the existing Intake DOM, never a cloned renderer;
  - observation is applied inside a localStorage preservation boundary because normal `applyAppState()` legitimately updates feature caches during restore/import;
  - the observed DOM is projected read-only/disabled after each snapshot render;
  - rapid switching aborts/stales the prior observer before the next workspace can render;
  - leaving Instructor restores the pre-observation local DOM; explicit Leave class also clears the Instructor resume capability;
  - Student → non-Student role changes now restore the Student pre-class local recovery without clearing Student resume.


## Active #294 implementation

- Coaching persistence is separate from `collaboration_workspaces.snapshot_json` and its revision.
- Table: `classroom_coaching_feedback`, keyed by class/workspace/target.
- Status: `meets-standard` or `needs-improvement`; optional note.
- Each target has its own `feedbackRevision`.
- Review evidence stores both Student workspace revision and a versioned field fingerprint.
- Instructor authority is class-scoped; no fake named reviewer identity is inferred from a rotating capability.
- Student read authorization resolves the existing classroom membership from its issued workspace capability; there is no workspace selector and no Student write method.
- Stable registry implemented in `src/coachableFields.js`: 22 substantive static fields + 10 KT question rows.
- Target identity is domain-based (`problem.one-line`, `impact.current`, `kt.where-location`, etc.); DOM IDs/KT bindings are placement hooks only.
- Fingerprints use normalized target evidence and a versioned deterministic 64-bit hash (`v1-...`).
- KT feedback reviews the full reasoning row (IS, IS NOT, distinctions, changes) as one target.
- Ephemeral Possible Cause IDs are intentionally excluded from the first durable coaching contract.
- Exact next step: mount Instructor review controls and Student feedback UI against the shared registry; poll coaching independently from collaboration state.

## Known risks / watch items

- Existing Case Study payloads are client-bundled; role-based hiding is not a confidentiality control.
- Existing collaboration secret links grant equal edit access and have no administrator role; classroom authorization must layer over rather than silently reinterpret those links.
- There is deliberately no current workspace-list endpoint; student non-enumeration must remain a security property when instructor listing is added.
- Classroom role/session state must not leak into `kt-intake-full-v2`.
- Instructor read-only behavior must be server-enforced, not just disabled controls.
- Class creation remains capability-first and does not yet require account/SSO identity; rate limiting/abuse controls are an operational follow-on if public exposure warrants them.
- Feature-branch Vercel deployments are skipped, so the additive Neon migration cannot be smoke-tested against a preview database before merge.

## Handoff template

Copy/update this section when a classroom PR is left open:

```text
Active issue:
Active PR:
Base / dependency:
HEAD SHA:
Implemented:
Not implemented:
Validation passed:
Manual verification:
Migration / external settings:
Known risk:
Exact next action:
```
