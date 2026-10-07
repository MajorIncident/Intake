/**
 * Focused validation for optional server-only staged Case Study definitions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeStagedSimulation,
  validateSimulationForResource,
  validateStagedSimulation
} from '../scripts/staged-simulation-schema.mjs';

function validSimulation() {
  return {
    version: 1,
    studentContent: [
      {
        id: 'initial-briefing',
        kind: 'narrative',
        title: ' Initial briefing ',
        body: ' A machine has stopped unexpectedly. '
      },
      {
        id: 'quality-table',
        kind: 'table',
        title: 'Quality readings',
        headers: ['Line', 'Reject rate'],
        rows: [['A', '2%'], ['B', '7%']]
      },
      {
        id: 'inspection-image',
        kind: 'image',
        title: 'Inspection photo',
        assetId: 'inspection-photo-1',
        alt: 'Close view of the affected surface'
      },
      {
        id: 'supplement-page',
        kind: 'document-page',
        title: 'Supplemental report',
        assetId: 'report-1',
        page: 2,
        alt: 'Second page of the supplemental report'
      }
    ],
    instructorContent: [
      {
        id: 'stage-one-notes',
        kind: 'facilitation',
        title: 'Stage 1 facilitation',
        body: 'Ask teams what they know before offering more evidence.'
      },
      {
        id: 'stage-two-exemplar',
        kind: 'exemplar',
        title: 'Stage 2 exemplar',
        body: 'Use only during the Instructor-led debrief.'
      }
    ],
    stages: [
      {
        id: 'stage-1',
        title: 'Clarify the situation',
        studentObjective: 'Establish what is known before diagnosing.',
        initialReleaseIds: ['initial-briefing', 'quality-table'],
        optionalReleaseIds: ['inspection-image'],
        intakeTargetIds: ['problem.one-line'],
        suggestedMinutes: 15,
        instructorContentIds: ['stage-one-notes'],
        defaultDebriefEditPolicy: 'frozen'
      },
      {
        id: 'stage-2',
        title: 'Use additional evidence',
        studentObjective: 'Refine the analysis using the newly released evidence.',
        initialReleaseIds: ['supplement-page'],
        optionalReleaseIds: [],
        intakeTargetIds: ['kt.what-object', 'possible-cause'],
        suggestedMinutes: null,
        instructorContentIds: ['stage-two-exemplar'],
        defaultDebriefEditPolicy: 'open'
      }
    ]
  };
}

test('valid staged simulation keeps Student and Instructor content structurally separate', () => {
  const simulation = validSimulation();
  assert.deepEqual(validateStagedSimulation(simulation), []);

  const normalized = normalizeStagedSimulation(simulation);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.studentContent[0].title, 'Initial briefing');
  assert.equal(normalized.studentContent[0].body, 'A machine has stopped unexpectedly.');
  assert.equal(normalized.instructorContent[0].kind, 'facilitation');
  assert.equal(normalized.stages[0].defaultDebriefEditPolicy, 'frozen');

  const studentIds = new Set(normalized.studentContent.map(item => item.id));
  const instructorIds = new Set(normalized.instructorContent.map(item => item.id));
  for (const stage of normalized.stages) {
    for (const id of [...stage.initialReleaseIds, ...stage.optionalReleaseIds]) {
      assert.equal(studentIds.has(id), true, `${id} should resolve only to Student content`);
      assert.equal(instructorIds.has(id), false, `${id} must not resolve to Instructor content`);
    }
    for (const id of stage.instructorContentIds) {
      assert.equal(instructorIds.has(id), true, `${id} should resolve only to Instructor content`);
      assert.equal(studentIds.has(id), false, `${id} must not resolve to Student content`);
    }
  }
});

test('simulation is optional for protected cases and forbidden on Standard Templates', () => {
  assert.deepEqual(
    validateSimulationForResource({ templateKind: 'case-study', simulation: undefined }),
    [],
    'existing non-staged Case Studies must remain valid'
  );

  const errors = validateSimulationForResource({
    templateKind: 'standard',
    simulation: validSimulation()
  });
  assert.ok(errors.some(message => message.includes('only on protected case-study resources')));
});

test('staged simulation rejects duplicate identities and cross-namespace collisions', () => {
  const simulation = validSimulation();
  simulation.studentContent.push({
    ...simulation.studentContent[0],
    title: 'Duplicate briefing'
  });
  simulation.instructorContent[1] = {
    ...simulation.instructorContent[1],
    id: 'stage-one-notes'
  };
  simulation.stages[1] = {
    ...simulation.stages[1],
    id: 'stage-1'
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.includes('simulation.studentContent ids must be unique'));
  assert.ok(errors.includes('simulation.instructorContent ids must be unique'));
  assert.ok(errors.includes('simulation.stages ids must be unique'));

  const collision = validSimulation();
  collision.instructorContent[0] = {
    ...collision.instructorContent[0],
    id: 'initial-briefing'
  };
  collision.stages[0] = {
    ...collision.stages[0],
    instructorContentIds: ['initial-briefing']
  };
  const collisionErrors = validateStagedSimulation(collision);
  assert.ok(collisionErrors.includes('Student and Instructor content ids must not collide'));
});

test('stage references must exist in the correct content namespace and cannot double-release one item', () => {
  const simulation = validSimulation();
  simulation.stages[0] = {
    ...simulation.stages[0],
    initialReleaseIds: ['initial-briefing', 'future-evidence'],
    optionalReleaseIds: ['initial-briefing', 'stage-one-notes'],
    instructorContentIds: ['quality-table']
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.some(message => message.includes('same Student content as both initial and optional release')));
  assert.ok(errors.some(message => message.includes('unknown Student content id: future-evidence')));
  assert.ok(errors.some(message => message.includes('unknown Student content id: stage-one-notes')));
  assert.ok(errors.some(message => message.includes('unknown Instructor content id: quality-table')));
});

test('orphan Student or Instructor content is rejected so authored protected material has an explicit stage', () => {
  const simulation = validSimulation();
  simulation.studentContent.push({
    id: 'unused-evidence',
    kind: 'evidence',
    title: 'Unused evidence',
    body: 'This should not silently ride along in a staged definition.'
  });
  simulation.instructorContent.push({
    id: 'unused-teaching-note',
    kind: 'debrief',
    title: 'Unused note',
    body: 'This must be deliberately assigned to a stage.'
  });

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.includes('simulation.studentContent id is not referenced by any stage: unused-evidence'));
  assert.ok(errors.includes('simulation.instructorContent id is not referenced by any stage: unused-teaching-note'));
});

test('content blocks reject unsafe/ambiguous shapes instead of accepting arbitrary markup or URLs', () => {
  const simulation = validSimulation();
  simulation.studentContent[0] = {
    id: 'initial-briefing',
    kind: 'narrative',
    title: 'Initial briefing',
    body: 'Safe text',
    html: '<script>alert(1)</script>'
  };
  simulation.studentContent[2] = {
    id: 'inspection-image',
    kind: 'image',
    title: 'Inspection photo',
    assetId: 'https://example.com/public-bypass.png',
    alt: ''
  };
  simulation.studentContent[3] = {
    id: 'supplement-page',
    kind: 'document-page',
    title: 'Supplemental report',
    assetId: 'report-1',
    page: 0,
    alt: 'Report'
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.some(message => message.includes('.html is not allowed')));
  assert.ok(errors.some(message => message.includes('assetId must be a stable lowercase slug')));
  assert.ok(errors.some(message => message.includes('.alt must be a non-empty string')));
  assert.ok(errors.some(message => message.includes('.page must be a positive integer')));
});

test('table blocks require a semantic rectangular string matrix', () => {
  const simulation = validSimulation();
  simulation.studentContent[1] = {
    id: 'quality-table',
    kind: 'table',
    title: 'Quality readings',
    headers: ['Line', 'Reject rate'],
    rows: [['A'], ['B', 7]]
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.some(message => message.includes('rows[0] must contain exactly 2 string cells')));
  assert.ok(errors.some(message => message.includes('rows[1] must contain exactly 2 string cells')));
});

test('version-1 definitions reject unknown lifecycle/content fields rather than silently widening the contract', () => {
  const simulation = validSimulation();
  simulation.futureStagesVisible = true;
  simulation.stages[0] = {
    ...simulation.stages[0],
    autoAdvanceWhenReady: true
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.some(message => message.includes('simulation.futureStagesVisible is not allowed')));
  assert.ok(errors.some(message => message.includes('autoAdvanceWhenReady is not allowed')));
});


test('staged intakeTargetIds accept shared static/KT targets and dynamic family selectors', () => {
  const simulation = validSimulation();
  assert.deepEqual(validateStagedSimulation(simulation), []);

  const normalized = normalizeStagedSimulation(simulation);
  assert.deepEqual(normalized.stages[0].intakeTargetIds, ['problem.one-line']);
  assert.deepEqual(normalized.stages[1].intakeTargetIds, ['kt.what-object', 'possible-cause']);
});

test('staged intakeTargetIds reject unknown targets and learner-created dynamic instance IDs', () => {
  const simulation = validSimulation();
  simulation.stages[0] = {
    ...simulation.stages[0],
    intakeTargetIds: [
      'problem.one-line',
      'future.unregistered-target',
      'possible-cause.cause-cache-rule'
    ]
  };

  const errors = validateStagedSimulation(simulation);
  assert.ok(errors.some(message => (
    message.includes('future.unregistered-target')
    && message.includes('unknown or unauthorable Intake target id')
  )));
  assert.ok(errors.some(message => (
    message.includes('possible-cause.cause-cache-rule')
    && message.includes('unknown or unauthorable Intake target id')
  )));
});
