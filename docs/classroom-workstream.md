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
| Browser E2E/CI | #296 | In progress (stacked) | draft PR #308 / `feature/classroom-browser-e2e` | Playwright/axe foundation green; Standalone browser journeys under stabilization |
| Browser test foundation | #279 | In progress via #296 | draft PR #308 | Shared Playwright/accessibility foundation; deterministic local HTTP CI |

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

#297–#306 are merged to `main`. #295 is active in draft PR #307 on `feature/classroom-protected-cases`. #296 / #279 is active in stacked draft PR #308 on `feature/classroom-browser-e2e`.

## Last completed action

Completed the #295 implementation/security/documentation slices through root cold-start and repository-operations guidance. Latest durable docs checkpoint before this update is `47ffd1bf11c813e69f8d7956659902c041c8e908`, followed by README/onboarding/roadmap/commenting/storage/operations synchronization. The public/server manifest split, authorized API/client flow, raw authored-JSON Vercel exclusion, and protected-resource verifier are implemented.

## Next recommended action

Continue #295 on draft PR #307 from the current branch head.

1. Protected Case Study runtime/security implementation is complete: public/server manifest split, Classroom authorization, role-aware client delivery, static/runtime leak guards, and deterministic API/client coverage.
2. A second-order production exposure was discovered during deployed verification: with the old `outputDirectory: "."`, production returned internal repository files such as `/docs/classroom-workstream.md` and `/scripts/build-templates-manifest.mjs` with HTTP 200.
3. #307 now builds a minimal public `dist/` surface via `scripts/build-vercel-public.mjs`. It copies only `index.html`, `main.js`, `styles.css`, and browser JavaScript under `src/` + `components/`; it rejects internal file types and protected Case Study identifiers.
4. `vercel.json` now uses `outputDirectory: "dist"` and `npm run verify:protected-cases && npm run build:vercel-public`. The verifier rejects any return to repository-root static output.
5. Exact GitHub CI evidence on `7f998f96b92a6760d5437a8fd8ffc36ea0a97f4c`:
   - `[verify:protected-cases] Protected 4 Case Study payload(s); public manifest/runtime and Vercel deployment boundary verified.`
   - `[build:vercel-public] Built 45 public file(s) in dist/ with no internal docs or protected Case Study identifiers.`
   - CI, CodeQL, Dependency Review, and Template Manifest Guard all green.
6. Vercel Git deployment policy remains repository-owned: ordinary branches create no Vercel deployment; `main` and `verify/**` are the only allowed classes, and repo `ignoreCommand` explicitly continues those branches.
7. A deliberate preview of the new `dist/` head was requested through `verify/protected-cases-preview`, but Vercel returned `upgradeToPro=build-rate-limit` before creating the deployment. This remains tracked in #304.
8. The earlier guarded preview `dpl_Ep2q8Y3BMUWGEV7fzZQHnvdwPumA` reached READY and returned HTTP 404 for the formerly public Microcomputer Cabinets authored JSON path, proving the protected authoring-source boundary before the `dist/` broadening.
9. Exact next action: finish PR/issue/diff synchronization on the latest documented head, then obtain one deliberate `verify/**` preview when Vercel capacity permits and confirm `/docs/classroom-workstream.md`, `/scripts/build-templates-manifest.mjs`, and protected `/templates/*.json` paths return 404. The deployed protected API matrix still requires an approved preview-auth bypass path; deterministic server tests are already green. Keep #307 draft and do not merge without explicit authorization.

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
- Final runtime/security implementation head before deployment-policy hardening: `a376d7751209eff02a616110a59e52fd45cc1b70`.
- Repository-owned Vercel deployment controls are now part of #307 and guarded by `verify:protected-cases`.
- Ordinary feature commits create no Vercel deployment records; `verify/**` is the explicit preview path.
- Deliberate verification head `f9f8fc8f22cd71029bb492ad278c4470264153b6` deployed successfully as `dpl_Ep2q8Y3BMUWGEV7fzZQHnvdwPumA` and reached **READY**.
- That READY preview returned HTTP **404** for the formerly public Microcomputer Cabinets authored JSON path.
- Deterministic API tests already cover Instructor authorization, Student membership-bound authorization, metadata-only catalogs, authenticated payload POST, legacy-token rejection, and no-store/no-referrer response headers.
- Remaining deployed API requests are blocked by the preview-auth tooling boundary, not by application/test failure.
- Additional static-output hardening: production's old repository-root output was confirmed to expose internal `docs/*` and `scripts/*` files. #307 now generates/serves only `dist/`; canonical CI built 45 public files with no internal docs or protected identifiers.
- Current deployed `dist/` verification is blocked only by Vercel's build-rate limit; #304 contains the infrastructure evidence.
- Final documented head before this update: `1238b82b0d6f880a49e83bedd31d8ebe5f0d967d`; all required GitHub checks green and PR #307 has no unresolved review threads.
- Complete `main → #307` diff review: 54 commits ahead, 0 behind; changed files remain confined to protected Case Study delivery, Vercel/public-output hardening, tests, and documentation.
- Deliberate final-head preview: `verify/protected-cases-preview` was moved to `1238b82...`; Vercel deployment `dpl_GqbgkkwKLJ7Z1Ekiw4oZ1eMYwgXz` reached **READY**.
- On that READY preview, `/docs/classroom-workstream.md` returned a genuine HTTP **404**.
- Vercel Preview Authentication then intercepted subsequent HTTP probes. A deliberately nonexistent path also returned the same HTTP 302 authentication response, proving those 302s are auth-layer behavior and cannot be interpreted as file-existence results.
- Therefore the deployed evidence is: exact final-head preview READY + build-time protected/public-boundary checks passed + one formerly exposed internal document returned 404. Remaining protected API HTTP matrix cannot be executed from the current connector without an approved preview-auth bypass path.
- Exact next action: synchronize PR #307 / issue #295 with this final preview evidence, then keep the PR draft until the user explicitly accepts the remaining preview-auth limitation or provides/approves a bypass path. Do not merge without explicit authorization.

## Active #296 / #279 implementation

- Branch: `feature/classroom-browser-e2e`.
- Draft PR: #308.
- Stack base: draft PR #307 / `feature/classroom-protected-cases`.
- The branch was refreshed onto current #307 because the old stack had diverged (8 ahead / 21 behind) and GitHub could no longer create the PR merge ref; subsequent pull-request workflows were not launching.
- Refreshed stack checkpoint: `593b9766d3a993c4834f475a90a362cfaf1aa6f0` — one commit ahead / zero behind #307 at refresh time, carrying only the browser/E2E surface.
- Browser foundation is real and running in GitHub Actions:
  - `@playwright/test@1.63.0`;
  - `@axe-core/playwright@4.13.0`;
  - desktop Chromium + Pixel 7 projects;
  - deterministic local HTTP server;
  - traces retained on failure, screenshots only on failure;
  - serious/critical axe violations fail covered journeys.
- Existing smoke coverage is green for first-run role chooser/accessibility and for absence of authored template JSON/server-source files from the browser fixture.
- First Standalone E2E checkpoint added real-browser input → summary → persistence/reload and Templates-only resource coverage.
- The first run correctly exposed test-assumption failures:
  - the test's init script cleared localStorage again during reload, invalidating persistence verification;
  - Standalone renames the drawer title to `Templates`, so `Templates Library` was a stale accessible-name assertion;
  - mobile menu-item clicks were not a stable primary-interaction contract.
- Test-only stabilization checkpoint: `ac8ab6311d1c3f24d0f0418a650de9973c168e8b`:
  - storage is cleared once before the journey rather than on every navigation;
  - drawer assertion uses stable `#templatesDrawer` and verifies title `Templates`;
  - desktop-only menu journeys stay desktop;
  - mobile gets a separate Standalone primary-input + persistence/reload smoke;
  - uncaught page errors remain fatal assertions.
- Normal repository quality gate is green on the refreshed stack.
- Exact next action: wait for/inspect Browser E2E on this checkpoint. Do **not** add Classroom API fixtures until the Standalone browser suite is green on both intended projects. Then proceed to deterministic Classroom fixtures and Student/Instructor/coaching/protected-case journeys.

## Known risks / watch items

- Existing collaboration secret links grant equal edit access and have no administrator role; classroom authorization must layer over rather than silently reinterpret those links.
- There is deliberately no current workspace-list endpoint; student non-enumeration must remain a security property when instructor listing is added.
- Classroom role/session state must not leak into `kt-intake-full-v2`.
- Instructor read-only behavior must be server-enforced, not just disabled controls.
- Class creation remains capability-first and does not yet require account/SSO identity; rate limiting/abuse controls are an operational follow-on if public exposure warrants them.
- Normal development branches are now denied at the repository `git.deploymentEnabled` layer before Vercel creates deployment records. `main` and `verify/**` are explicit allow paths. A deliberate verification preview still depends on available Vercel build capacity / preview-auth access; see #304.

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
