/**
 * Unit coverage for the universal Intake target registry and snapshot-native projection.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INTAKE_TARGET_DEFINITIONS,
  fingerprintIntakeTargetEvidence,
  getIntakeTargetDefinition,
  projectIntakeTarget,
  projectIntakeTargets
} from '../src/intakeTargets.js';
import {
  COACHABLE_TARGET_DEFINITIONS,
  fingerprintCoachingEvidence,
  getCoachableTargetDefinition
} from '../src/coachableFields.js';

test('universal registry preserves every existing coaching ID through the compatibility facade', () => {
  const universalIds = INTAKE_TARGET_DEFINITIONS.map(target => target.id);
  const coachingIds = COACHABLE_TARGET_DEFINITIONS.map(target => target.id);

  assert.equal(new Set(universalIds).size, universalIds.length);
  assert.deepEqual(coachingIds, universalIds);
  assert.equal(getCoachableTargetDefinition('problem.one-line'), getIntakeTargetDefinition('problem.one-line'));
  assert.equal(
    fingerprintCoachingEvidence('problem.one-line', 'Same evidence'),
    fingerprintIntakeTargetEvidence('problem.one-line', 'Same evidence')
  );
});

test('static target evidence projects directly from serialized Intake state without a DOM', () => {
  const snapshot = {
    pre: {
      oneLine: '  Payments   fail\r\nfor VIP users ',
      proof: 'Logs reproduce the timeout.'
    },
    impact: {
      now: 'Orders delayed',
      future: '',
      time: 'Since 10:00'
    },
    ops: {
      containDesc: 'Rollback active'
    }
  };

  const problem = projectIntakeTarget('problem.one-line', snapshot);
  assert.deepEqual(
    {
      id: problem.id,
      section: problem.section,
      kind: problem.kind,
      evidence: problem.evidence,
      comparisonText: problem.comparisonText,
      empty: problem.empty
    },
    {
      id: 'problem.one-line',
      section: 'Problem',
      kind: 'field',
      evidence: 'Payments fail\nfor VIP users',
      comparisonText: 'Payments fail\nfor VIP users',
      empty: false
    }
  );
  assert.equal(
    problem.fingerprint,
    fingerprintIntakeTargetEvidence('problem.one-line', 'Payments fail\nfor VIP users')
  );

  const futureImpact = projectIntakeTarget('impact.future', snapshot);
  assert.equal(futureImpact.evidence, '');
  assert.equal(futureImpact.empty, true);
});

test('KT target snapshot projection follows durable questionId rather than serialized row order', () => {
  const snapshot = {
    table: [
      {
        questionId: 'where-location',
        is: 'Toronto',
        no: 'Montreal',
        di: 'Region',
        ch: 'Routing changed'
      },
      {
        questionId: 'what-object',
        is: 'Checkout API',
        no: 'Reporting API',
        di: 'Request path',
        ch: 'New release'
      }
    ]
  };

  const first = projectIntakeTarget('kt.where-location', snapshot);
  const reordered = projectIntakeTarget('kt.where-location', {
    table: [...snapshot.table].reverse()
  });

  assert.equal(
    first.evidence,
    'is:Toronto\nis-not:Montreal\ndistinctions:Region\nchanges:Routing changed'
  );
  assert.equal(first.fingerprint, reordered.fingerprint);
});

test('Decision and Risk projections read their persisted workflow shapes and documented fallback', () => {
  const snapshot = {
    decisionAnalysis: {
      decision: 'Choose rollback path',
      options: 'Blue; Green',
      selectedOption: 'Blue',
      ownerRole: 'Application Owner',
      delegatedOwner: 'Alex',
      rationale: 'Lowest exposure',
      timestamp: '2026-10-07T10:00:00Z'
    },
    potentialProblemAnalysis: {
      owner: { name: 'Priya' },
      risk: {
        level: 'High',
        impactIfFails: 'Extended outage',
        prevent: 'Canary first',
        ifHappens: 'Restore prior version'
      },
      changeControl: { rollbackPlan: '' },
      verification: { result: 'Error rate below 1%' }
    }
  };

  assert.equal(projectIntakeTarget('decision.question', snapshot).evidence, 'Choose rollback path');
  assert.equal(projectIntakeTarget('risk.owner', snapshot).evidence, 'Priya');
  assert.equal(projectIntakeTarget('risk.rollback-contingency', snapshot).evidence, 'Restore prior version');
  assert.equal(projectIntakeTarget('risk.verification-condition', snapshot).evidence, 'Error rate below 1%');
});

test('projecting the registry yields a stable complete static/KT projection set', () => {
  const projected = projectIntakeTargets({});
  assert.equal(projected.length, INTAKE_TARGET_DEFINITIONS.length);
  assert.deepEqual(
    projected.map(target => target.id),
    INTAKE_TARGET_DEFINITIONS.map(target => target.id)
  );
  assert.equal(projected.every(target => typeof target.fingerprint === 'string'), true);
  assert.equal(projected.every(target => target.empty === true), true);
  assert.equal(projectIntakeTarget('unknown.target', {}), null);
});
