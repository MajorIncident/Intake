/**
 * Repository-level contract tests for #313 staged exercise persistence.
 *
 * These intentionally stop below HTTP/UI. They prove the deterministic repository
 * semantics that the later exercise handlers will orchestrate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createClassroomRepository,
  createWorkspaceRepository,
  testTokenHash
} from './helpers/classroom-test-repositories.mjs';

const CLASS_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EXERCISE_A_ID = '11111111-1111-4111-8111-111111111111';
const EXERCISE_A2_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_B_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WORKSPACE_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WORKSPACE_C_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PARTICIPANT_A = '44444444-4444-4444-8444-444444444444';
const SIMULATION_FINGERPRINT = 'a'.repeat(64);

async function classPair(classrooms) {
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
}

async function addWorkspace(classrooms, workspaceRepo, {
  instructor = 'A',
  publicId = WORKSPACE_A_ID,
  capability = 'P',
  claim = 'X',
  label = 'Team A'
} = {}) {
  const workspace = await workspaceRepo.create(
    testTokenHash(capability),
    { pre: { oneLine: label + ' Intake' } },
    30,
    label
  );
  await classrooms.addWorkspace(testTokenHash(instructor), {
    publicId,
    workspaceId: workspace.id,
    kind: 'group',
    label,
    claimHash: testTokenHash(claim)
  });
  return workspace;
}

test('exercise creation permits one open exercise per class and inherits class retention', async () => {
  const classrooms = createClassroomRepository();
  await classPair(classrooms);

  const createdA = await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  assert.equal(createdA.status, 'created');
  assert.equal(createdA.exercise.status, 'draft');
  assert.equal(createdA.exercise.simulationVersion, 1);
  assert.equal(createdA.exercise.simulationFingerprint, SIMULATION_FINGERPRINT);
  assert.equal(createdA.exercise.exerciseRevision, 1);
  assert.equal(createdA.exercise.currentStageId, null);
  assert.equal(createdA.exercise.expiresAt, createdA.classroom.expiresAt);

  const duplicateOpen = await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A2_ID,
    caseStudyId: 'another-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  assert.equal(duplicateOpen.status, 'exists');
  assert.equal(duplicateOpen.exercise.id, EXERCISE_A_ID);
  assert.equal(classrooms.exercises.length, 1);

  const createdB = await classrooms.createExercise(testTokenHash('B'), {
    publicId: EXERCISE_B_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  assert.equal(createdB.status, 'created');
  assert.equal(createdB.classroom.id, CLASS_B_ID);
  assert.equal(classrooms.exercises.length, 2);

  assert.equal(await classrooms.getExerciseForInstructor(testTokenHash('B'), EXERCISE_A_ID), null);

  await classrooms.revokeClass(testTokenHash('A'));
  assert.equal(await classrooms.getCurrentExerciseForInstructor(testTokenHash('A')), null);
});

test('exercise lifecycle mutation is optimistic and completion permits a later exercise', async () => {
  const classrooms = createClassroomRepository();
  await classPair(classrooms);
  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });

  const started = await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 1,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'work',
    studentEditingEnabled: true
  });
  assert.equal(started.status, 'updated');
  assert.equal(started.exercise.exerciseRevision, 2);
  assert.equal(started.exercise.startedAt, 'started');

  const stale = await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 1,
    status: 'paused',
    currentStageId: 'stage-1',
    stagePhase: 'work',
    studentEditingEnabled: true
  });
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.exercise.status, 'active');
  assert.equal(stale.exercise.exerciseRevision, 2);

  const debrief = await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 2,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'debrief',
    studentEditingEnabled: false
  });
  assert.equal(debrief.exercise.exerciseRevision, 3);
  assert.equal(debrief.exercise.stagePhase, 'debrief');
  assert.equal(debrief.exercise.studentEditingEnabled, false);

  const completed = await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 3,
    status: 'completed',
    currentStageId: 'stage-1',
    stagePhase: 'debrief',
    studentEditingEnabled: false
  });
  assert.equal(completed.exercise.exerciseRevision, 4);
  assert.equal(completed.exercise.completedAt, 'completed');
  assert.equal(await classrooms.getCurrentExerciseForInstructor(testTokenHash('A')), null);

  const next = await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A2_ID,
    caseStudyId: 'next-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  assert.equal(next.status, 'created');
  assert.equal(next.exercise.id, EXERCISE_A2_ID);
});

test('optional release is idempotent and only a new release advances exercise revision', async () => {
  const classrooms = createClassroomRepository();
  await classPair(classrooms);
  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 1,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'work',
    studentEditingEnabled: true
  });

  const first = await classrooms.releaseExerciseContent(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 2,
    stageId: 'stage-1',
    contentId: 'hint-1'
  });
  assert.equal(first.status, 'updated');
  assert.equal(first.exercise.exerciseRevision, 3);

  const replay = await classrooms.releaseExerciseContent(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 2,
    stageId: 'stage-1',
    contentId: 'hint-1'
  });
  assert.equal(replay.status, 'unchanged');
  assert.equal(replay.exercise.exerciseRevision, 3);

  const staleDifferentRelease = await classrooms.releaseExerciseContent(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 2,
    stageId: 'stage-1',
    contentId: 'evidence-2'
  });
  assert.equal(staleDifferentRelease.status, 'conflict');
  assert.equal(staleDifferentRelease.exercise.exerciseRevision, 3);

  const second = await classrooms.releaseExerciseContent(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 3,
    stageId: 'stage-1',
    contentId: 'evidence-2'
  });
  assert.equal(second.status, 'updated');
  assert.equal(second.exercise.exerciseRevision, 4);

  const listed = await classrooms.listExerciseReleasesForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID
  );
  assert.deepEqual(
    listed.releases.map(({ stageId, contentId }) => ({ stageId, contentId })),
    [
      { stageId: 'stage-1', contentId: 'evidence-2' },
      { stageId: 'stage-1', contentId: 'hint-1' }
    ]
  );
  assert.equal(await classrooms.listExerciseReleasesForInstructor(testTokenHash('B'), EXERCISE_A_ID), null);
});

test('readiness belongs to the current workspace and reassignment never carries old-team readiness', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classPair(classrooms);
  await addWorkspace(classrooms, workspaceRepo, {
    publicId: WORKSPACE_A_ID,
    capability: 'P',
    claim: 'X',
    label: 'Team A'
  });
  await addWorkspace(classrooms, workspaceRepo, {
    publicId: WORKSPACE_B_ID,
    capability: 'Q',
    claim: 'Y',
    label: 'Team B'
  });

  await classrooms.admitParticipant({
    joinCode: 'K7FMP4Q2',
    participantId: PARTICIPANT_A,
    displayName: 'Alex',
    sessionHash: testTokenHash('S')
  });
  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRepository: workspaceRepo
  });
  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });
  await classrooms.updateExerciseLifecycle(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    expectedRevision: 1,
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'work',
    studentEditingEnabled: true
  });

  const readyA = await classrooms.setExerciseWorkspaceReadinessBySession(testTokenHash('S'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    ready: true,
    workspaceRevision: 7
  });
  assert.equal(readyA.status, 'updated');
  assert.equal(readyA.workspace.id, WORKSPACE_A_ID);
  assert.equal(readyA.readiness.readyWorkspaceRevision, 7);

  const replay = await classrooms.setExerciseWorkspaceReadinessBySession(testTokenHash('S'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    ready: true,
    workspaceRevision: 7
  });
  assert.equal(replay.status, 'unchanged');

  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: WORKSPACE_B_ID,
    workspaceRepository: workspaceRepo
  });

  const beforeReadyB = await classrooms.listExerciseWorkspaceStateForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID
  );
  assert.deepEqual(beforeReadyB.workspaceState.map(state => state.workspaceId), [WORKSPACE_A_ID]);

  const readyB = await classrooms.setExerciseWorkspaceReadinessBySession(testTokenHash('S'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    ready: true,
    workspaceRevision: 3
  });
  assert.equal(readyB.workspace.id, WORKSPACE_B_ID);

  const both = await classrooms.listExerciseWorkspaceStateForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID
  );
  assert.deepEqual(
    both.workspaceState.map(state => ({
      workspaceId: state.workspaceId,
      revision: state.readyWorkspaceRevision
    })),
    [
      { workspaceId: WORKSPACE_A_ID, revision: 7 },
      { workspaceId: WORKSPACE_B_ID, revision: 3 }
    ]
  );

  await classrooms.assignParticipant(testTokenHash('A'), {
    participantId: PARTICIPANT_A,
    workspacePublicId: null,
    workspaceRepository: workspaceRepo
  });
  const waiting = await classrooms.setExerciseWorkspaceReadinessBySession(testTokenHash('S'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    ready: true,
    workspaceRevision: 4
  });
  assert.equal(waiting.status, 'waiting');
});

test('debrief checkpoints are class-scoped, immutable, idempotent, and snapshot-isolated', async () => {
  const classrooms = createClassroomRepository();
  const workspaceRepo = createWorkspaceRepository();
  await classPair(classrooms);
  await addWorkspace(classrooms, workspaceRepo, {
    publicId: WORKSPACE_A_ID,
    capability: 'P',
    claim: 'X',
    label: 'Team A'
  });
  await addWorkspace(classrooms, workspaceRepo, {
    instructor: 'B',
    publicId: WORKSPACE_C_ID,
    capability: 'R',
    claim: 'Z',
    label: 'Other Class Team'
  });
  await classrooms.createExercise(testTokenHash('A'), {
    publicId: EXERCISE_A_ID,
    caseStudyId: 'synthetic-staged-case',
    simulationVersion: 1,
    simulationFingerprint: SIMULATION_FINGERPRINT
  });

  const sourceSnapshot = {
    pre: { oneLine: 'Team A before debrief' },
    kt: { rows: [{ id: 'what', is: 'Observed fact' }] }
  };
  const captured = await classrooms.captureExerciseCheckpoint(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRevision: 9,
    snapshot: sourceSnapshot
  });
  assert.equal(captured.status, 'captured');
  assert.equal(captured.checkpoint.workspaceRevision, 9);

  sourceSnapshot.pre.oneLine = 'Mutated after capture';

  const replay = await classrooms.captureExerciseCheckpoint(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRevision: 10,
    snapshot: { pre: { oneLine: 'Different later state' } }
  });
  assert.equal(replay.status, 'unchanged');
  assert.equal(replay.checkpoint.workspaceRevision, 9);
  assert.equal(replay.checkpoint.snapshot.pre.oneLine, 'Team A before debrief');

  const crossClassWorkspace = await classrooms.captureExerciseCheckpoint(testTokenHash('A'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    workspacePublicId: WORKSPACE_C_ID,
    workspaceRevision: 1,
    snapshot: {}
  });
  assert.equal(crossClassWorkspace, null);

  const wrongInstructor = await classrooms.captureExerciseCheckpoint(testTokenHash('B'), {
    exercisePublicId: EXERCISE_A_ID,
    stageId: 'stage-1',
    workspacePublicId: WORKSPACE_A_ID,
    workspaceRevision: 9,
    snapshot: {}
  });
  assert.equal(wrongInstructor, null);

  const listed = await classrooms.listExerciseCheckpointsForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID,
    'stage-1'
  );
  assert.equal(listed.checkpoints.length, 1);
  assert.equal(listed.checkpoints[0].workspaceId, WORKSPACE_A_ID);
  assert.equal(listed.checkpoints[0].workspaceRevision, 9);
  assert.equal(Object.hasOwn(listed.checkpoints[0], 'snapshot'), false);

  const inspected = await classrooms.getExerciseCheckpointForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID,
    'stage-1',
    WORKSPACE_A_ID
  );
  assert.equal(inspected.workspace.id, WORKSPACE_A_ID);
  assert.equal(inspected.checkpoint.workspaceRevision, 9);
  assert.equal(inspected.checkpoint.snapshot.pre.oneLine, 'Team A before debrief');

  const crossClassRead = await classrooms.getExerciseCheckpointForInstructor(
    testTokenHash('A'),
    EXERCISE_A_ID,
    'stage-1',
    WORKSPACE_C_ID
  );
  assert.equal(crossClassRead, null);

  const wrongInstructorRead = await classrooms.getExerciseCheckpointForInstructor(
    testTokenHash('B'),
    EXERCISE_A_ID,
    'stage-1',
    WORKSPACE_A_ID
  );
  assert.equal(wrongInstructorRead, null);
});
