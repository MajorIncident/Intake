# Cold start / resume

Use this at the beginning of every new session, and after any timeout or failed tool delivery.

## 1. Establish real state (never trust memory)

```bash
git fetch origin && git log --oneline -5 origin/main
git status && git branch --show-current
```

Then check on GitHub: open PRs, the issue you are working on, and the latest CI result for your branch. A timeout can happen *after* a commit or merge succeeded — compare with the last SHA recorded in `STATUS.md` before repeating any write.

## 2. Read, in this order (stop when you have enough)

1. [`STATUS.md`](../../STATUS.md) — what is current, active, blocked, next.
2. Root [`AGENTS.md`](../../AGENTS.md) plus the scoped `AGENTS.md` for paths you will touch (`src/`, `api/`, `templates/`, `index.AGENTS.md`).
3. The playbook for your task type ([index](README.md)). It names the contract documents you actually need.

You do **not** need `docs/archive/` unless you are investigating why a past decision was made.

## 3. Prove the baseline

```bash
npm ci
npm run quality          # canonical repository gate
npm run test:browser     # required browser gate (Playwright + axe)
```

If the baseline is red before you change anything, record that in `STATUS.md` and fix or report it first.

## 4. Before writing code

- Name the invariants your change touches (the playbook lists the common ones).
- Plan durable checkpoints: one coherent concern per commit (server, client, tests, docs).
- Work on a short-lived branch; never commit to `main`.

## 5. While working

Follow [status-update.md](status-update.md) after each checkpoint. Keep chat messages short; detail belongs in commits, the PR body, and `STATUS.md`.
