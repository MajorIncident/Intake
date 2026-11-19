/**
 * End-to-end Classroom journey through the REAL api/ handlers and repository
 * SQL, executed against an in-process Postgres (PGlite). Complements the
 * in-memory authorization matrix and the browser fixture, neither of which
 * runs the production SQL.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { setSqlFactoryForTesting } from '../api/_db.js';
import {
  resetWorkspaceRepositoryForTesting,
  workspaceHandler
} from '../api/_workspace.js';
import {
  classAdmitHandler,
  classCoachingHandler,
  classHandler,
  classObserveHandler,
  classParticipantsHandler,
  classStudentAccessHandler,
  classStudentCoachingHandler,
  classStudentHandler,
  classWorkspacesHandler,
  classInstructorTransferHandler,
  resetClassroomRepositoryForTesting
} from '../api/_classroom.js';
import { createClassroomStudentWritePolicy } from '../api/_classroomWritePolicy.js';
import { adminHandler, resetAdminRepositoryForTesting } from '../api/_admin.js';
import { createPgliteSql } from './helpers/pglite-sql.mjs';
import { response } from './helpers/classroom-test-repositories.mjs';

const ADMIN_TOKEN = 'A'.repeat(43);
const STUDENT_ONE = '11111111-1111-4111-8111-111111111111';
const STUDENT_TWO = '22222222-2222-4222-8222-222222222222';

let sql;
let previousAdminToken;

/**
 * Invokes a handler with a minimal Vercel-style request.
 * @param {Function} handler - Handler under test.
 * @param {object} request - Request fields (method, body, query, token).
 * @returns {Promise<object>} Response double.
 */
async function call(handler, { method, body, query, token, headers = {} }) {
  const res = response();
  await handler({
    method,
    body,
    query: query || {},
    headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers
  }, res);
  return res;
}

before(async () => {
  sql = await createPgliteSql();
  setSqlFactoryForTesting(() => sql);
  resetWorkspaceRepositoryForTesting();
  resetClassroomRepositoryForTesting();
  resetAdminRepositoryForTesting();
  previousAdminToken = process.env.INTAKE_ADMIN_TOKEN;
  process.env.INTAKE_ADMIN_TOKEN = ADMIN_TOKEN;
});

after(async () => {
  setSqlFactoryForTesting(null);
  resetWorkspaceRepositoryForTesting();
  resetClassroomRepositoryForTesting();
  resetAdminRepositoryForTesting();
  if (previousAdminToken === undefined) delete process.env.INTAKE_ADMIN_TOKEN;
  else process.env.INTAKE_ADMIN_TOKEN = previousAdminToken;
  await sql.close();
});

test('real SQL: class, teams, admission, assignment, editing, reassignment, observation, coaching, admin inventory', async () => {
  const created = await call(classHandler(), {
    method: 'POST',
    body: { title: 'Pilot class', classPassword: 'kepnertregoe' }
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  const instructor = created.body.instructorToken;
  const joinCode = created.body.joinCode;
  assert.match(joinCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const workspaces = classWorkspacesHandler();
  const alpha = await call(workspaces, { method: 'POST', token: instructor, body: { kind: 'group', label: 'Team Alpha', snapshot: {} } });
  const beta = await call(workspaces, { method: 'POST', token: instructor, body: { kind: 'group', label: 'Team Beta', snapshot: {} } });
  assert.equal(alpha.statusCode, 201, JSON.stringify(alpha.body));
  assert.equal(beta.statusCode, 201);

  const admit = classAdmitHandler();
  const one = await call(admit, { method: 'POST', body: { joinCode: joinCode.toLowerCase(), participantId: STUDENT_ONE, displayName: 'Ana' } });
  const two = await call(admit, { method: 'POST', body: { joinCode, participantId: STUDENT_TWO, displayName: 'Ben' } });
  assert.equal(one.statusCode, 200, JSON.stringify(one.body));
  assert.equal(two.statusCode, 200);
  assert.equal(one.body.assignment, null, 'admitted Students start Waiting');

  const participants = classParticipantsHandler();
  const roster = await call(participants, { method: 'GET', token: instructor });
  assert.equal(roster.statusCode, 200);
  assert.deepEqual(roster.body.participants.map(p => p.displayName).sort(), ['Ana', 'Ben']);

  const waitingAccess = await call(classStudentAccessHandler(), { method: 'POST', token: one.body.studentSessionToken });
  assert.equal(waitingAccess.body.workspaceToken, undefined, 'Waiting Students receive no edit authority');

  for (const participantId of [STUDENT_ONE, STUDENT_TWO]) {
    const assigned = await call(participants, { method: 'PATCH', token: instructor, body: { participantId, workspaceId: alpha.body.workspace.id } });
    assert.equal(assigned.statusCode, 200, JSON.stringify(assigned.body));
  }
  const status = await call(classStudentHandler(), { method: 'GET', token: one.body.studentSessionToken });
  assert.equal(status.body.assignment.label, 'Team Alpha');

  const access = await call(classStudentAccessHandler(), { method: 'POST', token: one.body.studentSessionToken });
  assert.equal(access.statusCode, 200, JSON.stringify(access.body));
  const alphaToken = access.body.workspaceToken;
  assert.match(alphaToken, /^[A-Za-z0-9_-]{43}$/);

  const session = workspaceHandler({ getWritePolicy: createClassroomStudentWritePolicy() });
  const loaded = await call(session, { method: 'GET', token: alphaToken });
  assert.equal(loaded.statusCode, 200, JSON.stringify(loaded.body));
  const edited = { ...loaded.body.snapshot, pre: { ...(loaded.body.snapshot?.pre || {}), oneLine: 'Cabinets rejected for paint gaps' } };
  const saved = await call(session, { method: 'PUT', token: alphaToken, body: { snapshot: edited, revision: loaded.body.revision } });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.revision, loaded.body.revision + 1);

  const stale = await call(session, { method: 'PUT', token: alphaToken, body: { snapshot: edited, revision: loaded.body.revision } });
  assert.equal(stale.statusCode, 409, 'optimistic revision rejects a stale write');

  const observed = await call(classObserveHandler(), { method: 'GET', token: instructor, query: { workspaceId: alpha.body.workspace.id } });
  assert.equal(observed.statusCode, 200, JSON.stringify(observed.body));
  assert.equal(observed.body.snapshot.pre.oneLine, 'Cabinets rejected for paint gaps');
  assert.equal(observed.body.workspaceToken, undefined, 'observation never mints edit authority');

  const coaching = await call(classCoachingHandler(), {
    method: 'PUT',
    token: instructor,
    query: { workspaceId: alpha.body.workspace.id },
    body: {
      targetId: 'problem.one-line',
      status: 'needs-improvement',
      note: 'Name the object and the deviation.',
      reviewedWorkspaceRevision: saved.body.revision,
      reviewedFieldFingerprint: 'v1-0123456789abcdef'
    }
  });
  assert.equal(coaching.statusCode, 200, JSON.stringify(coaching.body));
  const studentCoaching = await call(classStudentCoachingHandler(), { method: 'GET', token: alphaToken });
  assert.equal(studentCoaching.statusCode, 200, JSON.stringify(studentCoaching.body));
  assert.equal(JSON.stringify(studentCoaching.body).includes('Name the object and the deviation.'), true);

  const moved = await call(participants, { method: 'PATCH', token: instructor, body: { participantId: STUDENT_ONE, workspaceId: beta.body.workspace.id } });
  assert.equal(moved.statusCode, 200);
  const revoked = await call(session, { method: 'GET', token: alphaToken });
  assert.equal(revoked.statusCode, 404, 'reassignment revokes the old team edit capability');

  const betaAccess = await call(classStudentAccessHandler(), { method: 'POST', token: one.body.studentSessionToken });
  const betaLoaded = await call(session, { method: 'GET', token: betaAccess.body.workspaceToken });
  assert.equal(betaLoaded.statusCode, 200);
  assert.notEqual(betaLoaded.body.snapshot?.pre?.oneLine, 'Cabinets rejected for paint gaps', 'destination team work is not merged with the old team');

  const inventory = await call(adminHandler(), { method: 'GET', token: ADMIN_TOKEN });
  assert.equal(inventory.statusCode, 200, JSON.stringify(inventory.body));
  const serialized = JSON.stringify(inventory.body);
  assert.ok(serialized.includes('Pilot class'));
  for (const secret of [instructor, one.body.studentSessionToken, betaAccess.body.workspaceToken]) {
    assert.equal(serialized.includes(secret), false, 'inventory never exposes bearer capabilities');
  }
});

test('real SQL: a frozen staged debrief rejects Student writes with 423 and leaves the snapshot untouched', async () => {
  const { getClassroomRepository } = await import('../api/_classroom.js');
  const { hashWorkspaceToken } = await import('../api/_workspace.js');
  const created = await call(classHandler(), { method: 'POST', body: { title: 'Freeze class', classPassword: 'kepnertregoe' } });
  const instructor = created.body.instructorToken;
  const team = await call(classWorkspacesHandler(), { method: 'POST', token: instructor, body: { kind: 'group', label: 'Team Freeze', snapshot: {} } });
  const admitted = await call(classAdmitHandler(), { method: 'POST', body: { joinCode: created.body.joinCode, participantId: '33333333-3333-4333-8333-333333333333', displayName: 'Cy' } });
  await call(classParticipantsHandler(), { method: 'PATCH', token: instructor, body: { participantId: '33333333-3333-4333-8333-333333333333', workspaceId: team.body.workspace.id } });
  const access = await call(classStudentAccessHandler(), { method: 'POST', token: admitted.body.studentSessionToken });
  const token = access.body.workspaceToken;

  const repository = await getClassroomRepository();
  const instructorHash = hashWorkspaceToken(instructor);
  const exercise = await repository.createExercise(instructorHash, {
    publicId: '44444444-4444-4444-8444-444444444444',
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: 'a'.repeat(64)
  });
  const frozen = await repository.updateExerciseLifecycle(instructorHash, {
    exercisePublicId: exercise.exercise.id,
    expectedRevision: exercise.exercise.exerciseRevision,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'debrief',
    studentEditingEnabled: false
  });
  assert.equal(frozen.status, 'updated', JSON.stringify(frozen));

  const session = workspaceHandler({ getWritePolicy: createClassroomStudentWritePolicy() });
  const before = await call(session, { method: 'GET', token });
  const rejected = await call(session, {
    method: 'PUT',
    token,
    body: { snapshot: { ...before.body.snapshot, pre: { oneLine: 'written during freeze' } }, revision: before.body.revision }
  });
  assert.equal(rejected.statusCode, 423, JSON.stringify(rejected.body));
  assert.equal(rejected.body.code, 'classroom-editing-locked');
  const afterRead = await call(session, { method: 'GET', token });
  assert.equal(afterRead.body.revision, before.body.revision);
  assert.deepEqual(afterRead.body.snapshot, before.body.snapshot);

  await repository.updateExerciseLifecycle(instructorHash, {
    exercisePublicId: exercise.exercise.id,
    expectedRevision: frozen.exercise.exerciseRevision,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'debrief',
    studentEditingEnabled: true
  });
  const allowed = await call(session, {
    method: 'PUT',
    token,
    body: { snapshot: { ...before.body.snapshot, pre: { oneLine: 'written after unfreeze' } }, revision: before.body.revision }
  });
  assert.equal(allowed.statusCode, 200, JSON.stringify(allowed.body));
});

test('real SQL (#342): long team names, rename, guarded removal, and one-time Instructor device transfer', async () => {
  const created = await call(classHandler(), { method: 'POST', body: { title: 'Controls class', classPassword: 'kepnertregoe' } });
  const instructor = created.body.instructorToken;
  const workspaces = classWorkspacesHandler();

  const longName = 'L'.repeat(100);
  const longTeam = await call(workspaces, { method: 'POST', token: instructor, body: { kind: 'group', label: longName, snapshot: {} } });
  assert.equal(longTeam.statusCode, 201, 'a 100-character team name no longer overflows team_name VARCHAR(80)');
  assert.equal(longTeam.body.workspace.label, longName);

  const renamed = await call(workspaces, { method: 'PATCH', token: instructor, body: { workspaceId: longTeam.body.workspace.id, label: 'Team Red' } });
  assert.equal(renamed.statusCode, 200, JSON.stringify(renamed.body));
  const [teamRow] = await sql`SELECT cw.label, w.team_name FROM classroom_workspaces cw JOIN collaboration_workspaces w ON w.id = cw.workspace_id WHERE cw.public_id = ${longTeam.body.workspace.id}::uuid`;
  assert.deepEqual([teamRow.label, teamRow.team_name], ['Team Red', 'Team Red']);

  const admitted = await call(classAdmitHandler(), { method: 'POST', body: { joinCode: created.body.joinCode, participantId: '55555555-5555-4555-8555-555555555555', displayName: 'Dee' } });
  const participants = classParticipantsHandler();
  await call(participants, { method: 'PATCH', token: instructor, body: { participantId: '55555555-5555-4555-8555-555555555555', workspaceId: longTeam.body.workspace.id } });
  const access = await call(classStudentAccessHandler(), { method: 'POST', token: admitted.body.studentSessionToken });

  const occupied = await call(workspaces, { method: 'DELETE', token: instructor, body: { workspaceId: longTeam.body.workspace.id } });
  assert.equal(occupied.statusCode, 409);
  assert.equal(occupied.body.code, 'workspace-occupied');

  await call(participants, { method: 'PATCH', token: instructor, body: { participantId: '55555555-5555-4555-8555-555555555555', workspaceId: null } });
  const removed = await call(workspaces, { method: 'DELETE', token: instructor, body: { workspaceId: longTeam.body.workspace.id } });
  assert.equal(removed.statusCode, 200, JSON.stringify(removed.body));
  const listed = await call(workspaces, { method: 'GET', token: instructor });
  assert.equal(listed.body.workspaces.some(item => item.id === longTeam.body.workspace.id), false);
  const session = workspaceHandler({ getWritePolicy: createClassroomStudentWritePolicy() });
  const stale = await call(session, { method: 'GET', token: access.body.workspaceToken });
  assert.equal(stale.statusCode, 404, 'removed team is no longer reachable');

  const transfer = await call(classHandler(), { method: 'PATCH', token: instructor, body: { action: 'create-transfer' } });
  assert.equal(transfer.statusCode, 200, JSON.stringify(transfer.body));
  assert.match(transfer.body.transferCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const [stored] = await sql`SELECT instructor_transfer_hash FROM classroom_classes WHERE public_id = ${created.body.class.id}::uuid`;
  assert.notEqual(stored.instructor_transfer_hash, transfer.body.transferCode.replace(/-/g, ''), 'only a hash is stored');

  const redeem = classInstructorTransferHandler();
  const moved = await call(redeem, { method: 'POST', body: { transferCode: transfer.body.transferCode.toLowerCase() } });
  assert.equal(moved.statusCode, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.class.id, created.body.class.id);
  assert.equal(moved.body.joinCode, created.body.joinCode);
  assert.equal((await call(classHandler(), { method: 'GET', token: instructor })).statusCode, 404, 'old device retired');
  assert.equal((await call(classHandler(), { method: 'GET', token: moved.body.instructorToken })).statusCode, 200);
  assert.equal((await call(redeem, { method: 'POST', body: { transferCode: transfer.body.transferCode } })).statusCode, 404, 'single use');

  const second = await call(classHandler(), { method: 'PATCH', token: moved.body.instructorToken, body: { action: 'create-transfer' } });
  await sql`UPDATE classroom_classes SET instructor_transfer_expires_at = NOW() - INTERVAL '1 second' WHERE public_id = ${created.body.class.id}::uuid`;
  assert.equal((await call(redeem, { method: 'POST', body: { transferCode: second.body.transferCode } })).statusCode, 404, 'expired code fails');
});
