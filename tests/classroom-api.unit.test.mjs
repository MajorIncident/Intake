/**
 * Classroom API authorization coverage using the in-memory classroom harness.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLASS_TITLE_MAX_LENGTH,
  CLASS_WORKSPACE_LABEL_MAX_LENGTH,
  classHandler,
  classJoinHandler,
  classWorkspacesHandler,
  normalizeClassroomLabel,
  normalizeClassroomWorkspaceKind,
  validateClassroomId
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

test('class creation returns raw capabilities once and stores only hashes', async () => {
  const classrooms = createClassroomRepository();
  const handler = classHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['I', 'J']),
    idFactory: () => CLASS_A_ID
  });

  const res = response();
  await handler({ method: 'POST', body: { title: '  Fall   Workshop ' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.class.title, 'Fall Workshop');
  assert.equal(res.body.instructorToken, 'I'.repeat(43));
  assert.equal(res.body.studentJoinToken, 'J'.repeat(43));
  assert.equal(classrooms.classes[0].instructorHash, testTokenHash('I'));
  assert.equal(classrooms.classes[0].studentJoinHash, testTokenHash('J'));
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
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
