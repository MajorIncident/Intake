# Intake Repository Guidelines

## Scope
This file applies to the entire repository unless a more specific `AGENTS.md` file exists deeper in the directory tree. Follow these guidelines when editing or adding files anywhere in the project.

## Cold Start Protocol
Before editing code in a new human or AI session:

1. Refresh repository state and confirm the current `main` HEAD, active branch, relevant open PR/issue, and recent commits. Never trust branch or PR state remembered from another chat.
2. Read this file, then every scoped `AGENTS.md` that governs files you expect to touch.
3. For architecture, persistence, API, CI, deployment, or security work, also read `docs/AI-ONBOARDING.md` and `docs/REPOSITORY-OPERATIONS.md`.
4. Run `npm ci` after cloning/dependency changes and use `npm run quality` as the canonical definition of repository health.
5. Work on a short-lived branch and pull request. Do not modify `main` directly.
6. Before coding, identify the repository invariants affected. Before handoff, state what changed, what passed, what was manually verified, and any external setting that still needs human action.

If code and documentation disagree, treat the contradiction as part of the task: verify current behaviour and update the stale documentation in the same PR.


## Delivery-Resilient AI Work

Long AI sessions must assume that a tool call, response delivery, or conversation can end unexpectedly. Repository state must therefore be the recovery mechanism.

- Split broad implementation into **durable checkpoints** that can be understood and validated independently: for example server/API, domain registry, client UI, tests, documentation, and final CI/review.
- Commit each meaningful checkpoint before beginning the next risky or wide change. Do not accumulate a large multi-concern change only in chat/tool state.
- Prefer several small repository mutations over one very large orchestration call that rewrites many unrelated files at once.
- After every meaningful checkpoint, update the relevant workstream/restart document with the branch, HEAD SHA, what is complete, what is intentionally incomplete, and the exact next action.
- Open or update the implementation PR early. The PR body should explain architecture, invariants, checkpoints, validation, rollback, and cold-restart instructions while work is still in progress.
- Keep user-facing progress messages concise. Large logs, diffs, test output, and detailed implementation state belong in the repository/PR rather than one giant chat response.
- Before a potentially long validation/review phase, ensure the latest implementation is already committed and restart documentation is current.
- If message delivery or a tool call times out, **do not reconstruct from memory or blindly repeat mutations**. First inspect the branch HEAD, PR, issue, and restart ledger; determine what actually persisted; continue from that verified state.
- If a batch fails before writing, explicitly verify that the branch HEAD is unchanged before retrying in a smaller batch.
- A cold AI should be able to resume from GitHub without needing prior chat history. If it cannot, documentation/checkpointing is incomplete.

See `docs/REPOSITORY-OPERATIONS.md#delivery-resilience-for-ai-assisted-work` for the full operating playbook.

## Long-running Classroom Program

The Standalone / Student / Instructor program is tracked by #288. Any work touching experience roles, classes, classroom workspaces, instructor observation, coaching, or protected Case Studies must read `docs/classroom-architecture.md`, `docs/classroom-roadmap.md`, and `docs/classroom-workstream.md` before editing. Class/API authorization work must additionally read `docs/classroom-api.md` and `api/AGENTS.md`.

Classroom invariants:

- experience role (`standalone | student | instructor`) is independent from intake mode and template kind;
- experience/class/session state never enters `kt-intake-full-v2`, exported Intake files, summaries, or curated Intake payloads;
- Standalone remains backend-optional;
- Student/team editing reuses the existing collaboration snapshot/revision/presence engine;
- Instructor observation is read-only with respect to student Intake snapshots;
- coaching uses separate persistence/revision semantics;
- student credentials never provide class/workspace enumeration;
- Case Study unlock passwords are pedagogy, not authentication;
- protected Case Study metadata/payloads are server-gated, absent from public browser/static assets, and authored `templates/*.json` remains excluded from Vercel deployment; `src/templates.manifest.js` is Standard-only and browser code must never import `api/protected-case-studies.manifest.js`.
- public Vercel static output comes only from generated `dist/`; never set `outputDirectory` back to `.` or otherwise expose repository docs/tests/scripts/AGENTS/authoring files. `scripts/build-vercel-public.mjs` owns the allowlisted browser bundle and is part of the canonical quality gate.

Every classroom PR must update `docs/classroom-workstream.md` before handoff with its issue, PR/base dependency, current HEAD, completed/incomplete work, validation, risks, and exact next action. For stacked PRs, state the merge order and never describe an unmerged dependent PR as independently mergeable.

## UI/UX Principles
- **Apple-like spacing:** Use generous whitespace, especially around sections, cards, and form controls. Maintain consistent padding and margins (e.g., multiples of 8px) to create a calm, breathable layout.
- **Typography hierarchy:** Favor clean sans-serif fonts with clear size steps. Headings should scale down gradually, and body text should remain highly legible. Use weight, size, and color to signal hierarchy while keeping the palette minimal.
- **Progressive disclosure:** Reveal information and advanced inputs gradually. Present primary actions and essential fields first, and defer complex or optional inputs to expandable sections or secondary cards.
- **Accessible contrast and feedback:** Ensure sufficient color contrast, provide clear focus states, and pair iconography with text labels so interactions remain inclusive.

## Modular JavaScript Architecture
- All runtime logic is organised into ES modules inside `src/`. Each module owns its DOM queries, event listeners, and state helpers for a single feature area (preface, KT table, comms, steps, etc.).
- `main.js` is the orchestration entry point. It should only import modules, run `boot()`, and wire shared events. Do not place feature-specific code directly in `main.js` unless you are connecting a brand-new module.
- When introducing new behaviour, create a module in `src/` and export only what is required. Import that module in `main.js` (or a sibling module) to keep responsibilities isolated.
- Reuse exports from existing modules instead of duplicating functionality. For shared config, extend `src/constants.js` so enums remain centralised and deep-frozen.
- Preserve the localStorage contract: all state persists under the key `kt-intake-full-v2`. Use the helpers from `src/storage.js` and `src/appState.js` (`collectAppState`, `applyAppState`, `getSummaryState`).
- Example pattern for AI agents and tests:
  ```js
  import { collectAppState, applyAppState } from './src/appState.js';
  import { generateSummary } from './src/summary.js';

  const before = collectAppState();
  // ...simulate changes...
  generateSummary('summary', 'prompt preamble');
  applyAppState(before);
  ```
- Keep modules free from cross-feature DOM edits. If two features must collaborate, share callbacks or data through `appState`, not ad-hoc selectors.

## Styling
- All shared CSS rules live in `styles.css`. Add layout variables, component rules, and responsive tweaks there while keeping the `[styles]` anchor comment in `index.html` intact.
- Reuse the defined CSS variables (the `[vars]` block) and existing component classes before introducing new ones to uphold the Apple-like visual rhythm described above.

## Editing Contract & Protected Elements
- **Anchors & tokens:** `index.html` is segmented by anchors such as `[styles]`, `[rows]`, `[script:init]`, and `[script:storage]`. Keep every anchor marker intact and insert changes inside the appropriate region. Never rename or delete tokens including `{OBJECT}` and `{DEVIATION}`.
- **Protected data:** `ROWS`, `STEP_DEFINITIONS`, and the other immutable collections in `src/constants.js` underpin the entire workflow. Extend them thoughtfully and document any changes in a scoped `AGENTS.md`.
- **Function invariants:** Core lifecycle helpers—`boot()`, `configureKT()`, `initTable()`, `initStepsFeature()`, `generateSummary()`, and `buildSummaryText()`—must retain their names and responsibilities. Extend behaviour via internal helpers rather than renaming or removing these entry points.

## Feature & Summary Extensions
- **UI additions:** Pair any new inputs with descriptive labels, helper text, and sensible storage keys. Follow the spacing guidance above and prefer semantic HTML elements.
- **File transfer workflow:** The header’s Save/Load buttons use `src/fileTransfer.js` to bridge `collectAppState()` and `applyAppState()`. Keep toast messaging friendly, reuse the helper module for new entry points, and document any behavioural changes in README.md.
- **Persistence:** When storing new data, extend the existing collectors in `src/appState.js` and `src/storage.js`. Document schema changes in module-level comments or scoped `AGENTS.md` files, and rerun `npm run update:storage-docs` so `docs/storage-schema.md` stays accurate.
- **Summary output:** Update `buildSummaryText()` and helper formatters (e.g., `formatPossibleCausesSummary()`) when introducing new captured data. Match the tone, ordering, and bullet structure already used.

## Self-documenting code & anchors
- **Module docblocks:** Every module (any `.js` file under `src/`, `components/`, or other runtime directories) must begin with a descriptive docblock explaining its purpose, primary exports, and the anchors it manages. Keep the summary up to date as responsibilities change.
- **Function documentation:** All exported functions and class methods require JSDoc comments with a one-line summary, parameter annotations, and return details. Internal helpers that mutate shared state or storage must also include summaries so future contributors can trace behaviour quickly.
- **Anchor format:** When introducing new structural anchors or feature toggles, use HTML comments in the form `<!-- [feature:your-anchor] start -->` / `<!-- [feature:your-anchor] end -->`. Preserve existing anchor tokens, and document every anchor you add in `docs/commenting-guide.md`.
- **Change checklist:** Before merging a change that adds files, modules, anchors, or storage keys, run through the checklist in `docs/commenting-guide.md`. Confirm that affected README sections and any scoped `AGENTS.md` documents are refreshed with the new anchors, links, or schema notes. Treat README/AGENTS updates as required work, not optional polish.
- **Reference guide:** Follow the detailed patterns and examples in [`docs/commenting-guide.md`](docs/commenting-guide.md) whenever you add documentation, anchors, or persisted keys. Update that guide alongside behaviour changes so it remains authoritative.

## Testing expectations
- Every feature pull request must add or update automated tests that cover the behaviours it introduces or changes.
- Consult [`docs/testing-guidelines.md`](docs/testing-guidelines.md) for instructions on when to write unit tests versus DOM integration tests, how to use `collectAppState()` / `applyAppState()` in new suites, and the required naming/location conventions under `tests/`.
- Start new coverage from the reusable template in `tests/template.feature.test.mjs` to keep imports, teardown patterns, and file names consistent.
- Whenever `package.json` dependencies change, run a successful `npm install` against the normal npm registry, commit the fully generated lockfile, then run `npm run verify:lockfile` and `npm ci`. Never edit only the root dependency block in `package-lock.json`.

## Using Sub-Guidelines
- Specialized editing rules for `index.html` live in `index.AGENTS.md`. Review that file before modifying the intake page.
- If you introduce new modules or directories, include a scoped `AGENTS.md` that clarifies local conventions and how they interact with the global contract above. State the intent and scope at the top of each document so future contributors understand its coverage.
