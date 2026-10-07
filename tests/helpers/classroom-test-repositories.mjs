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
    async getCapabilityKind(hash) {
      const alias = aliasByHash.get(hash);
      return alias && !alias.revoked ? alias.capabilityKind : null;
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
    async updateClassroomStudent(hash, snapshot, revision, writePolicy = null) {
      if (writePolicy?.allowed === false) {
        const workspace = resolve(hash);
        return workspace
          ? { status: 'locked', revision: workspace.revision, exercise: writePolicy.exercise || null }
          : { status: 'missing' };
      }
      return this.update(hash, snapshot, revision);
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
    async removePresenceByWorkspaceId(workspaceId, participantId) {
      const workspace = workspaces.get(Number(workspaceId)) || workspaces.get(workspaceId);
      if (!workspace) return false;
      const participants = presenceByWorkspace.get(workspace.id) || [];
      const next = participants.filter(item => item.id !== participantId);
      presenceByWorkspace.set(workspace.id, next);
      return next.length !== participants.length;
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
  let nextExerciseInternalId = 1;
  const classes = [];
  const workspaces = [];
  const memberships = new Map();
  const participants = new Map();
  const coaching = new Map();
  const exercises = [];
  const exerciseReleases = new Map();
  const exerciseWorkspaceState = new Map();
  const exerciseCheckpoints = new Map();

  const activeByInstructor = hash => classes.find(item => item.instructorHash === hash && !item.revoked) || null;
  const activeByJoin = hash => classes.find(item => item.studentJoinHash === hash && item.joinsEnabled && !item.revoked) || null;
  const activeByJoinCode = joinCode => classes.find(item => (
    item.studentJoinCode === joinCode && item.joinsEnabled && !item.revoked
  )) || null;
  const publicClass = item => item ? {
    internal_id: item.internalId,
    id: item.id,
    title: item.title,
    joinsEnabled: item.joinsEnabled,
    expiresAt: item.expiresAt,
    joinCode: item.studentJoinCode || null
  } : null;
  const publicExercise = exercise => exercise ? {
    id: exercise.id,
    caseStudyId: exercise.caseStudyId,
    simulationVersion: exercise.simulationVersion,
    simulationFingerprint: exercise.simulationFingerprint,
    status: exercise.status,
    currentStageId: exercise.currentStageId,
    stagePhase: exercise.stagePhase,
    exerciseRevision: exercise.exerciseRevision,
    studentEditingEnabled: exercise.studentEditingEnabled,
    startedAt: exercise.startedAt,
    completedAt: exercise.completedAt,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
    expiresAt: exercise.expiresAt
  } : null;
  const cloneValue = value => value == null ? value : JSON.parse(JSON.stringify(value));

  return {
    classes,
    workspaces,
    memberships,
    participants,
    coaching,
    exercises,
    exerciseReleases,
    exerciseWorkspaceState,
    exerciseCheckpoints,
    async createClass({ publicId, title, instructorHash, studentJoinHash, studentJoinCode = null }) {
      const item = {
        internalId: nextInternalId++,
        id: publicId,
        title,
        instructorHash,
        studentJoinHash,
        studentJoinCode,
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
    async getClassByJoinCode(joinCode) {
      return publicClass(activeByJoinCode(joinCode));
    },
    async admitParticipant({ joinCode, participantId, displayName, sessionHash }) {
      const item = activeByJoinCode(joinCode);
      if (!item) return null;
      const key = item.internalId + ':' + participantId;
      const previous = participants.get(key);
      if (previous?.revoked) return null;
      const participant = {
        classInternalId: item.internalId,
        participantId,
        displayName,
        sessionHash,
        workspaceId: previous?.workspaceId || null,
        workspaceAccessHash: previous?.workspaceAccessHash || null,
        assignmentRevision: previous?.assignmentRevision || 0,
        joinedAt: previous?.joinedAt || 'joined',
        updatedAt: 'updated',
        revoked: false
      };
      participants.set(key, participant);
      const assignment = participant.workspaceId
        ? workspaces.find(workspace => (
            workspace.classInternalId === item.internalId
            && workspace.workspaceId === participant.workspaceId
            && !workspace.revoked
          ))
        : null;
      return {
        classroom: publicClass(item),
        participant: {
          id: participant.participantId,
          displayName: participant.displayName,
          assignmentRevision: participant.assignmentRevision,
          joinedAt: participant.joinedAt,
          updatedAt: participant.updatedAt
        },
        assignment: assignment
          ? { id: assignment.id, kind: assignment.kind, label: assignment.label }
          : null
      };
    },
    async getParticipantBySession(sessionHash) {
      const participant = [...participants.values()].find(value => value.sessionHash === sessionHash && !value.revoked);
      if (!participant) return null;
      const item = classes.find(candidate => candidate.internalId === participant.classInternalId && !candidate.revoked);
      if (!item) return null;
      const assignment = participant.workspaceId
        ? workspaces.find(workspace => (
            workspace.classInternalId === item.internalId
            && workspace.workspaceId === participant.workspaceId
            && !workspace.revoked
          ))
        : null;
      return {
        classroom: publicClass(item),
        participant: {
          id: participant.participantId,
          displayName: participant.displayName,
          assignmentRevision: participant.assignmentRevision,
          joinedAt: participant.joinedAt
        },
        assignment: assignment
          ? { id: assignment.id, kind: assignment.kind, label: assignment.label }
          : null,
        internal: { classId: item.internalId, workspaceId: participant.workspaceId || null }
      };
    },
    async listParticipants(instructorHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      return {
        classroom: publicClass(item),
        participants: [...participants.values()]
          .filter(participant => participant.classInternalId === item.internalId && !participant.revoked)
          .map(participant => {
            const assignment = participant.workspaceId
              ? workspaces.find(workspace => (
                  workspace.classInternalId === item.internalId
                  && workspace.workspaceId === participant.workspaceId
                  && !workspace.revoked
                ))
              : null;
            return {
              id: participant.participantId,
              displayName: participant.displayName,
              assignmentRevision: participant.assignmentRevision,
              joinedAt: participant.joinedAt,
              updatedAt: participant.updatedAt,
              assignment: assignment
                ? { id: assignment.id, kind: assignment.kind, label: assignment.label }
                : null
            };
          })
      };
    },
    async assignParticipant(instructorHash, { participantId, workspacePublicId, workspaceRepository }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const participant = participants.get(item.internalId + ':' + participantId);
      if (!participant || participant.revoked) return null;

      const destination = workspacePublicId === null
        ? null
        : workspaces.find(candidate => (
            candidate.classInternalId === item.internalId
            && candidate.id === workspacePublicId
            && !candidate.revoked
          ));
      if (workspacePublicId !== null && !destination) return null;

      if (destination?.kind === 'individual') {
        if (destination.individualParticipantId && destination.individualParticipantId !== participantId) {
          return { status: 'occupied', classroom: publicClass(item) };
        }
        destination.individualParticipantId = participantId;
      }

      const nextWorkspaceId = destination?.workspaceId || null;
      if ((participant.workspaceId || null) === nextWorkspaceId) {
        return {
          status: 'unchanged',
          classroom: publicClass(item),
          participant: {
            id: participant.participantId,
            displayName: participant.displayName,
            assignmentRevision: participant.assignmentRevision,
            joinedAt: participant.joinedAt,
            updatedAt: participant.updatedAt
          },
          assignment: destination
            ? { id: destination.id, kind: destination.kind, label: destination.label }
            : null
        };
      }

      const previousWorkspaceId = participant.workspaceId;
      if (participant.workspaceAccessHash) {
        await workspaceRepository.revokeCapability(participant.workspaceAccessHash);
      }
      if (previousWorkspaceId) {
        await workspaceRepository.removePresenceByWorkspaceId(previousWorkspaceId, participantId);
      }

      const previousWorkspace = previousWorkspaceId
        ? workspaces.find(candidate => (
            candidate.classInternalId === item.internalId
            && candidate.workspaceId === previousWorkspaceId
          ))
        : null;

      participant.workspaceId = nextWorkspaceId;
      participant.workspaceAccessHash = null;
      participant.assignmentRevision += 1;
      participant.updatedAt = 'updated';

      if (previousWorkspace?.kind === 'individual'
        && previousWorkspace.workspaceId !== nextWorkspaceId
        && previousWorkspace.individualParticipantId === participantId) {
        previousWorkspace.individualParticipantId = null;
      }

      return {
        status: 'updated',
        classroom: publicClass(item),
        participant: {
          id: participant.participantId,
          displayName: participant.displayName,
          assignmentRevision: participant.assignmentRevision,
          joinedAt: participant.joinedAt,
          updatedAt: participant.updatedAt
        },
        assignment: destination
          ? { id: destination.id, kind: destination.kind, label: destination.label }
          : null
      };
    },
    async issueParticipantWorkspaceAccess({ sessionHash, accessHash, workspaceRepository }) {
      const participant = [...participants.values()].find(value => value.sessionHash === sessionHash && !value.revoked);
      if (!participant) return null;
      const item = classes.find(candidate => candidate.internalId === participant.classInternalId && !candidate.revoked);
      if (!item) return null;
      if (!participant.workspaceId) {
        return {
          classroom: publicClass(item),
          participant: {
            id: participant.participantId,
            displayName: participant.displayName,
            assignmentRevision: participant.assignmentRevision,
            joinedAt: participant.joinedAt
          },
          assignment: null,
          internal: { classId: item.internalId, workspaceId: null },
          waiting: true
        };
      }
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.workspaceId === participant.workspaceId
        && !candidate.revoked
      ));
      if (!workspace) return null;

      if (!await workspaceRepository.createCapability(
        workspace.workspaceId,
        accessHash,
        'classroom-student',
        item.expiresAt
      )) throw new Error('Unable to create live capability');

      const previous = participant.workspaceAccessHash;
      participant.workspaceAccessHash = accessHash;
      participant.updatedAt = 'updated';
      if (previous && previous !== accessHash) {
        await workspaceRepository.revokeCapability(previous);
      }

      return {
        classroom: publicClass(item),
        participant: {
          id: participant.participantId,
          displayName: participant.displayName,
          assignmentRevision: participant.assignmentRevision,
          joinedAt: participant.joinedAt
        },
        assignment: {
          id: workspace.id,
          kind: workspace.kind,
          label: workspace.label,
          expiresAt: item.expiresAt
        },
        internal: { classId: item.internalId, workspaceId: workspace.workspaceId },
        waiting: false
      };
    },
    async createExercise(instructorHash, {
      publicId,
      caseStudyId,
      simulationVersion,
      simulationFingerprint
    }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const existing = exercises.find(exercise => (
        exercise.classInternalId === item.internalId
        && exercise.status !== 'completed'
      ));
      if (existing) {
        return {
          status: 'exists',
          classroom: publicClass(item),
          exercise: publicExercise(existing)
        };
      }
      if (exercises.some(exercise => exercise.id === publicId)) return null;

      const exercise = {
        internalId: nextExerciseInternalId++,
        id: publicId,
        classInternalId: item.internalId,
        caseStudyId,
        simulationVersion,
        simulationFingerprint,
        status: 'draft',
        currentStageId: null,
        stagePhase: 'work',
        exerciseRevision: 1,
        studentEditingEnabled: true,
        startedAt: null,
        completedAt: null,
        createdAt: 'created',
        updatedAt: 'created',
        expiresAt: item.expiresAt
      };
      exercises.push(exercise);
      return {
        status: 'created',
        classroom: publicClass(item),
        exercise: publicExercise(exercise)
      };
    },
    async getCurrentExerciseForInstructor(instructorHash) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.status !== 'completed'
      ));
      return exercise
        ? { classroom: publicClass(item), exercise: publicExercise(exercise) }
        : null;
    },
    async getExerciseForInstructor(instructorHash, exercisePublicId) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === exercisePublicId
      ));
      return exercise
        ? { classroom: publicClass(item), exercise: publicExercise(exercise) }
        : null;
    },
    async getCurrentExerciseByClassInternalId(classInternalId) {
      const item = classes.find(candidate => candidate.internalId === Number(classInternalId) && !candidate.revoked);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.status !== 'completed'
      ));
      return publicExercise(exercise);
    },
    async hasExerciseForClassCase(classInternalId, caseStudyId) {
      const item = classes.find(candidate => candidate.internalId === Number(classInternalId) && !candidate.revoked);
      if (!item) return false;
      return exercises.some(exercise => (
        exercise.classInternalId === item.internalId
        && exercise.caseStudyId === caseStudyId
      ));
    },
    async getExerciseForStudentSession(sessionHash) {
      const context = await this.getParticipantBySession(sessionHash);
      if (!context) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === context.internal.classId
        && candidate.status !== 'completed'
      ));
      if (!exercise) return { ...context, exercise: null, releases: [], readiness: null };

      const releasePrefix = exercise.internalId + ':';
      const releases = [...exerciseReleases.entries()]
        .filter(([key]) => key.startsWith(releasePrefix))
        .map(([, value]) => ({ ...value }))
        .sort((a, b) => (
          a.releasedAt.localeCompare(b.releasedAt)
          || a.stageId.localeCompare(b.stageId)
          || a.contentId.localeCompare(b.contentId)
        ));

      let readiness = null;
      if (context.internal.workspaceId && exercise.currentStageId) {
        const key = exercise.internalId + ':' + context.internal.workspaceId + ':' + exercise.currentStageId;
        const state = exerciseWorkspaceState.get(key);
        if (state) {
          const {
            classInternalId: _classInternalId,
            exerciseInternalId: _exerciseInternalId,
            workspaceInternalId: _workspaceInternalId,
            ...publicReadiness
          } = state;
          readiness = { ...publicReadiness };
        }
      }

      return {
        ...context,
        exercise: publicExercise(exercise),
        releases,
        readiness
      };
    },
    async beginExerciseDebrief(instructorHash, {
      exercisePublicId,
      expectedRevision,
      stageId,
      workspaceRepository,
      studentEditingEnabled
    }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === exercisePublicId
      ));
      if (!exercise) return null;
      if (
        exercise.exerciseRevision !== expectedRevision
        || exercise.status !== 'active'
        || exercise.currentStageId !== stageId
        || exercise.stagePhase !== 'work'
      ) {
        return {
          status: 'conflict',
          classroom: publicClass(item),
          exercise: publicExercise(exercise)
        };
      }

      let capturedCount = 0;
      for (const workspace of workspaces.filter(candidate => (
        candidate.classInternalId === item.internalId && !candidate.revoked
      ))) {
        const key = exercise.internalId + ':' + stageId + ':' + workspace.workspaceId;
        if (exerciseCheckpoints.has(key)) continue;
        const observation = await workspaceRepository.observeById(workspace.workspaceId);
        if (!observation) continue;
        exerciseCheckpoints.set(key, {
          stageId,
          workspaceRevision: observation.revision,
          snapshot: cloneValue(observation.snapshot),
          capturedAt: 'captured',
          classInternalId: item.internalId,
          exerciseInternalId: exercise.internalId,
          workspaceInternalId: workspace.workspaceId
        });
        capturedCount += 1;
      }

      exercise.stagePhase = 'debrief';
      exercise.studentEditingEnabled = studentEditingEnabled;
      exercise.exerciseRevision += 1;
      exercise.updatedAt = 'updated';
      return {
        status: 'updated',
        classroom: publicClass(item),
        exercise: publicExercise(exercise),
        capturedCount
      };
    },
    async updateExerciseLifecycle(instructorHash, {
      exercisePublicId,
      expectedRevision,
      status,
      currentStageId,
      stagePhase,
      studentEditingEnabled
    }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === exercisePublicId
      ));
      if (!exercise) return null;
      if (exercise.exerciseRevision !== expectedRevision) {
        return {
          status: 'conflict',
          classroom: publicClass(item),
          exercise: publicExercise(exercise)
        };
      }

      exercise.status = status;
      exercise.currentStageId = currentStageId;
      exercise.stagePhase = stagePhase;
      exercise.studentEditingEnabled = studentEditingEnabled;
      exercise.exerciseRevision += 1;
      if (status === 'active' && !exercise.startedAt) exercise.startedAt = 'started';
      if (status === 'completed' && !exercise.completedAt) exercise.completedAt = 'completed';
      exercise.updatedAt = 'updated';
      return {
        status: 'updated',
        classroom: publicClass(item),
        exercise: publicExercise(exercise)
      };
    },
    async releaseExerciseContent(instructorHash, {
      exercisePublicId,
      expectedRevision,
      stageId,
      contentId
    }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === exercisePublicId
      ));
      if (!exercise) return null;

      const key = exercise.internalId + ':' + stageId + ':' + contentId;
      const existing = exerciseReleases.get(key);
      if (existing) {
        return {
          status: 'unchanged',
          classroom: publicClass(item),
          exercise: publicExercise(exercise),
          release: { ...existing }
        };
      }
      if (exercise.exerciseRevision !== expectedRevision) {
        return {
          status: 'conflict',
          classroom: publicClass(item),
          exercise: publicExercise(exercise)
        };
      }

      const release = { stageId, contentId, releasedAt: 'released' };
      exerciseReleases.set(key, release);
      exercise.exerciseRevision += 1;
      exercise.updatedAt = 'updated';
      return {
        status: 'updated',
        classroom: publicClass(item),
        exercise: publicExercise(exercise),
        release: { ...release }
      };
    },
    async listExerciseReleasesForInstructor(instructorHash, exercisePublicId) {
      const current = await this.getExerciseForInstructor(instructorHash, exercisePublicId);
      if (!current) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === current.classroom.internal_id
        && candidate.id === exercisePublicId
      ));
      const prefix = exercise.internalId + ':';
      return {
        ...current,
        releases: [...exerciseReleases.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => ({ ...value }))
          .sort((a, b) => (
            a.stageId.localeCompare(b.stageId)
            || a.contentId.localeCompare(b.contentId)
          ))
      };
    },
    async setExerciseWorkspaceReadinessBySession(sessionHash, {
      exercisePublicId,
      stageId,
      ready,
      workspaceRevision,
      expectedWorkspaceInternalId = null
    }) {
      const context = await this.getParticipantBySession(sessionHash);
      if (!context) return null;
      if (!context.internal.workspaceId || !context.assignment) {
        return { status: 'waiting', ...context };
      }
      if (
        expectedWorkspaceInternalId !== null
        && Number(context.internal.workspaceId) !== Number(expectedWorkspaceInternalId)
      ) {
        return { status: 'conflict', ...context };
      }
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === context.internal.classId
        && candidate.id === exercisePublicId
        && candidate.currentStageId === stageId
        && candidate.status !== 'completed'
      ));
      if (!exercise) return null;

      const key = exercise.internalId + ':' + context.internal.workspaceId + ':' + stageId;
      const previous = exerciseWorkspaceState.get(key);
      const nextRevision = ready ? workspaceRevision : null;
      if (previous
        && previous.readyForDebrief === ready
        && previous.readyWorkspaceRevision === nextRevision) {
        return {
          status: 'unchanged',
          classroom: context.classroom,
          participant: context.participant,
          workspace: context.assignment,
          exercise: publicExercise(exercise),
          readiness: { ...previous }
        };
      }

      const readiness = {
        classInternalId: context.internal.classId,
        exerciseInternalId: exercise.internalId,
        workspaceInternalId: context.internal.workspaceId,
        stageId,
        readyForDebrief: ready,
        readyAt: ready ? 'ready' : null,
        readyWorkspaceRevision: nextRevision,
        createdAt: previous?.createdAt || 'created',
        updatedAt: 'updated'
      };
      exerciseWorkspaceState.set(key, readiness);
      const {
        classInternalId: _classInternalId,
        exerciseInternalId: _exerciseInternalId,
        workspaceInternalId: _workspaceInternalId,
        ...publicReadiness
      } = readiness;
      return {
        status: 'updated',
        classroom: context.classroom,
        participant: context.participant,
        workspace: context.assignment,
        exercise: publicExercise(exercise),
        readiness: publicReadiness
      };
    },
    async listExerciseWorkspaceStateForInstructor(instructorHash, exercisePublicId) {
      const current = await this.getExerciseForInstructor(instructorHash, exercisePublicId);
      if (!current) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === current.classroom.internal_id
        && candidate.id === exercisePublicId
      ));
      return {
        ...current,
        workspaceState: [...exerciseWorkspaceState.values()]
          .filter(state => state.exerciseInternalId === exercise.internalId)
          .map(state => {
            const workspace = workspaces.find(candidate => (
              candidate.classInternalId === current.classroom.internal_id
              && candidate.workspaceId === state.workspaceInternalId
              && !candidate.revoked
            ));
            if (!workspace) return null;
            return {
              workspaceId: workspace.id,
              workspaceKind: workspace.kind,
              workspaceLabel: workspace.label,
              stageId: state.stageId,
              readyForDebrief: state.readyForDebrief,
              readyAt: state.readyAt,
              readyWorkspaceRevision: state.readyWorkspaceRevision,
              createdAt: state.createdAt,
              updatedAt: state.updatedAt
            };
          })
          .filter(Boolean)
      };
    },
    async captureExerciseCheckpoint(instructorHash, {
      exercisePublicId,
      stageId,
      workspacePublicId,
      workspaceRevision,
      snapshot
    }) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === exercisePublicId
      ));
      if (!exercise) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId
        && candidate.id === workspacePublicId
        && !candidate.revoked
      ));
      if (!workspace) return null;

      const key = exercise.internalId + ':' + stageId + ':' + workspace.workspaceId;
      const existing = exerciseCheckpoints.get(key);
      if (existing) {
        return {
          status: 'unchanged',
          classroom: publicClass(item),
          workspace: { id: workspace.id },
          checkpoint: cloneValue(existing)
        };
      }

      const checkpoint = {
        stageId,
        workspaceRevision,
        snapshot: cloneValue(snapshot),
        capturedAt: 'captured',
        classInternalId: item.internalId,
        exerciseInternalId: exercise.internalId,
        workspaceInternalId: workspace.workspaceId
      };
      exerciseCheckpoints.set(key, checkpoint);
      const {
        classInternalId: _classInternalId,
        exerciseInternalId: _exerciseInternalId,
        workspaceInternalId: _workspaceInternalId,
        ...publicCheckpoint
      } = checkpoint;
      return {
        status: 'captured',
        classroom: publicClass(item),
        workspace: { id: workspace.id },
        checkpoint: cloneValue(publicCheckpoint)
      };
    },
    async listExerciseCheckpointsForInstructor(instructorHash, exercisePublicId, stageId) {
      const current = await this.getExerciseForInstructor(instructorHash, exercisePublicId);
      if (!current) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === current.classroom.internal_id
        && candidate.id === exercisePublicId
      ));
      return {
        ...current,
        checkpoints: [...exerciseCheckpoints.values()]
          .filter(checkpoint => (
            checkpoint.exerciseInternalId === exercise.internalId
            && checkpoint.stageId === stageId
          ))
          .map(checkpoint => {
            const workspace = workspaces.find(candidate => (
              candidate.classInternalId === current.classroom.internal_id
              && candidate.workspaceId === checkpoint.workspaceInternalId
            ));
            return {
              workspaceId: workspace?.id || null,
              workspaceKind: workspace?.kind || null,
              workspaceLabel: workspace?.label || null,
              stageId: checkpoint.stageId,
              workspaceRevision: checkpoint.workspaceRevision,
              capturedAt: checkpoint.capturedAt
            };
          })
          .filter(checkpoint => checkpoint.workspaceId)
      };
    },
    async getExerciseCheckpointForInstructor(
      instructorHash,
      exercisePublicId,
      stageId,
      workspacePublicId
    ) {
      const current = await this.getExerciseForInstructor(instructorHash, exercisePublicId);
      if (!current) return null;
      const exercise = exercises.find(candidate => (
        candidate.classInternalId === current.classroom.internal_id
        && candidate.id === exercisePublicId
      ));
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === current.classroom.internal_id
        && candidate.id === workspacePublicId
        && !candidate.revoked
      ));
      if (!exercise || !workspace) return null;
      const checkpoint = exerciseCheckpoints.get(
        exercise.internalId + ':' + stageId + ':' + workspace.workspaceId
      );
      if (!checkpoint) return null;
      return {
        ...current,
        workspace: {
          id: workspace.id,
          kind: workspace.kind,
          label: workspace.label
        },
        checkpoint: {
          workspaceId: workspace.id,
          workspaceKind: workspace.kind,
          workspaceLabel: workspace.label,
          stageId: checkpoint.stageId,
          workspaceRevision: checkpoint.workspaceRevision,
          snapshot: cloneValue(checkpoint.snapshot),
          capturedAt: checkpoint.capturedAt
        }
      };
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
            participantCount:
              [...memberships.values()].filter(member => (
                member.classInternalId === item.internalId && member.workspaceId === workspace.workspaceId
              )).length
              + [...participants.values()].filter(participant => (
                participant.classInternalId === item.internalId
                && participant.workspaceId === workspace.workspaceId
                && !participant.revoked
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
    async listFeedbackForInstructor(instructorHash, workspacePublicId) {
      const item = activeByInstructor(instructorHash);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId && candidate.id === workspacePublicId && !candidate.revoked
      ));
      if (!workspace) return null;
      const prefix = item.internalId + ':' + workspace.workspaceId + ':';
      return {
        classroom: publicClass(item),
        workspace: { internalId: workspace.workspaceId, id: workspace.id, kind: workspace.kind, label: workspace.label },
        feedback: [...coaching.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => ({ ...value }))
          .sort((a, b) => a.targetId.localeCompare(b.targetId))
      };
    },
    async upsertFeedback(instructorHash, workspacePublicId, feedbackInput) {
      const scope = await this.listFeedbackForInstructor(instructorHash, workspacePublicId);
      if (!scope) return null;
      const key = scope.classroom.internal_id + ':' + scope.workspace.internalId + ':' + feedbackInput.targetId;
      const previous = coaching.get(key);
      const record = {
        targetId: feedbackInput.targetId,
        status: feedbackInput.status,
        note: feedbackInput.note,
        reviewedWorkspaceRevision: feedbackInput.reviewedWorkspaceRevision,
        reviewedFieldFingerprint: feedbackInput.reviewedFieldFingerprint,
        feedbackRevision: (previous?.feedbackRevision || 0) + 1,
        createdAt: previous?.createdAt || 'created',
        updatedAt: 'updated'
      };
      coaching.set(key, record);
      return { classroom: scope.classroom, workspace: scope.workspace, feedback: { ...record } };
    },
    async deleteFeedback(instructorHash, workspacePublicId, targetId) {
      const scope = await this.listFeedbackForInstructor(instructorHash, workspacePublicId);
      if (!scope) return null;
      const key = scope.classroom.internal_id + ':' + scope.workspace.internalId + ':' + targetId;
      const cleared = coaching.delete(key);
      return { classroom: scope.classroom, workspace: scope.workspace, cleared, targetId };
    },
    async getStudentContext(accessHash) {
      const live = [...participants.values()].find(value => value.workspaceAccessHash === accessHash && !value.revoked);
      if (live) {
        const item = classes.find(candidate => candidate.internalId === live.classInternalId && !candidate.revoked);
        const workspace = item && workspaces.find(candidate => (
          candidate.classInternalId === item.internalId
          && candidate.workspaceId === live.workspaceId
          && !candidate.revoked
        ));
        if (item && workspace) {
          return {
            classroom: publicClass(item),
            workspace: { id: workspace.id, kind: workspace.kind, label: workspace.label },
            internal: { classId: item.internalId, workspaceId: workspace.workspaceId }
          };
        }
      }

      const member = [...memberships.values()].find(value => value.accessHash === accessHash);
      if (!member) return null;
      const item = classes.find(candidate => candidate.internalId === member.classInternalId && !candidate.revoked);
      if (!item) return null;
      const workspace = workspaces.find(candidate => (
        candidate.classInternalId === item.internalId && candidate.workspaceId === member.workspaceId && !candidate.revoked
      ));
      if (!workspace) return null;
      return {
        classroom: publicClass(item),
        workspace: { id: workspace.id, kind: workspace.kind, label: workspace.label },
        internal: { classId: item.internalId, workspaceId: workspace.workspaceId }
      };
    },
    async listFeedbackForStudent(accessHash) {
      const scope = await this.getStudentContext(accessHash);
      if (!scope) return null;
      const prefix = scope.internal.classId + ':' + scope.internal.workspaceId + ':';
      return {
        classroom: scope.classroom,
        workspace: scope.workspace,
        feedback: [...coaching.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, value]) => ({ ...value }))
          .sort((a, b) => a.targetId.localeCompare(b.targetId))
      };
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
