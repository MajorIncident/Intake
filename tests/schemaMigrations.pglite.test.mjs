/**
 * Real-Postgres (PGlite) coverage for versioned schema application,
 * retry-safe repository memoization, and persisted rate limits in api/_db.js.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applySchema,
  consumeRateLimit,
  describeSchemaSteps,
  memoizeUntilFailure,
  rateLimitBucket,
  schemaFingerprint
} from '../api/_db.js';
import { WORKSPACE_SCHEMA } from '../api/_workspace.js';
import { CLASSROOM_SCHEMA } from '../api/_classroom.js';
import { createPgliteSql } from './helpers/pglite-sql.mjs';

for (const schema of [WORKSPACE_SCHEMA, CLASSROOM_SCHEMA]) {
  test(`${schema.component} schema fingerprint matches its declared version`, () => {
    const actual = schemaFingerprint(schema);
    assert.equal(
      actual,
      schema.fingerprint,
      `${schema.component} schema steps changed. Bump its version (currently ${schema.version}) and set fingerprint to '${actual}'.`
    );
  });
}

test('schema applies once, records its version, then takes a one-query fast path', async () => {
  const sql = await createPgliteSql();
  try {
    assert.deepEqual(await applySchema(sql, WORKSPACE_SCHEMA), { applied: true, version: WORKSPACE_SCHEMA.version });
    assert.deepEqual(await applySchema(sql, CLASSROOM_SCHEMA), { applied: true, version: CLASSROOM_SCHEMA.version });

    const before = sql.queryCount;
    assert.equal((await applySchema(sql, WORKSPACE_SCHEMA)).applied, false);
    assert.equal(sql.queryCount - before, 1, 'warm schema check must be a single SELECT');

    const versions = await sql`SELECT component, version, fingerprint FROM intake_schema_versions ORDER BY component`;
    assert.deepEqual(versions.map(row => [row.component, row.version, row.fingerprint]), [
      ['classroom', CLASSROOM_SCHEMA.version, CLASSROOM_SCHEMA.fingerprint],
      ['collaboration', WORKSPACE_SCHEMA.version, WORKSPACE_SCHEMA.fingerprint]
    ]);
  } finally {
    await sql.close();
  }
});

test('schema upgrades a database created by the pre-versioning cold-start DDL', async () => {
  const sql = await createPgliteSql();
  try {
    // Simulate the current production database: tables exist, no version table.
    for (const step of WORKSPACE_SCHEMA.steps) await step(sql);
    for (const step of CLASSROOM_SCHEMA.steps) await step(sql);
    assert.equal((await applySchema(sql, WORKSPACE_SCHEMA)).applied, true);
    assert.equal((await applySchema(sql, CLASSROOM_SCHEMA)).applied, true);
    assert.equal((await applySchema(sql, CLASSROOM_SCHEMA)).applied, false);
  } finally {
    await sql.close();
  }
});

test('concurrent cold starts both succeed and an older deploy never downgrades the record', async () => {
  const sql = await createPgliteSql();
  try {
    await Promise.all([applySchema(sql, WORKSPACE_SCHEMA), applySchema(sql, WORKSPACE_SCHEMA)]);
    const newer = { ...WORKSPACE_SCHEMA, version: WORKSPACE_SCHEMA.version + 1, fingerprint: 'f'.repeat(64) };
    assert.equal((await applySchema(sql, newer)).applied, true);
    assert.equal((await applySchema(sql, WORKSPACE_SCHEMA)).applied, false, 'old instance sees a newer schema and skips DDL');
    const [row] = await sql`SELECT version, fingerprint FROM intake_schema_versions WHERE component = 'collaboration'`;
    assert.equal(row.version, newer.version);
    assert.equal(row.fingerprint, newer.fingerprint);
  } finally {
    await sql.close();
  }
});

test('a failing step rolls the whole migration back', async () => {
  const sql = await createPgliteSql();
  try {
    const broken = {
      component: 'broken',
      version: 1,
      fingerprint: '0'.repeat(64),
      steps: [
        db => db`CREATE TABLE broken_first (id INTEGER)`,
        db => db`SELECT * FROM table_that_does_not_exist`
      ]
    };
    await assert.rejects(applySchema(sql, broken));
    const [row] = await sql`SELECT to_regclass('public.broken_first') AS name`;
    assert.equal(row.name, null);
  } finally {
    await sql.close();
  }
});

test('schema step descriptions are pure and carry no runtime values', () => {
  for (const schema of [WORKSPACE_SCHEMA, CLASSROOM_SCHEMA]) {
    for (const step of describeSchemaSteps(schema)) assert.deepEqual(step.values, []);
  }
});

test('memoized repository initialization retries after a failure instead of caching it', async () => {
  let attempts = 0;
  const get = memoizeUntilFailure(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('database briefly unavailable');
    return { ready: true };
  });
  await assert.rejects(get(), /briefly unavailable/);
  const first = await get();
  assert.deepEqual(first, { ready: true });
  assert.equal(await get(), first);
  assert.equal(attempts, 2);
});

test('rate limits count per hashed bucket and window', async () => {
  const sql = await createPgliteSql();
  try {
    await applySchema(sql, WORKSPACE_SCHEMA);
    const bucket = rateLimitBucket('class-create', '203.0.113.7');
    assert.match(bucket, /^[0-9a-f]{64}$/);
    const policy = { bucket, windowSeconds: 3600, limit: 2 };
    assert.deepEqual(await consumeRateLimit(sql, policy), { allowed: true, hits: 1 });
    assert.deepEqual(await consumeRateLimit(sql, policy), { allowed: true, hits: 2 });
    assert.deepEqual(await consumeRateLimit(sql, policy), { allowed: false, hits: 3 });
    const other = rateLimitBucket('class-create', '198.51.100.4');
    assert.equal((await consumeRateLimit(sql, { ...policy, bucket: other })).allowed, true);
  } finally {
    await sql.close();
  }
});
