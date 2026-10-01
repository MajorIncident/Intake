# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file in every classroom-related PR before handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history.

## Current phase

Experience-role foundation (#289) stacked on the architecture/governance bootstrap.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Open | #297 merged | Architecture/governance foundation is now on `main` |
| Experience role | #289 | In progress | PR #298 / `feature/classroom-experience-roles` | Based on `main`; runtime/tests/docs implemented; final validation in progress |
| Templates / Case Studies | #290 | Not started | — | Can stack on #289 |
| Class domain/API | #291 | Not started | — | Can branch from #289 in parallel with #290 |
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

#297 is merged to `main`. Draft PR #298 is the active #289 implementation on `feature/classroom-experience-roles`, now retargeted directly to `main`.

## Last completed action

Implemented the #289 experience-role foundation on top of #297 and opened draft PR #298.

## Next recommended action

Finish final CI/CodeQL for PR #298. Vercel's Git integration currently skips this feature-branch deployment, so browser-level preview verification remains explicitly pending. After #298 lands, #290 (resource split) and #291 (class domain/API) may proceed in parallel.

## Active #298 implementation

- Canonical role IDs/config: `src/experienceRoles.js`.
- Role controller / preference: `src/experienceRoleController.js`, key `kt-experience-role-v1`.
- New browser: required role chooser.
- Existing Intake or `?workspace=` link without preference: silent Standalone migration.
- Standalone: normal Intake.
- Student: normal Intake + transitional Student notice; no class admission yet.
- Instructor: non-editing placeholder shell; no class data or authorization yet.
- **View → Experience** safely switches roles without clearing Intake.
- Experience role is excluded from SerializedAppState, file/template/summary flows, and Start Fresh clearing.
- Menubar keyboard navigation skips hidden role-controlled controls.
- Legacy `?workspace=` collaboration links explicitly override a stored Student/Instructor preference and enter Standalone, preventing hidden background collaboration.
- Summary/persistence guards now distinguish presentation-only `data-experience-surface` containers from new data-bearing controls while retaining enforcement for actual form controls.
- Canonical CI, dependency review, and template-manifest guard passed on the refreshed main-based branch; final head validation follows this documentation update.

## Known risks / watch items

- Existing Case Study payloads are client-bundled; role-based hiding is not a confidentiality control.
- Existing collaboration secret links grant equal edit access and have no administrator role; classroom authorization must layer over rather than silently reinterpret those links.
- There is deliberately no current workspace-list endpoint; student non-enumeration must remain a security property when instructor listing is added.
- Classroom role/session state must not leak into `kt-intake-full-v2`.
- Instructor read-only behavior must be server-enforced, not just disabled controls.

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
