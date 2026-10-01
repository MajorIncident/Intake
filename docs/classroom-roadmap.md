# Classroom Experience Delivery Roadmap

This roadmap is the execution map for #288. It is intentionally repository-native so the work can continue across many short AI or human sessions without relying on chat memory.

## Dependency graph

```text
PR 0: architecture + governance
              |
             #289
            /    \
         #290    #291
                  |
                 #292
                  |
                 #293
                  |
                 #294

#290 + #291 ------------> #295
#279 + landed slices ----> #296
```

## Why this is not one giant implementation PR

The program crosses UI, local persistence, collaboration, API authorization, database schema, protected content delivery, accessibility, and CI. Keeping all implementation in one PR would make review, rollback, conflict recovery, and cold restart harder.

Use focused PRs and stack only when there is a real dependency.

## Slice 0 — Architecture and execution guardrails

**Tracking:** #288

Deliver:

- this architecture document;
- this roadmap;
- workstream status/handoff document;
- classroom rules in root `AGENTS.md`;
- PR template support for program/stack/handoff metadata;
- repository doctor protection for the durable classroom docs.

No runtime behavior should change.

## Slice 1 — Experience-role foundation

**Issue:** #289  
**Implementation:** PR #298 (merged)

Branch: `feature/classroom-experience-roles`

Primary deliverables:

- canonical role constants/config;
- role controller and dedicated local preference/session contract;
- first-run chooser + return/resume mechanics;
- declarative role-based surface visibility;
- Instructor shell placeholder;
- exclusion tests proving role never enters Intake serialization.

Merge before class-specific runtime work where practical.

## Slice 2 — Templates / Case Studies resource semantics

**Issue:** #290  
**Implementation:** PR #299 (merged)

Branch: `feature/classroom-resource-split`

Completed from the merged #289 foundation.

Primary deliverables:

- explicit Templates vs Case Studies presentation;
- role-aware availability;
- Standalone templates-only behavior;
- Student templates + cases;
- Instructor assignment-oriented case semantics;
- transitional confidentiality warning in docs/tests.

Do not yet claim protected cases are secure.

## Slice 3 — Class domain and authorization

**Issue:** #291  
**Implementation:** PR #300

Branch: `feature/classroom-domain-api`

Implemented from the merged #289 foundation; reconciled after #290 merged.

Primary deliverables:

- class schema;
- class/workspace relationship;
- instructor and student-admission capabilities;
- individual/group assignment;
- instructor-only workspace enumeration;
- student non-enumeration;
- authorization/security tests;
- SECURITY.md updates.

Preserve old ad-hoc collaboration APIs.

## Slice 4 — Student join/resume

**Issue:** #292  
**Implementation:** PR #302 — implementation complete; final completion-ledger checks pending merge

Branch: `feature/classroom-student-experience`

Normally stacks on #291.

Primary deliverables:

- class join UI;
- display name;
- authorized assignment resolution;
- same-device resume;
- classroom chrome around normal Intake;
- invalid/expired/revoked recovery;
- collaboration reuse.

## Slice 5 — Instructor observer

**Issue:** #293

Recommended branch: `feature/classroom-instructor-observer`

Normally stacks on #292/#291 depending implementation.

Primary deliverables:

- instructor class entry/resume;
- roster/workspace rail;
- search/filter;
- revision-aware observer;
- rapid workspace switching;
- server-enforced read-only snapshot access;
- observer lifecycle cleanup.

## Slice 6 — Coaching feedback

**Issue:** #294

Recommended branch: `feature/classroom-coaching`

Stacks on instructor observer.

Primary deliverables:

- coachable target registry;
- meets-standard / needs-improvement;
- optional note;
- separate persistence and revisioning;
- student feedback rendering;
- reviewed revision / changed-since-review groundwork;
- authorization tests.

## Slice 7 — Protected Case Study delivery

**Issue:** #295

Recommended branch: `feature/classroom-protected-cases`

Requires #290 semantics and #291 authorization.

Primary deliverables:

- split public template build from protected cases;
- authenticated case catalog/payload API;
- static-bundle guard;
- authorized Student/Instructor flows;
- unauthorized request tests;
- deployment/docs migration.

## Slice 8 — Browser/E2E and required CI

**Issue:** #296, using #279

Do not wait until the end to write all browser tests. Add tests with the slice that owns behavior, then finish the program by promoting stable critical journeys to required CI as appropriate.

## Stacked PR rules

A stacked PR description must include:

- **Program:** #288
- **Issue:** child issue number
- **Base:** exact branch / PR
- **Depends on:** prerequisite PR(s)
- **Merge order:** explicit
- **Independent rollback:** yes/no and why
- **Cold restart:** next command/action and docs to read

If a base PR changes materially, rebase/refresh the stack and update the PR description before continuing.

## Documentation required per slice

At minimum, inspect and update where relevant:

- root `AGENTS.md`;
- scoped `AGENTS.md`;
- `README.md`;
- `docs/architecture-overview.md`;
- `docs/classroom-architecture.md`;
- `docs/classroom-roadmap.md`;
- `docs/classroom-workstream.md`;
- `docs/REPOSITORY-OPERATIONS.md`;
- `docs/AI-ONBOARDING.md`;
- `SECURITY.md`;
- `docs/commenting-guide.md`;
- storage docs if persisted Intake shape changes.

A PR is not complete when code behavior has changed but these documents teach the previous behavior.

## CI philosophy

Prefer deterministic guardrails over prose-only rules.

Potential guards as the program grows:

- experience-role serialization exclusion;
- protected Case Study static-bundle absence;
- classroom API authorization matrix;
- changed classroom runtime requires classroom tests;
- coachable target registry integrity;
- Playwright critical-role journeys.

Add guards only when their contract is stable enough to avoid noisy false failures.

## Completion criteria

The program is complete only when:

- all #289–#296 acceptance criteria are satisfied;
- #279 browser infrastructure supports the classroom journeys;
- Standalone remains backend-optional;
- student/instructor authorization isolation is covered;
- coaching is separate from Intake state;
- protected cases are server-gated and absent from public assets;
- docs and CI allow a cold contributor to safely maintain the product.
