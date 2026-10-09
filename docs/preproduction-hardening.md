# Pre-production Hardening and Lifecycle Plan

This document is the canonical architecture/roadmap contract for the pre-production simplification work tracked by #328, #329, and #330.

## Why this exists

Intake has not yet reached public production use. The repository therefore does **not** need to carry compatibility indefinitely for classroom access paths, local resume envelopes, or save-file shapes that were created only during development.

The next product cycle should deliberately simplify the system before production case authoring resumes:

1. remove obsolete compatibility paths;
2. add an authenticated maintenance surface for server data lifecycle;
3. make startup/resume intent explicit and user-friendly;
4. only then resume protected rich-case delivery (#316) and first production staged-case authoring (#317).

This is a breaking pre-production cleanup. Current behavior remains authoritative until the corresponding implementation issue is merged; this document describes the intended end state.

## Target ordering

```text
PRE-PRODUCTION HARDENING
#328  remove legacy access + obsolete save compatibility
   |
  #329  Admin / Maintenance lifecycle inventory + cleanup
   |
  #330  startup experience hub + explicit resume choices
   |
PRODUCTION SIMULATION ENABLEMENT
#316  protected rich staged assets
   |
  #317  first production staged KT Case Study
```

#328–#330 are complete and published. #329 merged via PR #333 as `b04684f2432aa474cb84874aa26aa08a5f4c5ab7`; its canonical runtime contract is `docs/admin-maintenance.md`. #330 merged via PR #334 as `ad7b9835adf3fd5338658f29b634e18b13b2def5`; the exact merged `main` deployment reached Vercel production **READY**. The active next slice is #316.

## End-state access model

### Student

The only supported Classroom Student admission path is:

1. Student chooses **Join a class**;
2. Student supplies display name + the short human class code;
3. `POST /api/classes/admit` returns a high-entropy Student class-session capability;
4. the human code is discarded after admission;
5. the Student class-session capability can read only that participant's own assignment/session state;
6. when assigned, the Student exchanges it through `POST /api/classes/student/access` for a fresh assignment-specific editable workspace capability;
7. workspace edit authority is memory-only and is revoked/reissued on move or unassign.

There is no legacy class-capability + assignment-capability two-code UI or API path.

### Instructor

The normal Instructor lifecycle is:

- **Run a class** creates a class and returns Instructor authority;
- same-device resume retains that authority in the dedicated Instructor resume envelope;
- the normal product UI does **not** expose a reusable "Instructor access code" form for reopening arbitrary classes.

If an Instructor loses local resume authority, recovery is an explicit Administration/Maintenance function. The server may rotate/reissue current Instructor authority; it must never recover a historical raw bearer value from its hash.

### Standalone collaboration

Standalone/ad-hoc collaboration remains a current product feature, not a compatibility shim. It keeps its existing explicit shared-workspace capability model unless a future product decision changes it.

## Pre-production persistence policy

Before public launch, backward compatibility is not a product requirement.

#328 should inventory and remove compatibility-only migration code for superseded save/local formats, including classroom compatibility envelopes and obsolete Intake file migrations where current authored templates/tests can be regenerated safely.

The intended rule is:

- one canonical current Intake save-file schema/version;
- one canonical current experience-preference envelope;
- current Student and Instructor resume envelopes only;
- unsupported old files fail with a clear message instead of being silently migrated;
- current templates/fixtures are regenerated to the canonical shape;
- no credential/session data ever enters Intake save files.

Do not remove transformations that remain part of the **current** data model merely because their helper name says "normalize" or "legacy"; #328 must inventory each compatibility helper and prove it is obsolete before deletion.

## Administration / Maintenance architecture

**Implementation status:** complete and published in #329 / PR #333. The detailed implemented contract is `docs/admin-maintenance.md`; this section remains the roadmap-level summary.

Administration is a privileged maintenance surface, **not** a fourth Intake experience role.

### Entry

The startup hub may show an **Administration / Maintenance** secondary entry. Entering it requires a high-entropy server-configured credential.

The admin credential:

- is configured through deployment environment settings, never browser source;
- is sent only to admin endpoints over HTTPS;
- is never written to `kt-intake-full-v2`, exports, summaries, templates, URLs, logs, or telemetry;
- should be retained only for the current browser tab/session after explicit entry, not durable localStorage;
- authorizes maintenance only, not normal Instructor/Student workflows.

### Server boundary

Prefer one explicit admin server entrypoint/route family so the authorization boundary is easy to audit and the Vercel Serverless Function budget remains controlled.

Admin APIs must return private responses with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

### Inventory model

The Admin UI should show two independent inventories.

**Classrooms**
- public class ID/title;
- active / revoked / expired status;
- created, updated, and expiry timestamps;
- latest participant/presence activity;
- participant and workspace counts;
- staged exercise status where relevant;
- derived idle age.

**Collaboration workspaces**
- public workspace/session identity;
- class-owned vs Standalone/ad-hoc;
- created, updated, and expiry timestamps;
- latest presence/activity;
- participant count;
- derived idle age.

No inventory response exposes bearer capabilities.

### Idle classification

Server timestamps are authoritative. Idle classification should combine:
- object `updated_at`;
- most recent participant/presence `last_seen_at`;
- expiry/revocation state.

A recent active presence must prevent an item from being presented as safely purgeable merely because its snapshot is old.

`CLASS_EXPIRY_DAYS` remains a class creation/expiry policy. Admin cleanup is the deliberate physical purge mechanism.

### Cleanup model

Initial Admin cleanup is manual and preview-first.

Supported actions should include:
- revoke/close a class;
- preview deletion impact for one class/workspace;
- purge one expired/revoked class and class-owned subordinate data;
- bulk preview/purge classes older than a selected idle/expiry threshold;
- bulk preview/purge Standalone collaboration workspaces older than a selected idle/expiry threshold.

The server must calculate the preview and committed deletion from the same scoped criteria. Destructive operations should be transactional/fail-closed where practical and respect foreign-key ownership.

Do **not** add autonomous scheduled deletion in the first Admin slice. Prove the manual lifecycle first.

## Startup experience hub

**Implementation status:** complete in #330 / merged PR #334 as `ad7b9835adf3fd5338658f29b634e18b13b2def5`; production deployment verified **READY**.

Ordinary app launch should no longer silently resume a role solely because `kt-experience-role-v1` exists.

### Returning user

If valid resumable context exists, lead with **Continue where you left off**.

Possible cards:
- **Continue your saved Intake**
- **Rejoin <class title>** as the saved Student
- **Continue managing <class title>** as Instructor

Only show a resume card when the relevant local envelope is structurally valid enough to attempt. Server-backed resume must still be revalidated; failed/expired authority returns the user to the hub with a clear explanation.

If more than one resumable context exists, show separate choices rather than guessing.

### New intent

Below Continue, show clear new-session choices:

- **Work independently** — Standalone;
- **Join a class** — Student;
- **Run a class** — Instructor;
- **Administration / Maintenance** — secondary privileged entry after #329.

Use product language, not implementation terms such as token, capability, or role.

### Cached Intake detection

Define a deterministic **substantive saved Intake** predicate. An empty/default `kt-intake-full-v2` snapshot must not create a misleading Continue card.

Opening the startup hub never destroys local Intake work. Starting fresh or replacing substantive local work is explicit.

### Explicit-link behavior

A safe `#join=<human-code>` intent may preselect/highlight **Join a class** and prefill the code, but it still goes through normal admission.

An explicit Standalone `?workspace=` collaboration link remains explicit user intent. It must never be forwarded into Classroom share links or interpreted as Classroom authority.

## Security invariants that remain unchanged

- experience/navigation intent is separate from Intake mode and serialized Intake state;
- Standalone remains backend-optional;
- Student credentials never enumerate other class workspaces;
- Student class-session authority never edits collaboration directly;
- assignment-specific Student workspace authority is revocable and memory-only;
- Instructor observation is read-only with respect to Student snapshots;
- coaching remains a separate persistence/revision channel;
- protected Case Study material remains server-gated;
- future-stage and Instructor-only staged content remains server-withheld;
- credentials never enter Intake persistence, summaries, exports, templates, analytics, logs, or URLs;
- public Vercel output remains generated only from `dist/`.

## Validation expectations

Each implementation issue must update the existing Node/API/browser suites and the durable architecture docs.

At final acceptance:
- `npm run quality` passes;
- required browser regression passes;
- CodeQL / Dependency Review / Template Manifest Guard are green;
- Serverless Function budget remains within repository policy;
- mobile/keyboard/serious-critical axe coverage exists for new user-facing surfaces;
- legacy access/save contracts are absent from code, docs, fixtures, and tests after #328 rather than merely hidden.

## Cold restart

Before implementing any of #328–#330:

1. refresh `main`, issue/PR state, and open dependency work;
2. read root/scoped `AGENTS.md`;
3. read this file plus `docs/classroom-architecture.md`, `docs/classroom-api.md`, `docs/classroom-roadmap.md`, and `docs/classroom-workstream.md`;
4. treat #328 as the prerequisite unless repository state proves it is already merged;
5. keep work in small durable checkpoints and use the documented slow-gate handoff protocol.
