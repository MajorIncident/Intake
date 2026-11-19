# Playbooks

Playbooks are short, task-shaped checklists. They tell a human or AI contributor **what to read, what to change, and how to prove it** for a recurring kind of work, so nobody has to read every contract document before starting.

Contracts (the "why" and the invariants) stay in `docs/*.md`. Current status stays in [`STATUS.md`](../../STATUS.md). History stays in [`docs/archive/`](../archive/). Playbooks only point at those; they never restate status.

| I need to… | Playbook |
| --- | --- |
| Start a fresh session / resume after a timeout | [cold-start.md](cold-start.md) |
| Record progress or hand off | [status-update.md](status-update.md) |
| Change Student / Instructor / class / coaching / Case Study behaviour | [classroom-change.md](classroom-change.md) |
| Write an official KT case from KT Application Coach into Intake | [author-kt-case-study.md](author-kt-case-study.md) (see [field contract](../case-study-authoring.md)) |
| Add or change a server API route | [api-change.md](api-change.md) |
| Add a field that is saved with the Intake | [persisted-field.md](persisted-field.md) |
| Merge, deploy, or verify production | [release-and-verify.md](release-and-verify.md) |

## Adding a playbook

Write one when the same multi-step procedure has been explained twice. Keep it under ~120 lines, link to contracts instead of copying them, and add it to the table above.
