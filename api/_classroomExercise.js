/**
 * @module api/classroomExercise
 * @description
 * Server-only #313 staged exercise orchestration. Instructor handlers receive
 * the complete staged definition; Student handlers receive only the cumulative
 * Student-safe release through the current stage. No exercise route grants
 * collaboration edit authority.
 */

import { createHash, randomUUID } from 'node:crypto';

import { getClassroomRepository } from './_classroom.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from './protected-case-studies.manifest.js';
import {
  getWorkspaceRepository,
  hashWorkspaceToken,
  parseAuthorizationToken
} from './_workspace.js';

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  return send(res, 405, { error: 'Method not allowed.' });
}

function requireBearer(req) {
  if (req.headers?.authorization === undefined) {
    return { ok: false, status: 401, error: 'Authorization required.' };
  }
  const token = parseAuthorizationToken(req.headers.authorization);
  return token
    ? { ok: true, token }
    : { ok: false, status: 400, error: 'Invalid authorization.' };
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function requestedCaseStudyId(body) {
  const id = typeof body?.caseStudyId === 'string' ? body.caseStudyId.trim() : '';
  return id && id.length <= 160 ? id : null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value)
      .sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Return a stable SHA-256 identity for one normalized staged definition.
 *
 * @param {object} simulation Normalized server-only simulation definition.
 * @returns {string} Lowercase SHA-256 hex digest.
 */
export function fingerprintStagedSimulation(simulation) {
  return createHash('sha256').update(canonicalJson(simulation)).digest('hex');
}

function stagedCaseStudy(manifest, caseStudyId) {
  const entry = manifest.find(candidate => candidate.id === caseStudyId) || null;
  return entry?.templateKind === 'case-study' && entry.simulation ? entry : null;
}

function caseStudySummary(caseStudy) {
  return {
    id: caseStudy.id,
    name: caseStudy.name,
    description: caseStudy.description,
    supportedModes: [...caseStudy.supportedModes]
  };
}

function instructorDefinition(caseStudy) {
  return {
    ...caseStudySummary(caseStudy),
    simulation: caseStudy.simulation
  };
}

function definitionMatches(exercise, caseStudy) {
  if (!exercise || !caseStudy?.simulation) return false;
  return exercise.simulationVersion === caseStudy.simulation.version
    && exercise.simulationFingerprint === fingerprintStagedSimulation(caseStudy.simulation);
}

function currentStage(caseStudy, exercise) {
  if (!exercise?.currentStageId) return { stage: null, index: -1 };
  const index = caseStudy.simulation.stages.findIndex(stage => stage.id === exercise.currentStageId);
  return {
    stage: index >= 0 ? caseStudy.simulation.stages[index] : null,
    index
  };
}

function releasedStudentContent(caseStudy, exercise, releases) {
  const { index } = currentStage(caseStudy, exercise);
  if (index < 0 || exercise.status === 'draft') return [];

  const blocks = new Map(caseStudy.simulation.studentContent.map(block => [block.id, block]));
  const releasesByStage = new Map();
  for (const release of releases || []) {
    const items = releasesByStage.get(release.stageId) || [];
    items.push(release);
    releasesByStage.set(release.stageId, items);
  }

  const result = [];
  const seen = new Set();
  const append = (stageId, contentId, releaseType, releasedAt = null) => {
    if (seen.has(contentId)) return;
    const content = blocks.get(contentId);
    if (!content) return;
    seen.add(contentId);
    result.push({
      stageId,
      releaseType,
      releasedAt,
      content
    });
  };

  caseStudy.simulation.stages.slice(0, index + 1).forEach(stage => {
    stage.initialReleaseIds.forEach(contentId => append(stage.id, contentId, 'initial'));
    const allowedOptional = new Set(stage.optionalReleaseIds);
    for (const release of releasesByStage.get(stage.id) || []) {
      if (allowedOptional.has(release.contentId)) {
        append(stage.id, release.contentId, 'optional', release.releasedAt || null);
      }
    }
  });

  return result;
}

function studentExercisePayload(context, caseStudy) {
  if (!context.exercise) {
    return {
      class: context.classroom,
      participant: context.participant,
      assignment: context.assignment,
      exercise: null
    };
  }

  const { stage } = currentStage(caseStudy, context.exercise);
  return {
    class: context.classroom,
    participant: context.participant,
    assignment: context.assignment,
    exercise: {
      id: context.exercise.id,
      caseStudyId: context.exercise.caseStudyId,
      caseStudy: caseStudySummary(caseStudy),
      status: context.exercise.status,
      stagePhase: context.exercise.stagePhase,
      exerciseRevision: context.exercise.exerciseRevision,
      studentEditingEnabled: context.exercise.studentEditingEnabled !== false,
      editFreezeEnforced: true,
      currentStage: stage
        ? {
            id: stage.id,
            title: stage.title,
            studentObjective: stage.studentObjective
          }
        : null,
      releasedContent: releasedStudentContent(
        caseStudy,
        context.exercise,
        context.releases
      ),
      readiness: context.readiness
        ? {
            stageId: context.readiness.stageId,
            readyForDebrief: context.readiness.readyForDebrief,
            readyAt: context.readiness.readyAt,
            readyWorkspaceRevision: context.readiness.readyWorkspaceRevision
          }
        : null
    }
  };
}

async function instructorExercisePayload(repository, instructorHash, classroom, exercise, caseStudy) {
  const releases = await repository.listExerciseReleasesForInstructor(instructorHash, exercise.id);
  const workspaceState = await repository.listExerciseWorkspaceStateForInstructor(instructorHash, exercise.id);
  const checkpoints = exercise.currentStageId
    ? await repository.listExerciseCheckpointsForInstructor(
        instructorHash,
        exercise.id,
        exercise.currentStageId
      )
    : null;

  return {
    class: classroom,
    exercise,
    caseStudy: instructorDefinition(caseStudy),
    releases: releases?.releases || [],
    workspaceState: workspaceState?.workspaceState || [],
    checkpoints: checkpoints?.checkpoints || [],
    editFreezeEnforced: true
  };
}

function conflict(res, result, fallback = 'Exercise changed. Refresh and retry.') {
  return send(res, 409, {
    error: fallback,
    exercise: result?.exercise || null
  });
}

/**
 * Instructor staged exercise create/read/lifecycle handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classExerciseHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST,
  idFactory = randomUUID
} = {}) {
  return async (req, res) => {
    if (!['POST', 'GET', 'PATCH'].includes(req.method)) {
      return methodNotAllowed(res, 'POST, GET, PATCH');
    }
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });
    const instructorHash = hashWorkspaceToken(authorization.token);

    try {
      const repository = await getRepository();
      const classroom = await repository.getClassByInstructor(instructorHash);
      if (!classroom) return send(res, 404, { error: 'Class not found.' });

      if (req.method === 'POST') {
        const caseStudyId = requestedCaseStudyId(req.body);
        if (!caseStudyId) return send(res, 400, { error: 'Invalid Case Study selection.' });
        const caseStudy = stagedCaseStudy(manifest, caseStudyId);
        if (!caseStudy) return send(res, 404, { error: 'Staged Case Study not found.' });

        const existing = await repository.getCurrentExerciseForInstructor(instructorHash);
        if (existing) {
          const existingCase = stagedCaseStudy(manifest, existing.exercise.caseStudyId);
          if (!definitionMatches(existing.exercise, existingCase)) {
            return conflict(res, existing, 'Exercise definition is unavailable or has changed.');
          }
          if (existing.exercise.caseStudyId !== caseStudyId) {
            return conflict(res, existing, 'Another exercise is already open for this class.');
          }
          const body = await instructorExercisePayload(
            repository,
            instructorHash,
            existing.classroom,
            existing.exercise,
            existingCase
          );
          return send(res, 200, { ...body, created: false });
        }

        const result = await repository.createExercise(instructorHash, {
          publicId: idFactory(),
          caseStudyId,
          simulationVersion: caseStudy.simulation.version,
          simulationFingerprint: fingerprintStagedSimulation(caseStudy.simulation)
        });
        if (!result) return send(res, 404, { error: 'Class not found.' });

        const resolvedCase = stagedCaseStudy(manifest, result.exercise.caseStudyId);
        if (!definitionMatches(result.exercise, resolvedCase)) {
          return conflict(res, result, 'Exercise definition is unavailable or has changed.');
        }
        if (result.exercise.caseStudyId !== caseStudyId) {
          return conflict(res, result, 'Another exercise is already open for this class.');
        }

        const body = await instructorExercisePayload(
          repository,
          instructorHash,
          result.classroom,
          result.exercise,
          resolvedCase
        );
        return send(res, result.status === 'created' ? 201 : 200, {
          ...body,
          created: result.status === 'created'
        });
      }

      const current = await repository.getCurrentExerciseForInstructor(instructorHash);
      if (!current) {
        return req.method === 'GET'
          ? send(res, 200, { class: classroom, exercise: null })
          : send(res, 404, { error: 'Exercise not found.' });
      }
      const caseStudy = stagedCaseStudy(manifest, current.exercise.caseStudyId);
      if (!definitionMatches(current.exercise, caseStudy)) {
        return conflict(res, current, 'Exercise definition is unavailable or has changed.');
      }

      if (req.method === 'GET') {
        return send(res, 200, await instructorExercisePayload(
          repository,
          instructorHash,
          current.classroom,
          current.exercise,
          caseStudy
        ));
      }

      const expectedRevision = positiveRevision(req.body?.expectedRevision);
      if (!expectedRevision) return send(res, 400, { error: 'Invalid exercise revision.' });
      const action = req.body?.action;
      const { stage, index } = currentStage(caseStudy, current.exercise);
      let result = null;

      if (action === 'start') {
        if (current.exercise.status !== 'draft' || current.exercise.currentStageId !== null) {
          return conflict(res, current, 'Exercise cannot be started from its current state.');
        }
        const firstStage = caseStudy.simulation.stages[0];
        if (!firstStage) return conflict(res, current, 'Exercise has no staged definition.');
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: 'active',
          currentStageId: firstStage.id,
          stagePhase: 'work',
          studentEditingEnabled: true
        });
      } else if (action === 'pause') {
        if (current.exercise.status !== 'active') {
          return conflict(res, current, 'Exercise is not active.');
        }
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: 'paused',
          currentStageId: current.exercise.currentStageId,
          stagePhase: current.exercise.stagePhase,
          studentEditingEnabled: current.exercise.studentEditingEnabled !== false
        });
      } else if (action === 'resume') {
        if (current.exercise.status !== 'paused') {
          return conflict(res, current, 'Exercise is not paused.');
        }
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: 'active',
          currentStageId: current.exercise.currentStageId,
          stagePhase: current.exercise.stagePhase,
          studentEditingEnabled: current.exercise.studentEditingEnabled !== false
        });
      } else if (action === 'release-content') {
        const contentId = typeof req.body?.contentId === 'string' ? req.body.contentId.trim() : '';
        if (
          current.exercise.status !== 'active'
          || current.exercise.stagePhase !== 'work'
          || !stage
          || !stage.optionalReleaseIds.includes(contentId)
        ) {
          return send(res, 400, { error: 'Invalid current-stage content release.' });
        }
        result = await repository.releaseExerciseContent(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          stageId: stage.id,
          contentId
        });
      } else if (action === 'begin-debrief') {
        if (current.exercise.status !== 'active' || current.exercise.stagePhase !== 'work' || !stage) {
          return conflict(res, current, 'Exercise is not ready to enter debrief.');
        }
        const workspaceRepository = await getWorkspaceRepo();
        result = await repository.beginExerciseDebrief(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          stageId: stage.id,
          workspaceRepository,
          studentEditingEnabled: stage.defaultDebriefEditPolicy !== 'frozen'
        });
      } else if (action === 'set-editing') {
        if (
          current.exercise.status !== 'active'
          || current.exercise.stagePhase !== 'debrief'
          || !stage
          || typeof req.body?.enabled !== 'boolean'
        ) {
          return send(res, 400, { error: 'Invalid debrief editing policy.' });
        }
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: current.exercise.status,
          currentStageId: current.exercise.currentStageId,
          stagePhase: current.exercise.stagePhase,
          studentEditingEnabled: req.body.enabled
        });
      } else if (action === 'advance') {
        if (current.exercise.status !== 'active' || current.exercise.stagePhase !== 'debrief' || !stage) {
          return conflict(res, current, 'Exercise is not ready to advance.');
        }
        const nextStage = caseStudy.simulation.stages[index + 1];
        if (!nextStage) return send(res, 409, { error: 'Exercise is already at its final stage.' });
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: 'active',
          currentStageId: nextStage.id,
          stagePhase: 'work',
          studentEditingEnabled: true
        });
      } else if (action === 'complete') {
        if (
          current.exercise.status !== 'active'
          || current.exercise.stagePhase !== 'debrief'
          || !stage
          || index !== caseStudy.simulation.stages.length - 1
        ) {
          return conflict(res, current, 'Exercise cannot be completed from its current state.');
        }
        result = await repository.updateExerciseLifecycle(instructorHash, {
          exercisePublicId: current.exercise.id,
          expectedRevision,
          status: 'completed',
          currentStageId: stage.id,
          stagePhase: 'debrief',
          studentEditingEnabled: true
        });
      } else {
        return send(res, 400, { error: 'Invalid exercise action.' });
      }

      if (!result) return send(res, 404, { error: 'Exercise not found.' });
      if (result.status === 'conflict') return conflict(res, result);
      if (!definitionMatches(result.exercise, caseStudy)) {
        return conflict(res, result, 'Exercise definition is unavailable or has changed.');
      }

      return send(res, 200, {
        ...(await instructorExercisePayload(
          repository,
          instructorHash,
          result.classroom,
          result.exercise,
          caseStudy
        )),
        changed: result.status === 'updated',
        capturedCount: Number.isInteger(result.capturedCount) ? result.capturedCount : undefined
      });
    } catch {
      return send(res, 500, { error: 'Unable to access staged exercise.' });
    }
  };
}

/**
 * Student current staged-release handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classStudentExerciseHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST
} = {}) {
  return async (req, res) => {
    if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });

    try {
      const repository = await getRepository();
      const context = await repository.getExerciseForStudentSession(
        hashWorkspaceToken(authorization.token)
      );
      if (!context) return send(res, 404, { error: 'Student class session not found.' });
      if (!context.exercise) return send(res, 200, studentExercisePayload(context, null));

      const caseStudy = stagedCaseStudy(manifest, context.exercise.caseStudyId);
      if (!definitionMatches(context.exercise, caseStudy)) {
        return send(res, 409, { error: 'Exercise definition is unavailable or has changed.' });
      }
      return send(res, 200, studentExercisePayload(context, caseStudy));
    } catch {
      return send(res, 500, { error: 'Unable to load staged exercise.' });
    }
  };
}

/**
 * Student current-workspace readiness handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {Function} Vercel handler.
 */
export function classStudentExerciseReadyHandler({
  getRepository = getClassroomRepository,
  getWorkspaceRepo = getWorkspaceRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST
} = {}) {
  return async (req, res) => {
    if (req.method !== 'PUT') return methodNotAllowed(res, 'PUT');
    const authorization = requireBearer(req);
    if (!authorization.ok) return send(res, authorization.status, { error: authorization.error });
    if (typeof req.body?.ready !== 'boolean') {
      return send(res, 400, { error: 'Invalid readiness state.' });
    }

    const sessionHash = hashWorkspaceToken(authorization.token);
    try {
      const repository = await getRepository();
      const context = await repository.getExerciseForStudentSession(sessionHash);
      if (!context) return send(res, 404, { error: 'Student class session not found.' });
      if (!context.exercise || !context.exercise.currentStageId) {
        return send(res, 409, { error: 'No active exercise stage.' });
      }
      const caseStudy = stagedCaseStudy(manifest, context.exercise.caseStudyId);
      if (!definitionMatches(context.exercise, caseStudy)) {
        return send(res, 409, { error: 'Exercise definition is unavailable or has changed.' });
      }
      if (context.exercise.status !== 'active' || context.exercise.stagePhase !== 'work') {
        return send(res, 409, { error: 'Readiness is not available in the current exercise phase.' });
      }
      if (!context.internal.workspaceId || !context.assignment) {
        return send(res, 409, { status: 'waiting', error: 'Assign a workspace before marking Ready.' });
      }

      let workspaceRevision = null;
      if (req.body.ready) {
        const workspaceRepository = await getWorkspaceRepo();
        const observation = await workspaceRepository.observeById(context.internal.workspaceId);
        if (!observation) return send(res, 404, { error: 'Assigned workspace not found.' });
        workspaceRevision = observation.revision;
      }

      const result = await repository.setExerciseWorkspaceReadinessBySession(sessionHash, {
        exercisePublicId: context.exercise.id,
        stageId: context.exercise.currentStageId,
        ready: req.body.ready,
        workspaceRevision,
        expectedWorkspaceInternalId: context.internal.workspaceId
      });
      if (!result) return send(res, 404, { error: 'Exercise readiness not found.' });
      if (result.status === 'waiting') {
        return send(res, 409, { status: 'waiting', error: 'Assign a workspace before marking Ready.' });
      }
      if (result.status === 'conflict') {
        return send(res, 409, { error: 'Student assignment changed. Refresh and retry.' });
      }
      return send(res, 200, {
        class: result.classroom,
        participant: result.participant,
        assignment: result.workspace,
        readiness: result.readiness,
        changed: result.status === 'updated'
      });
    } catch {
      return send(res, 500, { error: 'Unable to update exercise readiness.' });
    }
  };
}
