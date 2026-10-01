/**
 * In-memory repositories used by classroom API authorization tests.
 *
 * They model the capability relationships only; no live Neon connection is used.
 */
import { hashWorkspaceToken } from '../../api/_workspace.js';

/** Build a minimal Vercel response double. @returns {object} Response double. */
export function response() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

/**
 * Return deterministic valid 43-character capability values.
 *
 * @param {string[]} values - Characters to repeat.
 * @returns {() => string} Token factory.
 */
export function tokenFactory(values) {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error('Test token sequence exhausted');
    return value.repeat(43);
  };
}

/** Create an in-memory collaboration workspace repository. @returns {object} Repository. */
export function createWorkspaceRepository() {
  let nextId = 1;
  const workspaces = new Map();
  const primaryByHash = new Map();
  const aliasByHash = new Map();
  const presenceByWorkspace = new Map();

  const resolve = hash => {
    const primaryId = primaryByHash.get(hash);
    if (primaryId) return workspaces.get(primaryId) || null;
    const alias = aliasByHash.get(hash);
    return alias && !alias.revoked ? workspaces.get(alias.workspaceId) || null : null;
  };

  return {
    workspaces,
    aliasByHash,
    async create(hash, snapshot, _days, teamName) {
      const workspace = {
        id: nextId++,
        snapshot,
        revision: 1,
        expires_at: 'future',
        team_name: teamName,
        teamName
      };
      workspaces.set(workspace.id, workspace);
      primaryByHash.set(hash, workspace.id);
      return workspace;
    },
    async createUntil(hash, snapshot, expiresAt, teamName) {
      const workspace = {
        id: nextId++,
        snapshot,
        revision: 1,
        expires_at: expiresAt,
        team_name: teamName,
        teamName
      };
      workspaces.set(workspace.id, workspace);
      primaryByHash.set(hash, workspace.id);
      return workspace;
    },
    async createCapability(workspaceId, hash, capabilityKind, expiresAt) {
      if (!workspaces.has(workspaceId)) return false;
      aliasByHash.set(hash, { workspaceId, capabilityKind, expiresAt, revoked: false });
      return true;
    },
    async revokeCapability(hash) {
      const alias = aliasByHash.get(hash);
      if (!alias || alias.revoked) return false;
      alias.revoked = true;
      return true;
    },
    async load(hash) {
      const workspace = resolve(hash);
      return workspace ? {
        snapshot: workspace.snapshot,
        revision: workspace.revision,
        expires_at: workspace.expires_at,
        team_name: workspace.team_name,
        teamName: workspace.teamName
      } : null;
    },
    async update(hash, snapshot, revision) {
      const workspace = resolve(hash);
      if (!workspace) return { status: 'missing' };
      if (workspace.revision !== revision) return { status: 'conflict', revision: workspace.revision };
      workspace.snapshot = snapshot;
      workspace.revision += 1;
      return { status: 'updated', workspace: { revision: workspace.revision, expires_at: workspace.expires_at } };
    },
    async upsertPresence(hash, participantId, displayName) {
      const workspace = resolve(hash);
      if (!workspace) return null;
      const resolvedName = displayName || 'Teammate 1';
      const participants = presenceByWorkspace.get(workspace.id) || [];
      const next = participants.filter(item => item.id !== participantId);
      next.push({
        id: participantId,
        displayName: resolvedName,
        activityState: 'active',
        editingField: '',
        editingRevision: workspace.revision,
        lastSeenAt: 'future',
        lastActiveAt: 'future',
        activitySequence: 0
      });
      presenceByWorkspace.set(workspace.id, next);
      return {
        teamName: workspace.teamName,
        self: { id: participantId, displayName: resolvedName },
        participants: next
      };
    },
    async observeById(workspaceId) {
      const workspace = workspaces.get(Number(workspaceId)) || workspaces.get(workspaceId);
      if (!workspace) return null;
      return {
        snapshot: workspace.snapshot,
        revision: workspace.revision,
        expiresAt: workspace.expires_at,
        updatedAt: 'future',
        teamName: workspace.teamName,
        participants: presenceByWorkspace.get(workspace.id) || []
      };
    }
  };
}

/** Create an in-memory classroom repository. @returns {object} Repository. */
export function createClassroomRepository() {
  let nextInternalId = 1;
  const classes = [];
  const workspaces = [];
  const memberships = new Map();

  const activeByInstructor = hash => classes.find(item => item.instructorHash === hash && !item.revoked) || null;
  const activeByJoin = hash => classes.find(item => item.studentJoinHash === hash && item.joinsEnabled && !item.revoked) || null;
  const publicClass = item => item ? {
    internal_id: item.internalId,
    id: item.id,
    title: item.title,
    joinsEnabled: item.joinsEnabled,
    expiresAt: item.expiresAt
  } : null;

  return {
    classes,
    workspaces,
    memberships,
    async createClass({ publicId, title, instructorHash, studentJoinHash }) {
      const item = {
        internalId: nextInternalId++,
        id: publicId,
        title,
        instructorHash,
        studentJoinHash,
        joinsEnabled: true,
        expiresAt: 'future',
        revoked: false
      };
      classes.push(item);
      return publicClass(item);
    },
    async getClassByInstructor(hash) {
      return publicClass(activeByInstructor(hash));
    },
    async rotateStudentJoin(instructorHash, nextHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      item.studentJoinHash = nextHash;
      return publicClass(item);
    },
    async rotateInstructor(instructorHash, nextHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      item.instructorHash = nextHash;
      return publicClass(item);
    },
    async setJoinsEnabled(instructorHash, enabled) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      item.joinsEnabled = enabled;
      return publicClass(item);
    },
    async revokeClass(instructorHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      item.revoked = true;
      item.joinsEnabled = false;
      return { id: item.id };
    },
    async addWorkspace(instructorHash, { publicId, workspaceId, kind, label, claimHash }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const workspace = {
        id: publicId,
        workspaceId,
        kind,
        label,
        claimHash,
        classInternalId: item.internalId,
        individualParticipantId: null,
        revoked: false,
        createdAt: new Date(0).toISOString()
      };
      workspaces.push(workspace);
      return {
        classroom: publicClass(item),
        workspace: { id: workspace.id, kind, label, createdAt: workspace.createdAt }
      };
    },
    async listWorkspaces(instructorHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      return {
        classroom: publicClass(item),
        workspaces: workspaces
          .filter(workspace => workspace.classInternalId === item.internalId && !workspace.revoked)
          .map(workspace => ({
            id: workspace.id,
            kind: workspace.kind,
            label: workspace.label,
            createdAt: workspace.createdAt,
            participantCount: [...memberships.values()].filter(member => (
              member.classInternalId === item.internalId && member.workspaceId === workspace.workspaceId
            )).length,
            activeParticipantCount: 0,
            editingParticipantCount: 0,
            lastSeenAt: null
          }))
      };
    },
    async getWorkspaceForObservation(instructorHash, workspacePublicId) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === workspacePublicId
        && !candidate.revoked
      ));
      return workspace ? {
        classroom: publicClass(item),
        workspace: {
          internalId: workspace.workspaceId,
          id: workspace.id,
          kind: workspace.kind,
          label: workspace.label
        }
      } : null;
    },
    async rotateWorkspaceClaim(instructorHash, workspacePublicId, nextHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId && candidate.id === workspacePublicId && !candidate.revoked
      ));
      if (!workspace) return null;
      workspace.claimHash = nextHash;
      return { classroom: publicClass(item), workspace: { id: workspace.id, kind: workspace.kind, label: workspace.label } };
    },
    async revokeWorkspaceClaim(instructorHash, workspacePublicId) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId && candidate.id === workspacePublicId && !candidate.revoked
      ));
      if (!workspace) return null;
      workspace.revoked = true;
      return { classroom: publicClass(item), workspace: { id: workspace.id, workspace_id: workspace.workspaceId } };
    },
    async joinWorkspace({ studentJoinHash, claimHash, participantId, accessHash, workspaceRepository }) {
      const item = activeByJoin(studentJoinHash);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId && candidate.claimHash === claimHash && !candidate.revoked
      ));
      if (!workspace) return null;
      if (workspace.kind === 'individual') {
        if (workspace.individualParticipantId && workspace.individualParticipantId !== participantId) return null;
        workspace.individualParticipantId = participantId;
      }

      const membershipKey = item.internalId + ':' + participantId;
      const previous = memberships.get(membershipKey);
      if (!await workspaceRepository.createCapability(
        workspace.workspaceId,
        accessHash,
        'classroom-student',
        item.expiresAt
      )) throw new Error('Unable to create capability');

      memberships.set(membershipKey, {
        classInternalId: item.internalId,
        workspaceId: workspace.workspaceId,
        participantId,
        accessHash
      });
      if (previous?.accessHash && previous.accessHash !== accessHash) {
        await workspaceRepository.revokeCapability(previous.accessHash);
      }
      return {
        classroom: publicClass(item),
        workspace: { id: workspace.id, kind: workspace.kind, label: workspace.label, expiresAt: item.expiresAt }
      };
    }
  };
}

/** Convenience for hashing a repeated test token. @param {string} character Token character. @returns {string} Hash. */
export function testTokenHash(character) {
  return hashWorkspaceToken(character.repeat(43));
}
