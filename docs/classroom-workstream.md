# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file in every classroom-related PR before handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history.

## Current phase

Resource semantics (#290 / PR #299) are complete and green. Class domain/API (#291 / PR #300) is active independently.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Open | #297 merged | Architecture/governance foundation is now on `main` |
| Experience role | #289 | Complete | PR #298 / `feature/classroom-experience-roles` | Runtime/tests/docs complete; canonical CI, dependency review, template guard, and CodeQL green |
| Templates / Case Studies | #290 | Complete | PR #299 / `feature/classroom-resource-split` | 171 tests: 170 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Class domain/API | #291 | In progress | PR #300 / `feature/classroom-domain-api` | Independent sibling PR; server capability implementation under CI |
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

#297 and #298 are merged to `main`. PR #299 is ready to merge as completed #290 work. PR #300 is the active #291 server/domain sibling and must be refreshed against `main` after #299 lands.

## Last completed action

Implemented the #290 role-aware resource policy/drawer and opened draft PR #299.

## Next recommended action

Merge green PR #299, then refresh PR #300 against the new `main` and reconcile the shared classroom roadmap/workstream docs before its final validation.

## Active #299 implementation

- `src/templateAvailability.js` is the policy bridge between experience role and existing `templateKind`.
- Standalone normal UI renders Standard Templates only.
- Student normal UI renders Templates + Case Studies; Case Study mode/password behavior is unchanged.
- Instructor shell launches teaching-only Case Studies with no apply/save/mode/password controls.
- The shared template registry and projection logic remain in `src/templates.js`; there is no duplicate resource registry.
- Static placeholder Case Study markup was removed from `index.html`; resources are rendered by the role-aware controller.
- Security boundary remains transitional: Case Study payloads are still present in the public manifest until #295.
- Canonical CI completed with 171 tests (170 pass, 0 fail, 1 intentional skip); CodeQL, dependency review, and template-manifest guard are green.

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
