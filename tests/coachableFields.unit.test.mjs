/**
 * Unit coverage for stable coachable target IDs and field-specific fingerprints.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  COACHABLE_TARGET_DEFINITIONS,
  fingerprintCoachingEvidence,
  getCoachableTargetDefinition,
  listResolvedCoachableTargets,
  normalizeCoachingEvidence,
  resolveCoachableTarget
} from '../src/coachableFields.js';

test('coachable registry has unique stable domain IDs and excludes ephemeral Possible Cause identities', () => {
  const ids = COACHABLE_TARGET_DEFINITIONS.map(target => target.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('problem.one-line'));
  assert.ok(ids.includes('impact.current'));
  assert.ok(ids.includes('kt.what-object'));
  assert.ok(ids.includes('kt.extent-count'));
  assert.equal(ids.some(id => id.startsWith('cause.')), false);
  assert.equal(getCoachableTargetDefinition('problem.one-line').domId, 'oneLine');
});

test('static target identity survives placement changes and fingerprints normalized field evidence', () => {
  const dom = new JSDOM('<div class="field"><div><textarea id="oneLine"></textarea></div></div>');
  const field = dom.window.document.getElementById('oneLine');
  field.value = '  Payments   fail\r\nfor VIP users  ';

  const target = resolveCoachableTarget('problem.one-line', { documentRef: dom.window.document });
  assert.equal(target.id, 'problem.one-line');
  assert.equal(target.mount.classList.contains('field'), true);
  assert.equal(target.fingerprint, fingerprintCoachingEvidence('problem.one-line', 'Payments fail\nfor VIP users'));

  const before = target.fingerprint;
  field.parentElement.replaceWith(field);
  const moved = resolveCoachableTarget('problem.one-line', { documentRef: dom.window.document });
  assert.equal(moved.id, target.id);
  assert.equal(moved.fingerprint, before);

  field.value = 'Payments fail for every user';
  assert.notEqual(resolveCoachableTarget('problem.one-line', { documentRef: dom.window.document }).fingerprint, before);
  dom.window.close();
});

test('KT coaching target fingerprints the full durable question row rather than its position', () => {
  const dom = new JSDOM('<table><tbody><tr id="row"><th id="head"></th></tr></tbody></table>');
  const row = {
    questionId: 'where-location',
    tr: dom.window.document.getElementById('row'),
    th: dom.window.document.getElementById('head'),
    isTA: { value: 'Toronto' },
    notTA: { value: 'Montreal' },
    distTA: { value: 'Region' },
    chgTA: { value: 'Routing changed' }
  };
  const unrelated = { questionId: 'what-object', tr: {}, th: {}, isTA: { value: 'x' }, notTA: { value: 'y' }, distTA: { value: '' }, chgTA: { value: '' } };

  const first = resolveCoachableTarget('kt.where-location', { documentRef: dom.window.document, rows: [unrelated, row] });
  const reordered = resolveCoachableTarget('kt.where-location', { documentRef: dom.window.document, rows: [row, unrelated] });
  assert.equal(first.fingerprint, reordered.fingerprint);
  assert.equal(first.mount.id, 'head');

  row.chgTA.value = 'Routing and DNS changed';
  const changed = resolveCoachableTarget('kt.where-location', { documentRef: dom.window.document, rows: [row] });
  assert.notEqual(changed.fingerprint, first.fingerprint);
  dom.window.close();
});

test('formatting-only whitespace normalizes while meaning changes alter fingerprints', () => {
  assert.equal(normalizeCoachingEvidence('  A   B\n\n\n C  '), 'A B\n\nC');
  assert.equal(
    fingerprintCoachingEvidence('impact.current', 'Loss:   $5,000'),
    fingerprintCoachingEvidence('impact.current', 'Loss: $5,000')
  );
  assert.notEqual(
    fingerprintCoachingEvidence('impact.current', 'Loss: $5,000'),
    fingerprintCoachingEvidence('impact.current', 'Loss: $50,000')
  );
});

test('resolved list contains only mounted static/KT targets', () => {
  const dom = new JSDOM('<textarea id="oneLine"></textarea><textarea id="impactNow"></textarea>');
  const resolved = listResolvedCoachableTargets({ documentRef: dom.window.document, rows: [] });
  assert.deepEqual(resolved.map(target => target.id), ['problem.one-line', 'impact.current']);
  dom.window.close();
});
