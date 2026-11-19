# Recording progress and handing off

`STATUS.md` is the only place that says what is current. Update it:

- after each durable checkpoint (a pushed commit that is coherent on its own);
- before a long validation wait (CI, browser suite, deployment);
- at handoff or end of session;
- when an issue/PR is opened, merged, closed, or blocked.

## What to change

1. `_Last updated_` line: date, branch, base SHA.
2. **Current phase** / **Active work**: one or two sentences.
3. **Pilot blockers** or other ordered work list: mark done items as done (one line, with PR/SHA) rather than deleting the line in the same session.
4. **Open issues / Open pull requests** tables: match GitHub exactly.
5. **Pending human / environment actions**: anything an agent cannot do (dashboard settings, secrets, milestones).
6. **Known risks**.

Detailed evidence (test counts, CI run links, SHAs per tranche) goes in the PR body and commit messages. When a body of work finishes, move any long checkpoint narrative into `docs/archive/` **verbatim** — never delete history.

## Handoff block (paste into the PR body)

```text
Active issue:
Active PR:
Branch / base:
HEAD SHA:
Completed checkpoints:
Intentionally not implemented:
Validation passed:
Validation still running / required (exact command + expected result):
Manual / environment actions for a human:
Known risk:
Exact next action:
```

A manual-gate handoff is valid only when the HEAD is pushed, the pending check and its success condition are written down, and nothing further depends on assuming it passed.

## Guard

`npm run repo:doctor` fails if active-slice / pending-merge status phrases or an "Active branch:" header appear in any Markdown file other than `STATUS.md` or `docs/archive/**`. Contracts describe how things work; only this file says where things stand.
