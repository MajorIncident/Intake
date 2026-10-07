/**
 * Focused #313 exercise API / progressive-disclosure authorization tests.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classExerciseCheckpointHandler,
  classExerciseHandler,
  classStudentExerciseHandler,
  classStudentExerciseReadyHandler,
  fingerprintStagedSimulation
} from '../api/_classroomExercise.js';
import { stagedExerciseRecommendedTargetIds } from '../api/_classroomSimulation.js';
import { createClassroomStudentWritePolicy } from '../api/_classroomWritePolicy.js';
import { studentCaseStudiesHandler } from '../api/_protectedCaseStudies.js';
import { workspaceHandler } from '../api/_workspace.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response,
  testTokenHash
} from './helpers/classroom-test-repositories.mjs';

const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WORKSPACE_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_A = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_B = '33333333-3333-4333-8333-333333333333';

const STAGED_CASE = Object.freeze({
  id: 'synthetic-staged-case',
  name: 'Synthetic Staged Case',
  description: 'Deterministic staged Case Study for server authorization tests.',
  templateKind: 'case-study',
  supportedModes: ['full'],
  state: { pre: { oneLine: 'COMPLETE SOURCE / EXEMPLAR — NEVER STAGED TO STUDENT' } },
  simulation: {
    version: 1,
    studentContent: [
      { id: 'brief-1', kind: 'narrative', title: 'Initial briefing', body: 'Student Stage 1 briefing.' },
      { id: 'hint-1', kind: 'evidence', title: 'Optional hint', body: 'Optional Student evidence.' },
      { id: 'evidence-1', kind: 'evidence', title: 'Second evidence', body: 'Second optional Student fact.' },
      { id: 'brief-2', kind: 'narrative', title: 'Stage 2 briefing', body: 'Student Stage 2 briefing.' }
    ],
    instructorContent: [
      { id: 'teach-1', kind: 'facilitation', title: 'Stage 1 teaching', body: 'INSTRUCTOR ONLY STAGE 1.' },
      { id: 'answer-2', kind: 'exemplar', title: 'Stage 2 exemplar', body: 'INSTRUCTOR ONLY MODEL ANSWER.' }
    ],
    stages: [
      {
        id: 'stage-1',
        title: 'Clarify the situation',
        studentObjective: 'Understand the initial situation.',
        initialReleaseIds: ['brief-1'],
        optionalReleaseIds: ['hint-1', 'evidence-1'],
        intakeTargetIds: ['problem.one-line'],
        suggestedMinutes: 10,
        instructorContentIds: ['teach-1'],
        defaultDebriefEditPolicy: 'frozen'
      },
      {
        id: 'stage-2',
        title: 'Analyze new evidence',
        studentObjective: 'Integrate the newly released evidence.',
        initialReleaseIds: ['brief-2'],
        optionalReleaseIds: [],
        intakeTargetIds: ['problem.one-line'],
        suggestedMinutes: 8,
        instructorContentIds: ['answer-2'],
        defaultDebriefEditPolicy: 'open'
      }
    ]
  }
});

const NON_STAGED_CASE = Object.freeze({
  id: 'ordinary-case',
  name: 'Ordinary Case',
  description: 'Protected but not staged.',
  templateKind: 'case-study',
  supportedModes: ['full'],
  state: { pre: { oneLine: 'Ordinary full protected payload' } }
});

const MANIFEST = Object.freeze([STAGED_CASE, NON_STAGED_CASE]);

async function setupClass({ withSecondWorkspace = false } = {}) {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();

  await classrooms.createClass({
    publicId: CLASS_A_ID,
    title: 'Class A',
    instructorHash: testTokenHash('A'),
    studentJoinHash: testTokenHash('C'),
    studentJoinCode: 'K7FMP4Q2'
  });

  const workspaceA = await workspaceRepo.create(
    testTokenHash('P'),
    { pre: { oneLine: 'Team A before debrief' } },
    30,
    'Team A'
  );
  await classrooms.addWorkspace(testTokenHash('A'), {
    publicId: WORKSPACE_A_ID,
    workspaceId: workspaceA.id,
    kind: 'group',
    label: 'Team A',
    claimHash: testTokenHash('X')
  });

  let workspaceB = null;
  if (withSecondWorkspace) {
    workspaceB = await workspaceRepo.create(
      testTokenHash('Q'),
      { pre: { oneLine: 'Team B before debrief' } },
      30,
      'Team B'
    );
    await classrooms.addWorkspace(testTokenHash('A'), {
      publicId: WORKSPACE_B_ID,
      workspaceId: workspaceB.id,
      kind: 'group',
      label: 'Team B',
      claimHash: testTokenHash('Y')
    });
  }

  return { classrooms, workspaceRepo, workspaceA, workspaceB };
}

async function admit(classrooms, {
  participantId = PARTICIPANT_A,
  name = 'Alex',
  session = 'S'
} = {}) {
  return classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId,
    displayName: name,
    sessionHash: testTokenHash(session)
  });
}

function instructorHandler(classrooms, workspaceRepo) {
  return classExerciseHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    manifest: MANIFEST,
    idFactory: () => EXERCISE_ID
  });
}

function instructorCheckpointHandler(classrooms) {
  return classExerciseCheckpointHandler({
    getRepository: async () => classrooms,
    manifest: MANIFEST
  });
}

async function createExercise(handler) {
  const created = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { caseStudyId: STAGED_CASE.id }
  }, created);
  assert.equal(created.statusCode, 201);
  return created;
}

async function patchExercise(handler, body) {
  const res = response();
  await handler({
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body
  }, res);
  return res;
}

test('staged definition fingerprint is canonical across object key order', () => {
  const reordered = {
    stages: STAGED_CASE.simulation.stages,
    instructorContent: STAGED_CASE.simulation.instructorContent,
    studentContent: STAGED_CASE.simulation.studentContent,
    version: 1
  };
  assert.equal(
    fingerprintStagedSimulation(STAGED_CASE.simulation),
    fingerprintStagedSimulation(reordered)
  );
  assert.match(fingerprintStagedSimulation(STAGED_CASE.simulation), /^[a-f0-9]{64}$/u);
});

test('staged exercise recommendations use the exact governed current-stage definition', () => {
  const exercise = {
    caseStudyId: STAGED_CASE.id,
    currentStageId: 'stage-1',
    simulationVersion: STAGED_CASE.simulation.version,
    simulationFingerprint: fingerprintStagedSimulation(STAGED_CASE.simulation)
  };

  assert.deepEqual(
    stagedExerciseRecommendedTargetIds(exercise, MANIFEST),
    ['problem.one-line']
  );

  exercise.currentStageId = 'stage-2';
  assert.deepEqual(
    stagedExerciseRecommendedTargetIds(exercise, MANIFEST),
    ['problem.one-line']
  );
});

test('staged exercise recommendations fail closed on definition drift or missing stage', () => {
  const exercise = {
    caseStudyId: STAGED_CASE.id,
    currentStageId: 'stage-1',
    simulationVersion: STAGED_CASE.simulation.version,
    simulationFingerprint: fingerprintStagedSimulation(STAGED_CASE.simulation)
  };

  assert.deepEqual(
    stagedExerciseRecommendedTargetIds({ ...exercise, simulationFingerprint: 'b'.repeat(64) }, MANIFEST),
    []
  );
  assert.deepEqual(
    stagedExerciseRecommendedTargetIds({ ...exercise, simulationVersion: 999 }, MANIFEST),
    []
  );
  assert.deepEqual(
    stagedExerciseRecommendedTargetIds({ ...exercise, currentStageId: 'missing-stage' }, MANIFEST),
    []
  );
  assert.deepEqual(
    stagedExerciseRecommendedTargetIds({ ...exercise, caseStudyId: 'ordinary-case' }, MANIFEST),
    []
  );
});

test('Instructor exercise GET discovers staged Case Studies without exposing simulation definitions', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  const handler = instructorHandler(classrooms, workspaceRepo);
  const res = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.exercise, null);
  assert.deepEqual(res.body.availableCaseStudies.map(item => item.id), [STAGED_CASE.id]);
  assert.equal(res.body.availableCaseStudies[0].name, STAGED_CASE.name);
  assert.equal('simulation' in res.body.availableCaseStudies[0], false);
  assert.equal('state' in res.body.availableCaseStudies[0], false);
  assert.equal(JSON.stringify(res.body.availableCaseStudies).includes('INSTRUCTOR ONLY'), false);
  assert.equal(JSON.stringify(res.body.availableCaseStudies).includes('COMPLETE SOURCE'), false);
});

test('Instructor exercise creation is class-authorized, staged-only, idempotent, and definition-pinned', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  await admit(classrooms);
  const handler = instructorHandler(classrooms, workspaceRepo);

  const nonStaged = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { caseStudyId: NON_STAGED_CASE.id }
  }, nonStaged);
  assert.equal(nonStaged.statusCode, 404);

  const created = await createExercise(handler);
  assert.equal(created.body.created, true);
  assert.equal(created.body.exercise.exerciseRevision, 1);
  assert.equal(created.body.exercise.simulationVersion, 1);
  assert.equal(
    created.body.exercise.simulationFingerprint,
    fingerprintStagedSimulation(STAGED_CASE.simulation)
  );
  assert.equal(created.body.caseStudy.simulation.instructorContent[0].body, 'INSTRUCTOR ONLY STAGE 1.');

  const replay = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    body: { caseStudyId: STAGED_CASE.id }
  }, replay);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.created, false);
  assert.equal(classrooms.exercises.length, 1);

  const studentCredential = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, studentCredential);
  assert.equal(studentCredential.statusCode, 404);

  const humanJoinCode = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer K7FM-P4Q2' }
  }, humanJoinCode);
  assert.equal(humanJoinCode.statusCode, 400);
});

test('Instructor lifecycle is revision-safe, optional release is idempotent, and debrief checkpoint transition is atomic', async () => {
  const { classrooms, workspaceRepo } = await setupClass({ withSecondWorkspace: true });
  const handler = instructorHandler(classrooms, workspaceRepo);
  await createExercise(handler);

  const started = await patchExercise(handler, { action: 'start', expectedRevision: 1 });
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.exercise.currentStageId, 'stage-1');
  assert.equal(started.body.exercise.exerciseRevision, 2);

  const released = await patchExercise(handler, {
    action: 'release-content',
    expectedRevision: 2,
    contentId: 'hint-1'
  });
  assert.equal(released.statusCode, 200);
  assert.equal(released.body.changed, true);
  assert.equal(released.body.exercise.exerciseRevision, 3);
  assert.deepEqual(released.body.releases.map(item => item.contentId), ['hint-1']);

  const releaseReplay = await patchExercise(handler, {
    action: 'release-content',
    expectedRevision: 2,
    contentId: 'hint-1'
  });
  assert.equal(releaseReplay.statusCode, 200);
  assert.equal(releaseReplay.body.changed, false);
  assert.equal(releaseReplay.body.exercise.exerciseRevision, 3);

  const staleDifferentRelease = await patchExercise(handler, {
    action: 'release-content',
    expectedRevision: 2,
    contentId: 'evidence-1'
  });
  assert.equal(staleDifferentRelease.statusCode, 409);
  assert.equal(staleDifferentRelease.body.exercise.exerciseRevision, 3);

  const debrief = await patchExercise(handler, {
    action: 'begin-debrief',
    expectedRevision: 3
  });
  assert.equal(debrief.statusCode, 200);
  assert.equal(debrief.body.exercise.stagePhase, 'debrief');
  assert.equal(debrief.body.exercise.exerciseRevision, 4);
  assert.equal(debrief.body.capturedCount, 2);
  assert.equal(debrief.body.checkpoints.length, 2);
  assert.equal(debrief.body.checkpoints.some(item => Object.hasOwn(item, 'snapshot')), false);
  assert.equal(debrief.body.editFreezeEnforced, true);
  assert.equal(debrief.body.exercise.studentEditingEnabled, false);

  await workspaceRepo.update(
    testTokenHash('P'),
    { pre: { oneLine: 'Team A changed after checkpoint' } },
    1
  );
  const checkpointRead = response();
  await instructorCheckpointHandler(classrooms)({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, checkpointRead);
  assert.equal(checkpointRead.statusCode, 200);
  assert.equal(checkpointRead.body.workspace.id, WORKSPACE_A_ID);
  assert.equal(checkpointRead.body.checkpoint.workspaceRevision, 1);
  assert.equal(checkpointRead.body.checkpoint.snapshot.pre.oneLine, 'Team A before debrief');

  const studentCheckpointRead = response();
  await instructorCheckpointHandler(classrooms)({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) },
    query: { workspaceId: WORKSPACE_A_ID }
  }, studentCheckpointRead);
  assert.equal(studentCheckpointRead.statusCode, 404);

  const invalidCheckpointRead = response();
  await instructorCheckpointHandler(classrooms)({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) },
    query: { workspaceId: 'not-a-workspace' }
  }, invalidCheckpointRead);
  assert.equal(invalidCheckpointRead.statusCode, 400);

  const staleDebriefReplay = await patchExercise(handler, {
    action: 'begin-debrief',
    expectedRevision: 3
  });
  assert.equal(staleDebriefReplay.statusCode, 409);

  const advanced = await patchExercise(handler, { action: 'advance', expectedRevision: 4 });
  assert.equal(advanced.statusCode, 200);
  assert.equal(advanced.body.exercise.currentStageId, 'stage-2');
  assert.equal(advanced.body.exercise.stagePhase, 'work');
  assert.equal(advanced.body.exercise.exerciseRevision, 5);

  const cannotCompleteWork = await patchExercise(handler, { action: 'complete', expectedRevision: 5 });
  assert.equal(cannotCompleteWork.statusCode, 409);

  const stage2Debrief = await patchExercise(handler, {
    action: 'begin-debrief',
    expectedRevision: 5
  });
  assert.equal(stage2Debrief.statusCode, 200);
  assert.equal(stage2Debrief.body.exercise.exerciseRevision, 6);

  const completed = await patchExercise(handler, { action: 'complete', expectedRevision: 6 });
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.body.exercise.status, 'completed');
  assert.equal(completed.body.exercise.exerciseRevision, 7);

  const current = response();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, current);
  assert.equal(current.statusCode, 200);
  assert.equal(current.body.exercise, null);
});

test('Student staged read exposes only cumulative released Student content and never future or Instructor material', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  await admit(classrooms);
  const instructor = instructorHandler(classrooms, workspaceRepo);
  await createExercise(instructor);

  const student = classStudentExerciseHandler({
    getRepository: async () => classrooms,
    manifest: MANIFEST
  });

  const draft = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, draft);
  assert.equal(draft.statusCode, 200);
  assert.equal(draft.body.assignment, null);
  assert.equal(draft.body.exercise.currentStage, null);
  assert.deepEqual(draft.body.exercise.releasedContent, []);

  await patchExercise(instructor, { action: 'start', expectedRevision: 1 });

  const stage1 = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, stage1);
  assert.equal(stage1.statusCode, 200);
  assert.equal(stage1.body.exercise.currentStage.id, 'stage-1');
  assert.deepEqual(
    stage1.body.exercise.releasedContent.map(item => item.content.id),
    ['brief-1']
  );
  const stage1Json = JSON.stringify(stage1.body);
  assert.equal(stage1Json.includes('Stage 2 briefing'), false);
  assert.equal(stage1Json.includes('INSTRUCTOR ONLY'), false);
  assert.equal(stage1Json.includes('MODEL ANSWER'), false);
  assert.equal(stage1Json.includes('COMPLETE SOURCE'), false);

  await patchExercise(instructor, {
    action: 'release-content',
    expectedRevision: 2,
    contentId: 'hint-1'
  });
  const withHint = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, withHint);
  assert.deepEqual(
    withHint.body.exercise.releasedContent.map(item => item.content.id),
    ['brief-1', 'hint-1']
  );

  await patchExercise(instructor, { action: 'begin-debrief', expectedRevision: 3 });
  await patchExercise(instructor, { action: 'advance', expectedRevision: 4 });

  const stage2 = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, stage2);
  assert.equal(stage2.body.exercise.currentStage.id, 'stage-2');
  assert.deepEqual(
    stage2.body.exercise.releasedContent.map(item => item.content.id),
    ['brief-1', 'hint-1', 'brief-2']
  );
  assert.equal(stage2.body.exercise.editFreezeEnforced, true);
  assert.equal(stage2.body.exercise.studentEditingEnabled, true);

  const instructorCredential = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, instructorCredential);
  assert.equal(instructorCredential.statusCode, 404);
});

test('server-enforced debrief freeze blocks Classroom Student PUT without mutating Intake while Standalone remains writable', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  await admit(classrooms);
  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRepository: workspaceRepo
  });
  await classrooms.issueParticipantWorkspaceAccess({
    sessionHash: testTokenHash('S'),
    accessHash: testTokenHash('W'),
    workspaceRepository: workspaceRepo
  });

  await workspaceRepo.create(
    testTokenHash('Z'),
    { pre: { oneLine: 'Standalone before' } },
    30,
    'Standalone'
  );

  const instructor = instructorHandler(classrooms, workspaceRepo);
  await createExercise(instructor);
  await patchExercise(instructor, { action: 'start', expectedRevision: 1 });

  const session = workspaceHandler({
    getRepository: async () => workspaceRepo,
    getWritePolicy: createClassroomStudentWritePolicy({
      getRepository: async () => classrooms
    })
  });

  const beforeDebrief = response();
  await session({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: {
      revision: 1,
      snapshot: { pre: { oneLine: 'Team A during work' } }
    }
  }, beforeDebrief);
  assert.equal(beforeDebrief.statusCode, 200);
  assert.equal(beforeDebrief.body.revision, 2);

  const debrief = await patchExercise(instructor, {
    action: 'begin-debrief',
    expectedRevision: 2
  });
  assert.equal(debrief.statusCode, 200);
  assert.equal(debrief.body.exercise.studentEditingEnabled, false);
  assert.equal(debrief.body.editFreezeEnforced, true);

  const frozenWrite = response();
  await session({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: {
      revision: 2,
      snapshot: { pre: { oneLine: 'MUST NOT SAVE' } }
    }
  }, frozenWrite);
  assert.equal(frozenWrite.statusCode, 423);
  assert.equal(frozenWrite.body.code, 'classroom-editing-locked');

  const afterFrozenWrite = await workspaceRepo.load(testTokenHash('W'));
  assert.equal(afterFrozenWrite.revision, 2);
  assert.equal(afterFrozenWrite.snapshot.pre.oneLine, 'Team A during work');

  const frozenRead = response();
  await session({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    query: {}
  }, frozenRead);
  assert.equal(frozenRead.statusCode, 200);
  assert.equal(frozenRead.body.revision, 2);
  assert.equal(frozenRead.body.snapshot.pre.oneLine, 'Team A during work');

  const standaloneWrite = response();
  await session({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'Z'.repeat(43) },
    body: {
      revision: 1,
      snapshot: { pre: { oneLine: 'Standalone changed while class is frozen' } }
    }
  }, standaloneWrite);
  assert.equal(standaloneWrite.statusCode, 200);
  assert.equal(standaloneWrite.body.revision, 2);

  const paused = await patchExercise(instructor, {
    action: 'pause',
    expectedRevision: 3
  });
  assert.equal(paused.statusCode, 200);
  assert.equal(paused.body.exercise.studentEditingEnabled, false);
  assert.equal(paused.body.exercise.exerciseRevision, 4);

  const resumed = await patchExercise(instructor, {
    action: 'resume',
    expectedRevision: 4
  });
  assert.equal(resumed.statusCode, 200);
  assert.equal(resumed.body.exercise.studentEditingEnabled, false);
  assert.equal(resumed.body.exercise.exerciseRevision, 5);

  const unfreeze = await patchExercise(instructor, {
    action: 'set-editing',
    expectedRevision: 5,
    enabled: true
  });
  assert.equal(unfreeze.statusCode, 200);
  assert.equal(unfreeze.body.exercise.studentEditingEnabled, true);
  assert.equal(unfreeze.body.exercise.exerciseRevision, 6);

  const afterUnfreeze = response();
  await session({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: {
      revision: 2,
      snapshot: { pre: { oneLine: 'Team A after unfreeze' } }
    }
  }, afterUnfreeze);
  assert.equal(afterUnfreeze.statusCode, 200);
  assert.equal(afterUnfreeze.body.revision, 3);

  const finalTeamA = await workspaceRepo.load(testTokenHash('W'));
  assert.equal(finalTeamA.snapshot.pre.oneLine, 'Team A after unfreeze');
});

test('Student Ready records the server-observed current workspace revision and Waiting cannot mark Ready', async () => {
  const { classrooms, workspaceRepo, workspaceA } = await setupClass();
  await admit(classrooms);
  await admit(classrooms, {
    participantId: PARTICIPANT_B,
    name: 'Blair',
    session: 'T'
  });
  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRepository: workspaceRepo
  });

  const instructor = instructorHandler(classrooms, workspaceRepo);
  await createExercise(instructor);
  await patchExercise(instructor, { action: 'start', expectedRevision: 1 });

  const readyHandler = classStudentExerciseReadyHandler({
    getRepository: async () => classrooms,
    getWorkspaceRepo: async () => workspaceRepo,
    manifest: MANIFEST
  });

  const ready = response();
  await readyHandler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) },
    body: { ready: true, workspaceRevision: 999999 }
  }, ready);
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.readiness.readyWorkspaceRevision, 1);
  assert.equal(ready.body.assignment.id, WORKSPACE_A_ID);

  await workspaceRepo.update(
    testTokenHash('P'),
    { pre: { oneLine: 'New Team A work' } },
    workspaceA.revision
  );

  const refreshed = response();
  await readyHandler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) },
    body: { ready: true }
  }, refreshed);
  assert.equal(refreshed.statusCode, 200);
  assert.equal(refreshed.body.readiness.readyWorkspaceRevision, 2);

  const waiting = response();
  await readyHandler({
    method: 'PUT',
    headers: { authorization: 'Bearer ' + 'T'.repeat(43) },
    body: { ready: true }
  }, waiting);
  assert.equal(waiting.statusCode, 409);
  assert.equal(waiting.body.status, 'waiting');
});

test('readiness race guard refuses to attach an old workspace revision after reassignment', async () => {
  const { classrooms, workspaceRepo, workspaceA } = await setupClass({ withSecondWorkspace: true });
  await admit(classrooms);
  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRepository: workspaceRepo
  });
  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_ID,
    caseStudyId: STAGED_CASE.id,
    simulationVersion: 1,
    simulationFingerprint: fingerprintStagedSimulation(STAGED_CASE.simulation)
  });
  await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_ID,
    expectedRevision: 1,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'work',
    studentEditingEnabled: true
  });

  const beforeMove = await classrooms.getParticipantBySession(testTokenHash('S'));
  const observedA = await workspaceRepo.observeById(beforeMove.internal.workspaceId);
  assert.equal(observedA.revision, workspaceA.revision);

  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_B_ID,
    workspaceRepository: workspaceRepo
  });

  const stale = await classrooms.setExerciseWorkspaceReadinessBySession(testTokenHash('S'), {
    exercisePublicId: EXERCISE_ID,
    stageId: 'stage-1',
    ready: true,
    workspaceRevision: observedA.revision,
    expectedWorkspaceInternalId: beforeMove.internal.workspaceId
  });
  assert.equal(stale.status, 'conflict');

  const state = await classrooms.listExerciseWorkspaceStateForInstructor(
    testTokenHash('A'),
    EXERCISE_ID
  );
  assert.deepEqual(state.workspaceState, []);
});

test('definition drift fails closed for Instructor and Student staged reads', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  await admit(classrooms);
  const instructor = instructorHandler(classrooms, workspaceRepo);
  await createExercise(instructor);
  classrooms.exercises[0].simulationFingerprint = 'b'.repeat(64);

  const instructorRead = response();
  await instructor({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'A'.repeat(43) }
  }, instructorRead);
  assert.equal(instructorRead.statusCode, 409);

  const student = classStudentExerciseHandler({
    getRepository: async () => classrooms,
    manifest: MANIFEST
  });
  const studentRead = response();
  await student({
    method: 'GET',
    headers: { authorization: 'Bearer ' + 'S'.repeat(43) }
  }, studentRead);
  assert.equal(studentRead.statusCode, 409);
});

test('Student full Case Study payload cannot bypass a staged run, including after completion', async () => {
  const { classrooms, workspaceRepo } = await setupClass();
  await admit(classrooms);
  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRepository: workspaceRepo
  });
  await classrooms.issueParticipantWorkspaceAccess({
    sessionHash: testTokenHash('S'),
    accessHash: testTokenHash('W'),
    workspaceRepository: workspaceRepo
  });

  const protectedHandler = studentCaseStudiesHandler({
    getRepository: async () => classrooms,
    manifest: MANIFEST
  });

  const beforeExercise = response();
  await protectedHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: { caseStudyId: STAGED_CASE.id }
  }, beforeExercise);
  assert.equal(beforeExercise.statusCode, 200);
  assert.equal(beforeExercise.body.caseStudy.state.pre.oneLine.includes('COMPLETE SOURCE'), true);

  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_ID,
    caseStudyId: STAGED_CASE.id,
    simulationVersion: 1,
    simulationFingerprint: fingerprintStagedSimulation(STAGED_CASE.simulation)
  });

  const duringExercise = response();
  await protectedHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: { caseStudyId: STAGED_CASE.id }
  }, duringExercise);
  assert.equal(duringExercise.statusCode, 409);
  assert.equal(JSON.stringify(duringExercise.body).includes('COMPLETE SOURCE'), false);

  const unrelated = response();
  await protectedHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: { caseStudyId: NON_STAGED_CASE.id }
  }, unrelated);
  assert.equal(unrelated.statusCode, 200);

  await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_ID,
    expectedRevision: 1,
    status: 'completed',
    currentStageId: null,
    stagePhase: 'work',
    studentEditingEnabled: true
  });

  const afterCompletion = response();
  await protectedHandler({
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'W'.repeat(43) },
    body: { caseStudyId: STAGED_CASE.id }
  }, afterCompletion);
  assert.equal(afterCompletion.statusCode, 409);
});
