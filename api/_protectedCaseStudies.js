/**
 * @module api/protectedCaseStudies
 * @description
 * Server-only protected Case Study catalog and payload delivery. Authorization
 * uses the existing Classroom Instructor capability or issued Student workspace
 * capability; protected content never travels in URLs or public client assets.
 *
 * Since #343 the Instructor can also load a Case Study into class workspaces
 * (`POST /api/classes/case-studies/assign`). The server projects the protected
 * source through the same mode rules as the drawer and writes it as a normal
 * collaboration revision, so Students receive it on their next poll and never
 * see the protected payload or the mode password.
 */

import { getClassroomRepository, validateClassroomId } from './_classroom.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from './protected-case-studies.manifest.js';
import { hashWorkspaceToken, parseAuthorizationToken, validateSnapshot } from './_workspace.js';
import { projectTemplateState } from '../src/templates.js';
import { TEMPLATE_KINDS } from '../src/templateKinds.js';

/** Most workspaces one load request may name (a class is ~22 Students). */
export const CASE_STUDY_ASSIGN_MAX_TARGETS = 60;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.status(status).json(body);
}

function methodNotAllowed(res) {
  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed.' });
}

function requireBearer(req) {
  const token = parseAuthorizationToken(req?.headers?.authorization);
  return token || null;
}

function catalog(manifest) {
  return manifest.map(entry => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    templateKind: entry.templateKind,
    supportedModes: [...entry.supportedModes]
  }));
}

function requestedCaseStudy(manifest, body) {
  const id = typeof body?.caseStudyId === 'string' ? body.caseStudyId.trim() : '';
  if (!id) return null;
  return manifest.find(entry => entry.id === id) || null;
}

function createProtectedCaseStudyHandler({
  getRepository,
  manifest,
  authorize,
  unauthorizedMessage,
  blockPayload = null
}) {
  return async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res);
    const token = requireBearer(req);
    if (!token) return send(res, 401, { error: 'Missing or invalid authorization.' });

    try {
      const repository = await getRepository();
      const context = await authorize(repository, hashWorkspaceToken(token));
      if (!context) return send(res, 404, { error: unauthorizedMessage });

      if (req.method === 'GET') {
        return send(res, 200, {
          class: context.classroom,
          caseStudies: catalog(manifest)
        });
      }

      const caseStudy = requestedCaseStudy(manifest, req.body);
      if (!caseStudy) return send(res, 404, { error: 'Case Study not found.' });

      if (blockPayload && await blockPayload(repository, context, caseStudy)) {
        return send(res, 409, {
          error: 'Case Study content is available only through the staged exercise.'
        });
      }

      return send(res, 200, {
        class: context.classroom,
        workspace: context.workspace || null,
        caseStudy
      });
    } catch {
      return send(res, 500, { error: 'Unable to load protected Case Studies.' });
    }
  };
}

/**
 * Create the Instructor protected Case Study handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @param {() => Promise<object>} [dependencies.getRepository] Classroom repository provider.
 * @param {ReadonlyArray<object>} [dependencies.manifest] Protected manifest override for tests.
 * @returns {Function} Vercel handler.
 */
export function instructorCaseStudiesHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST
} = {}) {
  return createProtectedCaseStudyHandler({
    getRepository,
    manifest,
    authorize: async (repository, tokenHash) => {
      const classroom = await repository.getClassByInstructor(tokenHash);
      return classroom ? { classroom } : null;
    },
    unauthorizedMessage: 'Class not found.'
  });
}

/**
 * Create the Student protected Case Study handler.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @param {() => Promise<object>} [dependencies.getRepository] Classroom repository provider.
 * @param {ReadonlyArray<object>} [dependencies.manifest] Protected manifest override for tests.
 * @returns {Function} Vercel handler.
 */
export function studentCaseStudiesHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST
} = {}) {
  return createProtectedCaseStudyHandler({
    getRepository,
    manifest,
    authorize: (repository, tokenHash) => repository.getStudentContext(tokenHash),
    unauthorizedMessage: 'Class resources not found.',
    blockPayload: async (repository, context, caseStudy) => {
      if (!context.internal?.classId || !repository.hasExerciseForClassCase) return false;
      return repository.hasExerciseForClassCase(context.internal.classId, caseStudy.id);
    }
  });
}

/**
 * Parse the requested load targets.
 *
 * `"all"` means every live workspace in the class and is only accepted for a
 * first, non-replacing load. Replacing Student work names each workspace with
 * the revision the Instructor confirmed.
 *
 * @param {unknown} targets - Request `targets`.
 * @param {boolean} replaceExisting - Whether Student work may be replaced.
 * @returns {'all'|Array<{workspaceId: string, expectedRevision: number|null}>|null} Targets or null when invalid.
 */
function parseAssignTargets(targets, replaceExisting) {
  if (targets === 'all') return replaceExisting ? null : 'all';
  if (!Array.isArray(targets) || targets.length === 0 || targets.length > CASE_STUDY_ASSIGN_MAX_TARGETS) return null;
  const seen = new Set();
  const parsed = [];
  for (const target of targets) {
    const workspaceId = target?.workspaceId;
    if (!validateClassroomId(workspaceId)) return null;
    const expectedRevision = target?.expectedRevision;
    if (replaceExisting && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) return null;
    if (seen.has(workspaceId)) continue;
    seen.add(workspaceId);
    parsed.push({ workspaceId, expectedRevision: replaceExisting ? expectedRevision : null });
  }
  return parsed;
}

/**
 * Create the Instructor handler that loads a protected Case Study into class
 * workspaces (#343).
 *
 * Body: `{ caseStudyId, mode, targets: 'all' | [{ workspaceId, expectedRevision? }], replaceExisting? }`.
 * Each workspace result is `loaded`, `has-work` (Student work kept; resend with
 * `replaceExisting` and the returned revision after the Instructor confirms),
 * `changed` (work moved on since confirmation), or `not-found`.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @param {() => Promise<object>} [dependencies.getRepository] Classroom repository provider.
 * @param {ReadonlyArray<object>} [dependencies.manifest] Protected manifest override for tests.
 * @returns {Function} Vercel handler.
 */
export function instructorCaseStudyAssignHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST
} = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { error: 'Method not allowed.' });
    }
    const token = requireBearer(req);
    if (!token) return send(res, 401, { error: 'Missing or invalid authorization.' });

    const caseStudy = requestedCaseStudy(manifest, req.body);
    if (!caseStudy) return send(res, 404, { error: 'Case Study not found.' });
    const mode = typeof req.body?.mode === 'string' ? req.body.mode.trim() : '';
    if (!caseStudy.supportedModes.includes(mode)) {
      return send(res, 400, { error: 'Choose a starting point this Case Study supports.' });
    }
    const replaceExisting = req.body?.replaceExisting === true;
    const targets = parseAssignTargets(req.body?.targets, replaceExisting);
    if (!targets) return send(res, 400, { error: 'Invalid workspaces.' });

    try {
      const repository = await getRepository();
      const instructorHash = hashWorkspaceToken(token);
      const classroom = await repository.getClassByInstructor(instructorHash);
      if (!classroom) return send(res, 404, { error: 'Class not found.' });

      // Staged-exercise anti-bypass: a staged Case Study is only ever
      // delivered stage by stage, and nothing may overwrite workspaces while
      // an exercise is running.
      if (caseStudy.simulation
        || await repository.hasExerciseForClassCase?.(classroom.internal_id, caseStudy.id)) {
        return send(res, 409, {
          error: 'This Case Study is delivered through its staged exercise, so it cannot be loaded into workspaces.',
          code: 'staged-exercise-only'
        });
      }
      if (await repository.getCurrentExerciseByClassInternalId?.(classroom.internal_id)) {
        return send(res, 409, {
          error: 'Complete the current staged exercise before loading a Case Study into workspaces.',
          code: 'exercise-active'
        });
      }

      const snapshot = projectTemplateState(caseStudy.state, mode, caseStudy.supportedModes, TEMPLATE_KINDS.CASE_STUDY);
      if (!snapshot || !validateSnapshot(snapshot).ok) {
        return send(res, 500, { error: 'Unable to prepare this Case Study.' });
      }

      let resolvedTargets = targets;
      if (targets === 'all') {
        const listed = await repository.listWorkspaces(instructorHash);
        if (!listed) return send(res, 404, { error: 'Class not found.' });
        resolvedTargets = listed.workspaces.map(workspace => ({ workspaceId: workspace.id, expectedRevision: null }));
        if (!resolvedTargets.length) {
          return send(res, 409, { error: 'Create a workspace first.', code: 'no-workspaces' });
        }
      }

      const results = [];
      for (const target of resolvedTargets) {
        const outcome = await repository.loadCaseStudyIntoWorkspace(instructorHash, {
          workspacePublicId: target.workspaceId,
          caseStudyId: caseStudy.id,
          caseStudyName: caseStudy.name,
          mode,
          snapshot,
          expectedRevision: target.expectedRevision
        });
        results.push(outcome
          ? { workspaceId: outcome.workspace.id, label: outcome.workspace.label, status: outcome.status, revision: outcome.revision }
          : { workspaceId: target.workspaceId, label: null, status: 'not-found', revision: null });
      }

      return send(res, 200, {
        caseStudy: { id: caseStudy.id, name: caseStudy.name },
        mode,
        results
      });
    } catch {
      return send(res, 500, { error: 'Unable to load the Case Study into workspaces.' });
    }
  };
}
