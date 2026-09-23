# Runtime module guidelines

## Scope
This file applies to ES modules under `src/`.

Keep feature modules independently initialisable, own only their feature-specific DOM, and communicate mode changes through the existing `intake:mode-changed` event. Presentational features must not extend the persisted intake schema unless their state is genuinely user-authored.

`collaboration.js` owns the `[feature:collaboration]` menu, `[feature:collaboration-presence]` strip/dialog, recovery key, and local-only collaboration profile. It synchronizes only complete `collectAppState()` snapshots through revision-controlled workspace requests; team metadata and presence must remain on their separate API path and must never enter the intake snapshot. Never log workspace tokens, participant identities, presence lists, or snapshot content.
