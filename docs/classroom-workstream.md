# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file at every durable classroom checkpoint, not only final handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history. Follow the delivery-resilience protocol in `docs/REPOSITORY-OPERATIONS.md` so message timeouts or conversation limits cannot erase the continuation point.

## Current phase

#294 is merged and production READY. #295 Protected Case Study delivery is active on `feature/classroom-protected-cases`.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Open | #297 merged | Architecture/governance foundation is now on `main` |
| Experience role | #289 | Complete | PR #298 / `feature/classroom-experience-roles` | Runtime/tests/docs complete; canonical CI, dependency review, template guard, and CodeQL green |
| Templates / Case Studies | #290 | Complete | PR #299 / `feature/classroom-resource-split` | 171 tests: 170 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Class domain/API | #291 | Complete | PR #300 / `feature/classroom-domain-api` | Combined #290+#291 head: 183 tests, 182 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Student join/resume | #292 | Complete | PR #302 / `feature/classroom-student-experience` | 194 tests: 193 pass, 0 fail, 1 skip; CI/CodeQL/dependency/template guard green |
| Instructor observer | #293 | Complete | PR #305 merged | 208 tests: 207 pass, 0 fail, 1 skip; repository gates green |
| Coaching | #294 | Complete | PR #306 merged | 224 tests: 223 pass, 0 fail, 1 skip; all repository gates green; production deployment READY |
| Protected cases | #295 | In progress | draft PR #307 / `feature/classroom-protected-cases` | Runtime/security implementation complete; final docs/gates and deployment verification remain |
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
- Protected Case Study metadata/payloads are server-gated, absent from public browser assets, and authored `templates/*.json` is excluded from Vercel deployment.

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

#297–#306 are merged to `main`. #295 is active on `feature/classroom-protected-cases`.

## Last completed action

Completed the #295 implementation/security/documentation slices through root cold-start and repository-operations guidance. Latest durable docs checkpoint before this update is `47ffd1bf11c813e69f8d7956659902c041c8e908`, followed by README/onboarding/roadmap/commenting/storage/operations synchronization. The public/server manifest split, authorized API/client flow, raw authored-JSON Vercel exclusion, and protected-resource verifier are implemented.

## Next recommended action

Continue #295 on draft PR #307 from the current branch head. Runtime/security implementation is complete. Finish only the finalization sequence:

1. Current #307 head: `a376d7751209eff02a616110a59e52fd45cc1b70`.
2. GitHub validation on that exact head is complete: **236 tests (235 pass, 0 fail, 1 intentional skip)**; CI, CodeQL, Dependency Review, Template Manifest Guard, and Vercel Preview Comments are green.
3. A temporary verification branch `verify/protected-cases-preview` over the prior fully documented runtime head added only a branch-scoped Vercel `ignoreCommand`. Deployment `dpl_A3H2rKdJAEGZpBM26iEFSyMicK6f` reached **READY** and the previously exposed protected path `/templates/Microcomputer%20Cabinets.json` returned a genuine HTTP **404**.
4. #307 was then strengthened at `a376d775...`: when `VERCEL=1`, `verify:protected-cases` now fails if any authored `templates/*.json` file is actually present in the Vercel upload, not merely if the ignore rule is missing.
5. A second verification branch `verify/protected-cases-preview-v2` attempted to deploy the strengthened head, but Vercel rejected it with `upgradeToPro=build-rate-limit` before creating a deployment. This is tracked in #304.
6. The connected Vercel fetch tool cannot traverse the READY preview's Vercel Authentication layer consistently, and the local runtime has no Vercel CLI/outbound DNS. Therefore deployed authenticated Student/Instructor API calls cannot be executed from this session without weakening/persisting a preview bypass secret.
7. Exact next action: once Vercel preview build capacity is available, deploy `a376d775...` (or a descendant with no runtime changes) and run the remaining authenticated/unauthenticated protected API HTTP checks. Keep PR #307 draft and do not merge until that verification is accepted and merge is explicitly authorized.

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

## Completed #293 implementation

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


## Completed #294 implementation

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
- First UI checkpoint implemented in `src/classroomCoaching.js` and wired through `main.js`, `src/classroomInstructor.js`, and `src/classroomStudent.js`.
- Instructor gets per-target Meets standard / Needs improvement controls, optional note, clear action, feedback revision, and changed-since-review signal.
- Student gets read-only in-context status/note and changed-since-review signal; coaching polling is independent of collaboration snapshot polling.
- Instructor observer controls are excluded from the read-only projection so coaching can remain interactive while Student Intake controls stay locked.
- UI runtime checkpoint: `f6daf4c810ccf2f037df96ec6aed294298263b74`.
- Focused coaching UI/lifecycle regression checkpoint: `f914a28affc1b7a12a8fc41d34775cf470201968`.
- Regression coverage now includes note-editor stability, Instructor save payload/review evidence, Student read-only feedback, changed-since-review, stale Instructor fetch rejection, and Student/Instructor coaching lifecycle hooks.
- Final validated implementation head before documentation consolidation: 224 tests (223 pass, 0 fail, 1 intentional skip).
- Final documentation/security/module-map consolidation is complete.
- GitHub Advanced Security flagged the original coaching target-ID regex for potential exponential backtracking; it was replaced with a linear-time dot-segment validator in `63bc782d885eb9d57bb74c09389db4c9955e52d7` with grammar regressions in `1e25af79c97a4c60f9a091bd41d9c5b8074c188e`.
- Exact next action: confirm the post-review-fix head is green, resolve the CodeQL review thread, update PR/issue final SHA, then merge #306.

## Active #295 implementation

- Branch: `feature/classroom-protected-cases`.
- Draft PR: #307.
- Issue: #295.
- Public/server manifest split:
  - `src/templates.manifest.js` contains Standard Templates only;
  - `api/protected-case-studies.manifest.js` contains the four protected Case Studies server-side;
  - all authored JSON remains validated by `npm run build:templates`.
- Authorized server delivery:
  - Instructor `GET/POST /api/classes/case-studies` is class-scoped;
  - Student `GET/POST /api/classes/case-studies/student` is membership-bound to the issued Classroom workspace capability;
  - catalog GET omits `state`;
  - full payload selection is authenticated POST-body data;
  - protected responses are `no-store` / `no-referrer`;
  - legacy Standalone collaboration capability does not authorize Student Case Studies.
- Client delivery:
  - `src/classroomCaseStudies.js` owns authorized catalog/payload access in memory only;
  - Student/Instructor lifecycle controllers connect/disconnect that context;
  - Standalone has no protected provider context;
  - Student fetches the full Case Study only when applying it after the existing pedagogical mode/password step;
  - remote payloads reuse canonical `projectTemplateState()` mode projection.
- Deployment boundary:
  - current production was verified to expose raw `/templates/Microcomputer%20Cabinets.json` before this PR, confirming a second real leak beyond the old public manifest;
  - `.vercelignore` now excludes `templates/*.json`;
  - Vercel production build no longer regenerates manifests from excluded authoring source and instead runs `npm run verify:protected-cases`;
  - GitHub/local authoring remains responsible for generated-manifest freshness.
- Guardrails/tests:
  - public manifest contains only Standard Templates;
  - every authored resource is emitted to exactly one generated boundary;
  - protected IDs/names must be absent from public manifest/browser runtime;
  - browser runtime must not import the server-only protected manifest;
  - authorization/API/client/drawer regression coverage is included;
  - `verify:protected-cases` is part of the canonical `npm run quality` gate.
- Durable implementation checkpoints:
  - `5d8ecb756de179276164d575cfc4ea1a03ef7115` — public/server manifest split + regression boundary;
  - `5dfd2718a2fefc2357afb22a5a906cd3f045e970` — authorized protected API;
  - `83e278b87392c7be5eb8ba8ec4f19d84a0b94def` — authorized client/lifecycle;
  - `35acd62d35a0826e8e350507a16c187ffceafbc1` — drawer integration;
  - `b3160264adfac5d500711c22515bf21f27dff75d` — authored-JSON Vercel exclusion + boundary verifier;
  - later commits fix only test harness and documentation synchronization.
- Final docs now cover security, API/architecture, README/deployment, scoped/global AGENTS, AI onboarding, roadmap, commenting guide, storage guidance, and repository operations.
- Final runtime/security head: `a376d7751209eff02a616110a59e52fd45cc1b70`.
- Validation: 236 tests (235 pass, 0 fail, 1 intentional skip); CI, CodeQL, Dependency Review, Template Manifest Guard, and Vercel Preview Comments green.
- Deployment evidence: temporary preview `dpl_A3H2rKdJAEGZpBM26iEFSyMicK6f` reached READY and returned 404 for the previously exposed Microcomputer Cabinets authoring JSON path.
- Stronger Vercel-upload assertion is now part of #307; its follow-up preview was blocked by the Vercel build-rate limit, tracked in #304.
- Exact next action: re-run a preview of the current head when Vercel capacity permits, then execute the remaining protected API HTTP authorization checks. Do not merge without explicit authorization.

## Known risks / watch items

- Existing collaboration secret links grant equal edit access and have no administrator role; classroom authorization must layer over rather than silently reinterpret those links.
- There is deliberately no current workspace-list endpoint; student non-enumeration must remain a security property when instructor listing is added.
- Classroom role/session state must not leak into `kt-intake-full-v2`.
- Instructor read-only behavior must be server-enforced, not just disabled controls.
- Class creation remains capability-first and does not yet require account/SSO identity; rate limiting/abuse controls are an operational follow-on if public exposure warrants them.
- Normal feature-branch Vercel deployments are skipped by the project's Ignored Build Step. A temporary branch override can produce a preview, but the second #295 verification attempt hit the team build-rate limit. Preview-authenticated API verification therefore depends on available Vercel build capacity / an automation bypass path; see #304.

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
