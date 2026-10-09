# Protected Staged Case Assets Contract

## Purpose

This document is the canonical implementation contract for #316 — protected staged Case Study assets and rich Student case rendering.

#316 builds on the completed staged-exercise engine (#313) and the completed pre-production hardening sequence (#328–#330). It must let a production staged Case Study present source-faithful text, tables, images, and document pages without shipping unreleased or Instructor-only material to the browser.

## Scope

Own:
- a server-only protected asset registry keyed by stable `assetId`;
- authorization for asset retrieval through the represented staged exercise;
- Student access only to assets referenced by currently cumulative released Student content;
- Instructor access only within the represented class/exercise;
- accessible Student rendering for `table`, `image`, and `document-page` blocks;
- protected response headers and public-bundle exclusion;
- deterministic unit/API/browser/security/accessibility coverage.

Do not:
- put protected asset paths or bytes in `dist/`;
- expose asset URLs in authored Student payloads;
- use collaboration workspace edit capabilities as case-asset authority;
- send future-stage assets and hide them client-side;
- infer official case staging or asset mapping without reviewed source material;
- weaken the existing complete protected Case Study payload boundary.

## Existing authored contract

Simulation version 1 already supports:
- `narrative`, `prompt`, and `evidence` blocks with `body`;
- `table` blocks with rectangular `headers` and `rows`;
- `image` blocks with stable `assetId` and required `alt`;
- `document-page` blocks with stable `assetId`, positive `page`, and required `alt`.

The staged definition remains server-only. `assetId` is an opaque stable identifier, not a URL or filesystem path.

## Asset registry

The registry is server-only and keyed by `assetId`.

Each entry must describe only what the server needs to locate and serve the protected asset. A registry entry must never be serialized into the Student exercise payload.

Initial supported asset representations should be deliberately small:
- raster image;
- protected document page representation suitable for browser display.

The registry must fail closed for:
- unknown asset IDs;
- unsupported media type;
- missing source;
- invalid page request;
- registry/source mismatch.

Asset IDs must remain stable across authoring revisions when the represented source evidence is the same.

## Authorization model

### Student

Student asset retrieval requires the stable Student class-session capability.

The server must:
1. resolve the represented participant/class;
2. resolve the current staged exercise;
3. validate the pinned staged definition;
4. compute cumulative Student content released through the current stage;
5. confirm that the requested `assetId` is referenced by one of those released Student blocks;
6. serve only that asset representation.

A Student workspace collaboration capability is never sufficient authorization.

An unreleased, future-stage, another-class, unknown, or Instructor-only asset must fail without revealing ownership or release timing.

### Instructor

Instructor asset retrieval requires the represented class Instructor capability.

The server must resolve that class's staged exercise and allow only assets referenced by that exercise definition. Instructor authority does not become a global protected-asset browser.

## Endpoint shape

Keep the single Classroom Serverless Function deployment invariant.

Add a routed Classroom asset endpoint under the existing `api/classroom.js` dispatcher rather than creating an independent Vercel function.

The public route should carry only a stable asset identifier and, for document-page assets, an allowed page selector. Bearer authority remains in the Authorization header.

Responses:
- `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- explicit safe `Content-Type`;
- no redirect to a permanent/public object URL;
- no credential-bearing URL.

Do not expose registry paths, storage bucket keys, or other server internals in error bodies.

## Student exercise payload

The normal `GET /api/classes/exercise/student` response may include the already-authorized block metadata needed to render the content:
- text block body;
- table headers/rows;
- image `assetId` + reviewed `alt`;
- document-page `assetId` + page + reviewed `alt`.

It must not include:
- protected asset bytes;
- filesystem/storage paths;
- signed/permanent URLs;
- future-stage block metadata;
- Instructor-only content.

## Student rendering

### Narrative / prompt / evidence

Continue rendering as safe text.

### Table

Render semantic HTML:
- `table`;
- `thead` / `tbody`;
- header cells with appropriate scope;
- responsive overflow container that does not break the mobile Intake layout.

No arbitrary HTML from authored content.

### Image

Render only after authorized retrieval.

Requirements:
- authored reviewed alt text;
- no public source URL;
- loading/error state that does not disclose protected path details;
- fit within the case-reference panel without horizontal page overflow.

### Document page

Render a protected page representation through the same authorized boundary.

The browser should treat it as evidence/reference, not as a downloadable public document location. The displayed page must have authored accessible alternative text.

## Progressive disclosure

Authorization is derived from the server's current cumulative released Student content, not from the browser asking for an arbitrary `assetId`.

Advancing a stage may make additional asset IDs authorized. Reassignment does not change class-level staged release authority. Revoked/expired Student class-session authority must stop asset retrieval immediately.

Future-stage content must remain absent from:
- Student exercise JSON;
- DOM;
- browser caches controlled by the app;
- public manifests/static output.

## Public deployment boundary

Protected source assets and the registry are server-only build inputs.

The existing generated `dist/` boundary remains authoritative. Extend the existing Vercel/public-output verification so protected source asset names/IDs/paths cannot accidentally be emitted as public static files.

Stay within the repository Serverless Function budget by routing through the existing Classroom dispatcher.

## Testing

Minimum acceptance coverage:

### Unit / schema
- image/document blocks preserve only approved fields;
- table renderer handles rectangular data;
- invalid/unknown asset representations fail closed.

### API
- current-stage Student asset succeeds;
- prior released-stage asset remains available after advance;
- future-stage asset denied;
- unreleased optional asset denied until release;
- cross-class Student denied;
- workspace capability alone denied;
- revoked/expired Student session denied;
- Instructor access is class/exercise scoped;
- unknown asset indistinguishable from unauthorized protected asset;
- no-store/no-referrer and safe content type asserted.

### Browser
- released table renders semantically;
- released image renders through protected retrieval;
- document page renders through protected retrieval;
- future-stage asset never appears before release;
- mobile layout has no horizontal document overflow;
- keyboard interaction remains usable;
- serious/critical axe scan passes with released rich content visible.

## Delivery slices

### 316A — contract + server registry boundary
- establish this contract;
- add registry shape and deterministic tests;
- add routed asset endpoint;
- prove authorization without adding production case assets.

### 316B — Student payload + table rendering
- preserve rich released block metadata;
- render semantic tables;
- add focused browser/a11y coverage.

### 316C — protected image/document-page retrieval + rendering
- add supported protected asset sources;
- wire authorized fetch/render lifecycle;
- add current/future/cross-class denial tests.

### 316D — deployment/security/final audit
- public-output guard;
- mobile/a11y/security acceptance;
- docs/cold-start reconciliation;
- exact-head required gates and production verification.

## Cold restart

1. Read `AGENTS.md`, `api/AGENTS.md`, `docs/classroom-roadmap.md`, `docs/classroom-architecture.md`, `docs/classroom-api.md`, `docs/classroom-staged-simulation.md`, and this file.
2. Confirm #330 is complete and #316 remains the active issue.
3. Preserve the single Classroom dispatcher/function budget.
4. Treat Student class-session authority as the only Student case-asset read authority.
5. Do not add official production assets/staging merely to test the feature; use deterministic synthetic fixtures until #317.
