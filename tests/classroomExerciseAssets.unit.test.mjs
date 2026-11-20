/**
 * #316 protected staged asset delivery: Student class-session access follows
 * the cumulative staged release; Instructor access is limited to the class's
 * current exercise definition; every other request is the same 404.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classAdmitHandler, classStudentAccessHandler } from '../api/_classroom.js';
import { classExerciseHandler } from '../api/_classroomExercise.js';
import {
  classInstructorExerciseAssetHandler,
  classStudentExerciseAssetHandler,
  resolveProtectedAsset
} from '../api/_classroomExerciseAssets.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response,
  testTokenHash,
  tokenFactory
} from './helpers/classroom-test-repositories.mjs';

const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WORKSPACE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const OTHER_STUDENT = '33333333-3333-4333-8333-333333333333';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');

const ASSETS = Object.freeze([
  { id: 'cabinet-photo', kind: 'image', mediaType: 'image/png', data: PNG },
  {
    id: 'inspection-report',
    kind: 'document',
    pages: [
      { page: 1, mediaType: 'image/png', data: PNG },
      { page: 2, mediaType: 'image/jpeg', data: JPEG }
    ]
  },
  { id: 'site-photo', kind: 'image', mediaType: 'image/png', data: PNG },
  { id: 'orphan-photo', kind: 'image', mediaType: 'image/png', data: PNG }
]);

const STAGED_CASE = Object.freeze({
  id: 'synthetic-asset-case',
  name: 'Synthetic Asset Case',
  description: 'Deterministic staged case with protected assets.',
  templateKind: 'case-study',
  supportedModes: ['full'],
  state: { pre: { oneLine: 'COMPLETE SOURCE' } },
  simulation: {
    version: 1,
    studentContent: [
      { id: 'readings', kind: 'table', title: 'Readings', headers: ['Line', 'Reject rate'], rows: [['A', '2%'], ['B', '9%']] },
      { id: 'photo-1', kind: 'image', title: 'Cabinet photo', assetId: 'cabinet-photo', alt: 'A rejected cabinet with a cracked door.' },
      { id: 'report-p2', kind: 'document-page', title: 'Inspection report, page 2', assetId: 'inspection-report', page: 2, alt: 'Inspection report page 2.' },
      { id: 'photo-2', kind: 'image', title: 'Site photo', assetId: 'site-photo', alt: 'The loading dock.' }
    ],
    instructorContent: [
      { id: 'teach-1', kind: 'facilitation', title: 'Teaching', body: 'INSTRUCTOR ONLY.' }
    ],
    stages: [
      {
        id: 'stage-1',
        title: 'Clarify',
        studentObjective: 'Understand the situation.',
        initialReleaseIds: ['readings', 'photo-1'],
        optionalReleaseIds: ['report-p2'],
        intakeTargetIds: ['problem.one-line'],
        suggestedMinutes: 10,
        instructorContentIds: ['teach-1'],
        defaultDebriefEditPolicy: 'open'
      },
      {
        id: 'stage-2',
        title: 'Analyze',
        studentObjective: 'Use the new evidence.',
        initialReleaseIds: ['photo-2'],
        optionalReleaseIds: [],
        intakeTargetIds: ['problem.one-line'],
        suggestedMinutes: 8,
        instructorContentIds: [],
        defaultDebriefEditPolicy: 'open'
      }
    ]
  }
});
const MANIFEST = Object.freeze([STAGED_CASE]);
const instructorBearer = letter => ({ authorization: 'Bearer ' + letter.repeat(43) });

async function call(handler, req) {
  const res = response();
  await handler({ headers: {}, query: {}, ...req }, res);
  return res;
}

/**
 * Two classes; class A has one team, a staged exercise, and an admitted Student.
 * @returns {Promise<object>} Fixture handles.
 */
async function fixture() {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({ publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinCode: 'K7FMP4Q2' });
  await classrooms.createClass({ publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinCode: 'M8RNQ5W3' });
  const collab = await workspaceRepo.create(testTokenHash('P'), {}, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), { publicId: WORKSPACE_ID, workspaceId: collab.id, kind: 'group', label: 'Team A' });

  const admit = classAdmitHandler({ getRepository: async () => classrooms, tokenFactory: tokenFactory(['S', 'T']), rateLimiter: async () => ({ allowed: true }) });
  const studentA = await call(admit, { method: 'POST', body: { joinCode: 'K7FM-P4Q2', participantId: STUDENT, displayName: 'Ana' } });
  const studentB = await call(admit, { method: 'POST', body: { joinCode: 'M8RN-Q5W3', participantId: OTHER_STUDENT, displayName: 'Ben' } });
  await classrooms.assignParticipant(testTokenHash('A'), { participantId: STUDENT, workspacePublicId: WORKSPACE_ID, workspaceRepository: workspaceRepo });

  const exercise = classExerciseHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    manifest: MANIFEST,
    idFactory: () => EXERCISE_ID
  });
  let revision = 1;
  const lifecycle = async body => {
    const res = await call(exercise, { method: body ? 'PATCH' : 'POST', headers: instructorBearer('A'), body: body ? { ...body, expectedRevision: revision } : { caseStudyId: STAGED_CASE.id } });
    assert.ok([200, 201].includes(res.statusCode), JSON.stringify(res.body));
    revision = res.body.exercise.exerciseRevision;
    return res;
  };
  await lifecycle(null);

  const student = classStudentExerciseAssetHandler({ getRepository: async () => classrooms, manifest: MANIFEST, assets: ASSETS });
  const instructor = classInstructorExerciseAssetHandler({ getRepository: async () => classrooms, manifest: MANIFEST, assets: ASSETS });
  const studentAsset = (query, token = studentA.body.studentSessionToken) => call(student, { method: 'GET', headers: { authorization: `Bearer ${token}` }, query });
  const instructorAsset = (query, letter = 'A') => call(instructor, { method: 'GET', headers: instructorBearer(letter), query });
  return { classrooms, workspaceRepo, lifecycle, studentAsset, instructorAsset, studentA, studentB };
}

test('resolveProtectedAsset matches the representation kind and fails closed', () => {
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'cabinet-photo', page: null }).mediaType, 'image/png');
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'cabinet-photo', page: 1 }), null, 'an image has no pages');
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'inspection-report', page: null }), null, 'a document needs a page');
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'inspection-report', page: 2 }).mediaType, 'image/jpeg');
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'inspection-report', page: 3 }), null);
  assert.equal(resolveProtectedAsset(ASSETS, { assetId: 'missing', page: null }), null);
  assert.equal(resolveProtectedAsset([{ id: 'svg', kind: 'image', mediaType: 'image/svg+xml', data: 'PHN2Zz4=' }], { assetId: 'svg', page: null }), null, 'unsupported media fails closed');
});

test('Student assets follow the cumulative staged release, never ahead of it', async () => {
  const { lifecycle, studentAsset } = await fixture();
  const notFound = res => {
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Asset not found.' });
  };

  notFound(await studentAsset({ assetId: 'cabinet-photo' }));
  await lifecycle({ action: 'start' });

  const photo = await studentAsset({ assetId: 'cabinet-photo' });
  assert.equal(photo.statusCode, 200);
  assert.deepEqual(photo.body, Buffer.from(PNG, 'base64'));
  assert.equal(photo.headers['Content-Type'], 'image/png');
  assert.equal(photo.headers['Cache-Control'], 'no-store');
  assert.equal(photo.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(photo.headers['X-Content-Type-Options'], 'nosniff');

  notFound(await studentAsset({ assetId: 'inspection-report', page: '2' }));
  notFound(await studentAsset({ assetId: 'site-photo' }));
  notFound(await studentAsset({ assetId: 'orphan-photo' }));
  notFound(await studentAsset({ assetId: 'never-registered' }));

  await lifecycle({ action: 'release-content', contentId: 'report-p2' });
  const page = await studentAsset({ assetId: 'inspection-report', page: '2' });
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['Content-Type'], 'image/jpeg');
  notFound(await studentAsset({ assetId: 'inspection-report', page: '1' }));
  notFound(await studentAsset({ assetId: 'inspection-report' }));

  await lifecycle({ action: 'begin-debrief' });
  await lifecycle({ action: 'advance' });
  assert.equal((await studentAsset({ assetId: 'site-photo' })).statusCode, 200, 'the next stage releases its asset');
  assert.equal((await studentAsset({ assetId: 'cabinet-photo' })).statusCode, 200, 'earlier releases stay available');
});

test('workspace edit capabilities, other classes, and revoked sessions cannot read Student assets', async () => {
  const { classrooms, workspaceRepo, lifecycle, studentAsset, studentA, studentB } = await fixture();
  await lifecycle({ action: 'start' });

  const access = await call(classStudentAccessHandler({ getRepository: async () => classrooms, getWorkspaceRepo: async () => workspaceRepo, tokenFactory: tokenFactory(['W']) }), {
    method: 'POST', headers: { authorization: `Bearer ${studentA.body.studentSessionToken}` }
  });
  assert.equal(access.statusCode, 200);
  assert.equal((await studentAsset({ assetId: 'cabinet-photo' }, access.body.workspaceToken)).statusCode, 404, 'workspace capability is not case-asset authority');
  assert.equal((await studentAsset({ assetId: 'cabinet-photo' }, studentB.body.studentSessionToken)).statusCode, 404, 'another class');
  assert.equal((await studentAsset({ assetId: 'cabinet-photo' }, 'I'.repeat(43))).statusCode, 404, 'unknown session');

  await classrooms.revokeClass(testTokenHash('A'));
  assert.equal((await studentAsset({ assetId: 'cabinet-photo' })).statusCode, 404, 'revoked class');
});

test('Instructor assets are limited to the class current exercise definition', async () => {
  const { instructorAsset } = await fixture();
  const ahead = await instructorAsset({ assetId: 'site-photo' });
  assert.equal(ahead.statusCode, 200, 'the Instructor can preview any Student asset of the exercise');
  assert.equal(ahead.headers['Cache-Control'], 'no-store');
  assert.equal((await instructorAsset({ assetId: 'inspection-report', page: '2' })).statusCode, 200);
  assert.equal((await instructorAsset({ assetId: 'inspection-report', page: '1' })).statusCode, 404, 'unreferenced page');
  assert.equal((await instructorAsset({ assetId: 'orphan-photo' })).statusCode, 404, 'not a global asset browser');
  assert.equal((await instructorAsset({ assetId: 'cabinet-photo' }, 'B')).statusCode, 404, 'another class without that exercise');
  assert.equal((await instructorAsset({ assetId: 'cabinet-photo' }, 'S')).statusCode, 404, 'a Student session is not Instructor authority');
});

test('definition drift and malformed requests fail closed', async () => {
  const { classrooms, lifecycle, studentAsset } = await fixture();
  await lifecycle({ action: 'start' });
  const drifted = [{ ...STAGED_CASE, simulation: { ...STAGED_CASE.simulation, version: 2 } }];
  const res = await call(classStudentExerciseAssetHandler({ getRepository: async () => classrooms, manifest: drifted, assets: ASSETS }), {
    method: 'GET', headers: { authorization: 'Bearer ' + 'S'.repeat(43) }, query: { assetId: 'cabinet-photo' }
  });
  assert.equal(res.statusCode, 404);

  assert.equal((await studentAsset({ assetId: '../etc/passwd' })).statusCode, 400);
  assert.equal((await studentAsset({ assetId: 'inspection-report', page: '0' })).statusCode, 400);
  assert.equal((await studentAsset({ assetId: 'inspection-report', page: 'two' })).statusCode, 400);
  const handler = classStudentExerciseAssetHandler({ getRepository: async () => classrooms, manifest: MANIFEST, assets: ASSETS });
  assert.equal((await call(handler, { method: 'GET', query: { assetId: 'cabinet-photo' } })).statusCode, 401);
  assert.equal((await call(handler, { method: 'POST', headers: { authorization: 'Bearer ' + 'S'.repeat(43) }, query: { assetId: 'cabinet-photo' } })).statusCode, 405);
});
