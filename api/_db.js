/**
 * @module api/db
 * @description
 * Server-only database plumbing shared by the collaboration, Classroom, and
 * Administration repositories.
 *
 * Responsibilities:
 * - resolve the Neon connection string (never logged or returned);
 * - create the tagged-template SQL client, with a test-only override so the
 *   real repository SQL can run against an in-process Postgres (PGlite);
 * - apply each component's schema **once per schema version**, inside one
 *   transaction guarded by a Postgres advisory lock, instead of re-running
 *   dozens of DDL statements on every serverless cold start;
 * - memoize repository initialization without caching a failed attempt, so a
 *   transient database outage does not poison a warm function instance;
 * - persist fixed-window rate-limit counters for unauthenticated endpoints.
 *
 * Schema evolution rules (see docs/playbooks/api-change.md): append steps,
 * keep each step idempotent, bump the component `version`, and update its
 * `fingerprint` (the schema fingerprint test prints the new value).
 */
import { createHash } from 'node:crypto';

const SCHEMA_LOCK_NAME = 'intake-schema-migrations';
const UNDEFINED_TABLE = '42P01';

let sqlFactoryOverride = null;

/**
 * Resolves the server-only Neon integration variable.
 * @returns {string} Connection string or an empty string.
 */
export function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

/**
 * Replaces the SQL client factory for tests. Pass `null` to restore Neon.
 * @param {(() => Promise<Function>|Function)|null} factory - Returns a Neon-compatible tagged-template client.
 * @returns {void}
 */
export function setSqlFactoryForTesting(factory) {
  sqlFactoryOverride = typeof factory === 'function' ? factory : null;
}

/**
 * Creates the Neon-compatible tagged-template SQL client.
 * @returns {Promise<Function>} `sql` tag with a `transaction(queries)` method.
 */
export async function createSql() {
  if (sqlFactoryOverride) return sqlFactoryOverride();
  const connection = connectionString();
  if (!connection) throw new Error('Database is not configured');
  const { neon } = await import('@neondatabase/serverless');
  return neon(connection);
}

/**
 * Memoizes an async initializer but forgets a rejected attempt so the next
 * caller retries instead of reusing the cached failure.
 * @param {() => Promise<any>} initializer - Async factory.
 * @returns {(() => Promise<any>) & { reset: () => void }} Memoized getter with a test reset hook.
 */
export function memoizeUntilFailure(initializer) {
  let pending = null;
  const get = () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(initializer)
        .catch(error => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };
  get.reset = () => { pending = null; };
  return get;
}

/**
 * Renders schema steps through a recording tag so their SQL can be fingerprinted
 * without a database.
 * @param {{steps: Array<(sql: Function) => any>}} schema - Component schema.
 * @returns {Array<{text: string, values: Array<any>}>} Step SQL text with placeholders.
 */
export function describeSchemaSteps(schema) {
  const record = (strings, ...values) => ({ text: strings.join('$?'), values });
  return schema.steps.map(step => step(record));
}

/**
 * Computes the deterministic SHA-256 fingerprint of a component's schema steps.
 * @param {{steps: Array<(sql: Function) => any>}} schema - Component schema.
 * @returns {string} 64-character hex fingerprint.
 */
export function schemaFingerprint(schema) {
  const normalized = describeSchemaSteps(schema).map(({ text, values }) => ({
    text: text.replace(/\s+/g, ' ').trim(),
    values
  }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Reads the applied schema version for a component.
 * @param {Function} sql - Tagged-template client.
 * @param {string} component - Schema component name.
 * @returns {Promise<number>} Applied version, or 0 when none is recorded.
 */
async function appliedSchemaVersion(sql, component) {
  try {
    const rows = await sql`SELECT version FROM intake_schema_versions WHERE component = ${component}`;
    return Number(rows[0]?.version || 0);
  } catch (error) {
    if (error?.code === UNDEFINED_TABLE) return 0;
    throw error;
  }
}

/**
 * Applies a component schema when the recorded version is older than the code.
 *
 * The fast path is one SELECT. Otherwise every step runs in one transaction
 * after `pg_advisory_xact_lock`, so concurrent cold starts serialize instead of
 * racing on catalog DDL, and a failed step leaves no partial migration.
 *
 * @param {Function} sql - Tagged-template client with `transaction()`.
 * @param {{component: string, version: number, fingerprint: string, steps: Array<(sql: Function) => any>}} schema - Component schema.
 * @returns {Promise<{applied: boolean, version: number}>} Whether DDL ran.
 */
export async function applySchema(sql, schema) {
  const current = await appliedSchemaVersion(sql, schema.component);
  if (current >= schema.version) return { applied: false, version: current };
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${SCHEMA_LOCK_NAME}))`,
    sql`CREATE TABLE IF NOT EXISTS intake_schema_versions (
      component VARCHAR(64) PRIMARY KEY,
      version INTEGER NOT NULL CHECK (version > 0),
      fingerprint CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    ...schema.steps.map(step => step(sql)),
    sql`INSERT INTO intake_schema_versions (component, version, fingerprint)
      VALUES (${schema.component}, ${schema.version}, ${schema.fingerprint})
      ON CONFLICT (component) DO UPDATE
        SET version = GREATEST(intake_schema_versions.version, EXCLUDED.version),
            fingerprint = CASE WHEN EXCLUDED.version >= intake_schema_versions.version
              THEN EXCLUDED.fingerprint ELSE intake_schema_versions.fingerprint END,
            applied_at = NOW()`
  ]);
  return { applied: true, version: schema.version };
}

/**
 * Hashes a rate-limit bucket so raw client addresses are never stored.
 * @param {string} policy - Policy name, e.g. `class-create`.
 * @param {string} clientKey - Client address or other caller key.
 * @returns {string} 64-character hex bucket key.
 */
export function rateLimitBucket(policy, clientKey) {
  return createHash('sha256').update(`intake-rate-limit:${policy}:${clientKey}`).digest('hex');
}

/**
 * Increments a fixed-window counter and reports whether the caller is within the limit.
 * @param {Function} sql - Tagged-template client.
 * @param {{bucket: string, windowSeconds: number, limit: number}} options - Hashed bucket and policy.
 * @returns {Promise<{allowed: boolean, hits: number}>} Counter result.
 */
export async function consumeRateLimit(sql, { bucket, windowSeconds, limit }) {
  const rows = await sql`INSERT INTO intake_rate_limits (bucket, window_start, hits)
    VALUES (
      ${bucket},
      to_timestamp(floor(extract(epoch FROM NOW()) / ${windowSeconds}::integer) * ${windowSeconds}::integer),
      1
    )
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = intake_rate_limits.hits + 1
    RETURNING hits`;
  const hits = Number(rows[0]?.hits || 0);
  if (Math.random() < 0.02) {
    await sql`DELETE FROM intake_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`;
  }
  return { allowed: hits <= limit, hits };
}
