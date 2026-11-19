/**
 * Red Sweat Mystery learner-safe case boundary and General Mode regression.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';
import { getTemplatePayload, TEMPLATE_MODE_IDS } from '../src/templates.js';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from '../scripts/standalone-public-case-studies.mjs';

const CASE_ID = 'red-sweat-mystery';

test('Red Sweat Mystery is a General Mode self-study Case Study and matches its protected source', () => {
  const publicCase = TEMPLATE_MANIFEST.find(entry => entry.id === CASE_ID);
  const protectedCase = PROTECTED_CASE_STUDY_MANIFEST.find(entry => entry.id === CASE_ID);
  assert.ok(publicCase);
  assert.ok(protectedCase);
  assert.ok(STANDALONE_PUBLIC_CASE_STUDY_IDS.includes(CASE_ID));
  assert.equal(publicCase.templateKind, 'case-study');
  assert.equal(publicCase.state.meta.intakeMode, 'general');
  assert.deepEqual(publicCase.state, protectedCase.state);
  assert.equal(publicCase.simulation, undefined);
  assert.equal(protectedCase.simulation, undefined);
});

test('Red Sweat Mystery prefills facts without revealing the true cause or a worked solution', () => {
  const state = TEMPLATE_MANIFEST.find(entry => entry.id === CASE_ID)?.state;
  assert.ok(state);
  assert.match(state.pre.proof, /LEARNER CASE BRIEF/);
  assert.match(state.pre.proof, /first 30 minutes/i);
  assert.equal(state.causes.length, 0);
  assert.equal(state.likelyCauseId, null);
  assert.equal(state.actions.items.length, 0);
  assert.ok(state.table.some(row => row.questionId === 'what-object'));
  assert.ok(state.table.some(row => row.questionId === 'when-description'));
  for (const row of state.table) {
    assert.equal(row.di || '', '');
    assert.equal(row.ch || '', '');
  }
});

test('Red Sweat Mystery supports introductory and full projections without filled analysis', () => {
  const intake = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.INTAKE);
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  assert.ok(intake);
  assert.ok(full);
  assert.equal(intake.table.length, 0);
  assert.equal(intake.pre.objectPrefill, 'Eastern Airlines flight attendants');
  assert.equal(full.meta.intakeMode, 'general');
  assert.ok(full.table.length >= 10);
  assert.equal(full.causes.length, 0);
});
