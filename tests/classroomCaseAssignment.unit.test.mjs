/**
 * #343 Instructor Case Study assignment: loading a protected Case Study into
 * class workspaces through the real handler over the in-memory repositories.
 * The same SQL is exercised against Postgres in classroomDatabase.pglite.test.mjs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classWorkspacesHandler } from '../api/_classroom.js';
import { instructorCaseStudyAssignHandler } from '../api/_protectedCaseStudies.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response,
  testTokenHash,
  tokenFactory
} from './helpers/classroom-test-repositories.mjs';

const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_IDS = [
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
];

/** Complete authored source with answer-key material in every later section. */
const CASE_STATE = Object.freeze({
  meta: { title: 'Payments failing' },
  pre: { oneLine: 'Card payments fail at checkout' },
  impact: { now: 'All card payments', future: 'Lost revenue', time: 'Friday close' },
  ops: { containDesc: 'Rolled back release 4.2', containStatus: 'contained', commLog: [{ ts: '1', text: 'Fixed' }] },
  table: [{ id: 'what-object', is: 'Card payments', no: 'Bank transfers', di: 'New gateway', ch: 'Release 4.2' }],
  causes: [{ id: 'cause-1', suspect: 'Release 4.2 gateway timeout' }],
  likelyCauseId: 'cause-1',
  steps: { items: [{ id: '1', label: 'Confirm', checked: true }], drawerOpen: false },
  actions: { analysisId: 'a1', items: [{ id: 'act-1', summary: 'Roll back' }] }
});

const MANIFEST = Object.freeze([
  Object.freeze({
    id: 'paytrix-test',
    name: 'Paytrix Test',
    description: 'Test case.',
    templateKind: 'case-study',
    supportedModes: ['intake', 'is-is-not', 'dc', 'full'],
    state: CASE_STATE
  }),
  Object.freeze({
    id: 'staged-test',
    name: 'Staged Test',
    description: 'Staged case.',
    templateKind: 'case-study',
    supportedModes: ['full'],
    state: CASE_STATE,
    simulation: { stages: [] }
  })
]);

const bearer = letter => ({ authorization: 'Bearer ' + letter.repeat(43) });

/**
 * Builds two classes; class A has three workspaces, class B has none.
 * @returns {Promise<object>} Fixture handles.
 */
async function fixture() {
  const workspaceRepo = createWorkspaceRepository();
  const classrooms = createClassroomRepository({ workspaceRepository: workspaceRepo });
  await classrooms.createClass({ publicId: CLASS_A_ID, title: 'Class A', instructorHash: testTokenHash('A'), studentJoinCode: 'K7FMP4Q2' });
  await classrooms.createClass({ publicId: CLASS_B_ID, title: 'Class B', instructorHash: testTokenHash('B'), studentJoinCode: 'M8RNQ5W3' });
  let nextWorkspace = 0;
  const workspaces = classWorkspacesHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    tokenFactory: tokenFactory(['P', 'Q', 'R']),
    idFactory: () => TEAM_IDS[nextWorkspace++]
  });
  const call = async (handler, req) => {
    const res = response();
    await handler({ headers: {}, query: {}, ...req }, res);
    return res;
  };
  for (const label of ['Team Red', 'Team Blue', 'Team Green']) {
    const created = await call(workspaces, { method: 'POST', headers: bearer('A'), body: { kind: 'group', label, snapshot: {} } });
    assert.equal(created.statusCode, 201);
  }
  const assign = instructorCaseStudyAssignHandler({ getRepository: async () => classrooms, manifest: MANIFEST });
  const collab = index => [...workspaceRepo.workspaces.values()][index];
  const roster = async () => (await call(workspaces, { method: 'GET', headers: bearer('A') })).body.workspaces;
  return { classrooms, workspaceRepo, workspaces, assign, call, collab, roster };
}

test('loads a Case Study into every untouched workspace, projected for the chosen starting point', async () => {
  const { assign, call, collab, roster } = await fixture();
  const loaded = await call(assign, {
    method: 'POST',
    headers: bearer('A'),
    body: { caseStudyId: 'paytrix-test', mode: 'is-is-not', targets: 'all' }
  });
  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.headers['Cache-Control'], 'no-store');
  assert.deepEqual(loaded.body.caseStudy, { id: 'paytrix-test', name: 'Paytrix Test' });
  assert.deepEqual(loaded.body.results.map(result => [result.label, result.status, result.revision]), [
    ['Team Red', 'loaded', 2],
    ['Team Blue', 'loaded', 2],
    ['Team Green', 'loaded', 2]
  ]);

  const snapshot = collab(0).snapshot;
  assert.equal(snapshot.pre.oneLine, 'Card payments fail at checkout');
  assert.equal(snapshot.table[0].is, 'Card payments');
  assert.equal(snapshot.table[0].di, '', 'IS / IS NOT starting point hides distinctions');
  assert.deepEqual(snapshot.causes, [], 'causes are answer-key material');
  assert.deepEqual(snapshot.actions.items, [], 'actions are answer-key material');
  assert.equal(snapshot.ops.containDesc, '', 'historical resolution is cleared');

  const listed = await roster();
  assert.deepEqual(listed.map(item => [item.revision, item.hasWork, item.caseStudy?.id, item.caseStudy?.mode]), [
    [2, false, 'paytrix-test', 'is-is-not'],
    [2, false, 'paytrix-test', 'is-is-not'],
    [2, false, 'paytrix-test', 'is-is-not']
  ]);
  assert.equal(listed[0].caseStudy.name, 'Paytrix Test');
});

test('Student work is kept unless the Instructor confirms the revision they saw', async () => {
  const { assign, call, collab, roster, workspaceRepo } = await fixture();
  await call(assign, { method: 'POST', headers: bearer('A'), body: { caseStudyId: 'paytrix-test', mode: 'intake', targets: 'all' } });

  // Team Red's Students type: collaboration revision 2 -> 3.
  const studentSnapshot = { ...collab(0).snapshot, meta: { title: 'Ours', intakeMode: 'majorIncident' }, pre: { oneLine: 'Our analysis' } };
  const saved = await workspaceRepo.update(testTokenHash('P'), studentSnapshot, 2);
  assert.equal(saved.status, 'updated');
  assert.equal((await roster())[0].hasWork, true);

  const again = await call(assign, { method: 'POST', headers: bearer('A'), body: { caseStudyId: 'paytrix-test', mode: 'full', targets: 'all' } });
  assert.deepEqual(again.body.results.map(result => [result.label, result.status, result.revision]), [
    ['Team Red', 'has-work', 3],
    ['Team Blue', 'loaded', 3],
    ['Team Green', 'loaded', 3]
  ]);
  assert.equal(collab(0).snapshot.pre.oneLine, 'Our analysis', 'unconfirmed load never replaces Student work');

  const stale = await call(assign, {
    method: 'POST',
    headers: bearer('A'),
    body: { caseStudyId: 'paytrix-test', mode: 'full', targets: [{ workspaceId: TEAM_IDS[0], expectedRevision: 2 }], replaceExisting: true }
  });
  assert.deepEqual(stale.body.results.map(result => [result.status, result.revision]), [['changed', 3]]);
  assert.equal(collab(0).snapshot.pre.oneLine, 'Our analysis');

  const replaced = await call(assign, {
    method: 'POST',
    headers: bearer('A'),
    body: { caseStudyId: 'paytrix-test', mode: 'full', targets: [{ workspaceId: TEAM_IDS[0], expectedRevision: 3 }], replaceExisting: true }
  });
  assert.deepEqual(replaced.body.results.map(result => [result.status, result.revision]), [['loaded', 4]]);
  assert.equal(collab(0).snapshot.pre.oneLine, 'Card payments fail at checkout');
  assert.equal(collab(0).snapshot.meta.intakeMode, 'majorIncident', "the team's Intake lens is kept");
  assert.equal(collab(0).snapshot.causes[0].id, 'cause-1', 'Full includes the worked answer');
  assert.equal((await roster())[0].hasWork, false);
});

test('only the class Instructor can load, and only into its own workspaces', async () => {
  const { assign, call, collab } = await fixture();
  const body = { caseStudyId: 'paytrix-test', mode: 'intake', targets: [{ workspaceId: TEAM_IDS[0] }] };

  assert.equal((await call(assign, { method: 'POST', body })).statusCode, 401);
  assert.equal((await call(assign, { method: 'POST', headers: bearer('S'), body })).statusCode, 404, 'unknown/Student credential');

  const crossClass = await call(assign, { method: 'POST', headers: bearer('B'), body });
  assert.equal(crossClass.statusCode, 200);
  assert.deepEqual(crossClass.body.results, [{ workspaceId: TEAM_IDS[0], label: null, status: 'not-found', revision: null }]);
  assert.equal(collab(0).revision, 1, 'another class cannot write the workspace');

  const empty = await call(assign, { method: 'POST', headers: bearer('B'), body: { ...body, targets: 'all' } });
  assert.equal(empty.statusCode, 409);
  assert.equal(empty.body.code, 'no-workspaces');
});

test('rejects malformed loads before touching any workspace', async () => {
  const { assign, call, collab } = await fixture();
  const post = body => call(assign, { method: 'POST', headers: bearer('A'), body });
  assert.equal((await call(assign, { method: 'GET', headers: bearer('A') })).statusCode, 405);
  assert.equal((await post({ caseStudyId: 'missing', mode: 'intake', targets: 'all' })).statusCode, 404);
  assert.equal((await post({ caseStudyId: 'paytrix-test', mode: 'everything', targets: 'all' })).statusCode, 400);
  assert.equal((await post({ caseStudyId: 'paytrix-test', mode: 'intake', targets: [] })).statusCode, 400);
  assert.equal((await post({ caseStudyId: 'paytrix-test', mode: 'intake', targets: [{ workspaceId: 'not-a-uuid' }] })).statusCode, 400);
  assert.equal((await post({ caseStudyId: 'paytrix-test', mode: 'intake', targets: 'all', replaceExisting: true })).statusCode, 400, 'replacing never targets "all"');
  assert.equal((await post({ caseStudyId: 'paytrix-test', mode: 'intake', targets: [{ workspaceId: TEAM_IDS[0] }], replaceExisting: true })).statusCode, 400, 'replacing needs the confirmed revision');
  assert.equal(collab(0).revision, 1);
});

test('staged Case Studies and running exercises cannot be bypassed by loading', async () => {
  const { assign, call, classrooms, collab } = await fixture();
  const post = body => call(assign, { method: 'POST', headers: bearer('A'), body });

  const staged = await post({ caseStudyId: 'staged-test', mode: 'full', targets: 'all' });
  assert.equal(staged.statusCode, 409);
  assert.equal(staged.body.code, 'staged-exercise-only');

  const created = await classrooms.createExercise(testTokenHash('A'), {
    publicId: '99999999-9999-4999-8999-999999999999',
    caseStudyId: 'paytrix-test',
    simulationVersion: 1,
    simulationFingerprint: 'f'.repeat(64)
  });
  assert.ok(created);
  const usedByExercise = await post({ caseStudyId: 'paytrix-test', mode: 'intake', targets: 'all' });
  assert.equal(usedByExercise.statusCode, 409);
  assert.equal(usedByExercise.body.code, 'staged-exercise-only', 'a case used by an exercise in this class stays staged-only');

  const other = [{ ...MANIFEST[0], id: 'other-test', name: 'Other' }];
  const assignOther = instructorCaseStudyAssignHandler({ getRepository: async () => classrooms, manifest: other });
  const running = await call(assignOther, { method: 'POST', headers: bearer('A'), body: { caseStudyId: 'other-test', mode: 'intake', targets: 'all' } });
  assert.equal(running.statusCode, 409);
  assert.equal(running.body.code, 'exercise-active');
  assert.equal(collab(0).revision, 1);
});
