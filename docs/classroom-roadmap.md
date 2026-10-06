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
**Implementation:** PR #302 — merged

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
**Implementation:** PR #305 — server read-only observer + Instructor roster/client implemented; validation head: 208 tests (207 pass, 0 fail, 1 intentional skip)

**Active branch:** `feature/classroom-instructor-observer`

Checkpoint 1 established the server-enforced read-only observer endpoint. The current implementation also includes Instructor same-device class resume, roster/search/filter, rapid workspace switching, presence/activity context, and read-only projection of the existing Intake renderer.

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

**Implementation:** PR #306 merged; #294 complete.

Stacks on instructor observer.

Primary deliverables:

- stable coachable target registry (22 static fields + 10 KT rows);
- meets-standard / needs-improvement with optional note and clear/update;
- separate server persistence and per-target feedback revisioning;
- Student read-only in-context feedback rendering;
- reviewed workspace revision plus field fingerprint / Changed since review;
- Instructor class scoping and Student membership-bound authorization tests;
- dynamic Possible Cause cards intentionally deferred until they have stable lifecycle identity.

## Slice 7 — Protected Case Study delivery

**Issue:** #295

**Implementation:** PR #307 merged to `main` as `09f034f1f1776a3aaf92be7dec86b902549c8eb9`; protected delivery, minimal `dist/` public output, deployment controls, and production verification are complete.

Requires #290 semantics and #291 authorization; both prerequisites are merged.

Implemented deliverables:

- public generated manifest contains Standard Templates only;
- server-only generated manifest contains protected Case Study metadata/payloads;
- Instructor class-scoped and Student membership-bound protected catalog/payload APIs;
- metadata-only GET catalog and authenticated POST payload delivery;
- in-memory Student/Instructor protected-resource client integrated with the shared drawer;
- Standalone remains protected-resource free and backend-optional;
- authored `templates/*.json` source excluded from Vercel source upload;
- protected Case Study public-runtime/deployment verifier in the canonical quality gate;
- minimal generated `dist/` public bundle replaces repository-root static output so internal docs/tests/scripts/authoring files are not public assets;
- Vercel Git deployments are deny-by-default, with `main` and deliberate `verify/**` branches explicitly allowed;
- authorization, bundle-boundary, role/drawer, and public-output regression coverage;
- security/architecture/cold-start/deployment documentation migration.

Validation evidence:

- full suite: 236 tests, 235 pass, 0 fail, 1 intentional skip;
- exact minimal-output implementation head `7f998f96...`: CI, CodeQL, Dependency Review, and Template Manifest Guard green;
- canonical CI built 45 public `dist/` files with no internal docs or protected Case Study identifiers;
- prior deliberate READY preview returned HTTP 404 for the formerly public Microcomputer Cabinets authored JSON path.

## Slice 8 — Browser/E2E and required CI

**Issue:** #296, using #279  
**Implementation:** draft PR #308 on `feature/classroom-browser-e2e`

Implemented browser foundation / critical paths:

- Playwright 1.63 + axe 4.13 with desktop Chromium and Pixel 7 projects;
- deterministic local HTTP/API fixture; no Vercel preview dependency;
- first-run role chooser, Standalone summary/persistence/resources, mobile smoke;
- real Save-to-File / Load-from-File round trip and Intake-mode restoration;
- Student join/resume and shared collaboration persistence;
- same-team multi-browser synchronization plus cross-workspace isolation;
- Instructor roster / workspace switching / read-only observation / resume;
- Instructor coaching → Student feedback → changed-since-review;
- protected Case Study unauthorized/authorized catalog/payload journey;
- invalid authority, expired Student resume, and Student non-enumeration;
- serious/critical axe scans and uncaught-page-error assertions on covered journeys;
- deterministic fixture isolation by test/project/retry.

CI decision: the browser suite is now part of the already-required `tests` status. The required job runs `npm run quality` and then `npm run test:browser`. The separate Browser E2E workflow is manual-only for focused diagnostics.

Latest functional suite checkpoint before final docs: **22 passed, 6 intentionally project-scoped skips, 0 failed**.

## Post-foundation Classroom direction

The eight-slice #288 program establishes the secure Classroom foundation; it does not represent the final facilitated teaching product.

- **#312 — Instructor-run live class, roster, and dynamic team management:** Instructor-created classes, one human-friendly Student join path, waiting/late roster, accessible team formation, live reassignment, automatic Student workspace switching, and high-signal team monitoring.
- **#313 — Instructor-orchestrated case simulation and staged debrief:** staged protected Case Study release, case reference beside Intake, Instructor pause/debrief/advance controls, progressive disclosure, team progress, and server-gated future-stage / Instructor-only material.

#312 is implemented on draft PR #314 (`feature/classroom-live-management`): Start Class, one human Student join code, Waiting/late roster, stable Student class sessions, accessible team creation/assignment, safe reassignment/unassign with stale-authority cutoff, observer/coaching integration, and integrated multi-browser acceptance are green. The final #312 gate is documentation/security/merge readiness. #313 remains the next dependent product slice and must start from the merged #312 substrate.

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
