# Administration / Maintenance lifecycle contract

Issue: #329  
Implementation PR: #333

## Purpose

Administration / Maintenance is a privileged server-data lifecycle utility for Intake maintainers.

It is **not** a fourth Intake experience role and does not modify the Standalone / Student / Instructor authorization model.

The surface exists to:

- inspect Classroom and collaboration records without direct database access;
- understand which records are active, expired, revoked, or idle;
- close a class immediately;
- reissue lost Instructor authority without restoring an old credential;
- preview exactly what a cleanup will remove;
- purge expired/revoked/stale Classroom data;
- purge stale independent Standalone/ad-hoc collaboration workspaces.

There is no autonomous scheduled deletion in #329.

## Admin authorization

The server reads one environment-only credential:

```text
INTAKE_ADMIN_TOKEN
```

Requirements:

- exactly one 256-bit URL-safe capability value (43 base64url characters);
- configured only in the deployment environment;
- never bundled in browser assets;
- never written to Intake state, files, summaries, templates, URLs, logs, analytics, or telemetry;
- browser retention is allowed only in `sessionStorage` after successful server verification, under `kt-admin-session-v1`;
- Sign out removes the tab-scoped envelope;
- closing the browser tab removes the browser session value.

The browser sends the key only in the HTTPS `Authorization: Bearer ...` header.

The server compares credential hashes using a constant-time comparison. Missing/malformed server configuration fails closed with HTTP 503. Missing/incorrect request authority receives HTTP 401.

All Admin responses use:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
```

## HTTP surface

#329 adds one deployable function:

```text
/api/admin
```

No additional Classroom function wrappers are created.

### GET /api/admin

Returns the complete maintenance inventory visible to the Admin credential.

It never returns:

- Instructor credentials/hashes;
- Student session credentials/hashes;
- collaboration primary capability/hash;
- assignment-specific workspace credentials/hashes;
- snapshots;
- protected Case Study payloads.

### POST /api/admin

Supported actions:

- `revoke-class`
- `rotate-instructor`
- `preview-purge`
- `commit-purge`

Unknown actions fail closed.

## Non-secret maintenance identities

`collaboration_workspaces` has a UUID `public_id` used only as a non-secret maintenance identity.

This UUID is **not authorization**. Normal collaboration clients continue to authorize using their existing high-entropy capability model.

Existing workspace rows are backfilled idempotently during workspace schema initialization.

## Inventory

### Classes

Each class inventory record includes:

- public class UUID and title;
- active / expired / revoked status;
- joins-enabled state;
- created, updated, expiry, revocation timestamps;
- derived last-activity timestamp and idle-day count;
- current participant/workspace counts;
- all stored presence-row count and recent-presence count;
- coaching, exercise, checkpoint, and release cleanup counts;
- public Classroom workspace IDs/labels/kinds;
- current non-completed staged exercise state when present.

Class last activity is derived server-side from the latest meaningful timestamp across:

- class updates;
- participant updates;
- Classroom workspace updates;
- underlying collaboration snapshot updates;
- participant presence / last-active timestamps;
- staged exercise updates;
- coaching updates.

### Collaboration workspaces

Each collaboration workspace inventory record includes:

- non-secret maintenance UUID;
- team name;
- active / expired status;
- created / updated / expiry timestamps;
- derived last activity and idle-day count;
- participant/presence counts;
- capability-row count;
- whether the workspace is Classroom-owned or independent;
- owning public class/workspace metadata when Classroom-owned.

Workspace last activity uses both snapshot update time and presence activity.

**Recent presence therefore prevents an old snapshot from being treated as idle.**

## Close / revoke class

Admin can close an active class by public class UUID.

Closing:

- sets the class revoked timestamp;
- disables Student joins;
- marks Classroom workspace mappings revoked;
- expires underlying class-owned collaboration workspaces immediately.

It does not physically delete rows. Physical deletion remains a separate preview-first purge.

## Instructor recovery

Admin can rotate/reissue Instructor authority for an active, non-expired, non-revoked class.

The server:

1. creates a fresh high-entropy Instructor capability;
2. stores only its SHA-256 hash;
3. invalidates the previous Instructor capability atomically with the row update;
4. returns the new raw capability once.

The browser displays the returned value in a one-time recovery panel and does **not** persist it.

The Admin credential can never recover a historical raw Instructor capability from its stored hash.

## Purge eligibility

### Classes

A class is eligible when:

- it is revoked; or
- it is expired; or
- a **bulk** purge threshold is selected and the derived last activity is older than the server-computed cutoff.

A single-class purge is intentionally limited to expired/revoked classes.

### Independent collaboration workspaces

An independent workspace is eligible when:

- it is expired; or
- its derived last activity is older than the selected cutoff.

Class-owned collaboration workspaces are never independently purged. They are removed only as part of their owning class purge.

## Preview-first destructive workflow

Purge is two-step.

### 1. Preview

The server computes the current eligible candidate set and returns:

- exact candidate objects visible to the maintainer;
- a short-lived signed preview token;
- preview expiry;
- cutoff/threshold metadata.

The signed token contains only non-secret public identifiers and fingerprints.

Preview lifetime: **10 minutes**.

At most 200 candidates are included in one purge plan. A truncated preview is clearly marked and commits only the exact displayed candidates.

### 2. Commit

The browser sends only the signed preview token.

Before deletion, the server:

1. validates the preview signature and expiry;
2. re-reads current inventory;
3. rebuilds the plan using the original cutoff;
4. compares every candidate fingerprint;
5. rejects with HTTP 409 if state/activity changed;
6. runs guarded deletion using the exact public IDs from the signed plan.

A new or recently active record can never be silently added to an old preview.

## Cascade behavior

### Class purge

Class purge removes:

- class-owned collaboration workspaces;
- collaboration capabilities and presence rows through collaboration FK cascade;
- Classroom workspace mappings;
- Classroom participants;
- coaching feedback;
- exercises;
- releases;
- readiness/workspace state;
- checkpoints;
- the class row.

The deletion statement rechecks that every requested class is still terminal/eligible before mutation.

### Independent workspace purge

Independent purge deletes only collaboration workspaces with no Classroom ownership row.

Capabilities and presence cascade with the workspace.

## Browser UI

Administration / Maintenance is available as a secondary privileged entry from:

- the current experience chooser;
- View -> Administration / Maintenance.

Opening Admin does **not** set or change `data-experience-role`.

The console provides:

- class and workspace search;
- lifecycle/ownership filters;
- configurable idle threshold;
- refresh;
- tab-session Sign out;
- class close;
- Instructor access reissue;
- single terminal-class preview;
- bulk stale/expired class preview;
- eligible independent-workspace preview;
- bulk stale independent-workspace preview;
- exact purge confirmation;
- responsive single-column mobile layout;
- keyboard focus containment and Escape handling.

## Current environment dependency

Code can merge safely before `INTAKE_ADMIN_TOKEN` is configured: the endpoint fails closed with HTTP 503 and the browser shows the server error.

Production acceptance for #329 requires configuring a valid server environment key and verifying the exact merged deployment.

## Tests

Required coverage includes:

- missing/malformed server configuration;
- missing/incorrect request authorization;
- private response headers;
- no raw capability leakage;
- active/recent-presence protection;
- class-owned workspace protection;
- exact signed preview -> commit;
- stale preview rejection;
- terminal-only single-class purge;
- preview expiry;
- Instructor authority rotation;
- function-budget regression;
- real browser Admin auth/session isolation;
- desktop destructive preview flow;
- Instructor recovery value is not persisted;
- mobile/desktop serious/critical axe check.

## Cold restart

For #329 work:

1. refresh `main`, PR #333, and issue #329;
2. read root `AGENTS.md`, `api/AGENTS.md`, `docs/preproduction-hardening.md`, and this file;
3. keep Administration separate from experience roles;
4. never add token values to URL/query strings;
5. never bypass preview-first physical deletion;
6. keep Class-owned workspace deletion coupled to owning class purge;
7. preserve one deployable `api/admin.js` Admin function;
8. before handoff, update `docs/classroom-workstream.md` with exact branch/HEAD/gates.
