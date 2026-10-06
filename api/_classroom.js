/**
 * @module api/classroom
 * @description
 * Server-only classroom domain model, capability authorization, Neon persistence,
 * and injectable Vercel handlers. Classroom workspaces reference the existing
 * collaboration workspace engine; they never duplicate snapshot/revision state.
 */

import { randomInt, randomUUID } from 'node:crypto';
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
export const CLASS_JOIN_CODE_LENGTH = 8;
export const CLASS_JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEFAULT_CLASS_EXPIRY_DAYS = 30;
export const COACHING_STATUSES = Object.freeze(['meets-standard', 'needs-improvement']);
export const COACHING_NOTE_MAX_LENGTH = 2000;
export const COACHING_TARGET_ID_MAX_LENGTH = 160;
const COACHING_FINGERPRINT_PATTERN = /^v1-[0-9a-f]{16}$/u;
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
 * Normalize a human-facing live Classroom join code.
 *
 * Spaces and hyphens are presentation-only. Ambiguous characters such as
 * 0/O and 1/I are deliberately excluded from the accepted alphabet.
 *
 * @param {unknown} value - Candidate join code.
 * @returns {string|null} Canonical eight-character code or null.
 */
export function normalizeClassJoinCode(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().toUpperCase().replace(/[\s-]+/gu, '');
  if (compact.length !== CLASS_JOIN_CODE_LENGTH) return null;
  for (const character of compact) {
    if (!CLASS_JOIN_CODE_ALPHABET.includes(character)) return null;
  }
  return compact;
}

/**
 * Format a normalized join code for human display.
 *
 * @param {unknown} value - Candidate join code.
 * @returns {string|null} Grouped display form or null.
 */
export function formatClassJoinCode(value) {
  const normalized = normalizeClassJoinCode(value);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : null;
}

/**
 * Generate a random normalized human-facing Classroom join code.
 *
 * @returns {string} Eight-character unambiguous code.
 */
export function generateClassJoinCode() {
  let code = '';
  for (let index = 0; index < CLASS_JOIN_CODE_LENGTH; index += 1) {
    code += CLASS_JOIN_CODE_ALPHABET[randomInt(CLASS_JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalize a stable coaching target identifier.
 *
 * @param {unknown} value Candidate target identifier.
 * @returns {string|null} Canonical identifier or null.
 */
function isLowerAlphaNumeric(character) {
  if (!character || character.length !== 1) return false;
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

/**
 * Validate one dot-delimited coaching target segment in linear time.
 *
 * @param {string} segment Candidate segment.
 * @returns {boolean} Whether the segment uses the stable target grammar.
 */
function isCoachingTargetSegment(segment) {
  if (!segment || !isLowerAlphaNumeric(segment[0]) || !isLowerAlphaNumeric(segment.at(-1))) {
    return false;
  }
  for (let index = 1; index < segment.length - 1; index += 1) {
    const character = segment[index];
    if (character !== '-' && !isLowerAlphaNumeric(character)) return false;
  }
  return true;
}

export function normalizeCoachingTargetId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > COACHING_TARGET_ID_MAX_LENGTH) return null;
  const segments = normalized.split('.');
  return segments.every(isCoachingTargetSegment) ? normalized : null;
}

/**
 * Normalize an Instructor coaching status.
 *
 * @param {unknown} value Candidate status.
 * @returns {'meets-standard'|'needs-improvement'|null} Canonical status or null.
 */
export function normalizeCoachingStatus(value) {
  return typeof value === 'string' && COACHING_STATUSES.includes(value)
    ? /** @type {'meets-standard'|'needs-improvement'} */ (value)
    : null;
}

/**
 * Normalize an optional Instructor coaching note while preserving line breaks.
 *
 * @param {unknown} value Candidate note.
 * @returns {string|null} Trimmed note or null when invalid.
 */
export function normalizeCoachingNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length <= COACHING_NOTE_MAX_LENGTH ? normalized : null;
}

/**
 * Validate a client-computed field-evidence fingerprint.
 *
 * Fingerprints are change-detection evidence, not authentication material.
 *
 * @param {unknown} value Candidate fingerprint.
 * @returns {boolean} Whether the fingerprint matches the current versioned format.
 */
export function validateCoachingFingerprint(value) {
  return typeof value === 'string' && COACHING_FINGERPRINT_PATTERN.test(value);
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
  await sql`ALTER TABLE classroom_classes
    ADD COLUMN IF NOT EXISTS student_join_code VARCHAR(8)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS classroom_classes_student_join_code_idx
    ON classroom_classes (student_join_code)
    WHERE student_join_code IS NOT NULL`;

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
    revoked_at TIMESTAMPTZ,
    UNIQUE (class_id, workspace_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_workspaces_class_idx
    ON classroom_workspaces (class_id, created_at)`;

  await sql`CREATE TABLE IF NOT EXISTS classroom_participants (
    class_id BIGINT NOT NULL REFERENCES classroom_classes(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL,
    display_name VARCHAR(60) NOT NULL,
    session_token_hash CHAR(64) UNIQUE NOT NULL,
    workspace_id BIGINT,
    workspace_access_token_hash CHAR(64) UNIQUE,
    assignment_revision INTEGER NOT NULL DEFAULT 0 CHECK (assignment_revision >= 0),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (class_id, participant_id),
    FOREIGN KEY (class_id, workspace_id)
      REFERENCES classroom_workspaces(class_id, workspace_id)
      ON DELETE SET NULL (workspace_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_participants_class_idx
    ON classroom_participants (class_id, joined_at)`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_participants_workspace_idx
    ON classroom_participants (workspace_id)
    WHERE workspace_id IS NOT NULL`;

  await sql`CREATE TABLE IF NOT EXISTS classroom_memberships (
    class_id BIGINT NOT NULL,
    workspace_id BIGINT NOT NULL,
    participant_id UUID NOT NULL,
    access_token_hash CHAR(64) UNIQUE NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, participant_id),
    FOREIGN KEY (class_id, workspace_id)
      REFERENCES classroom_workspaces(class_id, workspace_id)
      ON DELETE CASCADE
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_memberships_workspace_idx
    ON classroom_memberships (workspace_id)`;

  await sql`CREATE TABLE IF NOT EXISTS classroom_coaching_feedback (
    class_id BIGINT NOT NULL,
    workspace_id BIGINT NOT NULL,
    target_id VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('meets-standard', 'needs-improvement')),
    note VARCHAR(2000) NOT NULL DEFAULT '',
    reviewed_workspace_revision INTEGER NOT NULL CHECK (reviewed_workspace_revision > 0),
    reviewed_field_fingerprint VARCHAR(32) NOT NULL,
    feedback_revision INTEGER NOT NULL DEFAULT 1 CHECK (feedback_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, workspace_id, target_id),
    FOREIGN KEY (class_id, workspace_id)
      REFERENCES classroom_workspaces(class_id, workspace_id)
      ON DELETE CASCADE
  )`;
  await sql`CREATE INDEX IF NOT EXISTS classroom_coaching_feedback_workspace_idx
    ON classroom_coaching_feedback (workspace_id, updated_at)`;

  async function classByInstructor(tokenHash) {
    const rows = await sql`SELECT id AS internal_id, public_id AS id, title,
        student_join_code AS "joinCode",
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

  async function classByJoinCode(joinCode) {
    const rows = await sql`SELECT id AS internal_id, public_id AS id, title,
        joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"
      FROM classroom_classes
      WHERE student_join_code = ${joinCode}
        AND joins_enabled = TRUE
        AND revoked_at IS NULL
        AND expires_at > NOW()`;
    return rows[0] || null;
  }

  return {
    async createClass({ publicId, title, instructorHash, studentJoinHash, studentJoinCode = null, expiryDays }) {
      const rows = await sql`INSERT INTO classroom_classes
        (public_id, title, instructor_token_hash, student_join_token_hash, student_join_code, expires_at)
        VALUES (
          ${publicId}::uuid,
          ${title},
          ${instructorHash},
          ${studentJoinHash},
          ${studentJoinCode},
          NOW() + (${expiryDays} * INTERVAL '1 day')
        )
        RETURNING public_id AS id, title, joins_enabled AS "joinsEnabled", expires_at AS "expiresAt"`;
      return rows[0];
    },

    async getClassByJoinCode(joinCode) {
      return classByJoinCode(joinCode);
    },

    async admitParticipant({ joinCode, participantId, displayName, sessionHash }) {
      const classroom = await classByJoinCode(joinCode);
      if (!classroom) return null;

      const rows = await sql`INSERT INTO classroom_participants
        (class_id, participant_id, display_name, session_token_hash)
        VALUES (
          ${classroom.internal_id},
          ${participantId}::uuid,
          ${displayName},
          ${sessionHash}
        )
        ON CONFLICT (class_id, participant_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            session_token_hash = EXCLUDED.session_token_hash,
            updated_at = NOW()
        WHERE classroom_participants.revoked_at IS NULL
        RETURNING
          participant_id AS id,
          display_name AS "displayName",
          workspace_id AS "workspaceInternalId",
          assignment_revision AS "assignmentRevision",
          joined_at AS "joinedAt",
          updated_at AS "updatedAt"`;
      const participant = rows[0];
      if (!participant) return null;

      let assignment = null;
      if (participant.workspaceInternalId) {
        const assignments = await sql`SELECT
            public_id AS id,
            workspace_kind AS kind,
            label
          FROM classroom_workspaces
          WHERE class_id = ${classroom.internal_id}
            AND workspace_id = ${participant.workspaceInternalId}
            AND revoked_at IS NULL`;
        assignment = assignments[0] || null;
      }

      return { classroom, participant, assignment };
    },

    async getParticipantBySession(sessionHash) {
      const rows = await sql`SELECT
          c.id AS "classInternalId",
          c.public_id AS "classId",
          c.title AS "classTitle",
          c.expires_at AS "classExpiresAt",
          cp.participant_id AS id,
          cp.display_name AS "displayName",
          cp.workspace_id AS "workspaceInternalId",
          cp.assignment_revision AS "assignmentRevision",
          cp.joined_at AS "joinedAt",
          cw.public_id AS "workspaceId",
          cw.workspace_kind AS "workspaceKind",
          cw.label AS "workspaceLabel"
        FROM classroom_participants cp
        JOIN classroom_classes c ON c.id = cp.class_id
        LEFT JOIN classroom_workspaces cw
          ON cw.class_id = cp.class_id
          AND cw.workspace_id = cp.workspace_id
          AND cw.revoked_at IS NULL
        WHERE cp.session_token_hash = ${sessionHash}
          AND cp.revoked_at IS NULL
          AND c.revoked_at IS NULL
          AND c.expires_at > NOW()`;
      const row = rows[0];
      if (!row) return null;
      return {
        classroom: { id: row.classId, title: row.classTitle, expiresAt: row.classExpiresAt },
        participant: {
          id: row.id,
          displayName: row.displayName,
          assignmentRevision: row.assignmentRevision,
          joinedAt: row.joinedAt
        },
        assignment: row.workspaceId
          ? { id: row.workspaceId, kind: row.workspaceKind, label: row.workspaceLabel }
          : null,
        internal: { classId: row.classInternalId, workspaceId: row.workspaceInternalId || null }
      };
    },

    async listParticipants(instructorHash) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const participants = await sql`SELECT
          cp.participant_id AS id,
          cp.display_name AS "displayName",
          cp.assignment_revision AS "assignmentRevision",
          cp.joined_at AS "joinedAt",
          cp.updated_at AS "updatedAt",
          cw.public_id AS "workspaceId",
          cw.workspace_kind AS "workspaceKind",
          cw.label AS "workspaceLabel"
        FROM classroom_participants cp
        LEFT JOIN classroom_workspaces cw
          ON cw.class_id = cp.class_id
          AND cw.workspace_id = cp.workspace_id
          AND cw.revoked_at IS NULL
        WHERE cp.class_id = ${classroom.internal_id}
          AND cp.revoked_at IS NULL
        ORDER BY cp.joined_at, cp.participant_id`;
      return {
        classroom,
        participants: participants.map(participant => ({
          id: participant.id,
          displayName: participant.displayName,
          assignmentRevision: participant.assignmentRevision,
          joinedAt: participant.joinedAt,
          updatedAt: participant.updatedAt,
          assignment: participant.workspaceId
            ? { id: participant.workspaceId, kind: participant.workspaceKind, label: participant.workspaceLabel }
            : null
        }))
      };
    },

    async assignParticipant(instructorHash, { participantId, workspacePublicId, workspaceRepository }) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;

      const participantRows = await sql`SELECT
          workspace_id AS "workspaceInternalId",
          workspace_access_token_hash AS "workspaceAccessHash",
          assignment_revision AS "assignmentRevision"
        FROM classroom_participants
        WHERE class_id = ${classroom.internal_id}
          AND participant_id = ${participantId}::uuid
          AND revoked_at IS NULL`;
      const participant = participantRows[0];
      if (!participant) return null;

      let destination = null;
      if (workspacePublicId !== null) {
        const destinationRows = await sql`SELECT
            cw.workspace_id AS "internalId",
            cw.public_id AS id,
            cw.workspace_kind AS kind,
            cw.label
          FROM classroom_workspaces cw
          JOIN collaboration_workspaces w ON w.id = cw.workspace_id
          WHERE cw.class_id = ${classroom.internal_id}
            AND cw.public_id = ${workspacePublicId}::uuid
            AND cw.revoked_at IS NULL
            AND w.expires_at > NOW()`;
        destination = destinationRows[0] || null;
        if (!destination) return null;

        if (destination.kind === 'individual') {
          const claimed = await sql`UPDATE classroom_workspaces
            SET individual_participant_id = COALESCE(individual_participant_id, ${participantId}::uuid),
                updated_at = NOW()
            WHERE class_id = ${classroom.internal_id}
              AND workspace_id = ${destination.internalId}
              AND (individual_participant_id IS NULL OR individual_participant_id = ${participantId}::uuid)
            RETURNING workspace_id`;
          if (!claimed[0]) {
            return { status: 'occupied', classroom };
          }
        }
      }

      const nextWorkspaceInternalId = destination?.internalId || null;
      if ((participant.workspaceInternalId || null) === nextWorkspaceInternalId) {
        return {
          status: 'unchanged',
          classroom,
          participant: {
            id: participantId,
            assignmentRevision: participant.assignmentRevision
          },
          assignment: destination
            ? { id: destination.id, kind: destination.kind, label: destination.label }
            : null
        };
      }

      if (participant.workspaceAccessHash) {
        await workspaceRepository.revokeCapability(participant.workspaceAccessHash);
      }
      if (participant.workspaceInternalId) {
        await workspaceRepository.removePresenceByWorkspaceId(participant.workspaceInternalId, participantId);
      }

      const updatedRows = await sql`UPDATE classroom_participants
        SET workspace_id = ${nextWorkspaceInternalId},
            workspace_access_token_hash = NULL,
            assignment_revision = assignment_revision + 1,
            assigned_at = CASE WHEN ${nextWorkspaceInternalId} IS NULL THEN NULL ELSE NOW() END,
            updated_at = NOW()
        WHERE class_id = ${classroom.internal_id}
          AND participant_id = ${participantId}::uuid
          AND assignment_revision = ${participant.assignmentRevision}
          AND revoked_at IS NULL
        RETURNING
          participant_id AS id,
          display_name AS "displayName",
          assignment_revision AS "assignmentRevision",
          joined_at AS "joinedAt",
          updated_at AS "updatedAt"`;
      const updated = updatedRows[0];

      if (!updated) {
        if (destination?.kind === 'individual') {
          const currentRows = await sql`SELECT workspace_id AS "workspaceInternalId"
            FROM classroom_participants
            WHERE class_id = ${classroom.internal_id}
              AND participant_id = ${participantId}::uuid
              AND revoked_at IS NULL`;
          if (currentRows[0]?.workspaceInternalId !== destination.internalId) {
            await sql`UPDATE classroom_workspaces
              SET individual_participant_id = NULL, updated_at = NOW()
              WHERE class_id = ${classroom.internal_id}
                AND workspace_id = ${destination.internalId}
                AND individual_participant_id = ${participantId}::uuid`;
          }
        }
        return { status: 'conflict', classroom };
      }

      if (participant.workspaceInternalId && participant.workspaceInternalId !== nextWorkspaceInternalId) {
        await sql`UPDATE classroom_workspaces
          SET individual_participant_id = NULL, updated_at = NOW()
          WHERE class_id = ${classroom.internal_id}
            AND workspace_id = ${participant.workspaceInternalId}
            AND workspace_kind = 'individual'
            AND individual_participant_id = ${participantId}::uuid`;
      }

      return {
        status: 'updated',
        classroom,
        participant: updated,
        assignment: destination
          ? { id: destination.id, kind: destination.kind, label: destination.label }
          : null
      };
    },

    async issueParticipantWorkspaceAccess({ sessionHash, accessHash, workspaceRepository }) {
      const context = await this.getParticipantBySession(sessionHash);
      if (!context) return null;
      if (!context.internal.workspaceId || !context.assignment) {
        return { ...context, waiting: true };
      }

      const assignments = await sql`SELECT
          cw.workspace_id AS "internalId",
          cw.public_id AS id,
          cw.workspace_kind AS kind,
          cw.label,
          w.expires_at AS "expiresAt"
        FROM classroom_workspaces cw
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        WHERE cw.class_id = ${context.internal.classId}
          AND cw.workspace_id = ${context.internal.workspaceId}
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()`;
      const assignment = assignments[0];
      if (!assignment) return null;

      const previousRows = await sql`SELECT workspace_access_token_hash AS "accessHash"
        FROM classroom_participants
        WHERE session_token_hash = ${sessionHash}
          AND revoked_at IS NULL`;
      const previousHash = previousRows[0]?.accessHash || null;

      const capabilityCreated = await workspaceRepository.createCapability(
        assignment.internalId,
        accessHash,
        CLASSROOM_STUDENT_CAPABILITY_KIND,
        context.classroom.expiresAt
      );
      if (!capabilityCreated) throw new Error('Unable to create live Student workspace capability');

      const updated = await sql`UPDATE classroom_participants
        SET workspace_access_token_hash = ${accessHash},
            updated_at = NOW()
        WHERE session_token_hash = ${sessionHash}
          AND class_id = ${context.internal.classId}
          AND workspace_id = ${context.internal.workspaceId}
          AND assignment_revision = ${context.participant.assignmentRevision}
          AND revoked_at IS NULL
        RETURNING participant_id`;
      if (!updated[0]) {
        await workspaceRepository.revokeCapability(accessHash);
        return null;
      }

      if (previousHash && previousHash !== accessHash) {
        await workspaceRepository.revokeCapability(previousHash);
      }

      return {
        classroom: context.classroom,
        participant: context.participant,
        assignment: {
          id: assignment.id,
          kind: assignment.kind,
          label: assignment.label,
          expiresAt: assignment.expiresAt
        },
        waiting: false
      };
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
          (
            COUNT(DISTINCT cm.participant_id)
            + COUNT(DISTINCT live_cp.participant_id)
          )::int AS "participantCount",
          COUNT(DISTINCT cp.participant_id) FILTER (
            WHERE cp.last_seen_at >= NOW() - 30 * INTERVAL '1 second'
          )::int AS "activeParticipantCount",
          COUNT(DISTINCT cp.participant_id) FILTER (
            WHERE cp.last_seen_at >= NOW() - 30 * INTERVAL '1 second'
              AND cp.activity_state = 'editing'
          )::int AS "editingParticipantCount",
          MAX(cp.last_seen_at) AS "lastSeenAt"
        FROM classroom_workspaces cw
        LEFT JOIN classroom_memberships cm ON cm.workspace_id = cw.workspace_id
        LEFT JOIN classroom_participants live_cp
          ON live_cp.class_id = cw.class_id
          AND live_cp.workspace_id = cw.workspace_id
          AND live_cp.revoked_at IS NULL
        LEFT JOIN collaboration_participants cp ON cp.workspace_id = cw.workspace_id
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        WHERE cw.class_id = ${classroom.internal_id}
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()
        GROUP BY cw.workspace_id, cw.public_id, cw.workspace_kind, cw.label, cw.created_at
        ORDER BY cw.created_at, cw.workspace_id`;
      return { classroom, workspaces: rows };
    },

    async getWorkspaceForObservation(instructorHash, workspacePublicId) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const rows = await sql`SELECT
          cw.workspace_id AS "internalId",
          cw.public_id AS id,
          cw.workspace_kind AS kind,
          cw.label
        FROM classroom_workspaces cw
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        WHERE cw.class_id = ${classroom.internal_id}
          AND cw.public_id = ${workspacePublicId}::uuid
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()`;
      return rows[0] ? { classroom, workspace: rows[0] } : null;
    },

    async listFeedbackForInstructor(instructorHash, workspacePublicId) {
      const classroom = await classByInstructor(instructorHash);
      if (!classroom) return null;
      const workspaces = await sql`SELECT
          workspace_id AS "internalId",
          public_id AS id,
          workspace_kind AS kind,
          label
        FROM classroom_workspaces
        WHERE class_id = ${classroom.internal_id}
          AND public_id = ${workspacePublicId}::uuid
          AND revoked_at IS NULL`;
      const workspace = workspaces[0];
      if (!workspace) return null;
      const feedback = await sql`SELECT
          target_id AS "targetId",
          status,
          note,
          reviewed_workspace_revision AS "reviewedWorkspaceRevision",
          reviewed_field_fingerprint AS "reviewedFieldFingerprint",
          feedback_revision AS "feedbackRevision",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM classroom_coaching_feedback
        WHERE class_id = ${classroom.internal_id}
          AND workspace_id = ${workspace.internalId}
        ORDER BY target_id`;
      return { classroom, workspace, feedback };
    },

    async upsertFeedback(instructorHash, workspacePublicId, feedbackInput) {
      const target = await this.getWorkspaceForObservation(instructorHash, workspacePublicId);
      if (!target) return null;
      const rows = await sql`INSERT INTO classroom_coaching_feedback
        (
          class_id, workspace_id, target_id, status, note,
          reviewed_workspace_revision, reviewed_field_fingerprint
        )
        VALUES (
          ${target.classroom.internal_id},
          ${target.workspace.internalId},
          ${feedbackInput.targetId},
          ${feedbackInput.status},
          ${feedbackInput.note},
          ${feedbackInput.reviewedWorkspaceRevision},
          ${feedbackInput.reviewedFieldFingerprint}
        )
        ON CONFLICT (class_id, workspace_id, target_id) DO UPDATE
        SET status = EXCLUDED.status,
            note = EXCLUDED.note,
            reviewed_workspace_revision = EXCLUDED.reviewed_workspace_revision,
            reviewed_field_fingerprint = EXCLUDED.reviewed_field_fingerprint,
            feedback_revision = classroom_coaching_feedback.feedback_revision + 1,
            updated_at = NOW()
        RETURNING
          target_id AS "targetId",
          status,
          note,
          reviewed_workspace_revision AS "reviewedWorkspaceRevision",
          reviewed_field_fingerprint AS "reviewedFieldFingerprint",
          feedback_revision AS "feedbackRevision",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`;
      return { classroom: target.classroom, workspace: target.workspace, feedback: rows[0] };
    },

    async deleteFeedback(instructorHash, workspacePublicId, targetId) {
      const target = await this.getWorkspaceForObservation(instructorHash, workspacePublicId);
      if (!target) return null;
      const rows = await sql`DELETE FROM classroom_coaching_feedback
        WHERE class_id = ${target.classroom.internal_id}
          AND workspace_id = ${target.workspace.internalId}
          AND target_id = ${targetId}
        RETURNING target_id AS "targetId"`;
      return {
        classroom: target.classroom,
        workspace: target.workspace,
        cleared: Boolean(rows[0]),
        targetId
      };
    },

    async getStudentContext(accessHash) {
      const liveRows = await sql`SELECT
          c.id AS "classInternalId",
          c.public_id AS "classId",
          c.title AS "classTitle",
          c.expires_at AS "classExpiresAt",
          cw.workspace_id AS "workspaceInternalId",
          cw.public_id AS "workspaceId",
          cw.workspace_kind AS "workspaceKind",
          cw.label AS "workspaceLabel"
        FROM classroom_participants cp
        JOIN classroom_classes c ON c.id = cp.class_id
        JOIN classroom_workspaces cw
          ON cw.class_id = cp.class_id AND cw.workspace_id = cp.workspace_id
        JOIN collaboration_workspaces w ON w.id = cw.workspace_id
        JOIN collaboration_workspace_capabilities cap
          ON cap.token_hash = cp.workspace_access_token_hash
          AND cap.workspace_id = cw.workspace_id
          AND cap.capability_kind = ${CLASSROOM_STUDENT_CAPABILITY_KIND}
          AND cap.revoked_at IS NULL
          AND (cap.expires_at IS NULL OR cap.expires_at > NOW())
        WHERE cp.workspace_access_token_hash = ${accessHash}
          AND cp.revoked_at IS NULL
          AND c.revoked_at IS NULL
          AND c.expires_at > NOW()
          AND cw.revoked_at IS NULL
          AND w.expires_at > NOW()`;
      let scope = liveRows[0];

      if (!scope) {
        const legacyRows = await sql`SELECT
            c.id AS "classInternalId",
            c.public_id AS "classId",
            c.title AS "classTitle",
            c.expires_at AS "classExpiresAt",
            cw.workspace_id AS "workspaceInternalId",
            cw.public_id AS "workspaceId",
            cw.workspace_kind AS "workspaceKind",
            cw.label AS "workspaceLabel"
          FROM classroom_memberships cm
          JOIN classroom_classes c ON c.id = cm.class_id
          JOIN classroom_workspaces cw
            ON cw.class_id = cm.class_id AND cw.workspace_id = cm.workspace_id
          JOIN collaboration_workspaces w ON w.id = cw.workspace_id
          WHERE cm.access_token_hash = ${accessHash}
            AND c.revoked_at IS NULL
            AND c.expires_at > NOW()
            AND cw.revoked_at IS NULL
            AND w.expires_at > NOW()`;
        scope = legacyRows[0];
      }

      if (!scope) return null;
      return {
        classroom: { id: scope.classId, title: scope.classTitle, expiresAt: scope.classExpiresAt },
        workspace: { id: scope.workspaceId, kind: scope.workspaceKind, label: scope.workspaceLabel },
        internal: { classId: scope.classInternalId, workspaceId: scope.workspaceInternalId }
      };
    },

    async listFeedbackForStudent(accessHash) {
      const scope = await this.getStudentContext(accessHash);
      if (!scope) return null;
      const feedback = await sql`SELECT
          target_id AS "targetId",
          status,
          note,
          reviewed_workspace_revision AS "reviewedWorkspaceRevision",
          reviewed_field_fingerprint AS "reviewedFieldFingerprint",
          feedback_revision AS "feedbackRevision",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM classroom_coaching_feedback
        WHERE class_id = ${scope.internal.classId}
          AND workspace_id = ${scope.internal.workspaceId}
        ORDER BY target_id`;
      return {
        classroom: scope.classroom,
        workspace: scope.workspace,
        feedback
      };
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
  joinCodeFactory = generateClassJoinCode,
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
        const joinCode = normalizeClassJoinCode(joinCodeFactory());
        if (!joinCode) throw new Error('Join-code generator returned an invalid code');
        const classroom = await repository.createClass({
          publicId: idFactory(),
          title,
          instructorHash: hashWorkspaceToken(instructorToken),
          studentJoinHash: hashWorkspaceToken(studentJoinToken),
          studentJoinCode: joinCode,
          expiryDays: getClassExpiryDays()
        });
        return send(res, 201, {
          class: classroom,
          instructorToken,
          studentJoinToken,
          joinCode: formatClassJoinCode(joinCode)
        });
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
          ? send(res, 200, {
              class: classroom,
              joinCode: formatClassJoinCode(classroom.joinCode)
            })
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
 * Create the Instructor-only, read-only live observation handler.
 *
 * The Instructor class capability authorizes exactly one class. The public
 * classroom workspace ID selects a workspace inside that class; the handler
 * then resolves the internal collaboration workspace ID server-side and reads
 * snapshot/presence without ever minting or accepting an editable Student
 * workspace capability.
 *
 * @param {object} [dependencies] - Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classObserveHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository
} = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') {
      return methodNotAllowed(res, 'GET');
    }
    const authorization = requireBearer(req);
    if (!authorization.ok) {
      return send(res, authorization.status, { error: authorization.error });
    }

    const workspaceId = Array.isArray(req.query?.workspaceId)
      ? null
      : req.query?.workspaceId;
    if (!validateClassroomId(workspaceId)) {
      return send(res, 400, { error: 'Invalid workspace.' });
    }

    try {
      const repository = await getRepository();
      const instructorHash = hashWorkspaceToken(authorization.token);
      const target = await repository.getWorkspaceForObservation(instructorHash, workspaceId);
      if (!target) {
        return send(res, 404, { error: 'Workspace not found.' });
      }

      const workspaceRepository = await getWorkspaceRepo();
      const observation = await workspaceRepository.observeById(target.workspace.internalId);
      if (!observation) {
        return send(res, 404, { error: 'Workspace not found.' });
      }

      return send(res, 200, {
        class: {
          id: target.classroom.id,
          title: target.classroom.title,
          expiresAt: target.classroom.expiresAt
        },
        workspace: {
          id: target.workspace.id,
          kind: target.workspace.kind,
          label: target.workspace.label,
          teamName: observation.teamName,
          revision: observation.revision,
          expiresAt: observation.expiresAt,
          updatedAt: observation.updatedAt
        },
        participants: observation.participants,
        snapshot: observation.snapshot
      });
    } catch {
      return send(res, 500, { error: 'Unable to observe class workspace.' });
    }
  };
}

/**
 * Create the Instructor coaching handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classCoachingHandler({ getRepository = getClassroomRepository } = {}) {
  return async (req, res) => {
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return methodNotAllowed(res, 'GET, PUT, DELETE');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });

    const workspaceId = Array.isArray(req.query?.workspaceId)
      ? null
      : (req.query?.workspaceId || req.body?.workspaceId);
    if (!validateClassroomId(workspaceId)) return send(res, 400, { error: 'Invalid workspace.' });

    const instructorHash = hashWorkspaceToken(authorization.token);
    try {
      const repository = await getRepository();
      if (req.method === 'GET') {
        const result = await repository.listFeedbackForInstructor(instructorHash, workspaceId);
        return result
          ? send(res, 200, {
              class: { id: result.classroom.id, title: result.classroom.title, expiresAt: result.classroom.expiresAt },
              workspace: { id: result.workspace.id, kind: result.workspace.kind, label: result.workspace.label },
              feedback: result.feedback
            })
          : send(res, 404, { error: 'Workspace not found.' });
      }

      const targetId = normalizeCoachingTargetId(req.body?.targetId);
      if (!targetId) return send(res, 400, { error: 'Invalid coaching target.' });

      if (req.method === 'DELETE') {
        const result = await repository.deleteFeedback(instructorHash, workspaceId, targetId);
        return result
          ? send(res, 200, { cleared: result.cleared, targetId: result.targetId })
          : send(res, 404, { error: 'Workspace not found.' });
      }

      const status = normalizeCoachingStatus(req.body?.status);
      const note = normalizeCoachingNote(req.body?.note);
      const reviewedWorkspaceRevision = Number(req.body?.reviewedWorkspaceRevision);
      const reviewedFieldFingerprint = req.body?.reviewedFieldFingerprint;
      if (!status || note === null || !Number.isInteger(reviewedWorkspaceRevision) || reviewedWorkspaceRevision < 1
        || !validateCoachingFingerprint(reviewedFieldFingerprint)) {
        return send(res, 400, { error: 'Invalid coaching feedback.' });
      }

      const result = await repository.upsertFeedback(instructorHash, workspaceId, {
        targetId, status, note, reviewedWorkspaceRevision, reviewedFieldFingerprint
      });
      return result
        ? send(res, 200, {
            class: { id: result.classroom.id, title: result.classroom.title, expiresAt: result.classroom.expiresAt },
            workspace: { id: result.workspace.id, kind: result.workspace.kind, label: result.workspace.label },
            feedback: result.feedback
          })
        : send(res, 404, { error: 'Workspace not found.' });
    } catch {
      return send(res, 500, { error: 'Unable to update coaching feedback.' });
    }
  };
}

/**
 * Create the Student read-only coaching handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classStudentCoachingHandler({ getRepository = getClassroomRepository } = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });
    try {
      const repository = await getRepository();
      const result = await repository.listFeedbackForStudent(hashWorkspaceToken(authorization.token));
      return result
        ? send(res, 200, { class: result.classroom, workspace: result.workspace, feedback: result.feedback })
        : send(res, 404, { error: 'Class feedback not found.' });
    } catch {
      return send(res, 500, { error: 'Unable to load coaching feedback.' });
    }
  };
}
/**
 * Create the one-code live Student admission handler.
 *
 * The human join code is only an admission locator. Successful admission mints
 * a high-entropy Student class-session capability that cannot edit collaboration
 * directly and may represent a waiting/unassigned Student.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classAdmitHandler({
  getRepository = getClassroomRepository,
  tokenFactory = generateWorkspaceToken
} = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

    const joinCode = normalizeClassJoinCode(req.body?.joinCode);
    const participantId = req.body?.participantId;
    const displayName = normalizeCollaborationName(req.body?.displayName, DISPLAY_NAME_MAX_LENGTH);
    if (!joinCode || !validateParticipantId(participantId) || displayName === null) {
      return send(res, 400, { error: 'Invalid class admission request.' });
    }

    try {
      const repository = await getRepository();
      const studentSessionToken = tokenFactory();
      const result = await repository.admitParticipant({
        joinCode,
        participantId,
        displayName,
        sessionHash: hashWorkspaceToken(studentSessionToken)
      });
      if (!result) {
        return send(res, 404, { error: 'Class not available.' });
      }
      return send(res, 200, {
        class: {
          id: result.classroom.id,
          title: result.classroom.title,
          expiresAt: result.classroom.expiresAt
        },
        participant: result.participant,
        assignment: result.assignment,
        studentSessionToken
      });
    } catch {
      return send(res, 500, { error: 'Unable to enter class.' });
    }
  };
}

/**
 * Create the Instructor-only live participant roster handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classParticipantsHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository
} = {}) {
  return async (req, res) => {
    if (!['GET', 'PATCH'].includes(req.method)) return methodNotAllowed(res, 'GET, PATCH');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });

    const instructorHash = hashWorkspaceToken(authorization.token);

    try {
      const repository = await getRepository();
      if (req.method === 'GET') {
        const result = await repository.listParticipants(instructorHash);
        return result
          ? send(res, 200, { class: result.classroom, participants: result.participants })
          : send(res, 404, { error: 'Class not found.' });
      }

      const participantId = req.body?.participantId;
      const workspaceId = req.body?.workspaceId ?? null;
      if (!validateParticipantId(participantId)
        || (workspaceId !== null && !validateClassroomId(workspaceId))) {
        return send(res, 400, { error: 'Invalid participant assignment.' });
      }

      const workspaceRepository = await getWorkspaceRepo();
      const result = await repository.assignParticipant(instructorHash, {
        participantId,
        workspacePublicId: workspaceId,
        workspaceRepository
      });
      if (!result) {
        return send(res, 404, { error: 'Participant or workspace not found.' });
      }
      if (result.status === 'occupied') {
        return send(res, 409, { error: 'Individual workspace is already assigned.' });
      }
      if (result.status === 'conflict') {
        return send(res, 409, { error: 'Participant assignment changed. Retry.' });
      }
      return send(res, 200, {
        class: result.classroom,
        participant: result.participant,
        assignment: result.assignment,
        changed: result.status === 'updated'
      });
    } catch {
      return send(res, 500, { error: 'Unable to update class participant.' });
    }
  };
}

/**
 * Create the Student own-assignment status handler.
 *
 * A Student class-session capability resolves only the represented participant.
 * It never returns a class roster, workspace catalog, or editable capability.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classStudentHandler({ getRepository = getClassroomRepository } = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });

    try {
      const repository = await getRepository();
      const result = await repository.getParticipantBySession(hashWorkspaceToken(authorization.token));
      return result
        ? send(res, 200, {
            class: result.classroom,
            participant: result.participant,
            assignment: result.assignment
          })
        : send(res, 404, { error: 'Student class session not found.' });
    } catch {
      return send(res, 500, { error: 'Unable to load Student class status.' });
    }
  };
}

/**
 * Create the Student current-workspace access handler.
 *
 * The stable Student class-session capability is exchanged for a fresh
 * assignment-specific edit capability only while the represented participant is
 * currently assigned to a live workspace.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classStudentAccessHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository,
  tokenFactory = generateWorkspaceToken
} = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });

    try {
      const repository = await getRepository();
      const workspaceRepository = await getWorkspaceRepo();
      const workspaceToken = tokenFactory();
      const result = await repository.issueParticipantWorkspaceAccess({
        sessionHash: hashWorkspaceToken(authorization.token),
        accessHash: hashWorkspaceToken(workspaceToken),
        workspaceRepository
      });
      if (!result) {
        return send(res, 404, { error: 'Student class session not found.' });
      }
      if (result.waiting) {
        return send(res, 409, {
          status: 'waiting',
          class: result.classroom,
          participant: result.participant,
          assignment: null
        });
      }
      return send(res, 200, {
        class: result.classroom,
        participant: result.participant,
        assignment: result.assignment,
        workspaceToken
      });
    } catch {
      return send(res, 500, { error: 'Unable to issue Student workspace access.' });
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
