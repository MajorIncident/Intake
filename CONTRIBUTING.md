# Contributing to KT Intake

This repository is optimized for small, reviewable pull requests from both humans and AI coding agents.

## Start clean

1. Fetch and prune remote branches.
2. Start from the current `main`.
3. Read the root `AGENTS.md` plus any scoped `AGENTS.md` that governs files you will touch.
4. Read `docs/AI-ONBOARDING.md` and `docs/REPOSITORY-OPERATIONS.md` when the work crosses architecture, persistence, API, CI, deployment, or security boundaries.
5. Run `npm ci` and `npm run quality` before assuming the repository is healthy.

Never rely on a previous chat session's branch, PR, deployment, or runtime state.

## Branch and pull request workflow

- Do not commit directly to `main`.
- Use a short-lived branch named for the change.
- Keep one logical change per PR.
- Use the PR template completely.
- Prefer squash merging so one PR becomes one coherent history entry.
- Delete merged branches.

## Definition of done

A change is ready for review only when:

- `npm run quality` passes.
- User-visible behaviour is covered by automated tests where practical.
- Persistence and summary contracts are updated when affected.
- Generated artifacts and storage docs are current.
- Relevant README, architecture, operations, and scoped `AGENTS.md` documentation reflect the new reality.
- Security/privacy implications are explicitly considered for API or collaboration changes.
- Manual browser/server checks are documented when automated tests cannot prove the behaviour.

## Repository invariants

The root and scoped `AGENTS.md` files are authoritative for code-editing constraints. If implementation and documentation disagree, fix the documentation in the same PR rather than teaching future contributors an obsolete architecture.

## Dependencies

Do not hand-edit dependency resolutions. Update `package.json` through normal npm tooling, commit the generated lockfile, and run `npm run verify:lockfile` plus `npm ci`.

Dependabot maintains npm and GitHub Actions updates. Security updates should remain small and isolated from feature work.
