# Adding or changing a server API route

## Constraints

- Vercel Hobby allows **12 Serverless Functions**; the repo uses 5. `npm run verify:vercel-functions` counts every non-underscore `api/*.js` file.
- All `/api/classes/**` URLs share **one** function (`api/classroom.js`). Do **not** add `api/classes/**/*.js` files.
- Server helpers live in underscore files (`api/_*.js`); they are bundled, not deployed as functions.

## Adding a Classroom route

1. Write the handler factory in the owning `api/_*.js` module with injectable `getRepository` (see existing handlers).
2. Register it in `api/_classroomRouter.js` (`CLASSROOM_ROUTE_IDS` + `defaultHandlers`).
3. Add the rewrite in `vercel.json` (`/api/classes/<path>` → `/api/classroom?__classroomRoute=<id>`).
4. Mirror it in `scripts/serve-browser-tests.mjs` if a browser journey uses it.
5. Tests: router mapping (`tests/classroomRouter.unit.test.mjs`), authorization matrix, and real SQL if you added queries.
6. Document the endpoint in `docs/classroom-api.md`.

## Every handler must

- validate method, bearer authority, identifiers, and payload size **before** any mutation;
- return `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on private responses;
- never log raw capabilities, hashes, Authorization headers, or snapshots;
- fail with non-enumerating errors (no hint whether another class/workspace exists);
- rate-limit unauthenticated creation/admission endpoints.

## Schema changes

Schema is created idempotently by the owning repository module. To change schema:

1. Append a new migration step; never edit an applied one.
2. Bump that module's schema version.
3. Keep steps idempotent (`IF NOT EXISTS`) so a partially applied deploy can re-run safely.
4. Add or extend a real-Postgres test.
