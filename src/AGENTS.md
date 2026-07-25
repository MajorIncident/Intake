# Runtime module guidelines

## Scope
This file applies to ES modules under `src/`.

Keep feature modules independently initialisable, own only their feature-specific DOM, and communicate mode changes through the existing `intake:mode-changed` event. Presentational features must not extend the persisted intake schema unless their state is genuinely user-authored.

`collaboration.js` owns the `[feature:collaboration]` menu and recovery key. It synchronizes only complete `collectAppState()` snapshots and must never log workspace tokens or snapshot content.
