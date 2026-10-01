# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file in every classroom-related PR before handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history.

## Current phase

Resource semantics (#290 / PR #299) and class domain/API (#291 / PR #300) are active in parallel from the merged #289 foundation.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Open | #297 merged | Architecture/governance foundation is now on `main` |
| Experience role | #289 | Complete | PR #298 / `feature/classroom-experience-roles` | Runtime/tests/docs complete; canonical CI, dependency review, template guard, and CodeQL green |
| Templates / Case Studies | #290 | In progress | PR #299 / `feature/classroom-resource-split` | Independent sibling PR; CI/final validation in progress |
| Class domain/API | #291 | In progress | PR #300 / `feature/classroom-domain-api` | Capability model/schema/tests/docs implemented; CI in progress |
| Student join/resume | #292 | Not started | — | Depends on #291 |
| Instructor observer | #293 | Not started | — | Depends on class semantics |
| Coaching | #294 | Not started | — | Depends on observer |
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
   - this file;
   - `docs/AI-ONBOARDING.md`;
   - `docs/REPOSITORY-OPERATIONS.md`.
3. Identify the earliest incomplete slice whose dependencies are satisfied.
4. If an implementation PR is already open, continue that PR rather than creating competing work.
5. Refresh the branch from its documented base before editing.
6. Run/inspect `npm run quality`.
7. Before handoff, update this table, record validation, and write the exact next action below.

## Active work

#297 and #298 are merged to `main`.

- PR #299: #290 role-aware Templates / Case Studies resource semantics.
- PR #300: #291 Class → Workspace → Participant server domain and capability APIs.

The two PRs are independent siblings. Either can merge first; after the first merge, refresh the other branch and reconcile shared roadmap/workstream documentation before merging.

## Last completed action

Opened draft PR #300 after implementing the #291 schema, capability authorization, collaboration alias integration, automated security matrix, and durable API/security documentation.

## Next recommended action

Finish CI on #299 and #300. Merge each only after its own canonical quality/security checks are green. After #300 lands, #292 can begin the Student join/resume UI against the documented `/api/classes/*` contract.

## Active #300 implementation

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

## Known risks / watch items

- Existing Case Study payloads are client-bundled; role-based hiding is not a confidentiality control.
- Existing collaboration secret links grant equal edit access and have no administrator role; classroom authorization must layer over rather than silently reinterpret those links.
- There is deliberately no current workspace-list endpoint; student non-enumeration must remain a security property when instructor listing is added.
- Classroom role/session state must not leak into `kt-intake-full-v2`.
- Instructor read-only behavior must be server-enforced, not just disabled controls.
- Class creation remains capability-first and does not yet require an account/SSO identity, matching the existing open workspace-creation posture. Abuse/rate-limit controls are operational follow-on work if public exposure warrants them.
- Feature-branch Vercel deployments are currently skipped, so #300 cannot exercise its additive Neon migration against a preview database before merge.

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
