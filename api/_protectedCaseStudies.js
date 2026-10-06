/**
 * @module api/protectedCaseStudies
 * @description
 * Server-only protected Case Study catalog and payload delivery. Authorization
 * uses the existing Classroom Instructor capability or issued Student workspace
 * capability; protected content never travels in URLs or public client assets.
 */

import { getClassroomRepository } from './_classroom.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from './protected-case-studies.manifest.js';
import { hashWorkspaceToken, parseAuthorizationToken } from './_workspace.js';

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
