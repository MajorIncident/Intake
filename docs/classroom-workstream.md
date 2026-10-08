# Classroom Experience Workstream Status

This is the live restart document for the Classroom Experience program (#288).

**Rule:** update this file at every durable classroom checkpoint, not only final handoff. It should answer “where are we, what is safe, and what should a cold AI do next?” without requiring chat history. Follow the delivery-resilience protocol in `docs/REPOSITORY-OPERATIONS.md` so message timeouts or conversation limits cannot erase the continuation point.

## Current phase

The secure Classroom foundation (#288), live-class management (#312), staged-simulation engine (#313), universal target layer (#318), debrief comparison (#319), and join/mobile polish (#320) are **merged**. PR #326 merged #319 to `main` as `400a6c5ee0b879b4a36705be6d8af075bc89d391`; that exact SHA reached Vercel production **READY** and the post-deploy runtime-error scan was clean. PR #327 then merged the small-slice/slow-gate operating rules as `dce82b1ddb94ff926464af4a9b9d81704ba05a5a`.

Pre-production hardening is active. **#328** is implemented on `feature/preproduction-compat-reset` / draft PR #332 and is in final validation. The governing contract remains `docs/preproduction-hardening.md`.

## Program issues

| Slice | Issue | Status | PR / branch | Notes |
| --- | --- | --- | --- | --- |
| Program | #288 | Complete | PR #297 merged | Foundation program closed; follow-ons tracked separately |
| Experience role | #289 | Complete | PR #298 merged | Runtime/tests/docs complete |
| Templates / Case Studies | #290 | Complete | PR #299 merged | Resource semantics complete |
| Class domain/API | #291 | Complete | PR #300 merged | Class/workspace authorization complete |
| Student join/resume | #292 | Complete | PR #302 merged | Student admission/resume foundation complete |
| Instructor observer | #293 | Complete | PR #305 merged | Server-enforced read-only observation complete |
| Coaching | #294 | Complete | PR #306 merged | Separate coaching persistence/UI complete |
| Protected cases | #295 | Complete | PR #307 merged | Protected catalog/payload + minimal public `dist/` boundary complete |
| Browser E2E/CI | #296 | Complete | PR #308 merged | Required Playwright/axe regression is inside CI |
| Browser test foundation | #279 | Complete | PR #308 merged | Deterministic browser fixture and accessibility foundation complete |
| Live class management | #312 | Complete / published | PR #314 merged | One-code admission, Waiting/late join, teams, reassignment, observer/coaching |
| Staged simulation | #313 | Complete / published | PR #315 merged | Staged release, Ready/debrief/freeze/checkpoints/advance/complete |
| Publish recovery | #321 | Complete | PR #322 merged | Vercel function count consolidated to 5/12; exact-main production READY |
| Universal Intake target identity | #318 | Complete | PR #325 merged as `ef694910...` | Shared semantic target projection and compatibility guards |
| Class debrief comparison | #319 | Complete / published | PR #326 merged as `400a6c5e...` | 319A–F complete; exact merged-main production READY + runtime clean |
| Join/mobile polish | #320 | Complete | PR #324 merged as `273ae643...` | Safe share/QR + compact mobile Class/Case/Team/Notes/Instructor chrome |
| Compatibility reset | #328 | **Implementation complete / validating** | Draft PR #332 | Current one-code/session model only; obsolete Classroom access/schema and pre-production save migrations removed |
| Admin / Maintenance | #329 | Planned / blocked by #328 | Open | Inventory, preview, revoke/purge stale Classroom + collaboration data |
| Startup experience hub | #330 | Planned / blocked by #328/#329 | Open | Explicit Continue / Work independently / Join / Run / Admin choices |
| Rich staged assets | #316 | Deferred until hardening complete | Open | Secure image/table/document-page delivery |
| First production staged case | #317 | Deferred / blocked by #316 | Open | Source-faithful official case authoring/rehearsal |

## Current architecture decisions

- Experience role, intake mode, and resource kind are separate axes.
- Standalone remains the local-first, backend-optional product. Pre-production historical save/access compatibility is not a requirement; #328 owns the deliberate cleanup.
- Student/team workspaces reuse existing collaboration snapshot/revision/presence behavior.
- Instructor observes student Intake read-only.
- Coaching is a separate persistence/revision channel.
- Classroom credentials never belong in exported Intake state.
- Case Study password is instructional gating, not authentication.
- Protected Case Study metadata/payloads are server-gated, absent from public browser assets, and authored `templates/*.json` is excluded from Vercel deployment.

See `docs/classroom-architecture.md` for the full contract.

## Cold restart checklist

1. Inspect current `main` HEAD and open follow-on issues #328–#330 plus deferred #316/#317. Also inspect any newer Classroom/deployment blocker before creating work.
2. Read:
   - root `AGENTS.md`;
   - `docs/classroom-architecture.md`;
   - `docs/classroom-roadmap.md`;
   - `docs/preproduction-hardening.md` for #328–#330;
   - `docs/classroom-api.md` for server/class work;
   - `api/AGENTS.md` for server/class work;
   - this file;
   - `docs/AI-ONBOARDING.md`;
   - `docs/REPOSITORY-OPERATIONS.md`.
3. Identify the earliest incomplete slice whose dependencies are satisfied.
4. If an implementation PR is already open, continue that PR rather than creating competing work.
5. Refresh the branch from its documented base before editing.
6. Run/inspect `npm run quality`.
7. After every meaningful completed sub-slice or validation repair, add a **mini milestone** to the active PR with branch/head SHA, proven behavior, pending/failed checks, scope not yet started, and the exact next action. Do this before long validation waits and before moving to another tranche.
8. Before handoff, update this table, record validation, and write the exact next action below.

## Active work

**#328 — Pre-production compatibility reset** is active on `feature/preproduction-compat-reset` / draft PR #332 and is at final validation.

Frozen implementation checkpoint before this final ledger update: `2383bc2cb4c4fe2d3561a4e13a01b9d96ad1ff6e`.

Completed:
- Student entry is display name + one human class code only; the legacy assignment-code disclosure and two-code client flow are removed.
- Student resume accepts only the current v2 class-session envelope. Assignment-specific workspace capability remains memory-only and is reacquired from the server.
- Instructor entry exposes Start Class + same-device resume only. The public **Open an existing class / Instructor access code** bearer-entry form is removed; future recovery belongs to #329 Administration / Maintenance.
- `POST /api/classes/join`, Student join-token issuance/rotation, workspace assignment-claim secrets, legacy membership authorization, and their Vercel route are removed.
- Existing pre-production databases explicitly drop `student_join_token_hash`, workspace `claim_token_hash`, and `classroom_memberships` during idempotent schema initialization.
- Current authorization remains human join code -> Student class-session -> current assignment-specific `classroom-student` workspace capability. Instructor observation/coaching remains class-scoped/read-only with respect to Student Intake.
- Intake serialization is current-version-only at `APP_STATE_VERSION = 3`; the historical migration registry is empty and old snapshot versions fail closed.
- Experience-role preference accepts only the current versioned envelope; saved Intake no longer silently infers Standalone.
- Load-from-File rejects unsupported snapshot versions with an explicit file-version/current-version message before normalization/application.
- All five authored Template/Case Study sources and both generated manifests use the canonical v3 Intake schema.
- Unit/API/browser fixtures have been converted to the current access/session model; retired browser journeys were consolidated into live-class coverage.
- Canonical API, architecture, security, onboarding, README, live-management, and storage-schema docs have been reconciled to the current model.

Validation evidence:
- An earlier Template Manifest Guard run was green after canonical resource conversion; the final docs-only head still requires its own fresh required checks.
- The first full quality attempt reached **360 tests / 358 pass / 1 fail / 1 intentional skip**; the single failure was an obsolete revocation test boundary and was corrected to exercise current Student class-session 401/404 revocation.
- Branch-wide changed-fixture audit found no accidental v1/v2 Intake snapshots; the only old-version fixture remaining is the intentional rejection test.
- Runtime audit finds retired DB identifiers only inside the deliberate `DROP ... IF EXISTS` cleanup statements.
- Explicit compatibility shims for legacy containment values, P1/P2/P3 action priorities, raw experience-role preferences, old Student recovery envelopes, and cause hypothesis/summary fields are removed with rejection/current-contract coverage.
- PR #332 has **0 unresolved review threads**.
- Final exact-head CI / CodeQL / Dependency Review / Template Manifest Guard are still pending as of this checkpoint; do not claim them green until refreshed after this documentation-only commit.

Exact next action:
1. refresh PR #332 exact head and required checks;
2. if CI fails, fix only the concrete failing current-contract test/gate and repeat;
3. once all required checks are green, update PR #332 with final evidence, mark it ready for review, verify 0 unresolved threads, and squash-merge the exact head;
4. verify merged `main` publication/runtime before closing #328;
5. #329 Administration / Maintenance is the next product slice after #328 is closed.

### Historical checkpoint ledger

The detailed sections below record how earlier Classroom slices were built and validated. Statements describing legacy compatibility in those historical checkpoints are **historical evidence**, not the forward product requirement. Current target direction is governed by `docs/preproduction-hardening.md` and #328–#330.

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
- Staged Case Study authoring-schema checkpoint:
  - `46109491808bedfbf5e778d0979859b3cd96b56c` adds version-1 server-side simulation validation/normalization;
  - `1f716470cfdf95a64c00a8a99a62735133feae61` integrates optional `simulation` into the protected Case Study manifest build only;
  - `9322cecabe9a487e072dd279519b5f358f089ebd` / `1e22806b8a1e50e94150a13ecf3b7083f0747667` add synthetic schema and public-boundary regression coverage;
  - `af6b6f21a8e4f25f014a8362857a1c15e252775b` restores #313 API guardrails alongside real tests.
  - Standard Templates cannot carry `simulation`; Student and Instructor content are separate, stable-ID/cross-reference validated namespaces; unsafe arbitrary fields/URLs are rejected; existing non-staged Case Studies remain unchanged.
  - no official production case has been staged or guessed.
  - validation on `af6b6f21...`: repository quality **260 tests / 259 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; Template Manifest Guard and Dependency Review green.
- Staged exercise persistence/repository checkpoint:
  - `ea964de7afc002ca307a903db7e1493d56837f13` adds additive exercise, optional-release, workspace-readiness, and immutable-checkpoint tables with class/workspace foreign-key scoping and one-open-exercise-per-class enforcement.
  - `3e519b8f4ab136404ade550376af0c80e06574f1` adds real repository primitives for draft creation, optimistic lifecycle mutation, release replay/idempotency, Student-session/current-workspace readiness, class-scoped checkpoint capture/listing, and class-bounded expiry.
  - `8595e1ec1072b365e82f759494ea0edb25001a4c` mirrors those semantics in the deterministic repository.
  - `f7c1e580ca8fdc5e818e1f6974af374850f6d3a6` proves one-open-exercise, optimistic conflict, completion/history, release idempotency, readiness staying with teams through reassignment, Waiting rejection, immutable snapshot-isolated checkpoints, and cross-class rejection.
  - `09ffaa6c...` through `c01dfff2f2bd1f9d7625901860210cc00eee7051` additionally pin simulation version + definition fingerprint on each exercise and keep those columns migration-safe so later APIs can fail closed on definition drift.
  - pre-hardening validation on `f7c1e58...`: repository quality **265 tests / 264 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
  - no exercise HTTP route, Student collaboration write lock, or exercise UI exists yet.
- Staged exercise API / authorization checkpoint:
  - Instructor `POST/GET/PATCH /api/classes/exercise` now owns class-scoped draft creation/read plus start/pause/resume/optional release/begin-debrief/advance/complete with optimistic exercise revision and immutable stage ordering.
  - Student `GET /api/classes/exercise/student` uses the stable class-session capability and returns only current/cumulative Student-safe released content; future stage and Instructor-only material remain server-withheld.
  - Student `PUT /api/classes/exercise/student/ready` resolves the current assignment server-side, records server-observed workspace revision, rejects Waiting, and fails closed on reassignment races.
  - every read/mutation validates the pinned simulation version/fingerprint against the current protected definition.
  - active/completed staged cases block Student full protected Case Study payload retrieval for that case; completion does not imply exemplar release.
  - Instructor full protected access and unrelated protected resources retain their existing behavior.
  - Tranche 4 deliberately returns `editFreezeEnforced: false`; no security claim is made until collaboration PUT enforcement lands.
  - implementation/security-test checkpoint: `5afc0041db89348d97ca0986cab89491765d0e00`.
  - validation: repository quality **273 tests / 272 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Server-enforced Student editing-policy checkpoint:
  - `9eea334b1a7ea791f3edf3d3330ac512b06bbb32` adds capability-kind-aware workspace write policy preflight; `6a8fb4f55b653ca5acc66954fcc8d28fe375ace4` resolves current Classroom exercise write policy; `1aec6a17647871ab23c36572ab339f2dd3e63350` wires the production session route.
  - `96eab74f64838775f544990e495fe62a3319827f` / `4eb7f5e6b8a719add994c79acbff31c04a4ebcbb` apply authored debrief defaults, expose truthful enforcement state, and add revision-safe debrief `set-editing`.
  - `507da02269336fb414d2ccc5390be4cbb26ed97c` hardens the real Neon `classroom-student` mutation with an atomic SQL freeze predicate so Instructor freeze racing a Student PUT fails closed.
  - `f3304a2f470b8c96468de13c787cbe0378b8f8b9` makes Pause/Resume preserve the current edit policy instead of silently unlocking a frozen debrief.
  - `d66eeeace6f9e41dade765b6b0331a69a40ebbb0` / `261b28d488538964ccd73132ed568d73628f6411` prove allowed work writes, 423 frozen-write rejection with zero snapshot/revision mutation, frozen GET availability, Standalone isolation, freeze persistence through Pause/Resume, and explicit unfreeze restoring writes.
  - stable temporary-lock contract: HTTP **423 Locked**, `code: classroom-editing-locked`.
  - validation on `261b28d...`: repository quality **274 tests / 273 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Tranche 6A — Instructor exercise console foundation:
  - implementation spans `2624f1e...` through `d20a303...`;
  - `GET /api/classes/exercise` now returns `availableCaseStudies` containing **only** staged Case Study summaries; full `simulation` definitions and protected source `state` are not used for discovery;
  - new `src/classroomExerciseInstructor.js` owns an in-memory Instructor exercise client and read-only console foundation;
  - the existing Instructor dashboard now includes a `[feature:instructor-exercise-console]` section for current exercise status, staged availability, and explicit refresh;
  - Instructor capability and exercise context remain outside Intake persistence, summaries, exports, URLs, and public manifests;
  - no exercise mutations were added in 6A; selection/create and Start/Pause/Debrief controls remain intentionally deferred to the next slice;
  - focused API/client tests cover staged-only discovery, absence of protected simulation/source material in the discovery list, capability non-persistence, draft rendering, disconnect cleanup, and transient refresh recovery.
- Tranche 6B — staged Case Study selection and draft creation:
  - implementation spans `6a69426...` through `5f3fb56...`, with deterministic browser fixture support at `c3440eb...`;
  - the console now exposes an accessible staged Case Study selector and **Create draft** action only when no exercise is open;
  - POST sends only the selected server-discovered `caseStudyId`; successful create and idempotent existing-draft reuse both hydrate the represented server exercise without persisting it locally;
  - once an exercise exists, selector/create are disabled so the UI cannot imply a second simultaneous exercise;
  - a 409 create conflict is never blindly retried: the controller performs an authoritative GET and renders the current exercise, with a visible "current state reloaded" status;
  - public controller state continues to sanitize the protected Case Study to summary fields and never exposes the Instructor capability or Instructor-only simulation content;
  - deterministic browser acceptance now uses a synthetic staged case owned only by `scripts/serve-browser-tests.mjs`; no official production case content was staged or guessed;
  - the live Instructor browser journey proves draft create, server-backed reload/resume, disabled duplicate-create control, and no local exercise persistence;
  - summary/persistence guards explicitly mark the staged selector, label, placeholder, and dynamic options as local-only / summary-excluded rather than incorrectly wiring Classroom exercise state into Intake serialization;
  - 6A final-head repository quality was green, but the existing four-browser integration acceptance exceeded its 30s global timeout (historical green runtime was already 26.1s). 6B raises only that test budget to 45s; no failing product assertion was suppressed.
- Tranche 6C — Start/Pause/Resume and current-stage Instructor context:
  - implementation spans `53ce2b7...` through `2888beb...`;
  - draft-only **Start exercise**, active-only **Pause exercise**, and paused-only **Resume exercise** controls use the current server `exerciseRevision`;
  - lifecycle PATCH conflict behavior is fail-refresh: a 409 triggers authoritative GET and never replays stale Instructor intent;
  - after Start, the console renders current stage title, Student objective, suggested timing, and only the current stage's Instructor-authorized facilitation blocks;
  - Pause explicitly describes class pacing as distinct from Student editing freeze, preserving the later debrief-policy boundary;
  - deterministic browser fixture now implements matching Start/Pause/Resume revision semantics against the synthetic staged case;
  - focused controller coverage proves revision progression, stage/facilitation rendering, state-specific controls, and 409 refresh; real-browser Instructor acceptance proves Start -> Pause -> Resume -> reload;
  - the unrelated four-browser acceptance timeout is raised narrowly from 30s to 45s after the previous run completed product assertions but timed out during teardown; no behavioral assertion was removed.
- Tranche 6D — optional evidence release and team readiness/progress:
  - implementation spans `1de00a1...` through green implementation head `2c8145b...`;
  - the console renders optional Student evidence only from the **current stage's** explicit `optionalReleaseIds`; future-stage optional content is not projected into the Instructor release UI;
  - **Release to Students** PATCHes `release-content` with the currently observed `exerciseRevision`; a genuinely new stale release 409 refreshes authoritative state and never replays stale intent;
  - an already-recorded release remains idempotent and renders **Released** without a second revision bump;
  - current-stage `workspaceState` rows render Ready/Working progress and progress buttons reuse the existing Instructor `selectWorkspace()` observer/coaching path rather than creating a second observer;
  - exercise releases/readiness/progress remain memory-only and local-only / summary-excluded;
  - deterministic browser coverage uses only synthetic optional evidence/readiness and proves release, persisted release after reload, Ready progress, and one-click observer navigation;
  - the prior four-browser failure was traced to nested scrolling in the expanded Instructor rail, not product authorization; the rail layout now lets the outer dashboard own scrolling so workspace buttons remain genuinely clickable without forced test clicks;
  - validation on `2c8145b...`: repository quality **285 tests / 284 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Tranche 6E — Begin Debrief, checkpoint review, Freeze/Allow Editing, and compact Instructor rail:
  - implementation spans `044e4f82...` through green implementation head `61aa582...`;
  - **Begin debrief** is exposed only for active current-stage work and PATCHes the current `exerciseRevision`; 409 conflicts authoritative-refresh and never replay stale intent;
  - entering debrief renders the server-captured immutable checkpoint status per current-stage workspace as workspace label + captured collaboration revision; checkpoint snapshot bodies remain server-side/in-memory and are deliberately omitted from controller public state and the checkpoint UI;
  - debrief shows the authoritative `studentEditingEnabled` state separately from Pause/Resume and exposes exactly one applicable **Freeze editing** or **Allow editing** action;
  - `set-editing` is debrief-only and revision-safe; conflicts refresh without replay, while the existing HTTP 423 `classroom-editing-locked` write guard remains the actual Student enforcement boundary;
  - deterministic browser acceptance proves work -> Begin Debrief -> immutable checkpoint capture -> stage-default freeze -> Allow Editing -> Freeze Editing -> reload while the existing observer remains active;
  - the connected Instructor class/team rail now has explicit collapse/expand controls. At <=700px it defaults to a compact collapsed class header rather than consuming the full mobile viewport; the Instructor can reopen it normally, and desktop collapse also reclaims horizontal Intake space;
  - mobile coaching/observer acceptance now explicitly reopens the compact class rail before switching teams, proving the collapsed state remains usable rather than relying on hidden/forced clicks;
  - validation on `61aa582e9faee9a7e500796634c5cc06e256ff14`: repository quality **288 tests / 287 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Mobile workspace UX follow-on: align the Notes workspace and Instructor class rail around the same compact mobile principle. Prefer an always-discoverable collapsed header/launcher over fully hiding either workspace; evaluate making Notes default-collapsed on narrow screens and reducing its collapsed chrome so it does not obstruct primary Intake work.
- Tranche 6F — Advance/Complete and Instructor-console lifecycle completion:
  - implementation spans `e855df09...` through green implementation head `e2f5534...`;
  - **Advance to next stage** is exposed only from active debrief when the protected Instructor definition has a next authored stage; it PATCHes the current `exerciseRevision` and follows the authored stage order rather than accepting a client-selected stage ID;
  - successful Advance renders the next stage's title/objective/timing/current Instructor facilitation, returns the exercise to work, and reflects authoritative Student editing restored for work;
  - **Complete exercise** is exposed only from active debrief on the final authored stage and also uses the current revision;
  - Completed now takes precedence over the debrief phase label, hides further Advance/Complete and Freeze/Allow controls, retains final-stage checkpoint review, and explicitly states that completion does **not** release additional Student, Instructor-only, exemplar, or full protected Case Study material;
  - lifecycle conflicts keep the same fail-refresh/no-replay behavior; focused coverage proves a stale Advance performs GET -> PATCH 409 -> authoritative GET with no mutation replay;
  - the deterministic browser staged fixture now has two synthetic authored stages and preserves earlier-stage checkpoints while capturing final-stage checkpoints;
  - the real Instructor journey proves Stage 1 work/debrief/freeze -> Advance -> Stage 2 work -> Stage 2 debrief -> Complete -> reload, while the existing observer remains available throughout;
  - validation on `e2f5534aa0e85bccc2bee0e73275c9b77d000f3d`: repository quality **290 tests / 289 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Mobile workspace UX follow-on remains open: align the Notes workspace and Instructor class rail around the same compact mobile principle. Prefer an always-discoverable collapsed header/launcher over fully hiding either workspace; evaluate making Notes default-collapsed on narrow screens and reducing its collapsed chrome so it does not obstruct primary Intake work.
- Tranche 7A — Student current-stage case-reference foundation:
  - implementation spans `e307ca2...` through green implementation head `91d7029...`;
  - new `src/classroomExerciseStudent.js` is a dedicated Student staged-exercise client rather than adding exercise authority to `classroomStudent.js`;
  - the Student controller uses only the **stable live Student class-session capability** for `GET /api/classes/exercise/student`; assignment/workspace capabilities continue to authorize collaboration only and may rotate independently;
  - `classroomStudent.js` now exposes separate session-level connect/disconnect hooks so the staged case reference survives Team A -> Team B reassignment but clears on live-session termination or Student-role exit;
  - the browser controller sanitizes the response down to case summary, current stage/objective, phase/editing state, and cumulative released Student-safe content; unknown/future-stage and Instructor-only fields are discarded from DOM and public state;
  - staged exercise credentials/content remain memory-only and never enter Intake persistence, localStorage/sessionStorage, summaries, exports, URLs, or public manifests;
  - the Student surface reports Work, Paused, Debrief/editing-open, Debrief/editing-frozen, and Completed state; a frozen debrief explains that case material remains reviewable even while Intake writes are locked server-side;
  - exercise polling follows the represented server revision and reload/resume restores the current Student-safe case reference without storing the protected material locally;
  - the reference is compact/collapsible and defaults collapsed at <=700px; on very wide desktop it becomes a bounded left companion while Intake/Notes keep their existing space;
  - real mobile acceptance exposed an existing fixed team/notes `.workspace-dock` overlapping the new reference toggle. Student narrow layouts now put that dock into normal document flow rather than floating over Intake; the acceptance test uses an ordinary click, not force/z-index workarounds;
  - deterministic Student fixture responses intentionally omit complete `simulation`, future-stage metadata, and Instructor facilitation; browser acceptance proves Stage 1 released content appears while Stage 2 and Instructor-only text do not;
  - validation on `91d7029bec5cddaf251d02301a4fd1ce97dc908c`: repository quality **295 tests / 294 pass / 0 fail / 1 intentional skip**; required Browser E2E **26 passed / 8 intentional skips / 0 failed**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Mobile workspace UX follow-on remains open beyond the overlap fix: converge the Student team/presence workspace and Notes workspace on compact discoverable headers/default-collapsed behavior so normal-flow mobile layout remains useful without excessive vertical footprint.
- Tranche 7B — Student Ready / Resume Working:
  - implementation spans `e43b84c...` through `247479f...`, with browser fixture/acceptance through `d311b7b...`;
  - readiness appears only during `active + work` while the Student has a current assignment;
  - **Mark Ready** / **Resume working** use only the stable Student class-session capability with `PUT /api/classes/exercise/student/ready` and body `{ ready: boolean }`; no workspace ID/token or client-supplied collaboration revision is sent;
  - Ready displays the server-captured collaboration revision; team readiness stays workspace-scoped across reassignment;
  - assignment/phase `409` refreshes authoritative exercise state and never replays stale readiness intent;
  - Waiting, paused, debrief, and completed states expose no readiness mutation;
  - deterministic browser acceptance proves a Team Alpha edit advances the shared Intake revision, Ready captures that revision, Resume Working clears readiness, and both writes use the stable Student session credential.
- Tranche 7C — frozen-debrief Student Intake read-only projection:
  - implementation spans `8d70e84...` through `50435c3...`;
  - a non-completed debrief with `studentEditingEnabled=false` and `editFreezeEnforced=true` projects the existing Student Intake surface read-only/disabled while the Tranche 5 HTTP **423 Locked** server guard remains the actual authorization boundary;
  - original disabled/readOnly/tabindex/ARIA/contenteditable/draggable state is restored exactly when editing reopens, the exercise advances/completes, staged state disappears, or the Student session disconnects;
  - paused frozen debrief remains read-only because Pause/Resume preserves edit policy;
  - **Leave class** remains usable during a freeze;
  - Notes are intentionally frozen with Intake because `notesWorkspace` is part of `collectAppState()` and therefore the collaborative snapshot;
  - focused tests prove freeze/unfreeze and paused-freeze/disconnect restoration;
  - integrated browser acceptance starts the staged exercise through the real Instructor console, enters the authored frozen debrief, proves Student Intake read-only, then **Allow editing** restores it through normal Student polling.
- Combined 7B/7C validation: repository quality passed on implementation head `50435c30e7d43f906eeff88d32265ba585fad079`; final browser/security gate evidence will be recorded on the documented head.
- Tranche 8A — Instructor immutable checkpoint inspection versus current live work:
  - implementation spans `0ce4b8d...` through `8530128...`, with browser isolation/test stabilization through `04587bf...`;
  - normal Instructor exercise reads now expose checkpoint **metadata only**; snapshot bytes are omitted from the console payload/public state;
  - new GET-only `/api/classes/exercise/checkpoint?workspaceId=<public UUID>` requires the represented Instructor capability, re-resolves the current exercise/stage/class, validates staged-definition identity, and returns one current-stage debrief checkpoint snapshot only after explicit Instructor inspection;
  - Student/join/assignment/unrelated authority cannot use the checkpoint read, and the endpoint never mints Student workspace authority or mutates collaboration state;
  - the checkpoint list exposes **Inspect checkpoint** per captured workspace/revision during debrief;
  - `classroomExerciseInstructor.js` fetches the snapshot transiently and passes it directly to `classroomInstructor.js`; snapshot bytes never enter exercise controller public state, Intake persistence/export/summary, URLs, or resume state;
  - the existing Instructor observer renderer displays the checkpoint read-only with **Checkpoint at debrief start · Revision N** and **Immutable checkpoint · live updates paused**;
  - live observer polling and coaching projection are paused while the immutable checkpoint is represented, preventing current-review actions from being accidentally applied to historical evidence;
  - **View current live Intake** explicitly returns to the existing observer endpoint and restores current workspace revision/coaching context;
  - selecting another live workspace also exits checkpoint mode rather than carrying a historical snapshot across teams;
  - focused API/controller tests cover metadata-only normal reads, explicit snapshot authorization, no public-state snapshot leak, checkpoint-to-live restoration, and Student credential rejection;
  - integrated browser acceptance now has a dedicated two-browser checkpoint-vs-live journey instead of overloading the long four-browser lifecycle journey; the shared deterministic integrated fixture is serialized within that file to prevent parallel fixture reset races.
- Tranche 8 now satisfies the planned checkpoint/debrief-view scope: immutable capture was implemented in earlier server tranches, Instructor facilitation prompts already render current-stage protected guidance, and 8A adds safe checkpoint inspection/comparison without overwriting Student work.
- Validation baseline for the 8A implementation: repository quality **302 tests / 301 pass / 0 fail / 1 intentional skip**. Final required Browser E2E/CodeQL evidence is taken from the final documented PR head.
- Tranche 9A — integrated staged security / late-join / reassignment acceptance:
  - acceptance hardening spans `6391c39...` through `89a5321...`; browser-fixture/security additions span `523d245...` through `89a5321...`;
  - the deterministic browser fixture now mirrors the production frozen-write boundary: a Classroom Student `PUT /api/workspaces/session` during a frozen debrief returns **423** with `code: classroom-editing-locked` before mutation;
  - browser acceptance reads the workspace immediately before/after that rejected PUT and proves both collaboration revision and snapshot remain unchanged;
  - the browser fixture now mirrors the production staged full-payload boundary: the Student protected Case Study POST cannot retrieve the synthetic staged Case Study while that staged exercise is active;
  - raw Student staged reads are asserted directly with the stable Student class-session capability and contain current released Student material while excluding later-stage and Instructor-only facilitation;
  - a Student joining after exercise Start is proved to enter the current Stage 1 work context and receive only the current cumulative Student release, never draft/future/Instructor material;
  - reassignment during active work preserves the class exercise stage and stable staged-session authority while replacing only workspace Intake/edit authority; the old workspace token remains rejected;
  - readiness is explicitly proved workspace-scoped: Ready on Team Alpha does not follow the Student to Team Beta, where the Student returns to Working at the same exercise stage;
  - mobile Student acceptance expands the compact case-reference surface and runs the serious/critical axe scan while staged content is actually visible;
  - a focused mobile Instructor acceptance opens the compact class rail, creates/starts the staged exercise, verifies current-stage facilitation/lifecycle controls, and runs the serious/critical axe scan;
  - staged accessibility testing exposed two insufficient `#007aff`/white text uses in the Instructor exercise UI. Primary lifecycle buttons and Ready progress text now use the existing darker `--accent-text` token rather than changing the global accent;
  - the checkpoint-vs-live browser proof now derives its captured collaboration revision from authoritative rendered checkpoint metadata instead of assuming a fixed revision, eliminating a serial-fixture retry flake without weakening the historical-vs-live assertions.
- Tranche 9 is complete. Validation on implementation head `89a5321a750606cff6fbf34ccf75ef40dc3def07`: repository quality **302 tests / 301 pass / 0 fail / 1 intentional skip**; required Browser E2E **28 passed / 10 intentional project-scoped skips / 0 failed / 0 flaky**; CI, CodeQL, Dependency Review, and Template Manifest Guard all green.
- Tranche 10 — final documentation, security, and merge-readiness audit:
  - full diff audited from #312 merge base `b141d55050207e4cf7ce842a4452a220a5268968` through completed Tranche 9 head `b000ceab20d1c0bdc132cb0fede0aaa75c85fe17`: **198 commits / 46 changed files / 10,793 additions / 30 deletions** before final documentation reconciliation;
  - README drift corrected: #313 is no longer described as below the HTTP/UI layer; it now documents the implemented Instructor/Student staged lifecycle, server-enforced freeze, checkpoint evidence, and continued separation from live Intake;
  - Classroom API drift corrected: exercise persistence is no longer described as having no HTTP routes; it is explicitly the storage layer beneath the implemented endpoints;
  - roadmap drift corrected: #313 is no longer described as just starting; Tranches 1–9 are complete and the branch is in final audit;
  - authorization audit passed: Instructor lifecycle/checkpoint authority remains class-scoped; Student staged reads use only the stable Student class-session capability; collaboration edits remain assignment/workspace-authorized; Student credentials do not enumerate class workspaces;
  - progressive-disclosure audit passed: normal Student staged responses exclude future-stage, Instructor-only, exemplar/model, and complete protected Case Study state; Student full protected payload is blocked for a staged case even after exercise completion;
  - lifecycle integrity audit passed: Instructor mutations remain optimistic-revision protected; Advance follows server-authored stage order; readiness uses server-observed workspace revision; reassignment preserves class stage while stale workspace authority is revoked;
  - debrief integrity audit passed: checkpoints are immutable class/workspace/stage-scoped evidence, normal exercise reads expose metadata only, explicit checkpoint reads are GET-only Instructor-authorized, and historical snapshots never replace live collaboration state;
  - freeze audit passed: `classroom-student` PUT returns HTTP 423 `classroom-editing-locked` when frozen, rejected writes do not mutate snapshot/revision, and production SQL repeats the freeze predicate atomically; Standalone/primary collaboration remains unaffected;
  - schema/retention audit passed: #313 tables are additive/idempotent, exercise rows inherit class expiry, foreign keys cascade with class/workspace cleanup, one-open-exercise constraint is scoped per class, and rollback can disable the staged feature without destructive schema removal;
  - deployment/public-boundary audit passed: `src/templates.manifest.js` remains Standard-only, `api/protected-case-studies.manifest.js` remains server-only, authored `templates/*.json` stays excluded from Vercel source upload, and Vercel serves only generated `dist/`;
  - production-content audit passed: no authored production Case Study contains a staged `simulation` definition; synthetic staged material remains deterministic test-fixture content only;
  - persistence audit passed: exercise/session/checkpoint/capability state remains outside `kt-intake-full-v2`, templates, summaries, exports, and URLs;
  - PR #315 has no unresolved review threads or reviews, is mergeable, and remains draft until this final documentation head passes all required gates.
- Final audit documentation reconciliation spans `65390fc...` through the Tranche 10 ledger commits. The last fully green implementation/security head before documentation-only cleanup is `b000ceab20d1c0bdc132cb0fede0aaa75c85fe17`: repository quality **302 tests / 301 pass / 0 fail / 1 intentional skip**; required Browser E2E **28 passed / 10 intentional project-scoped skips / 0 failed / 0 flaky**; CI, CodeQL, Dependency Review, and Template Manifest Guard green.
- Exact next action: validate the final Tranche 10 documentation head through all required gates. If green, synchronize PR #315 / issue #313 final status and mark PR #315 **ready for review**. Do **not** merge automatically.

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


## #313 closeout and post-merge handoff

PR #315 final audited head before closeout: `8974519108d6735383b8358373d005188501a785`.

Final validated evidence on that head:
- repository quality: **302 tests / 301 pass / 0 fail / 1 intentional skip**;
- required Browser E2E: **28 passed / 10 intentional project-scoped skips / 0 failed**;
- CI, CodeQL, Dependency Review, and Template Manifest Guard: green;
- PR #315 has no unresolved review threads and is mergeable.

What #313 completes:
- secure class-level staged exercise lifecycle and persistence;
- Instructor orchestration, protected facilitation, Ready/progress, debrief freeze, checkpoints, Advance/Complete;
- Student current-stage case reference, Ready/Resume, frozen-debrief read-only projection, automatic stage transitions;
- late join/reassignment safety, stale-authority cutoff, progressive-disclosure/full-payload denial, mobile/a11y acceptance;
- checkpoint-vs-current-live facilitation without replacing Student work.

What remains intentionally outside #313:
1. **#316 — protected staged assets/rich rendering (P0 blocker).**
   - Schema accepts `image`, `table`, and `document-page`, but Student runtime currently retains/renders only `title + body`.
   - Real protected case pages/assets therefore need a server-gated asset path and rich accessible renderer before official production cases can be staged faithfully.
2. **#317 — first production staged KT Case Study.**
   - No production official Case Study currently carries a `simulation` definition.
   - Staging must come from authoritative supplied participant/instructor sources and be explicitly reviewed; never infer it from completed Intake state.
3. **#318 — stage-linked Intake guidance + target identity.**
   - `intakeTargetIds` is authoring-validated against the universal static/KT + family namespace; it remains optional guidance metadata rather than answer content.
   - Dynamic Possible Cause coaching is now implemented through the same separate Classroom feedback channel.
4. **#319 — class-level debrief comparison.**
   - #313 supports one-team-at-a-time checkpoint/live inspection; it does not yet provide a cross-team selected-field/heatmap comparison surface for large-class debrief.
5. **#320 — join/mobile polish.**
   - Human join code + Copy Code exists; QR/share link remains deferred.
   - Notes/Class/Case mobile chrome still needs the broader compact-launcher alignment called out during #313.

Cold-start priority after #315 merges:
1. read `AGENTS.md`, `docs/classroom-roadmap.md`, `docs/classroom-architecture.md`, `docs/classroom-api.md`, and `docs/classroom-staged-simulation.md`;
2. inspect #316 first;
3. preserve all #313 security boundaries while adding protected rich content;
4. do **not** add an official production `simulation` definition until #316 is complete and the source material for #317 is present/reviewed.

The #288 foundation roadmap plus #312/#313 orchestration generation are complete after #315 merges. The next program phase is **production case enablement and facilitator scale**, beginning with #316.


## #321 publish-recovery checkpoint

**Issue:** #321  
**PR:** #322  
**Branch:** `fix/vercel-classroom-function-budget`  
**Base:** `main` at #315 merge `7c6afa4069ac5de5eae8ec0c9b0959084650c93a`

Why this exists:
- #314 (`b141d55...`) and #315 (`7c6afa4...`) both passed GitHub quality/security/browser gates but their Vercel production deployments ended in `ERROR`;
- Vercel reported `exceeded_serverless_functions_per_deployment`: Hobby permits at most 12 Serverless Functions;
- the last READY production deployment remained #308 at `6c58336ac1677764641c09eadb201abcad8eeac1`;
- #312 added four Classroom route entrypoints and #313 added four more, taking the one-file-per-route design beyond the plan limit.

Recovery architecture:
- all existing public `/api/classes/**` URLs remain unchanged;
- `vercel.json` rewrites those paths to one `api/classroom.js` deployment entrypoint;
- `api/_classroomRouter.js` delegates to the existing class/coaching/protected-case/exercise handler factories;
- routing is not authorization: every delegated handler retains its existing method/capability/class/workspace checks;
- standalone collaboration continues through the separate `api/workspaces/*` functions;
- the 16 redundant `api/classes/**/*.js` wrapper files are removed;
- the conservative deployable function count falls to **5**, leaving headroom below the Hobby limit of 12;
- `npm run verify:vercel-functions` now guards the budget in both `npm run quality` and the Vercel production build;
- regression coverage locks every preserved Classroom public URL to its dispatcher route.

Security invariants unchanged:
- Instructor vs Student capability isolation;
- stable Student class-session vs assignment/workspace edit authority;
- Student non-enumeration;
- protected Case Study and staged progressive-disclosure boundaries;
- checkpoint authorization;
- server-enforced HTTP 423 freeze;
- Standalone/ad-hoc collaboration compatibility.

Exact continuation:
1. finish #322 GitHub gates;
2. create a short-lived `verify/**` branch at the exact PR head and confirm Vercel can build/deploy it under the function budget;
3. merge #322 only after review/gates;
4. verify the exact merged `main` SHA reaches Vercel production `READY` and scan runtime errors;
5. close #321 and confirm #316 is unblocked;
6. then begin #316 — protected staged assets + rich Student rendering.

Do not describe #312/#313 as production-published until step 4 is complete.
