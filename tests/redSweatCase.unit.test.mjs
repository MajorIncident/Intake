/**
 * Red Sweat Mystery: validate official KT case content, impact semantics,
 * factual IS/IS NOT, cause testing, and staged self-study projections.
 * Complete source is the Full answer; Classroom controls live disclosure.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';
import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';
import { getTemplatePayload, TEMPLATE_MODE_IDS } from '../src/templates.js';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from '../scripts/standalone-public-case-studies.mjs';

const CASE_ID = 'red-sweat-mystery';
const VEST_CAUSE_ID = 'cause-red-sweat-demonstration-vest-ink';
const FILTER_CAUSE_ID = 'cause-red-sweat-air-filter-ozone';
const TEST_ROWS = ['what-object', 'where-location', 'when-description'];

const authored = TEMPLATE_MANIFEST.find(entry => entry.id === CASE_ID);
const getRow = (state, id) => state.table.find(row => row.questionId === id);

test('case is included in both catalogs without conflicting copies', () => {
  const protectedRecord = PROTECTED_CASE_STUDY_MANIFEST.find(entry => entry.id === CASE_ID);
  assert.ok(authored);
  assert.ok(protectedRecord);
  assert.equal(authored.templateKind, 'case-study');
  assert.deepEqual(protectedRecord.state, authored.state);
  assert.ok(STANDALONE_PUBLIC_CASE_STUDY_IDS.includes(CASE_ID));
  assert.equal(authored.state.meta.intakeMode, 'general');
  assert.equal(authored.simulation, undefined);
});

test('official problem statement and participant evidence exclude the resolution', () => {
  const { pre } = authored.state;
  assert.equal(pre.oneLine, 'Flight Attendants have red sweat.');
  assert.match(pre.proof, /flight attendants/i);
  assert.match(pre.proof, /lead flight attendants/i);
  assert.match(pre.proof, /DC9/i);
  assert.match(pre.proof, /30 minutes after takeoff/i);
  assert.doesNotMatch(pre.proof, /flak(?:e|ing)|red ink|reports stopped|true cause/i);
  assert.match(pre.now, /red\\/pink/i);
});

test('Impact fields answer present consequence, future consequence, and resolution timeframe', () => {
  const { impact } = authored.state;
  assert.match(impact.now, /flight attendants/i);
  assert.match(impact.now, /duties/i);
  assert.match(impact.future, /subsequent flights/i);
  assert.match(impact.time, /next affected flight/i);
  assert.match(impact.time, /no specific resolution deadline/i);
  // The symptom's 30-minute onset belongs in PA WHEN, not in an impact deadline.
  assert.doesNotMatch(impact.time, /30 minutes|takeoff|March 1980|January 1980/i);
});

test('earlier self-study views contain only content appropriate to the KT stage', () => {
  const intake = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.INTAKE);
  const spec = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.IS_IS_NOT);
  const dc = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.DC);
  assert.ok(intake && spec && dc);
  assert.equal(intake.table.length, 0);
  assert.equal(intake.causes.length, 0);
  assert.equal(intake.likelyCauseId, null);
  assert.equal(spec.causes.length, 0);
  assert.equal(dc.causes.length, 0);
  assert.equal(dc.likelyCauseId, null);

  for (const state of [intake, spec, dc]) {
    assert.deepEqual(state.actions.items, [], 'corrective action would reveal the answer');
    assert.equal(state.ops.containDesc, '', 'historical fix is Full-only');
    assert.deepEqual(state.notesWorkspace.notes, [], 'solution notes are Full-only');
    assert.deepEqual(state.handover, {}, 'complete source debrief is Full-only');
    assert.deepEqual(state.decisionAnalysis, {});
    assert.deepEqual(state.potentialProblemAnalysis, {});
  }
  for (const row of spec.table) {
    assert.equal(row.di || '', '');
    assert.equal(row.ch || '', '');
  }
  assert.match(getRow(dc, 'where-location').di, /over-water/i);
  assert.match(getRow(dc, 'where-location').ch, /January 1980/i);
  assert.match(getRow(dc, 'when-description').di, /safety demonstration/i);
  assert.equal(getRow(dc, 'what-object').di, '', 'do not invent a confirmed lead-attendant handling distinction');
});

test('Full uses the KT-preferred solution and a valid alternative elimination', () => {
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  assert.ok(full);
  assert.equal(full.causes.length, 4);
  assert.equal(full.likelyCauseId, VEST_CAUSE_ID);
  assert.match(full.ops.containDesc, /vests stopped the reports/i);

  const vested = full.causes.find(cause => cause.id === VEST_CAUSE_ID);
  const filter = full.causes.find(cause => cause.id === FILTER_CAUSE_ID);
  assert.ok(vested && filter);
  assert.match(vested.evidence, /True Cause:/);
  assert.match(vested.evidence, /red ink/i);
  assert.match(vested.evidence, /sweat/i);
  assert.match(vested.evidence, /reports of red sweat stopped/i);
  assert.equal(vested.findings['what-object'].mode, 'assumption');
  assert.equal(vested.findings['where-location'].mode, 'assumption');
  assert.equal(vested.findings['when-description'].mode, 'yes');
  assert.equal(filter.findings['when-description'].mode, 'fail');
  assert.match(filter.evidence, /after the red-sweat reports began/i);

  for (const cause of full.causes) {
    assert.ok(cause.suspect && cause.accusation && cause.impact);
    for (const id of TEST_ROWS) {
      assert.ok(getRow(full, id)?.is && getRow(full, id)?.no);
      assert.ok(cause.findings[id], `${cause.id} missing KT test for ${id}`);
      assert.ok(['yes', 'assumption', 'fail'].includes(cause.findings[id].mode));
      assert.ok(cause.findings[id].note.length > 35);
    }
  }
});

test('complete Full source gives official removal outcome without invented incident decisions', () => {
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  const source = authored.state;
  for (const key of [
    'meta', 'appearance', 'pre', 'impact', 'ops', 'table', 'causes', 'likelyCauseId',
    'steps', 'actions', 'handover', 'decisionAnalysis', 'potentialProblemAnalysis', 'notesWorkspace'
  ]) {
    assert.deepEqual(full[key], source[key], `lost canonical source field ${key}`);
  }
  assert.equal(full.actions.items.length, 1);
  const fix = full.actions.items[0];
  assert.equal(fix.status, 'Done');
  assert.match(fix.summary, /Remove the new demonstration life vests/i);
  assert.match(fix.verification.result, /ceased/i);
  assert.equal(fix.owner.name, '');
  assert.equal(full.ops.icName, '');
  assert.equal(full.ops.bridgeOpenedUtc, '');
  assert.equal(full.ops.severity, '');
  assert.equal(full.decisionAnalysis.decision, '');
  assert.equal(full.potentialProblemAnalysis.risk.impactIfFails, '');
  assert.equal(full.steps.items.length, 0);

  const serialized = JSON.stringify(full);
  assert.doesNotMatch(serialized, /HISTORICAL CASE|ILLUSTRATIVE|PROPOSED\\/ILLUSTRATIVE|UNCONFIRMED learner/i);
});

test('unknown IS NOT comparators remain blank rather than invented', () => {
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  for (const id of ['what-deviation', 'where-on-object', 'when-first-observed', 'when-pattern', 'extent-population', 'extent-size', 'extent-count']) {
    assert.equal(getRow(full, id).no, '', `${id}: no invented IS NOT`);
  }
});
