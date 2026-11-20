/**
 * @module api/classroomExerciseAssets
 * @description
 * Server-only delivery of protected staged Case Study images and document
 * pages (#316). Bytes come from the generated server-only
 * `_protected-assets.manifest.js`; they are never public static files and never
 * travel in a URL or the exercise JSON.
 *
 * Two routes, two authorities:
 * - `GET /api/classes/exercise/student/asset` — the stable Student
 *   class-session capability. The asset (and page) must be referenced by a
 *   Student block in the cumulative release through the current stage of the
 *   class's current exercise. Workspace edit capabilities do not authorize.
 * - `GET /api/classes/exercise/asset` — the class Instructor capability. The
 *   asset must be referenced by a Student block anywhere in the class's
 *   current exercise definition; Instructor authority is not a global browser.
 *
 * Query: `assetId` (stable slug) and, for document pages, `page`. Every
 * denial after authentication — unknown, unreleased, future-stage,
 * another class, definition drift — is the same 404, so a response never
 * reveals which class or stage owns an asset.
 */

import { getClassroomRepository } from './_classroom.js';
import {
  definitionMatches,
  releasedStudentContent,
  stagedCaseStudy
} from './_classroomExercise.js';
import { PROTECTED_ASSET_MANIFEST } from './_protected-assets.manifest.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from './protected-case-studies.manifest.js';
import { hashWorkspaceToken, parseAuthorizationToken } from './_workspace.js';

const ASSET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const PAGE_PATTERN = /^[1-9][0-9]{0,3}$/u;
const SERVABLE_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const NOT_FOUND = 'Asset not found.';

function privateHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, body) {
  privateHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function queryValue(req, key) {
  const value = req.query?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse `assetId` and optional `page` from the query.
 * @param {object} req - Request.
 * @returns {{assetId: string, page: number|null}|null} Parsed request, or null when malformed.
 */
function parseAssetRequest(req) {
  const assetId = queryValue(req, 'assetId');
  const rawPage = queryValue(req, 'page');
  if (!ASSET_ID_PATTERN.test(assetId)) return null;
  if (rawPage && !PAGE_PATTERN.test(rawPage)) return null;
  return { assetId, page: rawPage ? Number(rawPage) : null };
}

/**
 * Whether a Student content block references the requested representation.
 * @param {object} block - Staged Student content block.
 * @param {{assetId: string, page: number|null}} request - Parsed request.
 * @returns {boolean} Whether the block authorizes it.
 */
function blockReferences(block, { assetId, page }) {
  if (block?.assetId !== assetId) return false;
  if (block.kind === 'image') return page === null;
  if (block.kind === 'document-page') return page === block.page;
  return false;
}

/**
 * Resolve embedded bytes for an authorized representation; fails closed.
 * @param {ReadonlyArray<object>} assets - Protected asset manifest.
 * @param {{assetId: string, page: number|null}} request - Parsed request.
 * @returns {{mediaType: string, bytes: Buffer}|null} Representation or null.
 */
export function resolveProtectedAsset(assets, { assetId, page }) {
  const asset = assets.find(candidate => candidate?.id === assetId) || null;
  if (!asset) return null;
  const representation = asset.kind === 'image' && page === null
    ? asset
    : asset.kind === 'document' && page !== null
      ? (asset.pages || []).find(candidate => candidate.page === page) || null
      : null;
  if (!representation || !SERVABLE_MEDIA_TYPES.includes(representation.mediaType)
    || typeof representation.data !== 'string' || !representation.data) return null;
  return { mediaType: representation.mediaType, bytes: Buffer.from(representation.data, 'base64') };
}

function sendAsset(res, { mediaType, bytes }) {
  privateHeaders(res);
  res.setHeader('Content-Type', mediaType);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Content-Disposition', 'inline');
  res.status(200);
  return res.end(bytes);
}

function createAssetHandler({ getRepository, manifest, assets, authorizedBlocks }) {
  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    if (req.headers?.authorization === undefined) return sendJson(res, 401, { error: 'Authorization required.' });
    const token = parseAuthorizationToken(req.headers.authorization);
    if (!token) return sendJson(res, 400, { error: 'Invalid authorization.' });
    const request = parseAssetRequest(req);
    if (!request) return sendJson(res, 400, { error: 'Invalid asset request.' });

    try {
      const repository = await getRepository();
      const blocks = await authorizedBlocks(repository, hashWorkspaceToken(token), manifest);
      if (!blocks || !blocks.some(block => blockReferences(block, request))) {
        return sendJson(res, 404, { error: NOT_FOUND });
      }
      const asset = resolveProtectedAsset(assets, request);
      if (!asset) return sendJson(res, 404, { error: NOT_FOUND });
      return sendAsset(res, asset);
    } catch {
      return sendJson(res, 500, { error: 'Unable to load the asset.' });
    }
  };
}

/**
 * Student protected asset handler (class-session authority, released content only).
 * @param {object} [dependencies] - Injectable dependencies.
 * @param {() => Promise<object>} [dependencies.getRepository] - Classroom repository provider.
 * @param {ReadonlyArray<object>} [dependencies.manifest] - Protected Case Study manifest.
 * @param {ReadonlyArray<object>} [dependencies.assets] - Protected asset manifest.
 * @returns {Function} Vercel handler.
 */
export function classStudentExerciseAssetHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST,
  assets = PROTECTED_ASSET_MANIFEST
} = {}) {
  return createAssetHandler({
    getRepository,
    manifest,
    assets,
    authorizedBlocks: async (repository, sessionHash, caseManifest) => {
      const context = await repository.getExerciseForStudentSession(sessionHash);
      if (!context?.exercise) return null;
      const caseStudy = stagedCaseStudy(caseManifest, context.exercise.caseStudyId);
      if (!definitionMatches(context.exercise, caseStudy)) return null;
      return releasedStudentContent(caseStudy, context.exercise, context.releases).map(item => item.content);
    }
  });
}

/**
 * Instructor protected asset handler (class capability, current exercise definition only).
 * @param {object} [dependencies] - Injectable dependencies.
 * @param {() => Promise<object>} [dependencies.getRepository] - Classroom repository provider.
 * @param {ReadonlyArray<object>} [dependencies.manifest] - Protected Case Study manifest.
 * @param {ReadonlyArray<object>} [dependencies.assets] - Protected asset manifest.
 * @returns {Function} Vercel handler.
 */
export function classInstructorExerciseAssetHandler({
  getRepository = getClassroomRepository,
  manifest = PROTECTED_CASE_STUDY_MANIFEST,
  assets = PROTECTED_ASSET_MANIFEST
} = {}) {
  return createAssetHandler({
    getRepository,
    manifest,
    assets,
    authorizedBlocks: async (repository, instructorHash, caseManifest) => {
      const current = await repository.getCurrentExerciseForInstructor(instructorHash);
      if (!current?.exercise) return null;
      const caseStudy = stagedCaseStudy(caseManifest, current.exercise.caseStudyId);
      if (!definitionMatches(current.exercise, caseStudy)) return null;
      return caseStudy.simulation.studentContent;
    }
  });
}
