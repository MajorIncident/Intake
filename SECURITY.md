# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a vulnerability that could expose collaboration workspace capabilities, database access, private incident data, or another user's data.

Use GitHub's private vulnerability reporting feature when it is enabled for this repository. If private reporting is not available, contact the repository owner privately before publishing technical details.

## Sensitive values

Never commit, log, paste into issues, or include in test fixtures:

- database connection strings or credentials;
- raw collaboration workspace tokens or secret links;
- authorization headers;
- production incident snapshots containing confidential data;
- private participant identity data.

The collaboration capability model treats possession of the full secret link as read/write authorization. Server code must store only token hashes and must not log tokens or snapshots.

## Supported code

Security fixes target the current `main` branch. Dependency Review, CodeQL, Dependabot, repository quality checks, and GitHub branch rules are intended to prevent known regressions from entering `main`.
