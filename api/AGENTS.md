# Collaboration API guidelines

## Scope
These rules apply to server-only modules below `api/`.

- Never return or log database connection values, workspace tokens, or snapshots.
- Keep route files thin and inject repositories into handlers for tests.
- Schema changes must remain idempotent and be documented in the README.
