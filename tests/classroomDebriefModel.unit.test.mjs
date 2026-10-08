/**
 * Unit coverage for the pure Classroom debrief comparison model.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ROWS } from '../src/constants.js';
import {
  DEBRIEF_EVIDENCE_MODES,
  buildClassroomDebriefModel,
  selectDebriefTargetAcrossWorkspaces
} from '../src/classroomDebriefModel.js';
import {
  possibleCauseTargetId,
  projectIntakeTarget
} from '../src/intakeTargets.js';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const KT_ID = ROWS.find(row => row?.id)?.id;

function snapshot({
  statement,
  ktIs = '',
  causeId,
  causeText
}) {
  return {
    pre: { oneLine: statement },
    table: KT_ID ? [{
      questionId: KT_ID,
      is: ktIs,
      no: '',
      di: '',
      ch: ''
    }] : [],
    causes: causeId ? [{
      id: causeId,
      suspect: causeText,
      accusation: 'Could explain the deviation',
      impact: 'Service impact',
      summaryText: causeText,
      confidence: 'medium',
      evidence: '',
      findings: {},
      editing: false,
      testingOpen: false
    }] : []
  };
}

function modelInput() {
  const currentA = snapshot({
    statement: 'Team Alpha current',
    ktIs: 'Alpha current fact',
    causeId: 'cause-alpha',
    causeText: 'Shared wording'
  });
  const checkpointA = snapshot({
    statement: 'Team Alpha checkpoint',
    ktIs: 'Alpha checkpoint fact',
    causeId: 'cause-alpha',
    causeText: 'Earlier Alpha cause'
  });
  const currentB = snapshot({
    statement: 'Team Beta current',
    ktIs: 'Beta current fact',
    causeId: 'cause-beta',
    causeText: 'Shared wording'
  });
  const reviewed = projectIntakeTarget('problem.one-line', checkpointA);

  return {
    sources: { currentA, checkpointA, currentB },
    input: {
      classroom: {
        id: 'class-1',
        title: 'Problem Solving 101',
        expiresAt: '2099-01-01T00:00:00Z'
      },
      exercise: {
        id: 'exercise-1',
        status: 'active',
        currentStageId: 'stage-1',
        stagePhase: 'debrief'
      },
      recommendedTargetIds: [
        'problem.one-line',
        'possible-cause',
        possibleCauseTargetId('cause-alpha'),
        'unknown.target',
        'problem.one-line'
      ],
      workspaces: [
        {
          id: W1,
          kind: 'group',
          label: 'Team Alpha',
          participantCount: 4,
          activeParticipantCount: 2,
          editingParticipantCount: 0,
          lastSeenAt: '2026-10-07T18:00:00Z'
        },
        {
          id: W2,
          kind: 'group',
          label: 'Team Beta',
          participantCount: 3,
          activeParticipantCount: 1,
          editingParticipantCount: 1,
          lastSeenAt: '2026-10-07T18:01:00Z'
        }
      ],
      currentSnapshots: [
        { workspaceId: W1, workspaceRevision: 14, updatedAt: '2026-10-07T18:02:00Z', snapshot: currentA },
        { workspaceId: W2, workspaceRevision: 9, updatedAt: '2026-10-07T18:03:00Z', snapshot: currentB }
      ],
      checkpoints: [
        {
          workspaceId: W1,
          workspaceRevision: 12,
          stageId: 'stage-1',
          capturedAt: '2026-10-07T17:55:00Z',
          snapshot: checkpointA
        }
      ],
      readiness: [
        { workspaceId: W1, readyForDebrief: true, readyWorkspaceRevision: 12, readyAt: '2026-10-07T17:54:00Z' },
        { workspaceId: W2, readyForDebrief: false, readyWorkspaceRevision: 8 }
      ],
      feedback: [
        {
          workspaceId: W1,
          targetId: 'problem.one-line',
          status: 'meets-standard',
          note: 'Instructor-only note must not enter the comparison model.',
          reviewedWorkspaceRevision: 12,
          reviewedFieldFingerprint: reviewed.fingerprint,
          feedbackRevision: 3
        },
        {
          workspaceId: W2,
          targetId: 'problem.one-line',
          status: 'needs-improvement',
          reviewedWorkspaceRevision: 9,
          reviewedFieldFingerprint: projectIntakeTarget('problem.one-line', currentB).fingerprint,
          feedbackRevision: 1
        }
      ]
    }
  };
}

test('buildClassroomDebriefModel projects current/checkpoint Intake without mutating source snapshots', () => {
  const { input, sources } = modelInput();
  const before = JSON.parse(JSON.stringify(sources));
  const model = buildClassroomDebriefModel(input);

  assert.equal(model.class.title, 'Problem Solving 101');
  assert.equal(model.workspaces.length, 2);
  assert.deepEqual(sources, before);

  const alpha = model.workspaces.find(workspace => workspace.id === W1);
  assert.equal(alpha.current.workspaceRevision, 14);
  assert.equal(alpha.checkpoint.workspaceRevision, 12);
  assert.equal(
    alpha.current.targets.find(target => target.id === 'problem.one-line').comparisonText,
    'Team Alpha current'
  );
  assert.equal(
    alpha.checkpoint.targets.find(target => target.id === 'problem.one-line').comparisonText,
    'Team Alpha checkpoint'
  );

  if (KT_ID) {
    assert.equal(
      alpha.current.targets.find(target => target.id === `kt.${KT_ID}`).comparisonText.includes('Alpha current fact'),
      true
    );
  }

  assert.equal(Object.hasOwn(alpha.current, 'snapshot'), false);
  assert.equal(Object.hasOwn(alpha.checkpoint, 'snapshot'), false);
});

test('dynamic Possible Causes remain independent per-workspace collections', () => {
  const { input } = modelInput();
  const model = buildClassroomDebriefModel(input);
  const cells = selectDebriefTargetAcrossWorkspaces(model, 'possible-cause');

  assert.equal(cells.length, 2);
  assert.equal(cells[0].projections.length, 1);
  assert.equal(cells[1].projections.length, 1);
  assert.equal(cells[0].projections[0].id, possibleCauseTargetId('cause-alpha'));
  assert.equal(cells[1].projections[0].id, possibleCauseTargetId('cause-beta'));
  assert.equal(cells[0].projections[0].comparisonText, 'Shared wording');
  assert.equal(cells[1].projections[0].comparisonText, 'Shared wording');
  assert.notEqual(cells[0].projections[0].instanceId, cells[1].projections[0].instanceId);
});

test('checkpoint selection is explicit and honestly reports missing checkpoint evidence', () => {
  const { input } = modelInput();
  const model = buildClassroomDebriefModel(input);
  const cells = selectDebriefTargetAcrossWorkspaces(
    model,
    'problem.one-line',
    { mode: DEBRIEF_EVIDENCE_MODES.CHECKPOINT }
  );

  const alpha = cells.find(cell => cell.workspace.id === W1);
  const beta = cells.find(cell => cell.workspace.id === W2);
  assert.equal(alpha.sourceAvailable, true);
  assert.equal(alpha.workspaceRevision, 12);
  assert.equal(alpha.projections[0].comparisonText, 'Team Alpha checkpoint');
  assert.equal(beta.sourceAvailable, false);
  assert.deepEqual(beta.projections, []);
});

test('coaching summary is neutral metadata and detects changed current evidence without returning notes', () => {
  const { input } = modelInput();
  const model = buildClassroomDebriefModel(input);
  const alpha = model.workspaces.find(workspace => workspace.id === W1);
  const beta = model.workspaces.find(workspace => workspace.id === W2);

  assert.deepEqual(alpha.coaching, {
    reviewedTargetCount: 1,
    meetsStandardCount: 1,
    needsImprovementCount: 0,
    changedSinceReviewCount: 1,
    targets: [{
      targetId: 'problem.one-line',
      status: 'meets-standard',
      reviewedWorkspaceRevision: 12,
      feedbackRevision: 3,
      changedSinceReview: true
    }]
  });
  assert.equal(beta.coaching.changedSinceReviewCount, 0);
  assert.equal(JSON.stringify(model).includes('Instructor-only note'), false);
  assert.equal(Object.hasOwn(alpha.coaching.targets[0], 'note'), false);
});

test('staged target recommendations accept shared static/family IDs only', () => {
  const { input } = modelInput();
  const model = buildClassroomDebriefModel(input);

  assert.deepEqual(model.recommendedTargetIds, ['problem.one-line', 'possible-cause']);
  assert.deepEqual(model.exercise.recommendedTargetIds, ['problem.one-line', 'possible-cause']);
});

test('unknown or runtime dynamic instance target IDs cannot be selected as cross-team semantic targets', () => {
  const { input } = modelInput();
  const model = buildClassroomDebriefModel(input);

  assert.deepEqual(
    selectDebriefTargetAcrossWorkspaces(model, possibleCauseTargetId('cause-alpha')),
    []
  );
  assert.deepEqual(selectDebriefTargetAcrossWorkspaces(model, 'unknown.target'), []);
});
