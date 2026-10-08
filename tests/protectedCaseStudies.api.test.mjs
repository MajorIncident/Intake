/**
 * Authorization coverage for protected Case Study catalog and payload delivery.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  instructorCaseStudiesHandler,
  studentCaseStudiesHandler
} from '../api/_protectedCaseStudies.js';
import { hashWorkspaceToken } from '../api/_workspace.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response
} from './helpers/classroom-test-repositories.mjs';

const INSTRUCTOR = 'i'.repeat(43);
const STUDENT = 's'.repeat(43);
const STUDENT_SESSION = 'u'.repeat(43);
const JOIN_CODE = 'K7FMP4Q2';
const PRIMARY_WORKSPACE = 'p'.repeat(43);
const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';

const CASES = Object.freeze([
  Object.freeze({
    id: 'training-case',
    name: 'Training Case',
    description: 'Protected classroom material.',
    templateKind: 'case-study',
    supportedModes: Object.freeze(['intake', 'full']),
    state: Object.freeze({ secretEvidence: 'answer-key-content' })
  })
]);

function request(method, token, body = undefined) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body
  };
}

async function setupClassroom() {
  const classrooms = createClassroomRepository();
  const workspaces = createWorkspaceRepository();
  const instructorHash = hashWorkspaceToken(INSTRUCTOR);

  await classrooms.createClass({
    publicId: CLASS_ID,
    title: 'Protected Cases Class',
    instructorHash,
    studentJoinCode: JOIN_CODE
  });
  const workspace = await workspaces.createUntil(
    hashWorkspaceToken(PRIMARY_WORKSPACE),
    { meta: { version: 1 } },
    'future',
    'Student workspace'
  );
  await classrooms.addWorkspace(instructorHash, {
    publicId: WORKSPACE_ID,
    workspaceId: workspace.id,
    kind: 'individual',
    label: 'Student workspace'
  });
  await classrooms.admitParticipant({
    joinCode: JOIN_CODE,
    participantId: PARTICIPANT_ID,
    displayName: 'Student',
    sessionHash: hashWorkspaceToken(STUDENT_SESSION)
  });
  await classrooms.assignParticipant(instructorHash, {
    participantId: PARTICIPANT_ID,
    workspacePublicId: WORKSPACE_ID,
    workspaceRepository: workspaces
  });
  await classrooms.issueParticipantWorkspaceAccess({
    sessionHash: hashWorkspaceToken(STUDENT_SESSION),
    accessHash: hashWorkspaceToken(STUDENT),
    workspaceRepository: workspaces
  });

  return { classrooms, workspaces };
}

test('Instructor catalog requires the represented class and omits protected payload state', async () => {
  const { classrooms } = await setupClassroom();
  const handler = instructorCaseStudiesHandler({
    getRepository: async () => classrooms,
    manifest: CASES
  });

  const unauthorized = response();
  await handler(request('GET', STUDENT_SESSION), unauthorized);
  assert.equal(unauthorized.statusCode, 404);
  assert.deepEqual(unauthorized.body, { error: 'Class not found.' });

  const res = response();
  await handler(request('GET', INSTRUCTOR), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(res.body.class.id, CLASS_ID);
  assert.deepEqual(res.body.caseStudies, [{
    id: 'training-case',
    name: 'Training Case',
    description: 'Protected classroom material.',
    templateKind: 'case-study',
    supportedModes: ['intake', 'full']
  }]);
  assert.equal('state' in res.body.caseStudies[0], false);
});

test('Instructor payload uses POST body and returns protected content only after authorization', async () => {
  const { classrooms } = await setupClassroom();
  const handler = instructorCaseStudiesHandler({
    getRepository: async () => classrooms,
    manifest: CASES
  });

  const res = response();
  await handler(request('POST', INSTRUCTOR, { caseStudyId: 'training-case' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.caseStudy.id, 'training-case');
  assert.equal(res.body.caseStudy.state.secretEvidence, 'answer-key-content');

  const missing = response();
  await handler(request('POST', INSTRUCTOR, { caseStudyId: 'missing' }), missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, 'Case Study not found.');
});

test('Student access is live-participant-bound and rejects Standalone collaboration capabilities', async () => {
  const { classrooms } = await setupClassroom();
  const handler = studentCaseStudiesHandler({
    getRepository: async () => classrooms,
    manifest: CASES
  });

  const standalone = response();
  await handler(request('GET', PRIMARY_WORKSPACE), standalone);
  assert.equal(standalone.statusCode, 404);
  assert.deepEqual(standalone.body, { error: 'Class resources not found.' });

  const catalog = response();
  await handler(request('GET', STUDENT), catalog);
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.body.class.id, CLASS_ID);
  assert.equal(catalog.body.caseStudies[0].id, 'training-case');
  assert.equal('state' in catalog.body.caseStudies[0], false);

  const payload = response();
  await handler(request('POST', STUDENT, { caseStudyId: 'training-case' }), payload);
  assert.equal(payload.statusCode, 200);
  assert.equal(payload.body.workspace.id, WORKSPACE_ID);
  assert.equal(payload.body.caseStudy.state.secretEvidence, 'answer-key-content');
});

test('Protected Case Study handlers reject unauthenticated and unsupported methods without caching', async () => {
  const { classrooms } = await setupClassroom();
  const handler = studentCaseStudiesHandler({
    getRepository: async () => classrooms,
    manifest: CASES
  });

  const missingAuth = response();
  await handler(request('GET', null), missingAuth);
  assert.equal(missingAuth.statusCode, 401);
  assert.equal(missingAuth.headers['Cache-Control'], 'no-store');

  const write = response();
  await handler(request('PUT', STUDENT, { caseStudyId: 'training-case' }), write);
  assert.equal(write.statusCode, 405);
  assert.equal(write.headers.Allow, 'GET, POST');
});
