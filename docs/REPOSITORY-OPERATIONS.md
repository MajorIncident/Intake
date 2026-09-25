# Repository Operations

This document describes the operating model around the KT Intake repository. It complements the product architecture docs: it is about keeping the repository safe, understandable, and recoverable over time.

## Canonical runtime

Node.js is declared once in `.nvmrc` and mirrored in `package.json#engines`. GitHub Actions reads the same file. Vercel should be configured to the same major version.

After changing the runtime, update all three surfaces together and run `npm run quality`.

## Canonical quality gate

`npm run quality` is the single local and CI definition of repository health. It includes:

- lockfile consistency;
- repository contract checks (`repo:doctor`);
- changed-runtime test coverage guard;
- summary integration guard;
- persistence integration guard;
- ESLint/JSDoc;
- generated template-manifest freshness;
- generated storage-documentation freshness;
- the full Node/jsdom test suite.

Individual commands remain useful while developing, but a PR is not complete until the aggregate gate passes.

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
