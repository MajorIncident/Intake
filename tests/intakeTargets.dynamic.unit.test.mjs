/**
 * Unit coverage for dynamic Possible Cause Intake target identity and projection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  POSSIBLE_CAUSE_TARGET_FAMILY_ID,
  buildPossibleCauseEvidence,
  normalizePossibleCauseInstanceId,
  possibleCauseTargetId,
  projectIntakeTarget,
  projectIntakeTargets,
  projectPossibleCauseTargets,
  resolveIntakeTarget
} from '../src/intakeTargets.js';

function cause(overrides = {}) {
  return {
    id: 'cause-cache-rule',
    suspect: 'Cache rule',
    accusation: 'Routes checkout traffic incorrectly',
    impact: 'Requests time out',
    summaryText: 'Cache rule routes checkout traffic incorrectly',
    confidence: 'medium',
    evidence: 'Timeouts correlate with the rule.',
    findings: {
      'where-location': { mode: 'yes', note: 'Only region A is affected' },
      'what-object': { mode: 'assumption', note: 'Checkout only' }
    },
    editing: false,
    testingOpen: false,
    ...overrides
  };
}

test('Possible Cause instance target IDs reuse persisted grammar-safe lifecycle IDs', () => {
  assert.equal(normalizePossibleCauseInstanceId('cause-cache-rule'), 'cause-cache-rule');
  assert.equal(possibleCauseTargetId('cause-cache-rule'), 'possible-cause.cause-cache-rule');

  assert.equal(normalizePossibleCauseInstanceId(' Cause-Upper '), '');
  assert.equal(possibleCauseTargetId('cause with spaces'), '');
  assert.equal(possibleCauseTargetId('cause_underscore'), '');
  assert.equal(possibleCauseTargetId('cause-' + 'x'.repeat(145)), '');
});

test('Possible Cause projection exposes family + instance identity and ignores presentation-only state', () => {
  const snapshot = { causes: [cause()] };
  const targetId = possibleCauseTargetId('cause-cache-rule');
  const first = projectIntakeTarget(targetId, snapshot);
  const toggled = projectIntakeTarget(targetId, {
    causes: [cause({ editing: true, testingOpen: true })]
  });

  assert.equal(first.familyId, POSSIBLE_CAUSE_TARGET_FAMILY_ID);
  assert.equal(first.instanceId, 'cause-cache-rule');
  assert.equal(first.kind, 'dynamic-card');
  assert.match(first.label, /Cache rule/u);
  assert.match(first.comparisonText, /Cache rule routes checkout traffic incorrectly/u);
  assert.equal(first.empty, false);
  assert.equal(first.fingerprint, toggled.fingerprint);
  assert.equal(first.evidence, toggled.evidence);
});

test('Possible Cause evidence is deterministic across finding insertion order but changes with reasoning', () => {
  const original = cause();
  const reorderedFindings = cause({
    findings: {
      'what-object': { note: 'Checkout only', mode: 'assumption' },
      'where-location': { note: 'Only region A is affected', mode: 'yes' }
    }
  });

  assert.equal(buildPossibleCauseEvidence(original), buildPossibleCauseEvidence(reorderedFindings));

  const first = projectPossibleCauseTargets({ causes: [original] })[0];
  const changed = projectPossibleCauseTargets({
    causes: [cause({ evidence: 'New packet trace contradicts the rule.' })]
  })[0];

  assert.notEqual(first.fingerprint, changed.fingerprint);
});

test('Possible Cause instance identity survives cause-list reorder and does not depend on ordinal position', () => {
  const alpha = cause({ id: 'cause-alpha', suspect: 'Alpha', summaryText: 'Alpha hypothesis' });
  const beta = cause({ id: 'cause-beta', suspect: 'Beta', summaryText: 'Beta hypothesis' });

  const first = projectPossibleCauseTargets({ causes: [alpha, beta] });
  const reordered = projectPossibleCauseTargets({ causes: [beta, alpha] });

  const byId = values => new Map(values.map(value => [value.id, value.fingerprint]));
  assert.deepEqual(byId(first), byId(reordered));
  assert.deepEqual(
    first.map(target => target.id),
    ['possible-cause.cause-alpha', 'possible-cause.cause-beta']
  );
  assert.deepEqual(
    reordered.map(target => target.id),
    ['possible-cause.cause-beta', 'possible-cause.cause-alpha']
  );
});

test('ambiguous duplicate or unsupported Possible Cause IDs are excluded rather than silently rewritten', () => {
  const projected = projectPossibleCauseTargets({
    causes: [
      cause({ id: 'cause-duplicate', suspect: 'First' }),
      cause({ id: 'cause-duplicate', suspect: 'Second' }),
      cause({ id: 'Legacy Cause', suspect: 'Unsupported legacy identity' }),
      cause({ id: 'cause-safe', suspect: 'Safe cause' })
    ]
  });

  assert.deepEqual(projected.map(target => target.id), ['possible-cause.cause-safe']);
});

test('full target projection appends dynamic Possible Cause instances after static/KT definitions', () => {
  const projected = projectIntakeTargets({
    causes: [cause({ id: 'cause-one' }), cause({ id: 'cause-two' })]
  });
  assert.deepEqual(
    projected.slice(-2).map(target => target.id),
    ['possible-cause.cause-one', 'possible-cause.cause-two']
  );
});

test('live Possible Cause resolution uses persisted model evidence and the matching cause card', () => {
  const dom = new JSDOM('<main><article class="cause-card" data-cause-id="cause-cache-rule"><p>Visible card</p></article></main>');
  const model = cause();
  const targetId = possibleCauseTargetId(model.id);

  const resolved = resolveIntakeTarget(targetId, {
    documentRef: dom.window.document,
    causes: [model]
  });

  assert.ok(resolved);
  assert.equal(resolved.mount.dataset.causeId, model.id);
  assert.equal(resolved.instanceId, model.id);
  assert.equal(resolved.familyId, POSSIBLE_CAUSE_TARGET_FAMILY_ID);
  assert.equal(resolved.value, buildPossibleCauseEvidence(model));

  const presentationOnly = resolveIntakeTarget(targetId, {
    documentRef: dom.window.document,
    causes: [cause({ editing: true, testingOpen: true })]
  });
  assert.equal(resolved.fingerprint, presentationOnly.fingerprint);

  const changed = resolveIntakeTarget(targetId, {
    documentRef: dom.window.document,
    causes: [cause({ suspect: 'Changed suspect' })]
  });
  assert.notEqual(resolved.fingerprint, changed.fingerprint);
  dom.window.close();
});
