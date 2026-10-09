# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a vulnerability that could expose collaboration workspace capabilities, database access, private incident data, or another user's data.

Use GitHub's private vulnerability reporting feature when it is enabled for this repository. If private reporting is not available, contact the repository owner privately before publishing technical details.

## Sensitive values

Never commit, log, paste into issues, or include in test fixtures:

- database connection strings or credentials;
- raw collaboration workspace tokens or secret links;
- Instructor class capabilities, Student class-session capabilities, or assignment-specific classroom workspace capabilities;
- the `INTAKE_ADMIN_TOKEN` Administration / Maintenance credential;
- authorization headers;
- production incident snapshots containing confidential data;
- private participant identity data.

The collaboration capability model treats possession of the correct secret as authorization. Classroom separates privileges across Instructor class authority, human admission code, Student class session, and assignment-specific Student workspace authority. Server code stores only hashes for high-entropy bearer capabilities and must not log raw capabilities or snapshots.

Administration / Maintenance is a separate privileged boundary documented in `docs/admin-maintenance.md`. `INTAKE_ADMIN_TOKEN` is environment-only, is never an Intake or Classroom credential, and is accepted only in the `Authorization` header for `/api/admin`. The browser may retain a successfully verified Admin token only in tab-scoped `sessionStorage` under `kt-admin-session-v1`; it must never enter `localStorage`, Intake persistence, files, summaries, templates, URLs, logs, analytics, or telemetry. Admin inventory never returns raw capabilities or Intake snapshots. Physical purge requires a short-lived signed server preview; changed activity/state invalidates the preview before deletion. Classroom-owned workspaces cannot be purged independently of their owning class.


Same-device Student resume stores the high-entropy **Student class-session capability** under `kt-classroom-student-session-v1` together with public class/participant/current-assignment context. The human join code is discarded after admission. The current assignment-specific workspace capability is **memory-only** and must be reacquired after reload or reassignment; it must not be written into the live resume envelope or URL. #328 intentionally rejects older pre-production Student session-envelope formats. No Student resume envelope may enter Intake state, exports, summaries, templates, analytics, logs, or error telemetry.

Startup presentation does not change these capability rules. `src/startupExperienceHub.js` may read current local resume envelopes only to decide whether to show a Continue card and to display non-secret context such as class title, participant display name, or workspace label. It must never render, copy, log, place in a URL, or otherwise disclose Student/Instructor bearer values. `kt-experience-role-v1` is last-choice metadata only and is never authorization or automatic startup authority. A safe `#join=<human-code>` fragment may highlight normal Student admission but remains admission-only and cannot substitute for Student session/workspace authority.


For same-device Instructor resume, the browser retains the Instructor class capability under `kt-classroom-instructor-session-v1` together with public class metadata, the human Student join code, and the last selected public workspace ID. This credential may administer/list/observe only its represented class through Instructor classroom APIs. It must never enter Intake state, exports, summaries, templates, URLs, analytics, logs, error telemetry, or `collaboration_workspace_capabilities`.

The human Student join code and Student class-session capability must never enumerate class workspaces or edit collaboration. Student own-status returns only the represented participant's assignment. Reassignment/unassign must revoke old workspace authority before destination/current access is issued, and stale old-team tokens must fail rather than map to the new team. Cross-class assignments fail without revealing unrelated class state. Instructor roster/workspace listing is scoped to the represented class.

`collaboration_workspace_capabilities` is an editable-alias path. Only explicitly allowed edit kinds may resolve through the existing collaboration PUT/PATCH handlers. Instructor observation therefore uses the separate GET-only `/api/classes/observe` authorization path and the Instructor class capability is never inserted as a workspace alias. Moving Instructor observation into the editable alias table would be a privilege escalation. See `docs/classroom-api.md`.

Coaching authorization follows the same separation. Instructor GET/PUT/DELETE `/api/classes/coaching` is class-scoped by the Instructor capability and writes only `classroom_coaching_feedback`; it must never call the Student snapshot update path or increment a Student Intake revision. Student `GET /api/classes/coaching/student` resolves exactly one active live-participant assignment from the issued Student workspace capability, accepts no workspace selector, and has no write method. Coaching notes may contain instructional context about incident work and must not be logged or copied into analytics/error telemetry. Field fingerprints are change-detection evidence only, not credentials.

Protected Case Study delivery is a separate server boundary. The public browser manifest may contain **Standard Templates only**. Case Study metadata and payloads live in the server-only `api/protected-case-studies.manifest.js` and must never be imported by `main.js`, `src/`, `components/`, or any other browser runtime module. Instructor `GET/POST /api/classes/case-studies` is scoped by the active Instructor class capability. Student `GET/POST /api/classes/case-studies/student` resolves the active live-participant assignment from the issued Student workspace capability; Standalone collaboration capabilities do not authorize it.

Protected Case Study catalog responses contain metadata only; payloads are selected in authenticated POST bodies, not query strings. All protected Case Study responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The rotating mode password remains a pedagogical progression control and is **not** an authentication boundary.

For #313 staged simulation, Student progressive disclosure is server-side authorization, not UI hiding. A Student class-session may receive only the cumulative Student-safe release through the current exercise stage. Future-stage material, Instructor facilitation/model/exemplar material, and the complete protected Case Study source `state` must not be returned through the staged Student endpoint. If a class has a staged exercise record for a Case Study, Student full-payload retrieval for that case is blocked even after exercise completion unless a future explicit reveal contract is added.

Staged Student edit freeze is also server-enforced. When the represented class's current exercise has `student_editing_enabled=false`, an active `classroom-student` alias may still GET the collaboration workspace and maintain presence, but `PUT /api/workspaces/session` returns HTTP **423** with code `classroom-editing-locked`. The write must not mutate snapshot or revision. Production enforcement repeats the lock predicate atomically inside the workspace UPDATE to close check-then-write races. Standalone/primary collaboration tokens and classes with no current staged exercise are not subject to this Classroom lock.

Authored JSON under `templates/*.json` is build-time source and is excluded from Vercel uploads with `.vercelignore`. Production must use committed generated manifests and run `npm run verify:protected-cases`; do not change the Vercel build back to a command that needs excluded authoring JSON. The verifier must remain in the canonical quality gate and must prove protected IDs/names are absent from public browser runtime assets.

Public static delivery is also an explicit allowlist boundary. `scripts/build-vercel-public.mjs` emits only browser runtime files plus the intentionally public `docs/eula.md` to `dist/`, and Vercel must keep `outputDirectory: "dist"`. Never return static output to the repository root: production previously exposed internal Markdown and build scripts when `outputDirectory` was `.`. Other `docs/`, `tests/`, `scripts/`, AGENTS files, authoring material, and repository metadata must not be public assets.

After an authorized Student applies a Case Study, its selected-mode content becomes that Student/team Intake and follows normal Intake/collaboration persistence. That is expected authorized use; the protected-delivery boundary prevents unauthenticated or Standalone retrieval of the original protected resource.

## Supported code

Security fixes target the current `main` branch. Dependency Review, CodeQL, Dependabot, repository quality checks, and GitHub branch rules are intended to prevent known regressions from entering `main`.
