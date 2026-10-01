# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a vulnerability that could expose collaboration workspace capabilities, database access, private incident data, or another user's data.

Use GitHub's private vulnerability reporting feature when it is enabled for this repository. If private reporting is not available, contact the repository owner privately before publishing technical details.

## Sensitive values

Never commit, log, paste into issues, or include in test fixtures:

- database connection strings or credentials;
- raw collaboration workspace tokens or secret links;
- Instructor class capabilities, Student join capabilities, assignment capabilities, or classroom workspace capabilities;
- authorization headers;
- production incident snapshots containing confidential data;
- private participant identity data.

The collaboration capability model treats possession of the full secret link as read/write authorization. Classroom uses the same capability principle but separates privileges: Instructor class, Student join, assignment, and Student workspace capabilities are distinct secrets. Server code stores only token hashes and must not log raw capabilities or snapshots.

For same-device Student resume, the browser necessarily retains the one issued Student workspace capability under `kt-classroom-student-session-v1`. The Student join and assignment capabilities are never retained after successful admission. The resume envelope must never be copied into Intake state, exports, summaries, templates, URLs, analytics, logs, or error telemetry.

A Student join capability alone must never enumerate class workspaces. Cross-class join/assignment combinations must fail without revealing which credential was valid. Instructor workspace listing is scoped to the represented class.

`collaboration_workspace_capabilities` is an editable-alias path. Only explicitly allowed edit kinds may resolve through the existing collaboration PUT/PATCH handlers. Future read-only Instructor observer credentials must use a separate server authorization path; placing them in the editable alias table would be a privilege escalation. See `docs/classroom-api.md`.

## Supported code

Security fixes target the current `main` branch. Dependency Review, CodeQL, Dependabot, repository quality checks, and GitHub branch rules are intended to prevent known regressions from entering `main`.
