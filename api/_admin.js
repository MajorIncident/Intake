/**
 * @module api/admin
 * @description Server-only Administration / Maintenance authorization, inventory, preview, recovery, and purge operations.
 *
 * Administration is deliberately separate from Standalone / Student / Instructor
 * experience roles. The raw admin credential is environment-managed and is never
 * persisted by this module.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { getClassroomRepository } from './_classroom.js';
import {
  generateWorkspaceToken,
  getWorkspaceRepository,
  hashWorkspaceToken,
  parseAuthorizationToken
} from './_workspace.js';

export const ADMIN_TOKEN_ENV = 'INTAKE_ADMIN_TOKEN';
export const ADMIN_PREVIEW_TTL_MS = 10 * 60 * 1000;
export const ADMIN_MAX_PURGE_CANDIDATES = 200;
export const ADMIN_MIN_IDLE_DAYS = 1;
export const ADMIN_MAX_IDLE_DAYS = 3650;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_VERSION = 1;

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

function configuredAdminToken() {
  return process.env[ADMIN_TOKEN_ENV] || '';
}

function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function send(res, status, body) {
  headers(res);
  return res.status(status).json(body);
}

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  return send(res, 405, { error: 'Method not allowed.' });
}

function validConfiguredAdminToken(token) {
  return Boolean(parseAuthorizationToken(`Bearer ${token}`));
}

/**
 * Constant-time comparison for the environment admin credential.
 *
 * @param {unknown} authorization Authorization header.
 * @param {string} configured Server-configured admin token.
 * @returns {boolean} Whether the request carries the configured token.
 */
export function isAdminAuthorized(authorization, configured) {
  if (!validConfiguredAdminToken(configured)) return false;
  const supplied = parseAuthorizationToken(authorization);
  if (!supplied) return false;
  const left = Buffer.from(hashWorkspaceToken(supplied), 'hex');
  const right = Buffer.from(hashWorkspaceToken(configured), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** @param {unknown} value Candidate UUID. @returns {boolean} Whether valid. */
export function validateAdminPublicId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** @param {unknown} value Candidate idle threshold. @returns {number|null} Canonical day count. */
export function normalizeAdminIdleDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= ADMIN_MIN_IDLE_DAYS && days <= ADMIN_MAX_IDLE_DAYS
    ? days
    : null;
}

function toIso(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function calculateIdleDays(lastActivityAt, nowMs) {
  const parsed = lastActivityAt ? new Date(lastActivityAt).getTime() : NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 86400000));
}

function normalizeWorkspaceList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || ''),
      label: String(item.label || ''),
      kind: String(item.kind || '')
    }))
    .filter(item => validateAdminPublicId(item.id));
}

function mapClassInventory(row, nowMs) {
  const revokedAt = toIso(row.revokedAt);
  const expiresAt = toIso(row.expiresAt);
  const lastActivityAt = toIso(row.lastActivityAt || row.updatedAt || row.createdAt);
  const expired = expiresAt ? new Date(expiresAt).getTime() <= nowMs : false;
  const status = revokedAt ? 'revoked' : expired ? 'expired' : 'active';
  const exercise = row.exerciseId
    ? {
        id: String(row.exerciseId),
        status: String(row.exerciseStatus || ''),
        currentStageId: row.currentStageId ? String(row.currentStageId) : null,
        stagePhase: row.stagePhase ? String(row.stagePhase) : null,
        updatedAt: toIso(row.exerciseUpdatedAt)
      }
    : null;
  return {
    id: String(row.id),
    title: String(row.title || 'Untitled class'),
    status,
    joinsEnabled: Boolean(row.joinsEnabled),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    expiresAt,
    revokedAt,
    lastActivityAt,
    idleDays: calculateIdleDays(lastActivityAt, nowMs),
    participantCount: Number(row.participantCount || 0),
    workspaceCount: Number(row.workspaceCount || 0),
    presenceCount: Number(row.presenceCount || 0),
    recentPresenceCount: Number(row.recentPresenceCount || 0),
    coachingCount: Number(row.coachingCount || 0),
    exerciseCount: Number(row.exerciseCount || 0),
    checkpointCount: Number(row.checkpointCount || 0),
    releaseCount: Number(row.releaseCount || 0),
    workspaces: normalizeWorkspaceList(row.workspaces),
    exercise
  };
}

function mapWorkspaceInventory(row, nowMs) {
  const expiresAt = toIso(row.expiresAt);
  const lastActivityAt = toIso(row.lastActivityAt || row.updatedAt || row.createdAt);
  const expired = expiresAt ? new Date(expiresAt).getTime() <= nowMs : false;
  return {
    id: String(row.id),
    teamName: String(row.teamName || 'Shared intake'),
    status: expired ? 'expired' : 'active',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    expiresAt,
    lastActivityAt,
    idleDays: calculateIdleDays(lastActivityAt, nowMs),
    participantCount: Number(row.participantCount || 0),
    recentPresenceCount: Number(row.recentPresenceCount || 0),
    capabilityCount: Number(row.capabilityCount || 0),
    classOwned: Boolean(row.classOwned),
    classroom: row.classId
      ? {
          id: String(row.classId),
          title: String(row.classTitle || 'Untitled class'),
          workspaceId: row.classroomWorkspaceId ? String(row.classroomWorkspaceId) : null,
          workspaceKind: row.workspaceKind ? String(row.workspaceKind) : null,
          workspaceLabel: row.workspaceLabel ? String(row.workspaceLabel) : null
        }
      : null
  };
}

function fingerprintItem(item) {
  const stable = item.classOwned === undefined
    ? {
        id: item.id,
        title: item.title,
        status: item.status,
        joinsEnabled: item.joinsEnabled,
        updatedAt: item.updatedAt,
        expiresAt: item.expiresAt,
        revokedAt: item.revokedAt,
        lastActivityAt: item.lastActivityAt,
        participantCount: item.participantCount,
        workspaceCount: item.workspaceCount,
        presenceCount: item.presenceCount,
        recentPresenceCount: item.recentPresenceCount,
        coachingCount: item.coachingCount,
        exerciseCount: item.exerciseCount,
        checkpointCount: item.checkpointCount,
        releaseCount: item.releaseCount,
        workspaces: item.workspaces,
        exercise: item.exercise
      }
    : {
        id: item.id,
        teamName: item.teamName,
        status: item.status,
        updatedAt: item.updatedAt,
        expiresAt: item.expiresAt,
        lastActivityAt: item.lastActivityAt,
        participantCount: item.participantCount,
        recentPresenceCount: item.recentPresenceCount,
        capabilityCount: item.capabilityCount,
        classOwned: item.classOwned,
        classroom: item.classroom
      };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function cutoffForDays(days, nowMs) {
  return new Date(nowMs - (days * 86400000)).toISOString();
}

function classEligible(item, { mode, cutoffAt }) {
  if (item.status === 'revoked' || item.status === 'expired') return true;
  if (mode !== 'bulk' || !cutoffAt || !item.lastActivityAt) return false;
  return new Date(item.lastActivityAt).getTime() <= new Date(cutoffAt).getTime();
}

function workspaceEligible(item, { cutoffAt }) {
  if (item.classOwned) return false;
  if (item.status === 'expired') return true;
  if (!cutoffAt || !item.lastActivityAt) return false;
  return new Date(item.lastActivityAt).getTime() <= new Date(cutoffAt).getTime();
}

/**
 * Build a deletion preview from a current inventory.
 *
 * @param {object} inventory Current inventory.
 * @param {object} request Preview request.
 * @param {number} nowMs Current epoch milliseconds.
 * @returns {object|null} Preview plan or null when invalid.
 */
export function buildAdminPurgePreview(inventory, request, nowMs = Date.now()) {
  const scope = request?.scope;
  const mode = request?.mode === 'single' ? 'single' : request?.mode === 'bulk' ? 'bulk' : null;
  if (!['classes', 'workspaces'].includes(scope) || !mode) return null;

  const idleDays = normalizeAdminIdleDays(request?.idleDays);
  if (scope === 'workspaces' && idleDays === null) return null;
  if (scope === 'classes' && mode === 'bulk' && idleDays === null) return null;

  const id = request?.id === undefined || request?.id === null || request?.id === ''
    ? null
    : String(request.id);
  if (mode === 'single' && !validateAdminPublicId(id)) return null;

  const cutoffAt = idleDays === null ? null : cutoffForDays(idleDays, nowMs);
  const source = scope === 'classes' ? inventory.classes : inventory.workspaces;
  let candidates = Array.isArray(source) ? [...source] : [];

  if (mode === 'single') {
    candidates = candidates.filter(item => item.id === id);
  }

  candidates = candidates.filter(item => (
    scope === 'classes'
      ? classEligible(item, { mode, cutoffAt })
      : workspaceEligible(item, { cutoffAt })
  ));

  const truncated = candidates.length > ADMIN_MAX_PURGE_CANDIDATES;
  const items = candidates.slice(0, ADMIN_MAX_PURGE_CANDIDATES).map(item => ({
    ...item,
    fingerprint: fingerprintItem(item)
  }));

  return {
    scope,
    mode,
    idleDays,
    cutoffAt,
    generatedAt: new Date(nowMs).toISOString(),
    truncated,
    items
  };
}

function previewPayload(plan, nowMs) {
  return {
    version: PREVIEW_VERSION,
    scope: plan.scope,
    mode: plan.mode,
    idleDays: plan.idleDays,
    cutoffAt: plan.cutoffAt,
    generatedAt: plan.generatedAt,
    expiresAt: new Date(nowMs + ADMIN_PREVIEW_TTL_MS).toISOString(),
    items: plan.items.map(item => ({ id: item.id, fingerprint: item.fingerprint }))
  };
}

function encodePreview(payload, adminToken) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', adminToken).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodePreview(token, adminToken, nowMs) {
  if (typeof token !== 'string' || token.length > 50000) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', adminToken).update(body).digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    payload?.version !== PREVIEW_VERSION
    || !['classes', 'workspaces'].includes(payload.scope)
    || !['single', 'bulk'].includes(payload.mode)
    || !Array.isArray(payload.items)
    || payload.items.length < 1
    || payload.items.length > ADMIN_MAX_PURGE_CANDIDATES
    || !payload.items.every(item => validateAdminPublicId(item?.id) && /^[0-9a-f]{64}$/i.test(item?.fingerprint || ''))
  ) {
    return null;
  }
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < nowMs) return null;
  return payload;
}

function plansMatch(payload, currentPlan) {
  if (!currentPlan || currentPlan.items.length !== payload.items.length) return false;
  const expected = new Map(payload.items.map(item => [item.id, item.fingerprint]));
  return currentPlan.items.every(item => expected.get(item.id) === item.fingerprint);
}

let adminRepositoryPromise;

/**
 * Initialize the Admin repository after the current Classroom/collaboration schema.
 *
 * @returns {Promise<object>} Admin repository.
 */
export async function getAdminRepository() {
  if (!adminRepositoryPromise) adminRepositoryPromise = initializeAdminRepository();
  return adminRepositoryPromise;
}

async function initializeAdminRepository() {
  const connection = connectionString();
  if (!connection) throw new Error('Database is not configured');

  await getWorkspaceRepository();
  await getClassroomRepository();

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);

  async function listInventory(nowMs = Date.now()) {
    const [classRows, workspaceRows] = await Promise.all([
      sql`SELECT
          c.public_id AS id,
          c.title,
          c.joins_enabled AS "joinsEnabled",
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt",
          c.expires_at AS "expiresAt",
          c.revoked_at AS "revokedAt",
          GREATEST(
            c.updated_at,
            COALESCE((SELECT MAX(cp.updated_at) FROM classroom_participants cp WHERE cp.class_id = c.id), c.created_at),
            COALESCE((SELECT MAX(cw.updated_at) FROM classroom_workspaces cw WHERE cw.class_id = c.id), c.created_at),
            COALESCE((
              SELECT MAX(w.updated_at)
              FROM classroom_workspaces cw
              JOIN collaboration_workspaces w ON w.id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at),
            COALESCE((
              SELECT MAX(p.last_seen_at)
              FROM classroom_workspaces cw
              JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at),
            COALESCE((
              SELECT MAX(p.last_active_at)
              FROM classroom_workspaces cw
              JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at),
            COALESCE((SELECT MAX(e.updated_at) FROM classroom_exercises e WHERE e.class_id = c.id), c.created_at),
            COALESCE((SELECT MAX(f.updated_at) FROM classroom_coaching_feedback f WHERE f.class_id = c.id), c.created_at)
          ) AS "lastActivityAt",
          (SELECT COUNT(*)::int FROM classroom_participants cp WHERE cp.class_id = c.id AND cp.revoked_at IS NULL) AS "participantCount",
          (SELECT COUNT(*)::int FROM classroom_workspaces cw WHERE cw.class_id = c.id) AS "workspaceCount",
          (SELECT COUNT(*)::int
            FROM classroom_workspaces cw
            JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
            WHERE cw.class_id = c.id) AS "presenceCount",
          (SELECT COUNT(*)::int
            FROM classroom_workspaces cw
            JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
            WHERE cw.class_id = c.id
              AND p.last_seen_at >= NOW() - 5 * INTERVAL '1 minute') AS "recentPresenceCount",
          (SELECT COUNT(*)::int FROM classroom_coaching_feedback f WHERE f.class_id = c.id) AS "coachingCount",
          (SELECT COUNT(*)::int FROM classroom_exercises e WHERE e.class_id = c.id) AS "exerciseCount",
          (SELECT COUNT(*)::int FROM classroom_exercise_checkpoints k WHERE k.class_id = c.id) AS "checkpointCount",
          (SELECT COUNT(*)::int
            FROM classroom_exercise_releases r
            JOIN classroom_exercises e ON e.id = r.exercise_id
            WHERE e.class_id = c.id) AS "releaseCount",
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', cw.public_id, 'label', cw.label, 'kind', cw.workspace_kind)
              ORDER BY cw.created_at, cw.public_id
            )
            FROM classroom_workspaces cw
            WHERE cw.class_id = c.id
          ), '[]'::jsonb) AS workspaces,
          current_exercise.public_id AS "exerciseId",
          current_exercise.status AS "exerciseStatus",
          current_exercise.current_stage_id AS "currentStageId",
          current_exercise.stage_phase AS "stagePhase",
          current_exercise.updated_at AS "exerciseUpdatedAt"
        FROM classroom_classes c
        LEFT JOIN LATERAL (
          SELECT e.public_id, e.status, e.current_stage_id, e.stage_phase, e.updated_at
          FROM classroom_exercises e
          WHERE e.class_id = c.id AND e.status <> 'completed'
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1
        ) current_exercise ON TRUE
        ORDER BY c.updated_at DESC, c.created_at DESC, c.public_id`,
      sql`SELECT
          w.public_id AS id,
          COALESCE(w.team_name, 'Shared intake') AS "teamName",
          w.created_at AS "createdAt",
          w.updated_at AS "updatedAt",
          w.expires_at AS "expiresAt",
          GREATEST(
            w.updated_at,
            COALESCE((SELECT MAX(p.last_seen_at) FROM collaboration_participants p WHERE p.workspace_id = w.id), w.created_at),
            COALESCE((SELECT MAX(p.last_active_at) FROM collaboration_participants p WHERE p.workspace_id = w.id), w.created_at)
          ) AS "lastActivityAt",
          (SELECT COUNT(*)::int FROM collaboration_participants p WHERE p.workspace_id = w.id) AS "participantCount",
          (SELECT COUNT(*)::int
            FROM collaboration_participants p
            WHERE p.workspace_id = w.id
              AND p.last_seen_at >= NOW() - 5 * INTERVAL '1 minute') AS "recentPresenceCount",
          (SELECT COUNT(*)::int FROM collaboration_workspace_capabilities cap WHERE cap.workspace_id = w.id) AS "capabilityCount",
          (cw.workspace_id IS NOT NULL) AS "classOwned",
          c.public_id AS "classId",
          c.title AS "classTitle",
          cw.public_id AS "classroomWorkspaceId",
          cw.workspace_kind AS "workspaceKind",
          cw.label AS "workspaceLabel"
        FROM collaboration_workspaces w
        LEFT JOIN classroom_workspaces cw ON cw.workspace_id = w.id
        LEFT JOIN classroom_classes c ON c.id = cw.class_id
        ORDER BY w.updated_at DESC, w.created_at DESC, w.public_id`
    ]);

    return {
      generatedAt: new Date(nowMs).toISOString(),
      classes: classRows.map(row => mapClassInventory(row, nowMs)),
      workspaces: workspaceRows.map(row => mapWorkspaceInventory(row, nowMs))
    };
  }

  async function revokeClassById(publicId) {
    const rows = await sql`WITH target AS (
        UPDATE classroom_classes
        SET revoked_at = COALESCE(revoked_at, NOW()),
            joins_enabled = FALSE,
            updated_at = NOW()
        WHERE public_id = ${publicId}::uuid
          AND revoked_at IS NULL
        RETURNING id, public_id
      ),
      marked AS (
        UPDATE classroom_workspaces cw
        SET revoked_at = COALESCE(cw.revoked_at, NOW()),
            updated_at = NOW()
        WHERE cw.class_id = (SELECT id FROM target)
        RETURNING cw.workspace_id
      ),
      expired AS (
        UPDATE collaboration_workspaces w
        SET expires_at = LEAST(w.expires_at, NOW()),
            updated_at = NOW()
        WHERE w.id IN (SELECT workspace_id FROM marked)
        RETURNING w.id
      )
      SELECT public_id AS id FROM target`;
    return rows[0] || null;
  }

  async function rotateInstructorById(publicId, nextHash) {
    const rows = await sql`UPDATE classroom_classes
      SET instructor_token_hash = ${nextHash},
          updated_at = NOW()
      WHERE public_id = ${publicId}::uuid
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING
        public_id AS id,
        title,
        joins_enabled AS "joinsEnabled",
        expires_at AS "expiresAt"`;
    return rows[0] || null;
  }

  async function purgeClasses(ids, { mode, cutoffAt }) {
    const rows = await sql`WITH requested AS (
        SELECT value::uuid AS public_id
        FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      ),
      current AS (
        SELECT
          c.id,
          c.public_id,
          (c.revoked_at IS NOT NULL OR c.expires_at <= NOW()) AS terminal,
          GREATEST(
            c.updated_at,
            COALESCE((SELECT MAX(cp.updated_at) FROM classroom_participants cp WHERE cp.class_id = c.id), c.created_at),
            COALESCE((SELECT MAX(cw.updated_at) FROM classroom_workspaces cw WHERE cw.class_id = c.id), c.created_at),
            COALESCE((
              SELECT MAX(w.updated_at)
              FROM classroom_workspaces cw
              JOIN collaboration_workspaces w ON w.id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at),
            COALESCE((
              SELECT MAX(p.last_seen_at)
              FROM classroom_workspaces cw
              JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at),
            COALESCE((
              SELECT MAX(p.last_active_at)
              FROM classroom_workspaces cw
              JOIN collaboration_participants p ON p.workspace_id = cw.workspace_id
              WHERE cw.class_id = c.id
            ), c.created_at)
          ) AS last_activity
        FROM classroom_classes c
        JOIN requested r ON r.public_id = c.public_id
      ),
      eligible AS (
        SELECT *
        FROM current
        WHERE terminal = TRUE
          OR (
            ${mode === 'bulk'}
            AND ${cutoffAt || null}::timestamptz IS NOT NULL
            AND last_activity <= ${cutoffAt || null}::timestamptz
          )
      ),
      guard AS (
        SELECT
          (SELECT COUNT(*) FROM requested) > 0
          AND (SELECT COUNT(*) FROM requested) = (SELECT COUNT(*) FROM eligible) AS ok
      ),
      workspace_ids AS (
        SELECT cw.workspace_id
        FROM classroom_workspaces cw
        JOIN eligible e ON e.id = cw.class_id
        WHERE (SELECT ok FROM guard)
      ),
      deleted_workspaces AS (
        DELETE FROM collaboration_workspaces w
        WHERE (SELECT ok FROM guard)
          AND w.id IN (SELECT workspace_id FROM workspace_ids)
        RETURNING w.id
      ),
      deleted_classes AS (
        DELETE FROM classroom_classes c
        WHERE (SELECT ok FROM guard)
          AND c.id IN (SELECT id FROM eligible)
          AND (
            (SELECT COUNT(*) FROM workspace_ids) = 0
            OR (SELECT COUNT(*) FROM workspace_ids) = (SELECT COUNT(*) FROM deleted_workspaces)
          )
        RETURNING c.public_id
      )
      SELECT
        (SELECT ok FROM guard) AS ok,
        COALESCE((SELECT jsonb_agg(public_id ORDER BY public_id) FROM deleted_classes), '[]'::jsonb) AS "purgedIds",
        (SELECT COUNT(*)::int FROM deleted_workspaces) AS "workspaceCount"`;
    return rows[0] || { ok: false, purgedIds: [], workspaceCount: 0 };
  }

  async function purgeStandaloneWorkspaces(ids, { cutoffAt }) {
    const rows = await sql`WITH requested AS (
        SELECT value::uuid AS public_id
        FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)
      ),
      current AS (
        SELECT
          w.id,
          w.public_id,
          (w.expires_at <= NOW()) AS terminal,
          GREATEST(
            w.updated_at,
            COALESCE((SELECT MAX(p.last_seen_at) FROM collaboration_participants p WHERE p.workspace_id = w.id), w.created_at),
            COALESCE((SELECT MAX(p.last_active_at) FROM collaboration_participants p WHERE p.workspace_id = w.id), w.created_at)
          ) AS last_activity
        FROM collaboration_workspaces w
        JOIN requested r ON r.public_id = w.public_id
        WHERE NOT EXISTS (
          SELECT 1 FROM classroom_workspaces cw WHERE cw.workspace_id = w.id
        )
      ),
      eligible AS (
        SELECT *
        FROM current
        WHERE terminal = TRUE
          OR (
            ${cutoffAt || null}::timestamptz IS NOT NULL
            AND last_activity <= ${cutoffAt || null}::timestamptz
          )
      ),
      guard AS (
        SELECT
          (SELECT COUNT(*) FROM requested) > 0
          AND (SELECT COUNT(*) FROM requested) = (SELECT COUNT(*) FROM eligible) AS ok
      ),
      deleted AS (
        DELETE FROM collaboration_workspaces w
        WHERE (SELECT ok FROM guard)
          AND w.id IN (SELECT id FROM eligible)
        RETURNING w.public_id
      )
      SELECT
        (SELECT ok FROM guard) AS ok,
        COALESCE((SELECT jsonb_agg(public_id ORDER BY public_id) FROM deleted), '[]'::jsonb) AS "purgedIds"`;
    return rows[0] || { ok: false, purgedIds: [] };
  }

  return {
    listInventory,
    revokeClassById,
    rotateInstructorById,
    purgeClasses,
    purgeStandaloneWorkspaces
  };
}

function publicPreviewItem(item) {
  const { fingerprint: _fingerprint, ...publicItem } = item;
  return publicItem;
}

/**
 * Create the single Administration / Maintenance HTTP handler.
 *
 * @param {object} [dependencies] Test/runtime dependencies.
 * @returns {Function} Vercel handler.
 */
export function adminHandler({
  getRepository = getAdminRepository,
  getAdminToken = configuredAdminToken,
  tokenFactory = generateWorkspaceToken,
  now = () => Date.now()
} = {}) {
  return async (req, res) => {
    const adminToken = getAdminToken();
    if (!validConfiguredAdminToken(adminToken)) {
      return send(res, 503, { error: 'Administration is not configured.' });
    }
    if (!isAdminAuthorized(req.headers?.authorization, adminToken)) {
      return send(res, 401, { error: 'Administration authorization required.' });
    }
    if (!['GET', 'POST'].includes(req.method)) {
      return methodNotAllowed(res, 'GET, POST');
    }

    try {
      const repository = await getRepository();

      if (req.method === 'GET') {
        const inventory = await repository.listInventory(now());
        return send(res, 200, inventory);
      }

      const action = req.body?.action;
      if (action === 'revoke-class') {
        const classId = req.body?.classId;
        if (!validateAdminPublicId(classId)) {
          return send(res, 400, { error: 'Invalid class identifier.' });
        }
        const revoked = await repository.revokeClassById(classId);
        return revoked
          ? send(res, 200, { revoked: true, classId: String(revoked.id) })
          : send(res, 404, { error: 'Active class not found.' });
      }

      if (action === 'rotate-instructor') {
        const classId = req.body?.classId;
        if (!validateAdminPublicId(classId)) {
          return send(res, 400, { error: 'Invalid class identifier.' });
        }
        const instructorToken = tokenFactory();
        const classroom = await repository.rotateInstructorById(classId, hashWorkspaceToken(instructorToken));
        if (!classroom) {
          return send(res, 404, { error: 'Active class not found.' });
        }
        return send(res, 200, {
          classroom,
          instructorToken
        });
      }

      if (action === 'preview-purge') {
        const inventory = await repository.listInventory(now());
        const plan = buildAdminPurgePreview(inventory, req.body, now());
        if (!plan) {
          return send(res, 400, { error: 'Invalid purge preview request.' });
        }
        if (!plan.items.length) {
          return send(res, 200, {
            plan: {
              ...plan,
              items: []
            },
            previewToken: null,
            expiresAt: null
          });
        }
        const payload = previewPayload(plan, now());
        return send(res, 200, {
          plan: {
            ...plan,
            items: plan.items.map(publicPreviewItem)
          },
          previewToken: encodePreview(payload, adminToken),
          expiresAt: payload.expiresAt
        });
      }

      if (action === 'commit-purge') {
        const payload = decodePreview(req.body?.previewToken, adminToken, now());
        if (!payload) {
          return send(res, 400, { error: 'Purge preview is invalid or expired.' });
        }

        const inventory = await repository.listInventory(now());
        const currentPlan = buildAdminPurgePreview(inventory, {
          scope: payload.scope,
          mode: payload.mode,
          idleDays: payload.idleDays,
          ...(payload.mode === 'single' ? { id: payload.items[0]?.id } : {})
        }, new Date(payload.generatedAt).getTime());

        if (!plansMatch(payload, currentPlan)) {
          return send(res, 409, { error: 'Maintenance data changed. Refresh the preview before deleting.' });
        }

        const ids = payload.items.map(item => item.id);
        const result = payload.scope === 'classes'
          ? await repository.purgeClasses(ids, { mode: payload.mode, cutoffAt: payload.cutoffAt })
          : await repository.purgeStandaloneWorkspaces(ids, { cutoffAt: payload.cutoffAt });

        const purgedIds = Array.isArray(result?.purgedIds)
          ? result.purgedIds.map(String)
          : [];
        if (!result?.ok || purgedIds.length !== ids.length) {
          return send(res, 409, { error: 'Maintenance data changed. No purge was committed; refresh the preview.' });
        }

        return send(res, 200, {
          purged: true,
          scope: payload.scope,
          ids: purgedIds,
          ...(payload.scope === 'classes' ? { workspaceCount: Number(result.workspaceCount || 0) } : {})
        });
      }

      return send(res, 400, { error: 'Unknown administration action.' });
    } catch (_error) {
      return send(res, 500, { error: 'Unable to complete administration request.' });
    }
  };
}
