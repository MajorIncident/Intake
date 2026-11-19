# Protected Staged Case Assets Contract (#316)

This is the canonical contract for protected staged Case Study assets and rich Student case rendering. It builds on the staged-exercise engine (`docs/classroom-staged-simulation.md`) and the Classroom capability model (`docs/classroom-api.md`). It lets a staged Case Study show source-faithful text, tables, images, and document pages without shipping unreleased or Instructor-only material to the browser.

The first draft of this contract lived on PR #336; this version describes what is implemented.

## Invariants

- Protected asset bytes and the registry are server-only. They never appear in `dist/`, in the public manifest, in browser source, or in a URL.
- The stable **Student class-session capability** is the only Student authority for case assets. Workspace edit capabilities never authorize assets.
- A Student may retrieve an asset only when a Student block in the **cumulative release through the current stage** references it (and, for a document page, that exact page).
- **Instructor** authority is class-scoped and limited to assets referenced by the class's current exercise definition. It is not a global asset browser.
- Every denial after authentication — unknown, unreleased, future-stage, another class, definition drift, unsupported representation — returns the same `404 { error: "Asset not found." }`, so a response never reveals which class or stage owns an asset.
- Responses are `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, with an explicit raster `Content-Type`. No redirect, no permanent or signed URL.
- Routing stays inside the single Classroom Serverless Function (function budget unchanged).

## Authoring

Protected assets live under `templates/assets/`, indexed by `templates/assets/registry.json`:

```json
{
  "assets": [
    { "id": "cabinet-photo", "kind": "image", "file": "cabinet-photo.png" },
    {
      "id": "inspection-report",
      "kind": "document",
      "pages": [
        { "page": 1, "file": "inspection-report-p1.png" },
        { "page": 2, "file": "inspection-report-p2.png" }
      ]
    }
  ]
}
```

- `id` is a stable lowercase slug, reused across authoring revisions while the represented source evidence is the same. It is not a URL or a path.
- `file` is a plain file name inside `templates/assets/` (no directories, no `..`).
- Only **PNG, JPEG, and WebP** are accepted, detected from the bytes (never from the extension or the author). SVG is refused because it can carry script. Each representation is at most 2 MB.
- A document is a set of page images (render PDF pages to PNG/JPEG before authoring). Pages are numbered from 1.

Staged Student blocks reference assets by ID (`scripts/staged-simulation-schema.mjs`):

- `image` — `{ id, kind: "image", title, assetId, alt }`;
- `document-page` — `{ id, kind: "document-page", title, assetId, page, alt }`;
- `table` — `{ id, kind: "table", title, headers, rows }` (rectangular, strings only; no asset needed).

`alt` is required and must be reviewed against the source.

## Build and deployment boundary

`npm run build:templates` (`scripts/build-templates-manifest.mjs` + `scripts/protected-assets-schema.mjs`):

1. validates the registry shape strictly;
2. reads every file, sniffs its media type, and enforces the size limit;
3. checks that every staged `image` / `document-page` block resolves to a registry entry of the matching kind (and page);
4. writes the server-only `api/_protected-assets.manifest.js` (`PROTECTED_ASSET_MANIFEST`, base64 bytes). The leading underscore keeps it out of the Vercel function count; it is bundled only because the Classroom function imports it.

Any failure stops the build. `npm run check:templates` fails when the committed manifest is stale.

Boundary guards:

- `.vercelignore` excludes `templates/assets/` (and `templates/*.json`);
- `npm run verify:protected-cases` requires that exclusion, rejects any browser import of the asset manifest, rejects asset IDs in browser source or the public manifest, and on Vercel rejects uploaded asset sources;
- `npm run build:vercel-public` rejects asset IDs in `dist/`.

## Endpoints

### `GET /api/classes/exercise/student/asset?assetId=<id>[&page=<n>]`

Student class-session capability in `Authorization: Bearer`. The server resolves the participant's class and current exercise, validates the pinned staged definition (version + fingerprint), computes the cumulative Student release through the current stage (initial releases of every reached stage plus recorded optional releases), and serves the representation only if a released `image` block names `assetId` (no `page`) or a released `document-page` block names `assetId` and that `page`.

### `GET /api/classes/exercise/asset?assetId=<id>[&page=<n>]`

Class Instructor capability. Serves a representation referenced by any Student block of the class's current (non-completed) exercise definition, so an Instructor can preview material before releasing it.

Malformed `assetId` / `page` → 400; missing bearer → 401; anything else unauthorized → the uniform 404. Implementation: `api/_classroomExerciseAssets.js`.

## Student exercise payload

`GET /api/classes/exercise/student` keeps returning released blocks with their authored fields (text body, table headers/rows, image/page `assetId` + `page` + `alt`). It never includes bytes, paths, URLs, future-stage blocks, or Instructor-only content.

## Student rendering

`src/classroomCaseContent.js` sanitizes each released block to its approved fields and renders it with DOM APIs and `textContent` only (authored text is never parsed as HTML):

- **narrative / prompt / evidence** — title + text;
- **table** — `<table>` with `<caption>`, `<thead>` header cells `scope="col"`, `<tbody>`; wrapped in a focusable, named scroll region so wide tables scroll inside the panel on phones;
- **image / document-page** — `<figure>` with `<img alt>` and a caption (`Title · Page n` for pages).

`src/classroomExerciseStudent.js` fetches each released image/page from the Student asset route with the class-session bearer, displays it from an in-memory object URL, shows a non-revealing loading or error message, retries a refused asset at most three times, revokes object URLs when content leaves the release or the Student disconnects, and rebuilds the panel only when something visible changed (polling does not reset table scroll or reload images).

## Progressive disclosure

Advancing a stage authorizes its assets; earlier released assets stay available. Optional releases authorize their assets only once released. Reassignment does not change class-level release authority. A revoked class or session stops asset retrieval immediately. Future-stage content is absent from the Student JSON, the DOM, app-controlled caches, and public output.

## Tests

- `tests/protectedAssetsSchema.unit.test.mjs` — registry shape, byte sniffing (SVG refused), size limit, staged reference resolution, committed manifest.
- `tests/classroomExerciseAssets.unit.test.mjs` — current/optional/next-stage release, earlier assets after advance, unreleased/future/orphan/unknown 404s, workspace capability and other-class denial, revoked class, Instructor scope, definition drift, malformed requests, headers.
- `tests/classroomExerciseStudent.feature.test.mjs` — semantic table, no HTML parsing, bearer-authorized object URLs, no refetch on poll, revocation on disconnect, bounded retries.
- `tests/e2e/student.spec.mjs` (desktop + mobile) — table semantics, image at full resolution from a blob URL, no horizontal overflow, axe, unreleased/future assets absent and refused. The browser fixture mirrors both routes with generated PNGs.

## Authoring a real staged case (#317)

Add assets to `templates/assets/` and the registry, reference them from the case's `simulation.studentContent`, run `npm run build:templates`, and commit the regenerated manifests. Use only reviewed official source material; never infer staging or flatten missing source evidence (see `docs/classroom-staged-simulation.md` and `docs/playbooks/author-kt-case-study.md`).
