/**
 * #342 Instructor class controls: team rename/remove and one-time Instructor
 * device transfer, through the real handlers over the in-memory repositories.
 * The same SQL is exercised against Postgres in classroomDatabase.pglite.test.mjs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classAdmitHandler,
  classHandler,
  classInstructorTransferHandler,
  classParticipantsHandler,
  classStudentAccessHandler,
  classWorkspacesHandler,
  formatInstructorTransferCode,
  hashInstructorTransferCode,
  normalizeInstructorTransferCode
} from '../api/_classroom.js';
import { workspaceHandler } from '../api/_workspace.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response,
  testTokenHash,
  tokenFactory
} from './helpers/classroom-test-repositories.mjs';

const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STUDENT = '11111111-1111-4111-8111-111111111111';
const allowAll = async () => ({ allowed: true });

/**
 * Builds two classes, each with one team, sharing in-memory repositories.
 * @returns {Promise<object>} Fixture handles.
 */
async function fixture() {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({ publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinCode: 'K7FMP4Q2' });
  await classrooms.createClass({ publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinCode: 'M8RNQ5W3' });
  let nextWorkspace = 0;
  const workspaceIds = ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
  const workspaces = classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['P', 'Q', 'R', 'S']),
    idFactory: () => workspaceIds[nextWorkspace++]
  });
  const call = async (handler, req) => {
    const res = response();
    await handler({ headers: {}, query: {}, ...req }, res);
    return res;
  };
  const teamA = await call(workspaces, { method: 'POST', headers: { authorization: 'Bearer ' + 'A'.repeat(43) }, body: { kind: 'group', label: 'Team Alpha', snapshot: {} } });
  const teamB = await call(workspaces, { method: 'POST', headers: { authorization: 'Bearer ' + 'B'.repeat(43) }, body: { kind: 'group', label: 'Team Beta', snapshot: {} } });
  return { classrooms, workspaceRepo, workspaces, call, teamA: teamA.body.workspace, teamB: teamB.body.workspace };
}

const bearer = letter => ({ authorization: 'Bearer ' + letter.repeat(43) });

test('transfer codes normalize, format, and hash deterministically', () => {
  assert.equal(normalizeInstructorTransferCode(' k7fm-p4q2-x9za '), 'K7FMP4Q2X9ZA');
  assert.equal(normalizeInstructorTransferCode('K7FM-P4Q2'), null, 'join-code length is rejected');
  assert.equal(normalizeInstructorTransferCode('O0I1-P4Q2-X9ZA'), null, 'ambiguous characters are rejected');
  assert.equal(formatInstructorTransferCode('K7FMP4Q2X9ZA'), 'K7FM-P4Q2-X9ZA');
  assert.match(hashInstructorTransferCode('K7FMP4Q2X9ZA'), /^[0-9a-f]{64}$/);
  assert.notEqual(hashInstructorTransferCode('K7FMP4Q2X9ZA'), hashInstructorTransferCode('K7FMP4Q2X9ZB'));
});

test('Instructor renames a team in its own class only, and the collaboration team name follows', async () => {
  const { workspaces, workspaceRepo, call, teamA, teamB, classrooms } = await fixture();
  const renamed = await call(workspaces, { method: 'PATCH', headers: bearer('A'), body: { workspaceId: teamA.id, label: '  Team   Red ' } });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.body.workspace.label, 'Team Red');
  assert.equal(classrooms.workspaces.find(item => item.id === teamA.id).label, 'Team Red');
  assert.equal([...workspaceRepo.workspaces.values()][0].teamName, 'Team Red');
  assert.equal(renamed.headers['Cache-Control'], 'no-store');

  const crossClass = await call(workspaces, { method: 'PATCH', headers: bearer('A'), body: { workspaceId: teamB.id, label: 'Hijack' } });
  assert.equal(crossClass.statusCode, 404, 'another class workspace is not found');
  assert.equal(classrooms.workspaces.find(item => item.id === teamB.id).label, 'Team Beta');

  const invalid = await call(workspaces, { method: 'PATCH', headers: bearer('A'), body: { workspaceId: teamA.id, label: '   ' } });
  assert.equal(invalid.statusCode, 400);
});

test('Instructor cannot remove a team with assigned Students; removing an empty team revokes its access', async () => {
  const { classrooms, workspaceRepo, workspaces, call, teamA } = await fixture();
  const admitted = await call(classAdmitHandler({ getRepository: async () => classrooms, tokenFactory: tokenFactory(['T']), rateLimiter: allowAll }), {
    method: 'POST', body: { joinCode: 'K7FM-P4Q2', participantId: STUDENT, displayName: 'Ana' }
  });
  const participants = classParticipantsHandler({ getRepository: async () => classrooms, getWorkspaceRepo: async () => workspaceRepo });
  await call(participants, { method: 'PATCH', headers: bearer('A'), body: { participantId: STUDENT, workspaceId: teamA.id } });
  const access = await call(classStudentAccessHandler({ getRepository: async () => classrooms, getWorkspaceRepo: async () => workspaceRepo, tokenFactory: tokenFactory(['W']) }), {
    method: 'POST', headers: { authorization: 'Bearer ' + admitted.body.studentSessionToken }
  });
  assert.equal(access.statusCode, 200);

  const occupied = await call(workspaces, { method: 'DELETE', headers: bearer('A'), body: { workspaceId: teamA.id } });
  assert.equal(occupied.statusCode, 409);
  assert.equal(occupied.body.code, 'workspace-occupied');

  await call(participants, { method: 'PATCH', headers: bearer('A'), body: { participantId: STUDENT, workspaceId: null } });
  const removed = await call(workspaces, { method: 'DELETE', headers: bearer('A'), body: { workspaceId: teamA.id } });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.body.removed, true);

  const listed = await call(workspaces, { method: 'GET', headers: bearer('A') });
  assert.deepEqual(listed.body.workspaces.map(item => item.id), [], 'removed team leaves the roster');
  const again = await call(workspaces, { method: 'DELETE', headers: bearer('A'), body: { workspaceId: teamA.id } });
  assert.equal(again.statusCode, 404);

  const oldEdit = await call(workspaceHandler({ getRepository: async () => workspaceRepo }), {
    method: 'GET', headers: { authorization: 'Bearer ' + access.body.workspaceToken }
  });
  assert.equal(oldEdit.statusCode, 404, 'no edit capability survives removal');
});

test('Students cannot rename or remove workspaces', async () => {
  const { workspaces, call, teamA } = await fixture();
  for (const method of ['PATCH', 'DELETE']) {
    const res = await call(workspaces, { method, headers: bearer('S'), body: { workspaceId: teamA.id, label: 'X' } });
    assert.equal(res.statusCode, 404);
  }
});

test('one-time transfer moves Instructor authority to a new device and retires the old one', async () => {
  const { classrooms, call } = await fixture();
  const classes = classHandler({
    getRepository: async () => classrooms,
    transferCodeFactory: () => 'K7FMP4Q2X9ZA',
    rateLimiter: allowAll
  });
  const created = await call(classes, { method: 'PATCH', headers: bearer('A'), body: { action: 'create-transfer' } });
  assert.equal(created.statusCode, 200);
  assert.equal(created.body.transferCode, 'K7FM-P4Q2-X9ZA');
  assert.ok(Date.parse(created.body.expiresAt) > Date.now());
  assert.equal(created.body.instructorToken, undefined, 'creating a code never returns a credential');

  const redeem = classInstructorTransferHandler({ getRepository: async () => classrooms, tokenFactory: tokenFactory(['N', 'O']), rateLimiter: allowAll });
  const moved = await call(redeem, { method: 'POST', body: { transferCode: 'k7fm p4q2 x9za' } });
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.body.instructorToken, 'N'.repeat(43));
  assert.equal(moved.body.class.id, CLASS_A_ID);
  assert.equal(moved.body.joinCode, 'K7FM-P4Q2');
  assert.equal(moved.body.class.internal_id, undefined);
  assert.equal(moved.headers['Cache-Control'], 'no-store');

  const oldDevice = await call(classes, { method: 'GET', headers: bearer('A') });
  assert.equal(oldDevice.statusCode, 404, 'old device credential is retired');
  const newDevice = await call(classes, { method: 'GET', headers: bearer('N') });
  assert.equal(newDevice.statusCode, 200);

  const reused = await call(redeem, { method: 'POST', body: { transferCode: 'K7FM-P4Q2-X9ZA' } });
  assert.equal(reused.statusCode, 404, 'a code works once');
  assert.equal(reused.body.code, 'transfer-invalid');
});

test('transfer codes expire, reject wrong formats, ignore Student credentials, and are rate-limited', async () => {
  const { classrooms, call } = await fixture();
  const classes = classHandler({ getRepository: async () => classrooms, transferCodeFactory: () => 'K7FMP4Q2X9ZA', rateLimiter: allowAll });
  await call(classes, { method: 'PATCH', headers: bearer('A'), body: { action: 'create-transfer' } });
  classrooms.classes.find(item => item.id === CLASS_A_ID).transferExpiresAtMs = Date.now() - 1;
  const redeem = classInstructorTransferHandler({ getRepository: async () => classrooms, tokenFactory: tokenFactory(['N']), rateLimiter: allowAll });
  const expired = await call(redeem, { method: 'POST', body: { transferCode: 'K7FM-P4Q2-X9ZA' } });
  assert.equal(expired.statusCode, 404);

  const malformed = await call(redeem, { method: 'POST', body: { transferCode: 'K7FM-P4Q2' } });
  assert.equal(malformed.statusCode, 400);

  const student = await call(classes, { method: 'PATCH', headers: bearer('S'), body: { action: 'create-transfer' } });
  assert.equal(student.statusCode, 404, 'only the class Instructor can create a transfer code');

  const limited = await call(classInstructorTransferHandler({ getRepository: async () => classrooms, rateLimiter: async () => ({ allowed: false }) }), {
    method: 'POST', body: { transferCode: 'K7FM-P4Q2-X9ZA' }
  });
  assert.equal(limited.statusCode, 429);
});
