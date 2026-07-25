/**
 * @module api/workspace
 * @description Server-only validation, token security, Neon persistence, and injectable HTTP handlers for collaboration workspaces.
 */
import { createHash, randomBytes } from 'node:crypto';

export const MAX_SNAPSHOT_BYTES = 512 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_EXPIRY_DAYS = 30;

/** Generates an unguessable 256-bit URL-safe workspace capability. @returns {string} Secret token. */
export function generateWorkspaceToken() {
  return randomBytes(32).toString('base64url');
}

/** Hashes a workspace capability before persistence. @param {string} token Secret token. @returns {string} SHA-256 hex digest. */
export function hashWorkspaceToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Validates and measures a complete JSON snapshot. @param {unknown} snapshot Candidate snapshot. @returns {{ok:boolean,status?:number}} Validation result. */
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ok: false, status: 400 };
  let encoded;
  try { encoded = JSON.stringify(snapshot); } catch { return { ok: false, status: 400 }; }
  return Buffer.byteLength(encoded, 'utf8') > MAX_SNAPSHOT_BYTES
    ? { ok: false, status: 413 }
    : { ok: true };
}

/** Validates a secret token shape. @param {unknown} token Candidate token. @returns {boolean} Whether valid. */
export function validateToken(token) { return typeof token === 'string' && TOKEN_PATTERN.test(token); }

/** Extracts a bearer workspace token without accepting tokens in URLs. @param {unknown} authorization Header value. @returns {string|null} Token or null. */
export function parseAuthorizationToken(authorization) {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  return match ? match[1] : null;
}

/** Resolves a server-only Neon integration variable. @returns {string} Connection string or empty string. */
function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

let repositoryPromise;
/** Lazily initializes Neon and its idempotent schema. @returns {Promise<object>} Workspace repository. */
export async function getWorkspaceRepository() {
  if (!repositoryPromise) repositoryPromise = initializeRepository();
  return repositoryPromise;
}

/** Creates the table and repository after configuration is available. @returns {Promise<object>} Repository. */
async function initializeRepository() {
  const connection = connectionString();
  if (!connection) throw new Error('Database is not configured');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);
  await sql`CREATE TABLE IF NOT EXISTS collaboration_workspaces (
    id BIGSERIAL PRIMARY KEY,
    token_hash CHAR(64) UNIQUE NOT NULL,
    snapshot_json JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS collaboration_workspaces_expires_at_idx ON collaboration_workspaces (expires_at)`;
  return {
    async create(tokenHash, snapshot, expiryDays) {
      const rows = await sql`INSERT INTO collaboration_workspaces (token_hash, snapshot_json, expires_at)
        VALUES (${tokenHash}, ${JSON.stringify(snapshot)}::jsonb, NOW() + (${expiryDays} * INTERVAL '1 day'))
        RETURNING revision, expires_at`;
      return rows[0];
    },
    async load(tokenHash) {
      const rows = await sql`SELECT snapshot_json AS snapshot, revision, expires_at
        FROM collaboration_workspaces WHERE token_hash = ${tokenHash} AND expires_at > NOW()`;
      return rows[0] || null;
    },
    async update(tokenHash, snapshot, revision) {
      const rows = await sql`UPDATE collaboration_workspaces
        SET snapshot_json = ${JSON.stringify(snapshot)}::jsonb, revision = revision + 1, updated_at = NOW()
        WHERE token_hash = ${tokenHash} AND revision = ${revision} AND expires_at > NOW()
        RETURNING revision, expires_at`;
      if (rows[0]) return { status: 'updated', workspace: rows[0] };
      const current = await sql`SELECT revision FROM collaboration_workspaces WHERE token_hash = ${tokenHash} AND expires_at > NOW()`;
      return current[0] ? { status: 'conflict', revision: current[0].revision } : { status: 'missing' };
    }
  };
}

/** Applies privacy headers. @param {object} res Response. @returns {void} */
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}
/** Sends JSON. @param {object} res Response. @param {number} status Status. @param {object} body Body. @returns {object} Response. */
function send(res, status, body) { headers(res); return res.status(status).json(body); }
/** Sends a method error. @param {object} res Response. @param {string} allowed Methods. @returns {object} Response. */
function methodNotAllowed(res, allowed) { res.setHeader('Allow', allowed); return send(res, 405, { error: 'Method not allowed.' }); }

/** Creates a Vercel create-workspace handler. @param {object} [dependencies] Dependencies. @returns {Function} Handler. */
export function createWorkspaceHandler({ getRepository = getWorkspaceRepository } = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    const validation = validateSnapshot(req.body?.snapshot);
    if (!validation.ok) return send(res, validation.status, { error: validation.status === 413 ? 'Snapshot is too large.' : 'Invalid request.' });
    try {
      const token = generateWorkspaceToken();
      const requested = Number.parseInt(process.env.WORKSPACE_EXPIRY_DAYS || '', 10);
      const expiryDays = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_EXPIRY_DAYS;
      const workspace = await (await getRepository()).create(hashWorkspaceToken(token), req.body.snapshot, expiryDays);
      return send(res, 201, { token, revision: workspace.revision, expiresAt: workspace.expires_at });
    } catch { return send(res, 500, { error: 'Unable to create workspace.' }); }
  };
}

/** Creates a Vercel load/update handler. @param {object} [dependencies] Dependencies. @returns {Function} Handler. */
export function workspaceHandler({ getRepository = getWorkspaceRepository } = {}) {
  return async (req, res) => {
    const authorization = req.headers?.authorization;
    if (authorization === undefined) return send(res, 401, { error: 'Authorization required.' });
    const token = parseAuthorizationToken(authorization);
    if (!token) return send(res, 400, { error: 'Invalid authorization.' });
    if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, 'GET, PUT');
    try {
      const repository = await getRepository();
      if (req.method === 'GET') {
        const workspace = await repository.load(hashWorkspaceToken(token));
        return workspace ? send(res, 200, workspace) : send(res, 404, { error: 'Workspace not found.' });
      }
      const validation = validateSnapshot(req.body?.snapshot);
      if (!validation.ok) return send(res, validation.status, { error: validation.status === 413 ? 'Snapshot is too large.' : 'Invalid request.' });
      if (!Number.isInteger(req.body?.revision) || req.body.revision < 1) return send(res, 400, { error: 'Invalid request.' });
      const result = await repository.update(hashWorkspaceToken(token), req.body.snapshot, req.body.revision);
      if (result.status === 'conflict') return send(res, 409, { error: 'Revision conflict.', revision: result.revision });
      if (result.status === 'missing') return send(res, 404, { error: 'Workspace not found.' });
      return send(res, 200, result.workspace);
    } catch { return send(res, 500, { error: 'Unable to access workspace.' }); }
  };
}
