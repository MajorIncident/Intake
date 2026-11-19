# Red Sweat Mystery #349 historical handoff (2026-11-19)

Copied from the prior live `STATUS.md` checkpoint when PR #349 was open. This is historical; verify current GitHub state for merges and production.

## Red Sweat Mystery official KT answer correction (PR #349)

- PR #346 (starter case) and PR #347 (worked content/full MIM fields) are **merged**, with production READY at `60ad2e3`. User review identified a content error: #347 overfilled case fields with fictional modern incident-management actions and repetitive HISTORICAL/ILLUSTRATIVE qualifications instead of prioritizing the official KT solution. The Impact answers also confused incident impact/timeframe with PA symptoms and onset.
- Active PR #349 / branch `fix/red-sweat-official-kt-solution-impact-20261119` corrects `templates/red-sweat-mystery.json`: official Problem Statement "Flight Attendants have red sweat."; factual starter evidence, WHERE over-water life-vest distinction, January life-vest Change, testable Possible Causes, and the official confirmed red-ink-flaking True Cause with reports stopping after the vests were removed. Dated experimental air-filter rollout is rejected because it followed the deviation.
- Impact is correctly allocated: **now** = affected flight attendants and currently reported functional impact (no unsupported inability); **future** = recurrence risk on subsequent flights; **time** = next affected flight / no specified resolution deadline. The within-30-minutes-after-takeoff fact remains PA WHEN.
- Removed four proposed invented action records, fabricated DA/PPA decision/risk content, 27 unchecked operational steps, long debrief disclaimers and redundant risk/handover prose. Kept one reported corrective action, Full-answer confirmation, source-based KT notes, empty inapplicable MIM fields and the full persisted-source shape. General/Major Incident display and Classroom stage release are unchanged.
- Generator manifests and regression/feature tests updated. Source policy in `templates/AGENTS.md` and README now prioritizes official case solutions first and KT reasoning second. Follow-up issue #348 remains open for the other Case Studies.
- Required checks: GitHub CI `npm run quality`, `npm run test:browser`, template-manifest check and security scans on **PR #349 exact head**. Manual browser apply/smoke in General and Major Incident has not been performed. Merge/deploy only after review and green gates; then verify Vercel production READY SHA.
- Existing standalone self-study publication remains public; no change to access/distribution policy.

