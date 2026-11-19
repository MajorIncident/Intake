# Merge, deploy, and verify

## Merge

1. `npm run quality` and `npm run test:browser` green locally; required CI checks green on the exact PR head.
2. Branch up to date with `main` (repository rules require it).
3. Squash merge. Record the merge SHA in `STATUS.md`.

## Deploy

- `main` deploys to Vercel production automatically. Ordinary branches never deploy (`vercel.json` `git.deploymentEnabled`).
- For a deliberate preview, push the exact PR head to a short-lived `verify/<name>` branch.
- The Vercel build runs `verify:vercel-functions`, `verify:protected-cases`, and `build:vercel-public`; it does not regenerate manifests.
- A change is **published** only when the exact merged SHA shows **READY** in Vercel and the runtime log scan is clean.

## Production environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`) | Yes for collaboration/Classroom | Neon connection, server-only |
| `INTAKE_ADMIN_TOKEN` | Yes for Admin / Instructor recovery | 43-char base64url, 256-bit |
| `INTAKE_CLASS_CREATION_PASSWORD` | Optional | Overrides the default class-creation password |
| `CLASS_EXPIRY_DAYS`, `WORKSPACE_EXPIRY_DAYS` | Optional | Retention (default 30) |

Generate an admin token with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Real-class smoke test (before a pilot, after any Classroom deploy)

Use the production URL, one Instructor device and at least two Student devices (phones count).

1. Instructor: **Run a class** → class password → title → join code shown.
2. Two Students: **Join a class** with code + name → both appear in Waiting.
3. Instructor: create Team A and Team B; assign one Student to each.
4. Each Student edits; the Instructor observes each team read-only and sees the edits.
5. Instructor leaves Needs-improvement coaching on one field; the Student sees it.
6. Move a Student A → B: they land on Team B's work, not their own.
7. Unassign: the Student returns to Waiting.
8. Reload every device: each resumes from its **Continue** card.
9. Admin: open Administration / Maintenance with the admin token and confirm the class is listed.

Record the result (pass/fail per step, devices, date) in `STATUS.md`.
