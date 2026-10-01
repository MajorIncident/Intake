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

For same-device Instructor resume, the browser retains the Instructor class capability under `kt-classroom-instructor-session-v1` together with public class metadata and the last selected public workspace ID. This credential may list and observe only its represented class through the Instructor classroom API. It must never enter Intake state, exports, summaries, templates, URLs, analytics, logs, error telemetry, or `collaboration_workspace_capabilities`.

A Student join capability alone must never enumerate class workspaces. Cross-class join/assignment combinations must fail without revealing which credential was valid. Instructor workspace listing is scoped to the represented class.

`collaboration_workspace_capabilities` is an editable-alias path. Only explicitly allowed edit kinds may resolve through the existing collaboration PUT/PATCH handlers. Instructor observation therefore uses the separate GET-only `/api/classes/observe` authorization path and the Instructor class capability is never inserted as a workspace alias. Moving Instructor observation into the editable alias table would be a privilege escalation. See `docs/classroom-api.md`.

Coaching authorization follows the same separation. Instructor GET/PUT/DELETE `/api/classes/coaching` is class-scoped by the Instructor capability and writes only `classroom_coaching_feedback`; it must never call the Student snapshot update path or increment a Student Intake revision. Student `GET /api/classes/coaching/student` resolves exactly one membership from the issued Student workspace capability, accepts no workspace selector, and has no write method. Coaching notes may contain instructional context about incident work and must not be logged or copied into analytics/error telemetry. Field fingerprints are change-detection evidence only, not credentials.

Protected Case Study delivery is a separate server boundary. The public browser manifest may contain **Standard Templates only**. Case Study metadata and payloads live in the server-only `api/protected-case-studies.manifest.js` and must never be imported by `main.js`, `src/`, `components/`, or any other browser runtime module. Instructor `GET/POST /api/classes/case-studies` is scoped by the active Instructor class capability. Student `GET/POST /api/classes/case-studies/student` resolves active classroom membership from the issued Student workspace capability; legacy Standalone collaboration capabilities do not authorize it.

Protected Case Study catalog responses contain metadata only; payloads are selected in authenticated POST bodies, not query strings. All protected Case Study responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The rotating mode password remains a pedagogical progression control and is **not** an authentication boundary.

Authored JSON under `templates/*.json` is build-time source and is excluded from Vercel uploads with `.vercelignore`. Production must use committed generated manifests and run `npm run verify:protected-cases`; do not change the Vercel build back to a command that needs excluded authoring JSON. The verifier must remain in the canonical quality gate and must prove protected IDs/names are absent from public browser runtime assets.

Public static delivery is also an explicit allowlist boundary. `scripts/build-vercel-public.mjs` emits only browser runtime files plus the intentionally public `docs/eula.md` to `dist/`, and Vercel must keep `outputDirectory: "dist"`. Never return static output to the repository root: production previously exposed internal Markdown and build scripts when `outputDirectory` was `.`. Other `docs/`, `tests/`, `scripts/`, AGENTS files, authoring material, and repository metadata must not be public assets.

After an authorized Student applies a Case Study, its selected-mode content becomes that Student/team Intake and follows normal Intake/collaboration persistence. That is expected authorized use; the protected-delivery boundary prevents unauthenticated or Standalone retrieval of the original protected resource.

## Supported code

Security fixes target the current `main` branch. Dependency Review, CodeQL, Dependabot, repository quality checks, and GitHub branch rules are intended to prevent known regressions from entering `main`.
