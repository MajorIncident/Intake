/**
 * @module api/workspace
 * @description Server-only validation, token security, Neon persistence, and injectable HTTP handlers for collaboration workspaces.
 */
import { createHash, randomBytes } from 'node:crypto';

export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export const TEAM_NAME_MAX_LENGTH = 80;
export const DISPLAY_NAME_MAX_LENGTH = 60;
export const PRESENCE_WINDOW_SECONDS = 30;
export const EDITING_FIELD_MAX_LENGTH = 120;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PARTICIPANT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

/** Normalizes a human-entered collaboration label. @param {unknown} value Candidate label. @param {number} maximum Maximum length. @returns {string|null} Normalized label, an empty string, or null when invalid. */
export function normalizeCollaborationName(value, maximum) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= maximum ? normalized : null;
}

/** Normalizes a DOM field identifier used only for ephemeral editing presence. @param {unknown} value Candidate field ID. @returns {string|null} Safe ID, an empty string, or null. */
export function normalizeEditingField(value) {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'string' && value.length <= EDITING_FIELD_MAX_LENGTH && /^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value) ? value : null;
}

/** Validates a browser-generated participant identifier. @param {unknown} value Candidate UUID. @returns {boolean} Whether valid. */
export function validateParticipantId(value) { return typeof value === 'string' && PARTICIPANT_PATTERN.test(value); }

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
    expires_at TIMESTAMPTZ NOT NULL,
    team_name VARCHAR(80),
    next_participant_number INTEGER NOT NULL DEFAULT 1
  )`;
  await sql`ALTER TABLE collaboration_workspaces ADD COLUMN IF NOT EXISTS team_name VARCHAR(80)`;
  await sql`ALTER TABLE collaboration_workspaces ADD COLUMN IF NOT EXISTS next_participant_number INTEGER NOT NULL DEFAULT 1`;
  await sql`CREATE INDEX IF NOT EXISTS collaboration_workspaces_expires_at_idx ON collaboration_workspaces (expires_at)`;
  await sql`CREATE TABLE IF NOT EXISTS collaboration_participants (
    workspace_id BIGINT NOT NULL REFERENCES collaboration_workspaces(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL,
    display_name VARCHAR(60) NOT NULL,
    fallback_number INTEGER NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, participant_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS collaboration_participants_active_idx ON collaboration_participants (workspace_id, last_seen_at DESC)`;
  await sql`ALTER TABLE collaboration_participants ADD COLUMN IF NOT EXISTS editing_field VARCHAR(120)`;
  await sql`ALTER TABLE collaboration_participants ADD COLUMN IF NOT EXISTS editing_revision INTEGER`;
  return {
    async create(tokenHash, snapshot, expiryDays, teamName) {
      const rows = await sql`INSERT INTO collaboration_workspaces (token_hash, snapshot_json, expires_at, team_name)
        VALUES (${tokenHash}, ${JSON.stringify(snapshot)}::jsonb, NOW() + (${expiryDays} * INTERVAL '1 day'), ${teamName || null})
        RETURNING id, revision, expires_at, COALESCE(team_name, 'Shared intake') AS team_name`;
      return rows[0];
    },
    async load(tokenHash) {
      const rows = await sql`SELECT snapshot_json AS snapshot, revision, expires_at, COALESCE(team_name, 'Shared intake') AS team_name
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
    },
    async upsertPresence(tokenHash, participantId, requestedName, activity = {}) {
      const existing = await sql`SELECT w.id AS workspace_id, COALESCE(w.team_name, 'Shared intake') AS team_name,
          p.fallback_number
        FROM collaboration_workspaces w
        LEFT JOIN collaboration_participants p ON p.workspace_id = w.id AND p.participant_id = ${participantId}::uuid
        WHERE w.token_hash = ${tokenHash} AND w.expires_at > NOW()`;
      if (!existing[0]) return null;
      let fallbackNumber = existing[0].fallback_number;
      if (!fallbackNumber) {
        const allocated = await sql`UPDATE collaboration_workspaces
          SET next_participant_number = next_participant_number + 1
          WHERE id = ${existing[0].workspace_id} AND expires_at > NOW()
          RETURNING next_participant_number - 1 AS fallback_number`;
        if (!allocated[0]) return null;
        fallbackNumber = allocated[0].fallback_number;
      }
      const displayName = requestedName || `Teammate ${fallbackNumber}`;
      await sql`INSERT INTO collaboration_participants (workspace_id, participant_id, display_name, fallback_number)
        VALUES (${existing[0].workspace_id}, ${participantId}::uuid, ${displayName}, ${fallbackNumber})
        ON CONFLICT (workspace_id, participant_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, last_seen_at = NOW()`;
      if (Object.hasOwn(activity, 'editingField')) {
        await sql`UPDATE collaboration_participants
          SET editing_field = ${activity.editingField || null}, editing_revision = ${activity.editingRevision || null}, last_seen_at = NOW()
          WHERE workspace_id = ${existing[0].workspace_id} AND participant_id = ${participantId}::uuid`;
      }
      const participants = await sql`SELECT participant_id AS id, display_name AS "displayName", last_seen_at AS "lastSeenAt"
          , editing_field AS "editingField", editing_revision AS "editingRevision"
        FROM collaboration_participants
        WHERE workspace_id = ${existing[0].workspace_id}
          AND last_seen_at >= NOW() - (${PRESENCE_WINDOW_SECONDS} * INTERVAL '1 second')
        ORDER BY joined_at, participant_id`;
      return { teamName: existing[0].team_name, self: { id: participantId, displayName }, participants };
    },
    async listPresence(tokenHash) {
      const workspaces = await sql`SELECT id, COALESCE(team_name, 'Shared intake') AS team_name
        FROM collaboration_workspaces WHERE token_hash = ${tokenHash} AND expires_at > NOW()`;
      if (!workspaces[0]) return null;
      const participants = await sql`SELECT participant_id AS id, display_name AS "displayName", last_seen_at AS "lastSeenAt",
          editing_field AS "editingField", editing_revision AS "editingRevision"
        FROM collaboration_participants
        WHERE workspace_id = ${workspaces[0].id}
          AND last_seen_at >= NOW() - (${PRESENCE_WINDOW_SECONDS} * INTERVAL '1 second')
        ORDER BY joined_at, participant_id`;
      return { teamName: workspaces[0].team_name, participants };
    },
    async renameWorkspace(tokenHash, requestedTeamName) {
      const workspaces = await sql`UPDATE collaboration_workspaces
        SET team_name = ${requestedTeamName || 'Shared intake'}, updated_at = NOW()
        WHERE token_hash = ${tokenHash} AND expires_at > NOW()
        RETURNING id, COALESCE(team_name, 'Shared intake') AS team_name`;
      if (!workspaces[0]) return null;
      const participants = await sql`SELECT participant_id AS id, display_name AS "displayName", last_seen_at AS "lastSeenAt",
          editing_field AS "editingField", editing_revision AS "editingRevision"
        FROM collaboration_participants
        WHERE workspace_id = ${workspaces[0].id}
          AND last_seen_at >= NOW() - (${PRESENCE_WINDOW_SECONDS} * INTERVAL '1 second')
        ORDER BY joined_at, participant_id`;
      return { teamName: workspaces[0].team_name, participants };
    },
    async removePresence(tokenHash, participantId) {
      const rows = await sql`DELETE FROM collaboration_participants p
        USING collaboration_workspaces w
        WHERE p.workspace_id = w.id AND w.token_hash = ${tokenHash}
          AND p.participant_id = ${participantId}::uuid
        RETURNING p.participant_id`;
      return rows.length > 0;
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
    const teamName = normalizeCollaborationName(req.body?.teamName, TEAM_NAME_MAX_LENGTH);
    const displayName = normalizeCollaborationName(req.body?.participant?.displayName, DISPLAY_NAME_MAX_LENGTH);
    const participantId = req.body?.participant?.id;
    if (teamName === null || displayName === null || !validateParticipantId(participantId)) return send(res, 400, { error: 'Invalid collaboration profile.' });
    try {
      const token = generateWorkspaceToken();
      const requested = Number.parseInt(process.env.WORKSPACE_EXPIRY_DAYS || '', 10);
      const expiryDays = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_EXPIRY_DAYS;
      const repository = await getRepository();
      const workspace = await repository.create(hashWorkspaceToken(token), req.body.snapshot, expiryDays, teamName || 'Shared intake');
      const presence = await repository.upsertPresence(hashWorkspaceToken(token), participantId, displayName);
      if (!presence) throw new Error('Created workspace could not register its creator');
      return send(res, 201, { token, revision: workspace.revision, expiresAt: workspace.expires_at, ...presence });
    } catch { return send(res, 500, { error: 'Unable to create workspace.' }); }
  };
}

/** Creates a Vercel presence handler independent of intake snapshot revisions. @param {object} [dependencies] Dependencies. @returns {Function} Handler. */
export function presenceHandler({ getRepository = getWorkspaceRepository } = {}) {
  return async (req, res) => {
    const authorization = req.headers?.authorization;
    if (authorization === undefined) return send(res, 401, { error: 'Authorization required.' });
    const token = parseAuthorizationToken(authorization);
    if (!token) return send(res, 400, { error: 'Invalid authorization.' });
    if (!['GET', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, 'GET, PUT, PATCH, DELETE');
    const participantId = req.body?.participantId;
    if (!['GET', 'PATCH'].includes(req.method) && !validateParticipantId(participantId)) return send(res, 400, { error: 'Invalid participant.' });
    const displayName = req.method === 'PUT' ? normalizeCollaborationName(req.body?.displayName, DISPLAY_NAME_MAX_LENGTH) : '';
    const editingField = req.method === 'PUT' && Object.hasOwn(req.body || {}, 'editingField')
      ? normalizeEditingField(req.body.editingField)
      : undefined;
    const editingRevision = req.method === 'PUT' && req.body?.editingRevision !== undefined
      ? Number(req.body.editingRevision)
      : undefined;
    const teamName = req.method === 'PATCH' ? normalizeCollaborationName(req.body?.teamName, TEAM_NAME_MAX_LENGTH) : '';
    if (displayName === null) return send(res, 400, { error: 'Invalid display name.' });
    if (editingField === null || (editingRevision !== undefined && (!Number.isSafeInteger(editingRevision) || editingRevision < 0))) return send(res, 400, { error: 'Invalid editing activity.' });
    if (teamName === null) return send(res, 400, { error: 'Invalid team name.' });
    try {
      const repository = await getRepository();
      const result = req.method === 'GET'
        ? await repository.listPresence(hashWorkspaceToken(token))
        : req.method === 'PUT'
          ? await repository.upsertPresence(hashWorkspaceToken(token), participantId, displayName, { ...(editingField !== undefined ? { editingField } : {}), ...(editingRevision !== undefined ? { editingRevision } : {}) })
          : req.method === 'PATCH'
            ? await repository.renameWorkspace(hashWorkspaceToken(token), teamName || 'Shared intake')
            : await repository.removePresence(hashWorkspaceToken(token), participantId);
      if (result === null) return send(res, 404, { error: 'Workspace not found.' });
      return req.method === 'DELETE' ? send(res, 200, { removed: result }) : send(res, 200, result);
    } catch { return send(res, 500, { error: 'Unable to update presence.' }); }
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
        const rawAfterRevision = req.query?.afterRevision;
        if (rawAfterRevision !== undefined && (!/^\d+$/.test(String(rawAfterRevision)) || Number(rawAfterRevision) < 1 || !Number.isSafeInteger(Number(rawAfterRevision)))) {
          return send(res, 400, { error: 'Invalid revision query.' });
        }
        const workspace = await repository.load(hashWorkspaceToken(token));
        if (!workspace) return send(res, 404, { error: 'Workspace not found.' });
        if (rawAfterRevision !== undefined && Number(rawAfterRevision) === workspace.revision) {
          headers(res);
          return res.status(204).end();
        }
        const { team_name: storedTeamName, ...publicWorkspace } = workspace;
        return send(res, 200, { ...publicWorkspace, teamName: workspace.teamName || storedTeamName || 'Shared intake' });
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
