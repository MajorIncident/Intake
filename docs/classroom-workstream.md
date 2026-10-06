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
| Protected cases | #295 | Complete | PR #307 merged | Protected catalog/payload delivery, minimal `dist/` public boundary, deployment controls, and production verification complete |
| Browser E2E/CI | #296 | In progress — final stabilization | draft PR #308 / `feature/classroom-browser-e2e` | Critical Standalone/Student/Instructor/security journeys complete; Playwright now runs inside required `tests` CI gate |
| Browser test foundation | #279 | In progress — final stabilization via #296 | draft PR #308 | Deterministic local HTTP + Playwright/axe complete; focused Browser E2E workflow retained as manual diagnostic |

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
- Base: `main` at merged #307 (`09f034f1f1776a3aaf92be7dec86b902549c8eb9`).
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
- Browser E2E on the stabilized Standalone test checkpoint then exposed real accessibility defects in the Templates drawer:
  - `aria-required-children` / `aria-required-parent` / `listitem`: native `ul/li` markup was mixed with listbox/option roles;
  - `color-contrast`: the Apply resource button's white-on-`#007aff` contrast measured 4.01:1.
- Product fixes:
  - `e2ec381a39d1819deabb634a0ea3b0e63d9b6c8d` — resource chooser now uses a direct `div[role=listbox] > button[role=option]` pattern;
  - `b1b686aa6b3901db1b4a55f8997c7c4245b92c83` — Apply resource uses the existing darker blue `#1769aa` locally rather than altering the global accent.
- The same run confirmed the repaired behavioral coverage before axe executed: desktop input → summary → persistence/reload passed; mobile Standalone primary-input + persistence/reload passed.
- Browser E2E validation on `65204eb85ee2cbcc4eb6a5159313b944859fbf24`: **7 passed, 3 intentionally project-scoped skips, 0 failed**. Failure artifacts were not uploaded because the run was clean.
- Confirmed journeys now include:
  - first-run role chooser + axe on desktop/mobile;
  - protected public-boundary 404 smoke on desktop/mobile;
  - desktop Standalone input → summary → persisted reload;
  - desktop Standalone Templates-only drawer + serious/critical axe scan;
  - mobile Standalone primary input → persisted reload;
  - uncaught browser page errors fail the journeys.
- Normal repository quality gate is also green on the same stack.
- Deterministic Classroom fixture checkpoint: `f0f81d9e2e2b738eae47a5db20d2b0c972d108a5`.
  - local browser server now implements Student admission, collaboration session GET/PUT, presence PUT/PATCH/DELETE, empty Student coaching, and empty Student protected-resource catalog;
  - workspace state is keyed by the issued workspace capability so parallel desktop/mobile journeys do not require a destructive global reset;
  - the initial shared snapshot comes from the validated public Checkout Latency Standard Template.
- Student real-browser journey checkpoint: `6f7a03fcd0cde23944e94a4513374a289ec3af81`.
  - runs on desktop + mobile;
  - exercises Join a class with real form controls;
  - verifies class/assignment admission codes are cleared and not retained in the Student resume envelope;
  - verifies the issued workspace capability is retained for same-device resume;
  - edits the shared Intake, waits for a real collaboration PUT, reloads, reconnects, and verifies the shared edit returns from the fixture workspace;
  - includes serious/critical axe scan and uncaught-page-error assertion after resumed Student state.
- Student stabilization after the #307 merge/restack:
  - #307 merged to `main` as `09f034f1f1776a3aaf92be7dec86b902549c8eb9`; production deployment `dpl_C7cwWcBSHRjaDwvZtc8VpYbdzFKf` reached READY and #295/#304 were closed with production evidence.
  - PR #308 was restacked onto merged `main` without force rewriting via sync commit `224dfcad016935417f88607ad2cd1b1b7ed2a013`.
  - `1cff933dcab9536e92dfd86ed65a5aa9a136aa7f` removes an ambiguous Student display-name selector.
  - `fba3841480b21a04b8b37b9d757b9d8240d631fe` fixes the real Student-admission layout bug where the floating Notes Intake surface intercepted the Join class button.
  - axe-driven product repairs then fixed footer/resource/action/presence contrast and made the closed Templates dialog inert; regression coverage protects the inert lifecycle.
  - Student gate on `b39c1c16b6e9cded47e0f1db32b697614030a222`: Browser E2E, CI, CodeQL, Dependency Review, and Template Manifest Guard all green on desktop/mobile.
- Instructor observer checkpoint:
  - `a38bd5e312684be36f414e07696a87a21d65688c` adds deterministic Instructor roster and observation fixtures with two stable workspaces.
  - `f70aa734e24fd2b3d97f25b6a298c2106cad3ce5` adds the real-browser Instructor journey: class open, roster, workspace switch, read-only projection, persisted class resume, no Student join or editable collaboration endpoint traffic, axe, and uncaught-page-error protection.
  - the first browser run exposed invalid `aria-readonly` on the generic Intake wrapper; `ce4738be9fcf37c723387fe94d112b7f0d27cf87` removes that invalid container ARIA while preserving read-only/disabled control semantics, with regression coverage in `845f0059a3a2ea9a3dd75d5143b61069f9c4909d`.
  - Instructor gate on `845f0059a3a2ea9a3dd75d5143b61069f9c4909d`: Browser E2E, CI, CodeQL, Dependency Review, and Template Manifest Guard all green on desktop/mobile.
- Coaching browser checkpoint:
  - `tests/e2e/coaching.spec.mjs` exercises Instructor feedback save, Student read-only feedback, and changed-since-review after a Student edit.
  - The checkpoint exposed and repaired a collaboration presence-badge contrast defect; the pre-protected-case head `f0740c1043ef0866827071a4800e3aa4376b365c` was green across Browser E2E, CI, CodeQL, Dependency Review, and Template Manifest Guard.
- Protected Case Study browser checkpoint:
  - `88c2928dbcf137940fb12b0e06e645d7b2b7866b` extends the deterministic browser server with protected Case Study catalog/payload responses while retaining authorization checks.
  - `7d1770e30e66bdfb66f93efba3001f5f1034848b` adds the real-browser security journey: unauthenticated Student catalog and payload retrieval return 404; an admitted Student receives metadata-only catalog records; the protected payload is POSTed only when applying the selected Case Study through the real resource drawer and password flow.
  - The first run exposed a test-only assumption: a closed off-canvas drawer remains rendered and therefore Playwright-visible even though it is `aria-hidden` and `inert`. `1d181d22e77507e87377ac8b2798ed6b927c3b98` now asserts the actual closed-drawer interaction contract.
  - Browser E2E on `1d181d22...`: **14 passed, 4 intentionally project-scoped skips, 0 failed**.
  - Browser E2E, CI, CodeQL, Dependency Review, and Template Manifest Guard are all green on `1d181d22...`.
- Negative authorization browser checkpoint:
  - `0802e012bcc0f863d912304da2dabd1d286f1825` tightens the deterministic fixture so Instructor, class-join, and assignment credentials are distinct authorities rather than any syntactically valid 43-character token.
  - `e7bc8ed4af04b8c1061c29a8d8e67c0a36bc5795` adds real-browser coverage proving an active Student workspace capability cannot enumerate the Instructor roster, well-formed non-Instructor authority cannot open an Instructor class, and an expired saved Student session is discarded before stale workspace content resumes.
  - The tests intentionally assert durable authorization/recovery properties rather than requiring the current class+assignment-code Student UX, because #312 will replace that admission flow with Instructor-managed assignment.
  - Browser E2E on `e7bc8ed...`: **20 passed, 4 intentionally project-scoped skips, 0 failed**.
  - Browser E2E, CI, CodeQL, Dependency Review, and Template Manifest Guard are all green on `e7bc8ed...`.
- Team collaboration / isolation checkpoint:
  - `94ab842b09301ef95114522636de81538017f620` adds a real three-browser journey: two Students in one group converge on one Intake while a Student in a different workspace remains isolated.
  - The first fully-parallel run exposed deterministic-fixture cross-test contamination rather than a product defect. Student, coaching, and collaboration assignment capabilities are now isolated by spec/project/retry; final isolation head `bfaf307e80b4c014646080834fbef475c52204f2` restored a clean **21 passed, 5 intentional skips, 0 failed** Browser E2E run.
- File / workflow-mode checkpoint:
  - `5e4ea9bb2a35bc7f8ee013471a91d3944c13499a` covers a real Standalone **Save to File → mutate → Load from File** round trip and proves the exported Major Incident workflow mode and mode-controlled sections restore with the Intake.
  - Browser E2E on that head: **22 passed, 6 intentionally project-scoped skips, 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Required CI decision:
  - Browser E2E is **required**, not advisory.
  - `c9b03f30bd300cc5528ebf36e7ca07f1ed0575d5` keeps the existing branch-protected `tests` status context and extends it to run `npm run quality`, install Chromium, and execute `npm run test:browser`.
  - This avoids a repository-settings migration: the existing required `tests` rule now fails if browser regression fails.
  - The separate Browser E2E workflow is retained as **manual-only** for focused reruns and failure diagnostics rather than duplicating every PR run.
  - First required-gate validation on `c9b03f30...`: repository quality succeeded and browser regression reported **22 passed, 6 intentional skips**; CodeQL, Dependency Review, and Template Manifest Guard also green.
- Exact next action: synchronize final docs/PR/issues, review the complete `main → #308` diff and unresolved review/security state, then make #308 ready for review/merge if the documented head remains green. After #308 / #296 / #279 close, begin #312 as the next product slice; #313 follows on the live-class/team-management substrate.

## Active #312 implementation

- Issue: #312.
- Branch: `feature/classroom-live-management`.
- Base: `main` at #308 merge `6c58336ac1677764641c09eadb201abcad8eeac1`.
- First tranche: architecture + server contract only; no schema/runtime mutation until the admission/assignment/reassignment security contract is documented.
- Canonical design: `docs/classroom-live-management.md`.
- Decided model:
  - Instructor normal path is **Start a class**;
  - one human-friendly Student join code;
  - join code is admission-only, not workspace authority;
  - admission mints a stable high-entropy Student class-session capability;
  - Students may wait unassigned;
  - workspace edit capabilities are assignment-specific and revoked on move/unassign;
  - Student polls only own assignment status and never receives workspace lists;
  - reassignment never merges snapshots; destination team state wins;
  - legacy two-code admission remains supported during additive migration.
- Critical race protection: never remap one active workspace edit token from Team A to Team B. Old edit capability is revoked; Student obtains fresh destination access after assignment revision changes.
- Persistence/repository checkpoint:
  - `99c31f2e9c59180ed297db96512b62b310692b4c` adds the human join-code column and additive `classroom_participants` model plus live participant/session repository primitives;
  - `fa6180ada0183dfc4b19790925e61deea60bdfbf` corrects the participant/workspace FK deletion behavior so required class identity is preserved;
  - `5665637e6f550bebb861c73109e991b6e96a73c9` mirrors the model in the deterministic test repository;
  - `df3633d008bb7e352509e15c1964b7d27ebf441f` adds focused join-code normalization, waiting-roster, class-scoping, and class-session-rotation tests.
  - validation: canonical quality **241 tests / 1 intentional skip**; required Browser E2E **22 passed / 6 intentional skips / 0 failed**; CodeQL, Dependency Review, and Template Manifest Guard green.
  - current Student UI and legacy `POST /api/classes/join` remain unchanged.
- HTTP admission/status/access checkpoint:
  - `746559e67620aab3457b6cda90e42168d5350dde` adds Start Class join-code return, race-safe live workspace-access issuance, and live/legacy Student-context resolution;
  - `1b81d4a4c80a7fe16cee5523d6c13811f51f20b3` mirrors live access in the deterministic repository;
  - `2d6f92d05c693c35818e4457685c311c66a65807` adds one-code admission, Instructor participant roster, Student own-status, and Student current-workspace access handlers;
  - route entrypoints land in `11a83da6...` through `dc698c110...`;
  - `04f95f24dd63d2ce75260034d75c9c514d07e84e` adds the focused authorization matrix.
  - validation: repository quality **244 tests / 243 pass / 0 fail / 1 intentional skip**; required Browser E2E **22 passed / 6 intentional skips / 0 failed**; CodeQL, Dependency Review, and Template Manifest Guard green.
  - current Student UI remains on the legacy two-code path; no live team-management UI has been cut over yet.
- Assign/reassign/unassign authority checkpoint:
  - `742240e92156a9d43a96752a2cb6acc5908f4172` adds server-only stale-presence cleanup by internal workspace ID;
  - `2c1d6fdf6872eb1390424503f08692a581da6322` mirrors that cleanup in the deterministic workspace harness;
  - `b48e6bbb71c2d6ec818ca1f69b656b3bffbed473` adds Instructor-only assignment transitions, optimistic revision protection, individual-workspace occupancy enforcement, old-authority revocation before assignment mutation, and active-alias validation for live Student coaching/resource context;
  - `a382acad42de25f4fa1ae217acf34d69a047606b` mirrors live assignment transitions in the deterministic Classroom repository;
  - `7bfd662e2dcbe5511a4065b7b19222129485d08a` proves Waiting -> Team A -> Team B -> Waiting, idempotent same-team assignment, cross-class rejection, stale-token write rejection, old-presence cleanup, no snapshot merge, and individual-workspace single occupancy.
  - validation: repository quality **246 tests / 245 pass / 0 fail / 1 intentional skip**; required Browser E2E **22 passed / 6 intentional skips / 0 failed**; CodeQL, Dependency Review, and Template Manifest Guard green.
  - current Instructor and Student UIs are still on the pre-#312 experience; the new management surface has not been cut over.
- Instructor live-management client checkpoint:
  - `0d004552db82660dc723fd37a79ef4e46d197083` / `9c26bdf1a546428092af44dcf342cb2eae0d44a4` establish the primary Start Class shell, join-code panel, live roster/team controls, and responsive layout while keeping Open existing class as recovery.
  - `f2306021eaa4cb95fd34e72940233fc0a99bcb3e` through `a2ae981e0a902f3c143446fec2fa1e77ef346d1f` wire Instructor session/join-code state, combined workspace+participant polling, Start Class, workspace creation, assignment, copy, resume, and observer lifecycle.
  - `40f6ece94c47d026ac201e0f434f51329d38c604` / `8fe9e4438b18684377382c7e7cadd68208da1c53` make live participants count in workspace member totals.
  - `09daa729f4b2a32e0c913985b741771ace34dc5f` / `709cd910de22189b1d362f58aa58c3c5abbf2642` add Instructor feature/unit coverage.
  - `2a76541675217aff46f90c255c33e40968db718f` / `e23b4cd8cf998b313418706bc36b7cf2d175b1db` extend the deterministic browser fixture; `692c81aa9c0007d94f2d91fe36bb34160ff9173c` adds the real-browser Start Class -> Waiting -> create Team -> assign -> observe -> reload/resume journey.
  - the first browser run exposed only an intentional-UX test mismatch: old Instructor tests tried to type into the now-collapsed existing-class recovery disclosure. `205b0edc...` through `d3e2a397cd76fc75e62516ed63ad76231bb4812c` update those journeys to explicitly open recovery first.
  - validation on `d3e2a397...`: repository quality **248 tests / 247 pass / 0 fail / 1 intentional skip**; required Browser E2E **23 passed / 7 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
  - the normal Instructor flow no longer depends on exposing legacy Student join/assignment capabilities; compatibility routes remain intact.
- Student live-class client checkpoint:
  - `47485439c34fc7237c28f93619924e2da87b084a` / `73792b71db9ec7965c36c2b905ebc09bb699ea78` make display name + human class code the normal Student path, add Waiting, and retain the legacy assignment code under an explicit recovery disclosure.
  - `d32c7ec331daa5010f9617c6b332756e9395d35b` implements live admission, own-status polling, class-session resume, memory-only workspace access, safe reassignment, unassign, and terminal recovery while preserving the legacy controller path.
  - `db54b1aa84dc4d43802aa568b811b6974a84c02c` / `a3d520655c928abbeb4cb63e592593a38a969cd8` prove the live resume envelope never persists assignment-specific workspace authority and cover Waiting -> A -> B -> Waiting.
  - `8485b2ca1a5ba59fb98d4aae0398a9052fab91b6` / `2fd0d53c0fd8e4e4cac0298aca9f5ed7ad930a94` add an isolated live Student browser fixture with canonical Team A/B state and revocable fresh workspace aliases.
  - `50f6260a251793c0794945d941ad4ac1c97d4e8d` adds desktop/mobile one-code -> Waiting -> Team Alpha -> edit -> reload/resume -> Team Beta -> Waiting, including stale-token 404 checks and no snapshot merge.
  - the first browser run exposed two bounded issues: four older tests needed to open the intentional legacy recovery disclosure, and the Waiting eyebrow inherited a 3.72:1 blue-on-pale-blue contrast. `30dbb0d...` through `1b90c0f...` update the legacy journeys; `0c8692c7486ecb50c730d0757c41426b81830250` applies the existing accessible accent-text foreground.
  - validation on `0c8692c...`: repository quality **252 tests / 251 pass / 0 fail / 1 intentional skip**; required Browser E2E **25 passed / 7 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
  - live same-device resume persists the stable Student class-session capability, never the current team workspace token; reload/move reacquires fresh server-authorized access.
- Integrated live-class acceptance checkpoint:
  - `5f1404921eeec8b2aba3103672be547af35b6865` / `4f36af2d5221234a9ebf35d574f287f7aa52bb39` share managed Instructor workspace state with live Student collaboration and bind one-code admission to the same Instructor-owned class.
  - `e7b8d06111b8dbda6ba6a27372956b3d012899c3` carries existing field-level coaching across managed live workspaces.
  - `2262490c9de7da5a9b675932fda2c84475977168` adds the four-browser acceptance journey: displayed Instructor join code -> two Waiting Students -> Team Alpha shared sync -> late Student -> Team Beta isolation -> Instructor observe/coach -> A -> B move -> stale-A 404 -> unassign -> stale-B 404.
  - before accepting the gate, `971898cb4eca725ad079be5c8ba5c97484fdab2f` / `6c712e47383079d5aa50869be4e9d9a26def28e9` / `9315210dd15ed583cfbd3201302699d025ded3a1` isolate the integrated class capability/join-code/workspace namespace so fully parallel Playwright specs cannot reset one another.
  - validation on `9315210...`: repository quality **252 tests / 251 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
  - #312 browser acceptance now covers the complete live-class lifecycle without adding #313 staged simulation state.
- Exact next action: perform the final #312 docs/security/merge-readiness review: reconcile API/architecture docs with the implemented one-code lifecycle, review the full `main -> #314` diff and unresolved review/security state, confirm additive rollback/legacy compatibility, and move #314 out of draft only if the final documented head remains green. Keep #313 as the next separate product slice.

## #312 merge boundary

- #312 completed in PR #314.
- Squash merge on `main`: `b141d55050207e4cf7ce842a4452a220a5268968`.
- Final #312 head before merge: `d6a2f27b95639340ad46f6e596368f064671a08f`.
- Final gate: repository quality **252 tests / 251 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- #312 issue closed.
- #313 starts from the merge commit, not from the old #312 feature branch.

## Active #313 implementation

- Issue: #313 — Instructor-orchestrated case simulation and staged debrief.
- Branch: `feature/classroom-staged-simulation`.
- Base: #312 merge `b141d55050207e4cf7ce842a4452a220a5268968`.
- Canonical contract: `docs/classroom-staged-simulation.md`.
- Architecture checkpoint: `808bdfaa74e7e6a11a88173ee43c5c86d9a8da51`.
- First tranche is architecture/governance only; no exercise tables/routes/UI yet.
- Decided model:
  - staged simulation is class-level orchestration layered over #312 assignment/workspaces;
  - exercise lifecycle is separate from Intake/collaboration/coaching state;
  - Student staged reads use the stable Student class-session capability, allowing safe current-stage access while Waiting;
  - Student collaboration edits remain assignment-specific workspace-capability authorized;
  - future-stage and Instructor-only content are withheld server-side;
  - existing full protected Case Study `state` is source/exemplar material and cannot serve as the Student staged feed;
  - a staged Case Study requires an explicit server-only `simulation` definition; never infer official stages from a completed Intake payload;
  - while a staged exercise is active, the Student full-payload Case Study endpoint must not provide a bypass to the selected case's complete `state`;
  - workspace readiness is team-scoped;
  - beginning debrief captures immutable per-workspace checkpoints so pre-debrief reasoning can be discussed later without overwriting live Intake;
  - optional edit freeze must be enforced on the Student collaboration write path, not only in the UI;
  - late join enters the current class stage; reassignment preserves class stage while destination team Intake/readiness wins;
  - Instructor lifecycle mutations use optimistic exercise revision so retries cannot double-advance.
- Production stage content is intentionally **not authored yet**. Use synthetic deterministic staged content for infrastructure tests until authoritative case pages/evidence/facilitation material is supplied and reviewed.
- Exact next action after this architecture tranche: extend Case Study authoring validation/server-only manifest with an **optional** `simulation` definition and focused tests for unique IDs/cross-references, Student-vs-Instructor content separation, public-manifest exclusion, and backward compatibility. Stop before exercise persistence/API/UI.

## Approved Classroom follow-on direction

The current #288 program establishes the secure Classroom foundation, but it is **not** the final Instructor-led teaching experience.

- **#312 — Instructor-run live class, roster, and dynamic team management**
  - normal Instructor path becomes **Start a class**, not manually supplying a pre-existing secret;
  - one human-friendly Student join code/link for class admission;
  - late joiners can enter an unassigned/waiting roster after an exercise has begun;
  - Instructor creates teams/individual workspaces and assigns/reassigns Students live;
  - accessible drag/drop-style grouping may be offered, with keyboard/button alternatives;
  - moving a Student changes the server-authoritative workspace they synchronize with, without merging old/new team Intake snapshots;
  - old team edit authority must not remain indefinitely after reassignment;
  - Instructor dashboard should expose team membership, activity/progress/coaching signals, and fast observer/coaching navigation.

- **#313 — Instructor-orchestrated case simulation and staged debrief**
  - builds on #312 rather than expanding PR #308;
  - Instructor selects/starts a Case Study and controls exercise stage;
  - Student sees only case pages/evidence released for the current stage, ideally referenceable beside Intake;
  - future-stage material and Instructor-only facilitation/model-answer material remain server-gated;
  - teams document their reasoning/results continuously in Intake;
  - Instructor can pause for debrief, review team work, coach, and then advance the class together;
  - late join and team reassignment must preserve current-stage authorization;
  - progressive disclosure, shared pacing, preserved Student work, and debrief-before-exemplar are the target simulation principles.

#296/#279 should finish the present real-browser quality layer without encoding the current class+assignment-code Student admission UI as the permanent product contract. Negative authorization tests should protect credential isolation and non-enumeration in ways that remain valid when #312 replaces the current admission UX.

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
