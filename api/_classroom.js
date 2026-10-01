/**
 * @module api/classroom
 * @description
 * Server-only classroom domain model, capability authorization, Neon persistence,
 * and injectable Vercel handlers. Classroom workspaces reference the existing
 * collaboration workspace engine; they never duplicate snapshot/revision state.
 */

import { randomUUID } from 'node:crypto';
import {
  DISPLAY_NAME_MAX_LENGTH,
  generateWorkspaceToken,
  getWorkspaceRepository,
  hashWorkspaceToken,
  normalizeCollaborationName,
  parseAuthorizationToken,
  validateParticipantId,
  validateSnapshot,
  validateToken
} from './_workspace.js';

export const CLASS_TITLE_MAX_LENGTH = 120;
export const CLASS_WORKSPACE_LABEL_MAX_LENGTH = 120;
export const CLASS_WORKSPACE_KINDS = Object.freeze(['individual', 'group']);
export const DEFAULT_CLASS_EXPIRY_DAYS = 30;
const CLASSROOM_STUDENT_CAPABILITY_KIND = 'classroom-student';

let classroomRepositoryPromise;

/**
 * Resolve the configured server-only database connection string.
 *
 * @returns {string} Neon/Postgres connection string or empty string.
 */
function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
}

/**
 * Resolve configured class retention with a bounded positive integer fallback.
 *
 * @returns {number} Class expiry in days.
 */
export function getClassExpiryDays() {
  const requested = Number.parseInt(process.env.CLASS_EXPIRY_DAYS || '', 10);
  return Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_CLASS_EXPIRY_DAYS;
}

/**
 * Normalize a classroom title or workspace label.
 *
 * @param {unknown} value - Candidate human-facing label.
 * @param {number} maximum - Maximum accepted length.
 * @returns {string|null} Normalized label or null when invalid/blank.
 */
export function normalizeClassroomLabel(value, maximum) {
  const normalized = normalizeCollaborationName(value, maximum);
  return normalized && normalized.length > 0 ? normalized : null;
}

/**
 * Normalize the classroom workspace kind.
 *
 * @param {unknown} value - Candidate workspace kind.
 * @returns {'individual'|'group'|null} Canonical kind or null.
 */
export function normalizeClassroomWorkspaceKind(value) {
  return typeof value === 'string' && CLASS_WORKSPACE_KINDS.includes(value)
    ? /** @type {'individual'|'group'} */ (value)
    : null;
}

/**
 * Validate an opaque classroom public identifier.
 *
 * @param {unknown} value - Candidate UUID.
 * @returns {boolean} Whether it is a valid UUID-shaped identifier.
 */
export function validateClassroomId(value) {
  return validateParticipantId(value);
}

/**
 * Lazily initialize the classroom repository and its additive Neon schema.
 *
 * @returns {Promise<object>} Classroom repository.
 */
export async function getClassroomRepository() {
  if (!classroomRepositoryPromise) {
    classroomRepositoryPromise = initializeClassroomRepository();
  }
  return classroomRepositoryPromise;
}

/**
 * Build the classroom repository after ensuring the collaboration schema exists.
 *
 * @returns {Promise<object>} Repository implementation.
 */
async function initializeClassroomRepository() {
  const connection = connectionString();
  if (!connection) throw new Error('Database is not configured');

  // Ensures collaboration_workspaces and alias-capability tables exist before
  // classroom foreign keys are created.
  await getWorkspaceRepository();

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connection);

  await sql`CREATE TABLE IF NOT EXISTS classroom_classes (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID UNIQUE NOT NULL,
    title VARCHAR(120) NOT NULL,
    instructor_token_hash CHAR(64) UNIQUE NOT NULL,
    student_join_token_hash CHAR(64) UNIQUE NOT NULL,
    joins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_classes_expiry_idx
    ON classroom_classes (expires_at)`;

  await sql`CREATE TABLE IF NOT EXISTS classroom_workspaces (
    workspace_id BIGINT PRIMARY KEY REFERENCES collaboration_workspaces(id) ON DELETE CASCADE,
    class_id BIGINT NOT NULL REFERENCES classroom_classes(id) ON DELETE CASCADE,
    public_id UUID UNIQUE NOT NULL,
    workspace_kind VARCHAR(16) NOT NULL CHECK (workspace_kind IN ('individual', 'group')),
    label VARCHAR(120) NOT NULL,
    claim_token_hash CHAR(64) UNIQUE NOT NULL,
    individual_participant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_workspaces_class_idx
    ON classroom_workspaces (class_id, created_at)`;

  await sql`CREATE TABLE IF NOT EXISTS classroom_memberships (
    class_id BIGINT NOT NULL REFERENCES classroom_classes(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES collaboration_workspaces(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL,
    access_token_hash CHAR(64) UNIQUE NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, participant_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_memberships_workspace_idx
    ON classroom_memberships (workspace_id)`;

  async function classByInstructor(tokenHash) {
    const rows = await sql`SELECT id AS internal_id, public_id AS id, title,
        joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"
      FROM classroom_classes
      WHERE instructor_token_hash = ${tokenHash}
        AND revoked_at IS NULL
        AND expires_at > NOW()`;
    return rows[0] || null;
  }

  async function classByJoin(tokenHash) {
    const rows = await sql`SELECT id AS internal_id, public_id AS id, title,
        joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"
      FROM classroom_classes
      WHERE student_join_token_hash = ${tokenHash}
        AND joins_enabled = TRUE
        AND revoked_at IS NULL
        AND expires_at > NOW()`;
    return rows[0] || null;
  }

  return {
    async createClass({ publicId, title, instructorHash, studentJoinHash, expiryDays }) {
      const rows = await sql`INSERT INTO classroom_classes
        (public_id, title, instructor_token_hash, student_join_token_hash, expires_at)
        VALUES (
          ${publicId}::uuid,
          ${title},
          ${instructorHash},
          ${studentJoinHash},
          NOW() + (${expiryDays} * INTERVAL '1 day')
        )
        RETURNING public_id AS id, title, joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"`;
      return rows[0];
    },

    async getClassByInstructor(instructorHash) {
      return classByInstructor(instructorHash);
    },

    async rotateStudentJoin(instructorHash, nextHash) {
      const rows = await sql`UPDATE classroom_classes
        SET student_join_token_hash = ${nextHash}, updated_at = NOW()
        WHERE instructor_token_hash = ${instructorHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        RETURNING public_id AS id, title, joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"`;
      return rows[0] || null;
    },

    async rotateInstructor(instructorHash, nextHash) {
      const rows = await sql`UPDATE classroom_classes
        SET instructor_token_hash = ${nextHash}, updated_at = NOW()
        WHERE instructor_token_hash = ${instructorHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        RETURNING public_id AS id, title, joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"`;
      return rows[0] || null;
    },

    async setJoinsEnabled(instructorHash, enabled) {
      const rows = await sql`UPDATE classroom_classes
        SET joins_enabled = ${enabled}, updated_at = NOW()
        WHERE instructor_token_hash = ${instructorHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        RETURNING public_id AS id, title, joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"`;
      return rows[0] || null;
    },

    async revokeClass(instructorHash) {
      const rows = await sql`UPDATE classroom_classes
        SET revoked_at = NOW(), joins_enabled = FALSE, updated_at = NOW()
        WHERE instructor_token_hash = ${instructorHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        RETURNING id, public_id AS public_id`;
      if (!rows[0]) return null;

      await sql`UPDATE classroom_workspaces
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE class_id = ${rows[0].id} AND revoked_at IS NULL`;
      await sql`UPDATE collaboration_workspaces w
        SET expires_at = NOW(), updated_at = NOW()
        FROM classroom_workspaces cw
        WHERE cw.class_id = ${rows[0].id} AND cw.workspace_id = w.id`;

      return { id: rows[0].public_id };
    },

    async addWorkspace(instructorHash, { publicId, workspaceId, kind, label, claimHash }) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const rows = await sql`INSERT INTO classroom_workspaces
        (workspace_id, class_id, public_id, workspace_kind, label, claim_token_hash)
        VALUES (
          ${workspaceId},
          ${classroom.internal_id},
          ${publicId}::uuid,
          ${kind},
          ${label},
          ${claimHash}
        )
        RETURNING public_id AS id, workspace_kind AS kind, label, created_at AS "createdAt"`;
      return { classroom, workspace: rows[0] };
    },

    async listWorkspaces(instructorHash) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const rows = await sql`SELECT
          cw.public_id AS id,
          cw.workspace_kind AS kind,
          cw.label,
          cw.created_at AS "createdAt",
          COUNT(cm.participant_id)::int AS "participantCount"
        FROM classroom_workspaces cw
        LEFT JOIN classroom_memberships cm ON cm.workspace_id = cw.workspace_id
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        WHERE cw.class_id = ${classroom.internal_id}
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()
        GROUP BY cw.workspace_id, cw.public_id, cw.workspace_kind, cw.label, cw.created_at
        ORDER BY cw.created_at, cw.workspace_id`;
      return { classroom, workspaces: rows };
    },

    async rotateWorkspaceClaim(instructorHash, workspacePublicId, nextHash) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const rows = await sql`UPDATE classroom_workspaces
        SET claim_token_hash = ${nextHash}, updated_at = NOW()
        WHERE class_id = ${classroom.internal_id}
          AND public_id = ${workspacePublicId}::uuid
          AND revoked_at IS NULL
        RETURNING public_id AS id, workspace_kind AS kind, label`;
      return rows[0] ? { classroom, workspace: rows[0] } : null;
    },

    async revokeWorkspaceClaim(instructorHash, workspacePublicId) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const rows = await sql`UPDATE classroom_workspaces
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE class_id = ${classroom.internal_id}
          AND public_id = ${workspacePublicId}::uuid
          AND revoked_at IS NULL
        RETURNING workspace_id, public_id AS id`;
      if (!rows[0]) return null;
      await sql`UPDATE collaboration_workspaces
        SET expires_at = NOW(), updated_at = NOW()
        WHERE id = ${rows[0].workspace_id}`;
      return { classroom, workspace: rows[0] };
    },

    async joinWorkspace({ studentJoinHash, claimHash, participantId, accessHash, workspaceRepository }) {
      const classroom = await classByJoin(studentJoinHash);
      if (!classroom) return null;

      const assignments = await sql`SELECT
          cw.workspace_id,
          cw.public_id AS id,
          cw.workspace_kind AS kind,
          cw.label,
          cw.individual_participant_id,
          w.expires_at AS "expiresAt"
        FROM classroom_workspaces cw
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        WHERE cw.class_id = ${classroom.internal_id}
          AND cw.claim_token_hash = ${claimHash}
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()`;
      const assignment = assignments[0];
      if (!assignment) return null;

      if (assignment.kind === 'individual') {
        const claimed = await sql`UPDATE classroom_workspaces
          SET individual_participant_id = COALESCE(individual_participant_id, ${participantId}::uuid),
              updated_at = NOW()
          WHERE workspace_id = ${assignment.workspace_id}
            AND (individual_participant_id IS NULL OR individual_participant_id = ${participantId}::uuid)
          RETURNING workspace_id`;
        if (!claimed[0]) return null;
      }

      const previous = await sql`SELECT access_token_hash
        FROM classroom_memberships
        WHERE class_id = ${classroom.internal_id}
          AND participant_id = ${participantId}::uuid`;

      const capabilityCreated = await workspaceRepository.createCapability(
        assignment.workspace_id,
        accessHash,
        CLASSROOM_STUDENT_CAPABILITY_KIND,
        classroom.expiresAt
      );
      if (!capabilityCreated) {
        throw new Error('Unable to create student workspace capability');
      }

      await sql`INSERT INTO classroom_memberships
        (class_id, workspace_id, participant_id, access_token_hash)
        VALUES (
          ${classroom.internal_id},
          ${assignment.workspace_id},
          ${participantId}::uuid,
          ${accessHash}
        )
        ON CONFLICT (class_id, participant_id) DO UPDATE
        SET workspace_id = EXCLUDED.workspace_id,
            access_token_hash = EXCLUDED.access_token_hash,
            updated_at = NOW()`;

      if (previous[0]?.access_token_hash && previous[0].access_token_hash !== accessHash) {
        await workspaceRepository.revokeCapability(previous[0].access_token_hash);
      }

      return {
        classroom,
        workspace: {
          id: assignment.id,
          kind: assignment.kind,
          label: assignment.label,
          expiresAt: assignment.expiresAt
        }
      };
    }
  };
}

/**
 * Apply privacy-conscious API response headers.
 *
 * @param {object} res - Vercel response.
 * @returns {void}
 */
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * Send a JSON response with classroom privacy headers.
 *
 * @param {object} res - Vercel response.
 * @param {number} status - HTTP status.
 * @param {object} body - JSON body.
 * @returns {object} Response.
 */
function send(res, status, body) {
  headers(res);
  return res.status(status).json(body);
}

/**
 * Send a method-not-allowed response.
 *
 * @param {object} res - Vercel response.
 * @param {string} allowed - Allow header.
 * @returns {object} Response.
 */
function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return send(res, 405, { error: 'Method not allowed.' });
}

/**
 * Parse and validate a bearer capability.
 *
 * @param {object} req - Request object.
 * @returns {{ok:true,token:string}|{ok:false,status:number,error:string}} Authorization result.
 */
function requireBearer(req) {
  if (req.headers?.authorization === undefined) {
    return { ok: false, status: 401, error: 'Authorization required.' };
  }
  const token = parseAuthorizationToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 400, error: 'Invalid authorization.' };
  }
  return { ok: true, token };
}

/**
 * Create the class create/admin handler.
 *
 * POST creates a class and returns raw instructor + student-join capabilities
 * once. GET/PATCH/DELETE require the instructor capability.
 *
 * @param {object} [dependencies] - Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classHandler({
  getRepository = getClassroomRepository,
  tokenFactory = generateWorkspaceToken,
  idFactory = randomUUID
} = {}) {
  return async (req, res) => {
    if (!['POST', 'GET', 'PATCH', 'DELETE'].includes(req.method)) {
      return methodNotAllowed(res, 'POST, GET, PATCH, DELETE');
    }

    try {
      if (req.method === 'POST') {
        const title = normalizeClassroomLabel(req.body?.title, CLASS_TITLE_MAX_LENGTH);
        if (!title) return send(res, 400, { error: 'Invalid class title.' });

        const repository = await getRepository();
        const instructorToken = tokenFactory();
        const studentJoinToken = tokenFactory();
        const classroom = await repository.createClass({
          publicId: idFactory(),
          title,
          instructorHash: hashWorkspaceToken(instructorToken),
          studentJoinHash: hashWorkspaceToken(studentJoinToken),
          expiryDays: getClassExpiryDays()
        });
        return send(res, 201, { class: classroom, instructorToken, studentJoinToken });
      }

      const authorization = requireBearer(req);
      if (!authorization.ok) {
        return send(res, authorization.status, { error: authorization.error });
      }
      const instructorHash = hashWorkspaceToken(authorization.token);
      const repository = await getRepository();

      if (req.method === 'GET') {
        const classroom = await repository.getClassByInstructor(instructorHash);
        return classroom
          ? send(res, 200, { class: classroom })
          : send(res, 404, { error: 'Class not found.' });
      }

      if (req.method === 'DELETE') {
        const revoked = await repository.revokeClass(instructorHash);
        return revoked
          ? send(res, 200, { revoked: true, classId: revoked.id })
          : send(res, 404, { error: 'Class not found.' });
      }

      const action = req.body?.action;
      if (action === 'rotate-student-join') {
        const studentJoinToken = tokenFactory();
        const classroom = await repository.rotateStudentJoin(
          instructorHash,
          hashWorkspaceToken(studentJoinToken)
        );
        return classroom
          ? send(res, 200, { class: classroom, studentJoinToken })
          : send(res, 404, { error: 'Class not found.' });
      }
      if (action === 'rotate-instructor') {
        const instructorToken = tokenFactory();
        const classroom = await repository.rotateInstructor(
          instructorHash,
          hashWorkspaceToken(instructorToken)
        );
        return classroom
          ? send(res, 200, { class: classroom, instructorToken })
          : send(res, 404, { error: 'Class not found.' });
      }
      if (action === 'set-joins') {
        if (typeof req.body?.enabled !== 'boolean') {
          return send(res, 400, { error: 'Invalid join setting.' });
        }
        const classroom = await repository.setJoinsEnabled(instructorHash, req.body.enabled);
        return classroom
          ? send(res, 200, { class: classroom })
          : send(res, 404, { error: 'Class not found.' });
      }
      return send(res, 400, { error: 'Invalid class action.' });
    } catch {
      return send(res, 500, { error: 'Unable to access class.' });
    }
  };
}

/**
 * Create the instructor-only classroom workspace handler.
 *
 * @param {object} [dependencies] - Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classWorkspacesHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository,
  tokenFactory = generateWorkspaceToken,
  idFactory = randomUUID
} = {}) {
  return async (req, res) => {
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
      return methodNotAllowed(res, 'GET, POST, PATCH');
    }
    const authorization = requireBearer(req);
    if (!authorization.ok) {
      return send(res, authorization.status, { error: authorization.error });
    }

    const instructorHash = hashWorkspaceToken(authorization.token);

    try {
      const repository = await getRepository();

      if (req.method === 'GET') {
        const result = await repository.listWorkspaces(instructorHash);
        return result
          ? send(res, 200, { class: result.classroom, workspaces: result.workspaces })
          : send(res, 404, { error: 'Class not found.' });
      }

      if (req.method === 'PATCH') {
        const workspaceId = req.body?.workspaceId;
        if (!validateClassroomId(workspaceId)) {
          return send(res, 400, { error: 'Invalid workspace.' });
        }
        if (req.body?.action === 'rotate-assignment') {
          const assignmentToken = tokenFactory();
          const result = await repository.rotateWorkspaceClaim(
            instructorHash,
            workspaceId,
            hashWorkspaceToken(assignmentToken)
          );
          return result
            ? send(res, 200, { workspace: result.workspace, assignmentToken })
            : send(res, 404, { error: 'Workspace not found.' });
        }
        if (req.body?.action === 'revoke-assignment') {
          const result = await repository.revokeWorkspaceClaim(instructorHash, workspaceId);
          return result
            ? send(res, 200, { revoked: true, workspaceId: result.workspace.id })
            : send(res, 404, { error: 'Workspace not found.' });
        }
        return send(res, 400, { error: 'Invalid workspace action.' });
      }

      const kind = normalizeClassroomWorkspaceKind(req.body?.kind);
      const label = normalizeClassroomLabel(req.body?.label, CLASS_WORKSPACE_LABEL_MAX_LENGTH);
      const snapshot = req.body?.snapshot ?? {};
      const validation = validateSnapshot(snapshot);
      if (!kind || !label || !validation.ok) {
        return send(res, validation.status === 413 ? 413 : 400, {
          error: validation.status === 413 ? 'Snapshot is too large.' : 'Invalid workspace request.'
        });
      }

      const classroom = await repository.getClassByInstructor(instructorHash);
      if (!classroom) {
        return send(res, 404, { error: 'Class not found.' });
      }

      const workspaceRepository = await getWorkspaceRepo();
      const workspaceToken = tokenFactory();
      const assignmentToken = tokenFactory();
      const workspace = await workspaceRepository.createUntil(
        hashWorkspaceToken(workspaceToken),
        snapshot,
        classroom.expiresAt,
        label
      );
      const result = await repository.addWorkspace(instructorHash, {
        publicId: idFactory(),
        workspaceId: workspace.id,
        kind,
        label,
        claimHash: hashWorkspaceToken(assignmentToken)
      });
      if (!result) {
        return send(res, 404, { error: 'Class not found.' });
      }

      return send(res, 201, {
        workspace: {
          ...result.workspace,
          revision: workspace.revision,
          expiresAt: workspace.expires_at
        },
        assignmentToken
      });
    } catch {
      return send(res, 500, { error: 'Unable to access class workspaces.' });
    }
  };
}

/**
 * Create the student class-join handler.
 *
 * The shared class join capability never enumerates workspaces. A join succeeds
 * only when paired with a separate assignment capability for the same class.
 * The response issues a per-participant workspace capability that is accepted
 * by the existing collaboration session/presence endpoints.
 *
 * @param {object} [dependencies] - Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classJoinHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository,
  tokenFactory = generateWorkspaceToken
} = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return methodNotAllowed(res, 'POST');
    }
    const authorization = requireBearer(req);
    if (!authorization.ok) {
      return send(res, authorization.status, { error: authorization.error });
    }

    const participantId = req.body?.participantId;
    const displayName = normalizeCollaborationName(
      req.body?.displayName,
      DISPLAY_NAME_MAX_LENGTH
    );
    const assignmentToken = req.body?.assignmentToken;

    if (
      !validateParticipantId(participantId)
      || displayName === null
      || !validateToken(assignmentToken)
    ) {
      return send(res, 400, { error: 'Invalid class join request.' });
    }

    try {
      const repository = await getRepository();
      const workspaceRepository = await getWorkspaceRepo();
      const workspaceToken = tokenFactory();
      const result = await repository.joinWorkspace({
        studentJoinHash: hashWorkspaceToken(authorization.token),
        claimHash: hashWorkspaceToken(assignmentToken),
        participantId,
        accessHash: hashWorkspaceToken(workspaceToken),
        workspaceRepository
      });

      if (!result) {
        // Deliberately generic: do not reveal whether the class or assignment exists.
        return send(res, 404, { error: 'Class assignment not found.' });
      }

      const presence = await workspaceRepository.upsertPresence(
        hashWorkspaceToken(workspaceToken),
        participantId,
        displayName
      );
      if (!presence) {
        throw new Error('Joined classroom workspace could not register presence');
      }

      return send(res, 200, {
        class: {
          id: result.classroom.id,
          title: result.classroom.title,
          expiresAt: result.classroom.expiresAt
        },
        workspace: result.workspace,
        workspaceToken,
        ...presence
      });
    } catch {
      return send(res, 500, { error: 'Unable to join class workspace.' });
    }
  };
}
