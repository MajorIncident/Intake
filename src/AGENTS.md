# Runtime module guidelines

## Scope
This file applies to ES modules under `src/`.

Keep feature modules independently initialisable, own only their feature-specific DOM, and communicate mode changes through the existing `intake:mode-changed` event. Presentational features must not extend the persisted intake schema unless their state is genuinely user-authored.

`collaboration.js` owns the `[feature:collaboration]` menu, `[feature:collaboration-presence]` strip/dialog, recovery key, and local-only collaboration profile. It synchronizes only complete `collectAppState()` snapshots through revision-controlled workspace requests; team metadata and presence must remain on their separate API path and must never enter the intake snapshot. Never log workspace tokens, participant identities, presence lists, or snapshot content.


## Classroom coaching modules

`coachableFields.js` owns stable coaching target identity and deterministic field fingerprints. Persistence identity must remain domain-based (`problem.one-line`, `kt.where-location`, etc.); DOM IDs and KT row bindings are rendering hooks only. Do not add ephemeral Possible Cause identifiers to the durable registry without first defining stable lifecycle identity.

`classroomCoaching.js` owns Instructor coaching controls and Student read-only feedback presentation. Coaching is presentation plus a separate Classroom API channel: never add it to `collectAppState()`, `kt-intake-full-v2`, summaries, templates, or collaboration snapshot revisions. Student mode may only read feedback; Instructor controls must remain interactive while the observed Student Intake remains read-only.


## Protected Classroom resources

`classroomExerciseInstructor.js` owns the Instructor staged-exercise console client. It receives the Instructor capability only through the class lifecycle, keeps that credential and exercise payload in memory, and reads `/api/classes/exercise`. Exercise state, staged definitions, and capabilities must never enter Intake persistence, summaries, exports, URLs, or public manifests. Tranche 6 lifecycle mutations must remain optimistic-revision protected.

`classroomCaseStudies.js` owns the authorized in-memory protected Case Study catalog/payload client. It receives active capabilities only through Student/Instructor lifecycle callbacks, keeps no localStorage/sessionStorage record, and clears catalog/context when the class role disconnects. Its public state must never expose a bearer capability.

`templatesDrawer.js` may combine public Standard Template metadata with the current authorized in-memory Case Study catalog, but must fetch a protected payload only on demand and project it through `projectTemplateState()`. Standalone must work with no protected provider or classroom backend.

Browser modules must never import `api/protected-case-studies.manifest.js` or refer to protected Case Study IDs/names. `npm run verify:protected-cases` enforces this boundary. The rotating Case Study password remains instructional UX, not authentication.
