# Runtime module guidelines

## Scope
This file applies to ES modules under `src/`.

Keep feature modules independently initialisable, own only their feature-specific DOM, and communicate mode changes through the existing `intake:mode-changed` event. Presentational features must not extend the persisted intake schema unless their state is genuinely user-authored.

`collaboration.js` owns the `[feature:collaboration]` menu, `[feature:collaboration-presence]` strip/dialog, recovery key, and local-only collaboration profile. It synchronizes only complete `collectAppState()` snapshots through revision-controlled workspace requests; team metadata and presence must remain on their separate API path and must never enter the intake snapshot. Never log workspace tokens, participant identities, presence lists, or snapshot content.


## Classroom coaching modules

`coachableFields.js` owns stable coaching target identity and deterministic field fingerprints. Persistence identity must remain domain-based (`problem.one-line`, `kt.where-location`, etc.); DOM IDs and KT row bindings are rendering hooks only. Do not add ephemeral Possible Cause identifiers to the durable registry without first defining stable lifecycle identity.

`classroomCoaching.js` owns Instructor coaching controls and Student read-only feedback presentation. Coaching is presentation plus a separate Classroom API channel: never add it to `collectAppState()`, `kt-intake-full-v2`, summaries, templates, or collaboration snapshot revisions. Student mode may only read feedback; Instructor controls must remain interactive while the observed Student Intake remains read-only.
