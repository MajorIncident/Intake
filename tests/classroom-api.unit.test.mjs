/**
 * Classroom API authorization coverage using the in-memory classroom harness.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLASS_JOIN_CODE_ALPHABET,
  CLASS_JOIN_CODE_LENGTH,
  CLASS_TITLE_MAX_LENGTH,
  CLASS_WORKSPACE_LABEL_MAX_LENGTH,
  COACHING_NOTE_MAX_LENGTH,
  classAdmitHandler,
  classCoachingHandler,
  classDebriefHandler,
  classHandler,
  classJoinHandler,
  classParticipantsHandler,
  classObserveHandler,
  classStudentAccessHandler,
  classStudentCoachingHandler,
  classStudentHandler,
  classWorkspacesHandler,
  formatClassJoinCode,
  normalizeClassJoinCode,
  normalizeClassroomLabel,
  normalizeCoachingNote,
  normalizeCoachingStatus,
  normalizeCoachingTargetId,
  normalizeClassroomWorkspaceKind,
  validateClassroomId,
  validateCoachingFingerprint
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
const WORKSPACE_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WORKSPACE_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WORKSPACE_C_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PARTICIPANT_A = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_B = '22222222-2222-4222-8222-222222222222';

test('classroom labels, kinds, and public IDs validate conservatively', () => {
  assert.equal(normalizeClassroomLabel('  Team   Alpha ', CLASS_WORKSPACE_LABEL_MAX_LENGTH), 'Team Alpha');
  assert.equal(normalizeClassroomLabel('', CLASS_TITLE_MAX_LENGTH), null);
  assert.equal(normalizeClassroomWorkspaceKind('individual'), 'individual');
  assert.equal(normalizeClassroomWorkspaceKind('group'), 'group');
  assert.equal(normalizeClassroomWorkspaceKind('other'), null);
  assert.equal(validateClassroomId(CLASS_A_ID), true);
  assert.equal(validateClassroomId('not-an-id'), false);
});

test('live Classroom join codes normalize to an unambiguous eight-character contract', () => {
  assert.equal(CLASS_JOIN_CODE_LENGTH, 8);
  assert.equal(CLASS_JOIN_CODE_ALPHABET.includes('0'), false);
  assert.equal(CLASS_JOIN_CODE_ALPHABET.includes('O'), false);
  assert.equal(CLASS_JOIN_CODE_ALPHABET.includes('1'), false);
  assert.equal(CLASS_JOIN_CODE_ALPHABET.includes('I'), false);
  assert.equal(normalizeClassJoinCode(' k7fm-p4q2 '), 'K7FMP4Q2');
  assert.equal(formatClassJoinCode('k7fmp4q2'), 'K7FM-P4Q2');
  assert.equal(normalizeClassJoinCode('K7F0-P4Q2'), null);
  assert.equal(normalizeClassJoinCode('too-short'), null);
});

test('live participant admission creates a waiting Student and rotates only the class-session capability', async () => {
  const classrooms = createClassroomRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });

  const first = await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });

  assert.equal(first.classroom.id, CLASS_A_ID);
  assert.equal(first.participant.id, PARTICIPANT_A);
  assert.equal(first.participant.displayName, 'Alex');
  assert.equal(first.participant.assignmentRevision, 0);
  assert.equal(first.assignment, null);

  const firstSession = await classrooms.getParticipantBySession(testTokenHash('S'));
  assert.equal(firstSession.classroom.id, CLASS_A_ID);
  assert.equal(firstSession.assignment, null);

  const readmission = await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex Updated',
    sessionHash: testTokenHash('T')
  });

  assert.equal(readmission.participant.displayName, 'Alex Updated');
  assert.equal(readmission.participant.assignmentRevision, 0);
  assert.equal(await classrooms.getParticipantBySession(testTokenHash('S')), null);
  assert.equal((await classrooms.getParticipantBySession(testTokenHash('T'))).participant.displayName, 'Alex Updated');

  const roster = await classrooms.listParticipants(testTokenHash('A'));
  assert.equal(roster.classroom.id, CLASS_A_ID);
  assert.deepEqual(roster.participants.map(item => ({
    id: item.id,
    assignment: item.assignment
  })), [{ id: PARTICIPANT_A, assignment: null }]);
});

test('live participant admission is class-scoped and invalid join codes do not create roster entries', async () => {
  const classrooms = createClassroomRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID,
    title: 'Class B',
    instructorHash: testTokenHash('B'),
    studentJoinHash: testTokenHash('D'),
    studentJoinCode: 'M8RNQ5W3'
  });

  const denied = await classrooms.admitParticipant({
    joinCode: 'ZZZZZZZZ',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });
  assert.equal(denied, null);

  await classrooms.admitParticipant({
    joinCode: 'M8RNQ5W3',
    participantId: PARTICIPANT_B,
    displayName: 'Blair',
    sessionHash: testTokenHash('T')
  });

  const classA = await classrooms.listParticipants(testTokenHash('A'));
  const classB = await classrooms.listParticipants(testTokenHash('B'));
  assert.deepEqual(classA.participants, []);
  assert.deepEqual(classB.participants.map(item => item.id), [PARTICIPANT_B]);
  assert.equal(await classrooms.listParticipants(testTokenHash('C')), null);
});

test('class creation returns raw capabilities once and stores only hashes', async () => {
  const classrooms = createClassroomRepository();
  const handler = classHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['I', 'J']),
    joinCodeFactory: () => 'K7FMP4Q2',
    idFactory: () => CLASS_A_ID
  });

  const res = response();
  await handler({ method: 'POST', body: { title: '  Fall   Workshop ' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.class.title, 'Fall Workshop');
  assert.equal(res.body.instructorToken, 'I'.repeat(43));
  assert.equal(res.body.studentJoinToken, 'J'.repeat(43));
  assert.equal(res.body.joinCode, 'K7FM-P4Q2');
  assert.equal(classrooms.classes[0].studentJoinCode, 'K7FMP4Q2');
  assert.equal(classrooms.classes[0].instructorHash, testTokenHash('I'));
  assert.equal(classrooms.classes[0].studentJoinHash, testTokenHash('J'));
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('one-code admission creates a waiting Student class session without workspace edit authority', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });

  const admit = classAdmitHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['S'])
  });
  const admitted = response();
  await admit({
    method: 'POST',
    body: {
      joinCode: ' k7fm-p4q2 ',
      participantId: PARTICIPANT_A,
      displayName: '  Alex  '
    }
  }, admitted);

  assert.equal(admitted.statusCode, 200);
  assert.equal(admitted.body.class.id, CLASS_A_ID);
  assert.equal(admitted.body.participant.displayName, 'Alex');
  assert.equal(admitted.body.participant.assignmentRevision, 0);
  assert.equal(admitted.body.assignment, null);
  assert.equal(admitted.body.studentSessionToken, 'S'.repeat(43));

  const directWorkspace = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + admitted.body.studentSessionToken }
  }, directWorkspace);
  assert.equal(directWorkspace.statusCode, 404, 'class-session authority is not collaboration edit authority');

  const invalid = response();
  await classAdmitHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['T'])
  })({
    method: 'POST',
    body: {
      joinCode: 'M8RN-Q5W3',
      participantId: PARTICIPANT_B,
      displayName: 'Blair'
    }
  }, invalid);
  assert.equal(invalid.statusCode, 404);
  assert.deepEqual(invalid.body, { error: 'Class not available.' });
});

test('Instructor participant roster is class-scoped while Student status returns only self', async () => {
  const classrooms = createClassroomRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });

  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });
  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_B,
    displayName: 'Blair',
    sessionHash: testTokenHash('T')
  });

  const rosterHandler = classParticipantsHandler({ getRepository: async () => classrooms });
  const roster = response();
  await rosterHandler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, roster);
  assert.equal(roster.statusCode, 200);
  assert.deepEqual(roster.body.participants.map(item => item.displayName), ['Alex', 'Blair']);

  const studentCannotEnumerate = response();
  await rosterHandler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, studentCannotEnumerate);
  assert.equal(studentCannotEnumerate.statusCode, 404);

  const statusHandler = classStudentHandler({ getRepository: async () => classrooms });
  const alex = response();
  await statusHandler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, alex);
  assert.equal(alex.statusCode, 200);
  assert.equal(alex.body.participant.id, PARTICIPANT_A);
  assert.equal(alex.body.participant.displayName, 'Alex');
  assert.equal(alex.body.assignment, null);
  assert.equal('participants' in alex.body, false);
  assert.equal('workspaceToken' in alex.body, false);
});

test('Student workspace access waits while unassigned and rotates assignment-specific edit authority', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });
  const workspace = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Team A current Intake' } },
    30,
    'Team A'
  );
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspace.id,
    kind: 'group',
    label: 'Team A',
    claimHash: testTokenHash('X')
  });
  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });

  const waitingHandler = classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['W'])
  });
  const waiting = response();
  await waitingHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, waiting);
  assert.equal(waiting.statusCode, 409);
  assert.equal(waiting.body.status, 'waiting');
  assert.equal(waiting.body.assignment, null);
  assert.equal('workspaceToken' in waiting.body, false);

  const participant = [...classrooms.participants.values()][0];
  participant.workspaceId = workspace.id;
  participant.assignmentRevision = 1;

  const firstAccess = response();
  await classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['W'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, firstAccess);
  assert.equal(firstAccess.statusCode, 200);
  assert.equal(firstAccess.body.assignment.id, WORKSPACE_A_ID);
  assert.equal(firstAccess.body.participant.assignmentRevision, 1);
  assert.equal(firstAccess.body.workspaceToken, 'W'.repeat(43));

  const firstLoad = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) }
  }, firstLoad);
  assert.equal(firstLoad.statusCode, 200);
  assert.equal(firstLoad.body.snapshot.pre.oneLine, 'Team A current Intake');

  await classrooms.upsertFeedback(testTokenHash('A'), WORKSPACE_A_ID, {
    targetId: 'problem.one-line',
    status: 'meets-standard',
    note: 'Clear',
    reviewedWorkspaceRevision: 1,
    reviewedFieldFingerprint: 'v1-0123456789abcdef'
  });
  const liveCoaching = response();
  await classStudentCoachingHandler({ getRepository: async () => classrooms })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) }
  }, liveCoaching);
  assert.equal(liveCoaching.statusCode, 200);
  assert.deepEqual(liveCoaching.body.feedback.map(item => item.targetId), ['problem.one-line']);

  const rotated = response();
  await classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['V'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, rotated);
  assert.equal(rotated.statusCode, 200);
  assert.equal(rotated.body.workspaceToken, 'V'.repeat(43));

  const oldLoad = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) }
  }, oldLoad);
  assert.equal(oldLoad.statusCode, 404);

  const newLoad = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'V'.repeat(43) }
  }, newLoad);
  assert.equal(newLoad.statusCode, 200);
});

test('Instructor assign -> reassign -> unassign revokes old authority and never merges team Intake', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID,
    title: 'Class B',
    instructorHash: testTokenHash('B'),
    studentJoinHash: testTokenHash('D'),
    studentJoinCode: 'M8RNQ5W3'
  });

  const teamA = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Team A original' } },
    30,
    'Team A'
  );
  const teamB = await workspaceRepo.create(
    testTokenHash('Q'),
    { pre: { oneLine: 'Team B original' } },
    30,
    'Team B'
  );
  const otherClass = await workspaceRepo.create(
    testTokenHash('R'),
    { pre: { oneLine: 'Other class' } },
    30,
    'Other Class Team'
  );

  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: teamA.id,
    kind: 'group',
    label: 'Team A',
    claimHash: testTokenHash('X')
  });
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_B_ID,
    workspaceId: teamB.id,
    kind: 'group',
    label: 'Team B',
    claimHash: testTokenHash('Y')
  });
  await classrooms.addWorkspace(testTokenHash('B'), {
    publicId: WORKSPACE_C_ID,
    workspaceId: otherClass.id,
    kind: 'group',
    label: 'Other Class Team',
    claimHash: testTokenHash('Z')
  });
  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });

  const participantHandler = classParticipantsHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  const assigned = response();
  await participantHandler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: WORKSPACE_A_ID }
  }, assigned);
  assert.equal(assigned.statusCode, 200);
  assert.equal(assigned.body.changed, true);
  assert.equal(assigned.body.assignment.id, WORKSPACE_A_ID);
  assert.equal(assigned.body.participant.assignmentRevision, 1);

  const repeated = response();
  await participantHandler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: WORKSPACE_A_ID }
  }, repeated);
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.changed, false);
  assert.equal(repeated.body.participant.assignmentRevision, 1);

  const teamAAccess = response();
  await classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['W'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, teamAAccess);
  assert.equal(teamAAccess.statusCode, 200);
  assert.equal(teamAAccess.body.workspaceToken, 'W'.repeat(43));

  const editedA = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: {
      revision: 1,
      snapshot: { pre: { oneLine: 'Alex changed Team A only' } }
    }
  }, editedA);
  assert.equal(editedA.statusCode, 200);

  await workspaceRepo.upsertPresence(testTokenHash('W'), PARTICIPANT_A, 'Alex');

  const moved = response();
  await participantHandler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: WORKSPACE_B_ID }
  }, moved);
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.body.changed, true);
  assert.equal(moved.body.assignment.id, WORKSPACE_B_ID);
  assert.equal(moved.body.participant.assignmentRevision, 2);

  const staleRead = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) }
  }, staleRead);
  assert.equal(staleRead.statusCode, 404);

  const staleWrite = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: {
      revision: 2,
      snapshot: { pre: { oneLine: 'Must never become Team B' } }
    }
  }, staleWrite);
  assert.equal(staleWrite.statusCode, 404);

  const staleCoaching = response();
  await classStudentCoachingHandler({ getRepository: async () => classrooms })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) }
  }, staleCoaching);
  assert.equal(staleCoaching.statusCode, 404);

  const oldPresence = await workspaceRepo.observeById(teamA.id);
  assert.deepEqual(oldPresence.participants, []);

  const teamASnapshot = await workspaceRepo.load(testTokenHash('P'));
  const teamBSnapshotBeforeAccess = await workspaceRepo.load(testTokenHash('Q'));
  assert.equal(teamASnapshot.snapshot.pre.oneLine, 'Alex changed Team A only');
  assert.equal(teamBSnapshotBeforeAccess.snapshot.pre.oneLine, 'Team B original');

  const studentStatus = response();
  await classStudentHandler({ getRepository: async () => classrooms })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, studentStatus);
  assert.equal(studentStatus.statusCode, 200);
  assert.equal(studentStatus.body.assignment.id, WORKSPACE_B_ID);
  assert.equal(studentStatus.body.participant.assignmentRevision, 2);

  const teamBAccess = response();
  await classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['V'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, teamBAccess);
  assert.equal(teamBAccess.statusCode, 200);
  assert.equal(teamBAccess.body.workspaceToken, 'V'.repeat(43));

  const teamBLoad = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'V'.repeat(43) }
  }, teamBLoad);
  assert.equal(teamBLoad.statusCode, 200);
  assert.equal(teamBLoad.body.snapshot.pre.oneLine, 'Team B original');

  const crossClass = response();
  await participantHandler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: WORKSPACE_C_ID }
  }, crossClass);
  assert.equal(crossClass.statusCode, 404);

  const afterCrossClass = response();
  await classStudentHandler({ getRepository: async () => classrooms })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, afterCrossClass);
  assert.equal(afterCrossClass.body.assignment.id, WORKSPACE_B_ID);
  assert.equal(afterCrossClass.body.participant.assignmentRevision, 2);

  const unassigned = response();
  await participantHandler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: null }
  }, unassigned);
  assert.equal(unassigned.statusCode, 200);
  assert.equal(unassigned.body.changed, true);
  assert.equal(unassigned.body.assignment, null);
  assert.equal(unassigned.body.participant.assignmentRevision, 3);

  const oldTeamBLoad = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'V'.repeat(43) }
  }, oldTeamBLoad);
  assert.equal(oldTeamBLoad.statusCode, 404);

  const waitingAgain = response();
  await classStudentAccessHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['U'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, waitingAgain);
  assert.equal(waitingAgain.statusCode, 409);
  assert.equal(waitingAgain.body.status, 'waiting');
  assert.equal('workspaceToken' in waitingAgain.body, false);
});

test('individual live workspace rejects a second Student without disturbing either assignment', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });
  const individual = await workspaceRepo.create(testTokenHash('P'), {}, 30, 'Alex workspace');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: individual.id,
    kind: 'individual',
    label: 'Individual 1',
    claimHash: testTokenHash('X')
  });
  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });
  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_B,
    displayName: 'Blair',
    sessionHash: testTokenHash('T')
  });

  const handler = classParticipantsHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  const first = response();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_A, workspaceId: WORKSPACE_A_ID }
  }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.participant.assignmentRevision, 1);

  const denied = response();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { participantId: PARTICIPANT_B, workspaceId: WORKSPACE_A_ID }
  }, denied);
  assert.equal(denied.statusCode, 409);

  const alex = await classrooms.getParticipantBySession(testTokenHash('S'));
  const blair = await classrooms.getParticipantBySession(testTokenHash('T'));
  assert.equal(alex.assignment.id, WORKSPACE_A_ID);
  assert.equal(alex.participant.assignmentRevision, 1);
  assert.equal(blair.assignment, null);
  assert.equal(blair.participant.assignmentRevision, 0);
});

test('class admin rejects missing or malformed authorization before repository access', async () => {
  let accessed = false;
  const handler = classHandler({
    getRepository: async () => {
      accessed = true;
      return createClassroomRepository();
    }
  });

  const missing = response();
  await handler({ method: 'GET', headers: {} }, missing);
  assert.equal(missing.statusCode, 401);

  const malformed = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer short' } }, malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(accessed, false);
});

test('instructor workspace creation is class-bound and returns only an assignment capability', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C')
  });

  const handler = classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['P', 'X']),
    idFactory: () => WORKSPACE_A_ID
  });

  const created = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: {
      kind: 'group',
      label: '  Team   Alpha ',
      snapshot: { pre: { oneLine: 'Seeded case' } }
    }
  }, created);

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.workspace.id, WORKSPACE_A_ID);
  assert.equal(created.body.workspace.label, 'Team Alpha');
  assert.equal(created.body.workspace.expiresAt, 'future');
  assert.equal(created.body.assignmentToken, 'X'.repeat(43));
  assert.equal('workspaceToken' in created.body, false, 'internal primary collaboration capability is not returned');

  const storedWorkspace = [...workspaceRepo.workspaces.values()][0];
  assert.equal(storedWorkspace.expires_at, 'future', 'workspace inherits exact class expiry');
  assert.equal(storedWorkspace.snapshot.pre.oneLine, 'Seeded case');

  const listed = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'A'.repeat(43) } }, listed);
  assert.deepEqual(listed.body.workspaces.map(item => item.id), [WORKSPACE_A_ID]);
  assert.equal('assignmentToken' in listed.body.workspaces[0], false);
});

test('instructor workspace listing stays inside the authorized class', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinHash: testTokenHash('D')
  });

  const a = await workspaceRepo.create(testTokenHash('P'), { marker: 'A' }, 30, 'Team A');
  const b = await workspaceRepo.create(testTokenHash('Q'), { marker: 'B' }, 30, 'Team B');

  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: a.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });
  await classrooms.addWorkspace(testTokenHash('B'), {
    publicId: WORKSPACE_B_ID, workspaceId: b.id, kind: 'group', label: 'Team B', claimHash: testTokenHash('Y')
  });

  const handler = classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  const aRes = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'A'.repeat(43) } }, aRes);
  assert.deepEqual(aRes.body.workspaces.map(item => item.id), [WORKSPACE_A_ID]);

  const bRes = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'B'.repeat(43) } }, bRes);
  assert.deepEqual(bRes.body.workspaces.map(item => item.id), [WORKSPACE_B_ID]);
});

test('student join cannot enumerate and cross-class assignment pairing fails generically', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinHash: testTokenHash('D')
  });
  const b = await workspaceRepo.create(testTokenHash('Q'), { marker: 'B' }, 30, 'Team B');
  await classrooms.addWorkspace(testTokenHash('B'), {
    publicId: WORKSPACE_B_ID, workspaceId: b.id, kind: 'group', label: 'Team B', claimHash: testTokenHash('Y')
  });

  const handler = classJoinHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['S'])
  });

  const enumerate = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'C'.repeat(43) } }, enumerate);
  assert.equal(enumerate.statusCode, 405);

  const mismatch = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'C'.repeat(43) },
    body: { participantId: PARTICIPANT_A, displayName: 'Alex', assignmentToken: 'Y'.repeat(43) }
  }, mismatch);
  assert.equal(mismatch.statusCode, 404);
  assert.deepEqual(mismatch.body, { error: 'Class assignment not found.' });
});

test('successful join returns a workspace capability accepted by the existing session handler', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const workspace = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Classroom problem' } },
    30,
    'Team A'
  );
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: workspace.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });

  const join = response();
  await classJoinHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['S'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'C'.repeat(43) },
    body: { participantId: PARTICIPANT_A, displayName: '  Alex  ', assignmentToken: 'X'.repeat(43) }
  }, join);

  assert.equal(join.statusCode, 200);
  assert.equal(join.body.workspaceToken, 'S'.repeat(43));
  assert.equal(join.body.self.displayName, 'Alex');

  const load = response();
  await workspaceHandler({ getRepository: async () => workspaceRepo })({
    method: 'GET',
    headers: { authorization: 'Bearer ' + join.body.workspaceToken }
  }, load);
  assert.equal(load.statusCode, 200);
  assert.equal(load.body.snapshot.pre.oneLine, 'Classroom problem');
});

test('individual assignments are claim-once while group assignments support multiple participants', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const individual = await workspaceRepo.create(testTokenHash('P'), {}, 30, 'Individual');
  const group = await workspaceRepo.create(testTokenHash('Q'), {}, 30, 'Group');

  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: individual.id, kind: 'individual', label: 'Individual', claimHash: testTokenHash('X')
  });
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_B_ID, workspaceId: group.id, kind: 'group', label: 'Group', claimHash: testTokenHash('Y')
  });

  const joinHandler = classJoinHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['S', 'T', 'U', 'V'])
  });

  const first = response();
  await joinHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'C'.repeat(43) },
    body: { participantId: PARTICIPANT_A, displayName: 'Alex', assignmentToken: 'X'.repeat(43) }
  }, first);
  assert.equal(first.statusCode, 200);

  const second = response();
  await joinHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'C'.repeat(43) },
    body: { participantId: PARTICIPANT_B, displayName: 'Blair', assignmentToken: 'X'.repeat(43) }
  }, second);
  assert.equal(second.statusCode, 404);

  for (const [participantId, displayName] of [[PARTICIPANT_A, 'Alex'], [PARTICIPANT_B, 'Blair']]) {
    const joined = response();
    await joinHandler({
      method: 'POST',
      headers: { authorization: 'Bearer ' + 'C'.repeat(43) },
      body: { participantId, displayName, assignmentToken: 'Y'.repeat(43) }
    }, joined);
    assert.equal(joined.statusCode, 200);
    assert.equal(joined.body.workspace.id, WORKSPACE_B_ID);
  }
});

test('join and assignment capabilities rotate independently', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const workspace = await workspaceRepo.create(testTokenHash('P'), {}, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: workspace.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });

  const admin = classHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['D', 'B'])
  });
  const rotateJoin = response();
  await admin({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { action: 'rotate-student-join' }
  }, rotateJoin);
  assert.equal(rotateJoin.body.studentJoinToken, 'D'.repeat(43));

  const workspaceAdmin = classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['Y'])
  });
  const rotateAssignment = response();
  await workspaceAdmin({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { action: 'rotate-assignment', workspaceId: WORKSPACE_A_ID }
  }, rotateAssignment);
  assert.equal(rotateAssignment.body.assignmentToken, 'Y'.repeat(43));

  for (const [joinChar, assignmentChar] of [['C', 'Y'], ['D', 'X']]) {
    const rejected = response();
    await classJoinHandler({
      getRepository: async () => classrooms,
      getWorkspaceRepo: async () => workspaceRepo,
      tokenFactory: tokenFactory(['S'])
    })({
      method: 'POST',
      headers: { authorization: 'Bearer ' + joinChar.repeat(43) },
      body: { participantId: PARTICIPANT_A, displayName: 'Alex', assignmentToken: assignmentChar.repeat(43) }
    }, rejected);
    assert.equal(rejected.statusCode, 404);
  }

  const accepted = response();
  await classJoinHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['T'])
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'D'.repeat(43) },
    body: { participantId: PARTICIPANT_A, displayName: 'Alex', assignmentToken: 'Y'.repeat(43) }
  }, accepted);
  assert.equal(accepted.statusCode, 200);

  const rotateInstructor = response();
  await admin({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { action: 'rotate-instructor' }
  }, rotateInstructor);
  assert.equal(rotateInstructor.body.instructorToken, 'B'.repeat(43));

  const oldInstructor = response();
  await admin({ method: 'GET', headers: { authorization: 'Bearer ' + 'A'.repeat(43) } }, oldInstructor);
  assert.equal(oldInstructor.statusCode, 404);

  const newInstructor = response();
  await admin({ method: 'GET', headers: { authorization: 'Bearer ' + 'B'.repeat(43) } }, newInstructor);
  assert.equal(newInstructor.statusCode, 200);
});

test('join disablement and class revocation stop new classroom access', async () => {
  const classrooms = createClassroomRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });

  const admin = classHandler({ getRepository: async () => classrooms });

  const disabled = response();
  await admin({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { action: 'set-joins', enabled: false }
  }, disabled);
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.body.class.joinsEnabled, false);

  const revoked = response();
  await admin({
    method: 'DELETE',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, revoked);
  assert.equal(revoked.statusCode, 200);

  const after = response();
  await admin({ method: 'GET', headers: { authorization: 'Bearer ' + 'A'.repeat(43) } }, after);
  assert.equal(after.statusCode, 404);
});

test('invalid instructor capability cannot create an orphan collaboration workspace', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  let creates = 0;
  const guarded = {
    ...workspaceRepo,
    async create(...args) {
      creates += 1;
      return workspaceRepo.create(...args);
    }
  };

  const res = response();
  await classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => guarded
  })({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { kind: 'group', label: 'Team', snapshot: {} }
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(creates, 0);
});


test('Instructor observation is class-scoped, revision-aware, and returns no editable capability', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinHash: testTokenHash('D')
  });
  const workspace = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Initial student problem' } },
    30,
    'Team A'
  );
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspace.id,
    kind: 'group',
    label: 'Team Alpha',
    claimHash: testTokenHash('X')
  });
  await workspaceRepo.upsertPresence(testTokenHash('P'), PARTICIPANT_A, 'Alex');

  const handler = classObserveHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  const first = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, first);

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.class.id, CLASS_A_ID);
  assert.equal(first.body.workspace.id, WORKSPACE_A_ID);
  assert.equal(first.body.workspace.kind, 'group');
  assert.equal(first.body.workspace.label, 'Team Alpha');
  assert.equal(first.body.workspace.teamName, 'Team A');
  assert.equal(first.body.workspace.revision, 1);
  assert.equal(first.body.snapshot.pre.oneLine, 'Initial student problem');
  assert.equal(first.body.participants[0].displayName, 'Alex');
  assert.equal('workspaceToken' in first.body, false);
  assert.equal('token' in first.body, false);

  const updated = await workspaceRepo.update(
    testTokenHash('P'),
    { pre: { oneLine: 'Updated student problem' } },
    1
  );
  assert.equal(updated.status, 'updated');

  const second = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.workspace.revision, 2);
  assert.equal(second.body.snapshot.pre.oneLine, 'Updated student problem');
});

test('Instructor observation rejects cross-class and non-Instructor capabilities generically', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinHash: testTokenHash('D')
  });
  const workspace = await workspaceRepo.create(testTokenHash('P'), { marker: 'A' }, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspace.id,
    kind: 'group',
    label: 'Team A',
    claimHash: testTokenHash('X')
  });

  const handler = classObserveHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  for (const token of ['B', 'C']) {
    const denied = response();
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer ' + token.repeat(43) },
      query: { workspaceId: WORKSPACE_A_ID }
    }, denied);
    assert.equal(denied.statusCode, 404);
    assert.deepEqual(denied.body, { error: 'Workspace not found.' });
  }
});

test('Instructor observation is GET-only and cannot mutate a Student snapshot', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const workspace = await workspaceRepo.create(testTokenHash('P'), { marker: 'unchanged' }, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspace.id,
    kind: 'individual',
    label: 'Alex',
    claimHash: testTokenHash('X')
  });

  const handler = classObserveHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo
  });

  const writeAttempt = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID },
    body: { snapshot: { marker: 'mutated' } }
  }, writeAttempt);

  assert.equal(writeAttempt.statusCode, 405);
  assert.equal(writeAttempt.headers.Allow, 'GET');

  const observed = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, observed);
  assert.equal(observed.body.snapshot.marker, 'unchanged');
});

test('Instructor observation validates the public workspace selector before repository access', async () => {
  let repositoryReads = 0;
  const handler = classObserveHandler({
    getRepository: async () => {
      repositoryReads += 1;
      return createClassroomRepository();
    },
    getWorkspaceRepo: async () => createWorkspaceRepository()
  });

  const invalid = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: 'not-a-workspace' }
  }, invalid);

  assert.equal(invalid.statusCode, 400);
  assert.equal(repositoryReads, 0);
});

test('coaching identifiers, status, note, and fingerprints validate independently from Intake state', () => {
  assert.equal(normalizeCoachingTargetId(' Problem.One-Line '), 'problem.one-line');
  assert.equal(normalizeCoachingTargetId('kt.where-location'), 'kt.where-location');
  assert.equal(normalizeCoachingTargetId('bad target'), null);
  assert.equal(normalizeCoachingTargetId('.problem'), null);
  assert.equal(normalizeCoachingTargetId('problem.'), null);
  assert.equal(normalizeCoachingTargetId('problem..one-line'), null);
  assert.equal(normalizeCoachingTargetId('problem.-one-line'), null);
  assert.equal(normalizeCoachingTargetId('problem.one-line-'), null);
  assert.equal(normalizeCoachingStatus('meets-standard'), 'meets-standard');
  assert.equal(normalizeCoachingStatus('needs-improvement'), 'needs-improvement');
  assert.equal(normalizeCoachingStatus('great'), null);
  assert.equal(normalizeCoachingNote('  Helpful note\nwith detail  '), 'Helpful note\nwith detail');
  assert.equal(normalizeCoachingNote('x'.repeat(COACHING_NOTE_MAX_LENGTH + 1)), null);
  assert.equal(validateCoachingFingerprint('v1-0123456789abcdef'), true);
  assert.equal(validateCoachingFingerprint('0123456789abcdef'), false);
});

test('Instructor coaching is class-scoped, independently revisioned, and does not mutate Student Intake revision', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const workspace = await workspaceRepo.create(testTokenHash('P'), { pre: { oneLine: 'Student work' } }, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: workspace.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });

  const handler = classCoachingHandler({ getRepository: async () => classrooms });
  const first = response();
  await handler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID },
    body: {
      targetId: 'problem.one-line',
      status: 'needs-improvement',
      note: 'Make the deviation measurable.',
      reviewedWorkspaceRevision: 1,
      reviewedFieldFingerprint: 'v1-0123456789abcdef'
    }
  }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.feedback.feedbackRevision, 1);
  assert.equal(workspace.revision, 1);

  const second = response();
  await handler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID },
    body: {
      targetId: 'problem.one-line',
      status: 'meets-standard',
      note: '',
      reviewedWorkspaceRevision: 1,
      reviewedFieldFingerprint: 'v1-fedcba9876543210'
    }
  }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.feedback.feedbackRevision, 2);
  assert.equal(second.body.feedback.status, 'meets-standard');
  assert.equal(workspace.revision, 1);

  const listed = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, listed);
  assert.deepEqual(listed.body.feedback.map(item => item.targetId), ['problem.one-line']);
});

test('Instructor coaching cannot cross class boundaries and clearing is coaching-only', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  await classrooms.createClass({
    publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinHash: testTokenHash('D')
  });
  const workspace = await workspaceRepo.create(testTokenHash('P'), { marker: 'A' }, 30, 'Team A');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: workspace.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });
  const handler = classCoachingHandler({ getRepository: async () => classrooms });

  const denied = response();
  await handler({
    method: 'GET', headers: { authorization: 'Bearer ' + 'B'.repeat(43) }, query: { workspaceId: WORKSPACE_A_ID }
  }, denied);
  assert.equal(denied.statusCode, 404);

  await classrooms.upsertFeedback(testTokenHash('A'), WORKSPACE_A_ID, {
    targetId: 'problem.one-line', status: 'needs-improvement', note: 'Clarify',
    reviewedWorkspaceRevision: 1, reviewedFieldFingerprint: 'v1-0123456789abcdef'
  });
  const cleared = response();
  await handler({
    method: 'DELETE',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID },
    body: { targetId: 'problem.one-line' }
  }, cleared);
  assert.equal(cleared.statusCode, 200);
  assert.equal(cleared.body.cleared, true);
  assert.equal(workspace.revision, 1);
});

test('Student coaching GET resolves only the membership behind its workspace capability and is read-only', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classrooms.createClass({
    publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinHash: testTokenHash('C')
  });
  const a = await workspaceRepo.create(testTokenHash('P'), {}, 30, 'Team A');
  const b = await workspaceRepo.create(testTokenHash('Q'), {}, 30, 'Team B');
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID, workspaceId: a.id, kind: 'group', label: 'Team A', claimHash: testTokenHash('X')
  });
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_B_ID, workspaceId: b.id, kind: 'group', label: 'Team B', claimHash: testTokenHash('Y')
  });
  await classrooms.joinWorkspace({
    studentJoinHash: testTokenHash('C'), claimHash: testTokenHash('X'), participantId: PARTICIPANT_A,
    accessHash: testTokenHash('S'), workspaceRepository: workspaceRepo
  });
  await classrooms.joinWorkspace({
    studentJoinHash: testTokenHash('C'), claimHash: testTokenHash('Y'), participantId: PARTICIPANT_B,
    accessHash: testTokenHash('T'), workspaceRepository: workspaceRepo
  });
  await classrooms.upsertFeedback(testTokenHash('A'), WORKSPACE_A_ID, {
    targetId: 'problem.one-line', status: 'meets-standard', note: 'Clear',
    reviewedWorkspaceRevision: 3, reviewedFieldFingerprint: 'v1-0123456789abcdef'
  });
  await classrooms.upsertFeedback(testTokenHash('A'), WORKSPACE_B_ID, {
    targetId: 'impact.current', status: 'needs-improvement', note: 'Quantify',
    reviewedWorkspaceRevision: 2, reviewedFieldFingerprint: 'v1-fedcba9876543210'
  });

  const handler = classStudentCoachingHandler({ getRepository: async () => classrooms });
  const studentA = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'S'.repeat(43) } }, studentA);
  assert.equal(studentA.statusCode, 200);
  assert.equal(studentA.body.workspace.id, WORKSPACE_A_ID);
  assert.deepEqual(studentA.body.feedback.map(item => item.targetId), ['problem.one-line']);

  const write = response();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + 'S'.repeat(43) } }, write);
  assert.equal(write.statusCode, 405);

  const legacy = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + 'P'.repeat(43) } }, legacy);
  assert.equal(legacy.statusCode, 404);
});

test('coaching API rejects malformed feedback before any write', async () => {
  let writes = 0;
  const handler = classCoachingHandler({
    getRepository: async () => ({
      upsertFeedback: async () => { writes += 1; return null; },
      listFeedbackForInstructor: async () => null,
      deleteFeedback: async () => null
    })
  });
  const invalid = response();
  await handler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID },
    body: {
      targetId: 'bad target', status: 'great', reviewedWorkspaceRevision: 0, reviewedFieldFingerprint: 'bad'
    }
  }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(writes, 0);
});


function collectObjectKeys(value, keys = new Set()) {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach(item => collectObjectKeys(item, keys));
    return keys;
  }
  Object.entries(value).forEach(([key, item]) => {
    keys.add(key);
    collectObjectKeys(item, keys);
  });
  return keys;
}

test('Instructor debrief comparison returns projected evidence only and is GET-only', async () => {
  let repositoryReads = 0;
  const repository = {
    async listWorkspaces() {
      repositoryReads += 1;
      return {
        classroom: {
          id: CLASS_A_ID,
          title: 'Class A',
          expiresAt: '2099-01-01T00:00:00Z'
        },
        workspaces: [{
          id: WORKSPACE_A_ID,
          kind: 'group',
          label: 'Team Alpha',
          participantCount: 2,
          activeParticipantCount: 1,
          editingParticipantCount: 0,
          lastSeenAt: '2026-10-07T18:00:00Z'
        }]
      };
    },
    async listWorkspaceSnapshotsForInstructor() {
      repositoryReads += 1;
      return {
        snapshots: [{
          workspaceId: WORKSPACE_A_ID,
          workspaceRevision: 2,
          updatedAt: '2026-10-07T18:01:00Z',
          snapshot: { pre: { oneLine: 'Team Alpha current reasoning' } }
        }]
      };
    },
    async listFeedbackForClassInstructor() {
      repositoryReads += 1;
      return {
        feedback: [{
          workspaceId: WORKSPACE_A_ID,
          targetId: 'problem.one-line',
          status: 'meets-standard',
          note: 'Private coaching note must not enter aggregate comparison.',
          reviewedWorkspaceRevision: 1,
          reviewedFieldFingerprint: 'v1-0000000000000000',
          feedbackRevision: 2
        }]
      };
    },
    async getCurrentExerciseForInstructor() {
      repositoryReads += 1;
      return null;
    }
  };

  const handler = classDebriefHandler({
    getRepository: async () => repository
  });

  const result = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, result);

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['Referrer-Policy'], 'no-referrer');
  assert.equal(result.body.class.id, CLASS_A_ID);
  assert.equal(result.body.workspaces.length, 1);
  assert.equal(result.body.workspaces[0].current.workspaceRevision, 2);
  assert.equal(
    result.body.workspaces[0].current.targets
      .find(target => target.id === 'problem.one-line')
      .comparisonText,
    'Team Alpha current reasoning'
  );
  assert.equal(result.body.workspaces[0].coaching.meetsStandardCount, 1);
  assert.equal(result.body.workspaces[0].coaching.changedSinceReviewCount, 1);

  const keys = collectObjectKeys(result.body);
  for (const forbidden of ['snapshot', 'note', 'internalId', 'workspaceToken', 'assignmentToken', 'instructorToken']) {
    assert.equal(keys.has(forbidden), false, `aggregate response must not expose ${forbidden}`);
  }

  const readsBeforeWriteAttempt = repositoryReads;
  const writeAttempt = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { targetId: 'problem.one-line' }
  }, writeAttempt);
  assert.equal(writeAttempt.statusCode, 405);
  assert.equal(writeAttempt.headers.Allow, 'GET');
  assert.equal(repositoryReads, readsBeforeWriteAttempt, 'write rejection occurs before repository access');
});

test('Instructor debrief comparison composes current staged readiness and immutable checkpoint projections', async () => {
  const repository = {
    async listWorkspaces() {
      return {
        classroom: {
          id: CLASS_A_ID,
          title: 'Class A',
          expiresAt: '2099-01-01T00:00:00Z'
        },
        workspaces: [
          {
            id: WORKSPACE_A_ID,
            kind: 'group',
            label: 'Team Alpha',
            participantCount: 2,
            activeParticipantCount: 1,
            editingParticipantCount: 0
          },
          {
            id: WORKSPACE_B_ID,
            kind: 'group',
            label: 'Team Beta',
            participantCount: 3,
            activeParticipantCount: 0,
            editingParticipantCount: 0
          }
        ]
      };
    },
    async listWorkspaceSnapshotsForInstructor() {
      return {
        snapshots: [
          {
            workspaceId: WORKSPACE_A_ID,
            workspaceRevision: 7,
            updatedAt: '2026-10-07T18:01:00Z',
            snapshot: { pre: { oneLine: 'Team Alpha live reasoning' } }
          },
          {
            workspaceId: WORKSPACE_B_ID,
            workspaceRevision: 4,
            updatedAt: '2026-10-07T18:01:00Z',
            snapshot: { pre: { oneLine: 'Team Beta live reasoning' } }
          }
        ]
      };
    },
    async listFeedbackForClassInstructor() {
      return { feedback: [] };
    },
    async getCurrentExerciseForInstructor() {
      return {
        exercise: {
          id: 'exercise-1',
          status: 'active',
          currentStageId: 'stage-1',
          stagePhase: 'debrief'
        }
      };
    },
    async listExerciseWorkspaceStateForInstructor(_instructorHash, exerciseId) {
      assert.equal(exerciseId, 'exercise-1');
      return {
        workspaceState: [{
          workspaceId: WORKSPACE_A_ID,
          stageId: 'stage-1',
          readyForDebrief: true,
          readyWorkspaceRevision: 5,
          readyAt: '2026-10-07T17:55:00Z'
        }]
      };
    },
    async listExerciseCheckpointSnapshotsForInstructor(_instructorHash, exerciseId, stageId) {
      assert.equal(exerciseId, 'exercise-1');
      assert.equal(stageId, 'stage-1');
      return {
        checkpoints: [{
          workspaceId: WORKSPACE_A_ID,
          stageId: 'stage-1',
          workspaceRevision: 5,
          capturedAt: '2026-10-07T17:56:00Z',
          snapshot: { pre: { oneLine: 'Checkpoint reasoning' } }
        }]
      };
    }
  };

  const handler = classDebriefHandler({
    getRepository: async () => repository
  });
  const result = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, result);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.exercise.currentStageId, 'stage-1');
  const alpha = result.body.workspaces.find(workspace => workspace.id === WORKSPACE_A_ID);
  const beta = result.body.workspaces.find(workspace => workspace.id === WORKSPACE_B_ID);
  assert.equal(alpha.readiness.readyForDebrief, true);
  assert.equal(alpha.readiness.workspaceRevision, 5);
  assert.equal(alpha.checkpoint.workspaceRevision, 5);
  assert.equal(
    alpha.checkpoint.targets.find(target => target.id === 'problem.one-line').comparisonText,
    'Checkpoint reasoning'
  );
  assert.equal(
    alpha.current.targets.find(target => target.id === 'problem.one-line').comparisonText,
    'Team Alpha live reasoning'
  );
  assert.equal(beta.readiness, null);
  assert.equal(beta.checkpoint, null);
});

test('non-Instructor classroom capabilities cannot read the class debrief comparison', async () => {
  const workspaceRepo = createWorkspaceRepository();
  const classrooms = createClassroomRepository({
    observeWorkspaceById: workspaceId => workspaceRepo.observeById(workspaceId)
  });

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C')
  });
  const workspace = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Private Team A reasoning' } },
    30,
    'Team A'
  );
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspace.id,
    kind: 'group',
    label: 'Team A',
    claimHash: testTokenHash('X')
  });

  const handler = classDebriefHandler({
    getRepository: async () => classrooms
  });

  for (const token of ['C', 'X', 'P']) {
    const denied = response();
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer ' + token.repeat(43) }
    }, denied);
    assert.equal(denied.statusCode, 404);
    assert.deepEqual(denied.body, { error: 'Class not found.' });
  }

  const allowed = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(
    allowed.body.workspaces[0].current.targets
      .find(target => target.id === 'problem.one-line')
      .comparisonText,
    'Private Team A reasoning'
  );
});
