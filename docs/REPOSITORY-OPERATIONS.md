# Repository Operations

This document describes the operating model around the KT Intake repository. It complements the product architecture docs: it is about keeping the repository safe, understandable, and recoverable over time.

## Canonical runtime

Node.js is declared once in `.nvmrc` and mirrored in `package.json#engines`. GitHub Actions reads `.nvmrc`. Vercel honors `package.json#engines`, which overrides the Node version selected in Vercel project settings, so repository code remains the deploy-time source of truth.

After changing the runtime, update `.nvmrc` and `package.json#engines` together and run `npm run quality`. The Vercel dashboard setting should also be aligned when practical so its UI does not advertise an obsolete default.

## Canonical quality gate

`npm run quality` is the single local and CI definition of repository health. It includes:

- lockfile consistency;
- repository contract checks (`repo:doctor`);
- changed-runtime test coverage guard for `src/`, `components/`, and server `api/` code;
- summary integration guard;
- persistence integration guard;
- ESLint/JSDoc;
- generated public/server template-manifest freshness;
- protected Case Study browser/deployment boundary verification;
- generated storage-documentation freshness;
- the full Node/jsdom test suite.

Individual commands remain useful while developing, but a PR is not complete until the aggregate gate passes.

## Protected Case Study deployment boundary

Case Study authoring source is intentionally present in Git but intentionally absent from the public Vercel deployment surface.

- `templates/*.json` is repository/build-time source and is excluded by `.vercelignore`.
- `src/templates.manifest.js` is public and may contain Standard Templates only.
- `api/protected-case-studies.manifest.js` is server-only generated content and may contain protected Case Study metadata/payloads.
- Browser runtime files must never import or duplicate the server-only manifest.
- Production Vercel builds run `npm run verify:protected-cases` rather than regenerating manifests, because the authored JSON files are intentionally excluded from the upload.
- GitHub CI/local authoring remains responsible for `npm run build:templates` / `npm run check:templates` freshness.

Any change to `vercel.json`, `.vercelignore`, template generation, static output layout, or protected-resource routing must re-run `npm run verify:protected-cases` and include a deployed HTTP check that raw `/templates/*.json` Case Study paths are not served.


### Vercel Git deployment policy

Repository configuration deliberately separates ordinary development branches from intentional deployment verification:

- `main` is allowed to deploy automatically to Vercel;
- `verify/**` branches are allowed to create deliberate preview deployments for security/E2E verification;
- all other Git branches are denied Vercel Git deployment by default.

This is enforced in `vercel.json` with minimatch-based `git.deploymentEnabled` rules. The default deny is important for AI-assisted work: small checkpoint commits must continue to trigger GitHub quality/security checks **without** consuming Vercel build capacity.

Do not replace this with the older project-level Ignored Build Step as the primary feature-branch control. Ignored builds still created canceled deployment records during the Classroom program and contributed to build-rate exhaustion tracked in #304.

When a preview is genuinely needed, create a short-lived `verify/**` branch from the exact PR head. Do not add a temporary allow rule to a normal `feature/**` branch.

## GitHub branch controls

The intended `main` policy is:

- changes arrive through pull requests;
- required checks must pass before merge;
- conversations are resolved;
- force pushes and deletion of `main` are blocked;
- merged head branches are deleted automatically;
- squash merge is the normal merge strategy;
- auto-merge may be used after review because rules still gate the merge.

Repository administrators must configure these settings in GitHub because workflow files cannot protect their own branch.

## Dependency maintenance

Dependabot is configured for npm and GitHub Actions. Action references in workflows are pinned to immutable full commit SHAs; comments record the human-readable release associated with each SHA.

Dependency Review blocks newly introduced high or critical dependency vulnerabilities on pull requests. CodeQL provides source scanning and also runs on a weekly schedule.

## AI cold restart

A new AI coding session should not assume prior conversational state. Before editing:

1. Identify the repository and current default branch.
2. Inspect current `main` HEAD, working branch, open PRs/issues relevant to the task, and recent commits.
3. Read root `AGENTS.md`, then scoped `AGENTS.md` files for the paths to be changed.
4. Read this document plus `docs/AI-ONBOARDING.md` for architecture-crossing work.
5. Run or inspect the latest `npm run quality` result.
6. State the invariants affected before making a broad change.
7. Work on a short-lived branch and PR; never assume a stale branch is still appropriate.

At handoff, record what changed, what was tested, any manual checks still required, and any environment/settings changes that cannot live in Git.

For protected Case Study work, the handoff must also record whether the final deployed preview was checked for:
- blocked/unavailable raw `/templates/*.json` authoring files;
- Standalone absence of protected resources;
- authorized Student/Instructor catalog access;
- unauthorized protected API rejection.


## Delivery resilience for AI-assisted work

Chat delivery, connector calls, or long-running conversations can fail even when repository writes have already succeeded. Treat that as a normal failure mode and design the workflow so no important state depends on one response reaching the user.

### Checkpoint-first execution

For substantial tasks, use a sequence such as:

1. **Refresh and plan** — verify `main`, branch, PR, issue, dependencies, and invariants.
2. **Create the branch/PR early** — make GitHub the durable work surface before the implementation becomes large.
3. **Implement one architectural concern** — e.g. schema/API, domain registry, client integration, UI, or tests.
4. **Commit the checkpoint** — the commit should be coherent enough that a cold session can inspect it in isolation.
5. **Update the restart ledger** — record HEAD SHA, completed work, incomplete work, validation state, risks, and exact next action.
6. **Validate that checkpoint** — inspect CI or focused tests before layering another risky concern.
7. Repeat until the feature is complete, then do the final docs/security/diff review and merge.

Do not make "one big final message" the first place where the true architecture or progress is written down.

### Recommended split boundaries

Split work whenever a batch crosses a meaningful boundary, especially:

- schema/API authorization vs client UI;
- pure domain/registry logic vs DOM integration;
- implementation vs regression tests;
- behavior vs documentation/security contracts;
- implementation checkpoints vs final CI/log review;
- unrelated fixes discovered while working.

A single batch may touch several files when they form one coherent concern. Avoid giant tool scripts that combine unrelated code, tests, docs, metadata, and PR administration in one operation.

### Chat/message-size discipline

- Send short progress updates after durable checkpoints rather than holding all results until the end.
- Summarize results; do not paste full CI logs or large diffs into chat unless specifically needed.
- Store detailed evidence in commits, PR descriptions, issues, and workstream documents.
- When a response could become large, split it into named parts and finish each part with a durable repository checkpoint.
- Prefer "Part 1 committed at <SHA>; next is Part 2" over a long narrative describing uncommitted work.

### Timeout/recovery protocol

If delivery or execution times out:

1. Inspect the current branch HEAD and compare it with the last documented SHA.
2. Inspect the active PR and issue before creating another branch/PR or repeating work.
3. Read the restart/workstream document and the last few commits.
4. Determine whether the failed operation:
   - wrote nothing;
   - partially wrote repository state;
   - fully wrote repository state but only the user-visible message failed.
5. Resume only the missing portion.
6. If the failure came from an oversized mutation/orchestration call, split the retry into smaller independent commits.
7. Update the restart ledger immediately after recovery so the next interruption is cheaper.

Never assume a timeout means "nothing happened."

### Long-conversation protection

For programs likely to span many turns:

- the parent issue owns the program scope and child issue sequence;
- the PR owns the implementation record for the active slice;
- a workstream/restart document owns the live continuation point;
- architecture/API/security docs own durable decisions;
- commits own completed checkpoints;
- chat is only a control surface, never the source of truth.

This structure protects against both message-delivery failures and maximum-conversation-length limits.

### Long-running workstreams and stacked PRs

For multi-PR programs, repository state must carry the plan and progress rather than chat history. The Classroom Experience program (#288) is the reference implementation:

- architecture and invariants live in `docs/classroom-architecture.md`;
- server capability/API contracts live in `docs/classroom-api.md`;
- dependency/merge sequencing lives in `docs/classroom-roadmap.md`;
- live progress and the exact restart point live in `docs/classroom-workstream.md`;
- the parent issue links the child implementation issues.

When stacking PRs, each PR must name its exact base branch/PR, dependency, merge order, rollback boundary, and cold-restart next action. Before handoff, update the workstream document so a new session can continue without reconstructing prior conversation context.

## Scheduled maintenance

At least monthly, or after a period of heavy AI-assisted development:

- review open Dependabot PRs;
- close obsolete PRs;
- prune merged branches;
- review failing or disabled Actions;
- confirm Node/Vercel/runtime alignment;
- review security alerts;
- sample documentation for contradictions with current code;
- verify the main ruleset still names the checks actually emitted by CI.

Prefer deterministic scripts and GitHub-native enforcement over autonomous bots that rewrite code without review.
