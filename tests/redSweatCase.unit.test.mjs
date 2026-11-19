/**
 * Red Sweat Mystery: General Mode progressive-disclosure exemplar regression.
 * The starter brief remains learner-safe; D&C and cause testing appear only in
 * the corresponding template projections. Full is intentionally an answer key.
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
const TESTABLE_ROW_IDS = Object.freeze([
  'what-object',
  'where-location',
  'when-description'
]);

function findQuestion(state, id) {
  return state.table.find(row => row.questionId === id);
}

test('Red Sweat is a General Mode self-study Case Study matching its protected source', () => {
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

test('learner-facing case brief contains factual evidence but not the resolved mechanism', () => {
  const state = TEMPLATE_MANIFEST.find(entry => entry.id === CASE_ID)?.state;
  assert.ok(state);
  assert.match(state.pre.proof, /LEARNER CASE BRIEF/);
  assert.match(state.pre.proof, /30 minutes after takeoff/i);
  assert.doesNotMatch(state.pre.proof, /flak(?:e|ing)|red ink|removing the vests stopped/i);
  assert.equal(state.actions.items.length, 4, 'complete authored source includes the illustrative implementation actions');
  assert.ok(state.steps.items.length >= 20, 'full Major Incident checklist is represented');
  assert.equal(state.meta.intakeMode, 'general', 'case remains ready for General display while retaining hidden MIM fields');
});

test('Intake and IS/IS NOT projections do not expose worked reasoning', () => {
  const intake = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.INTAKE);
  const spec = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.IS_IS_NOT);
  assert.ok(intake);
  assert.ok(spec);
  assert.equal(intake.meta.intakeMode, 'general');
  assert.equal(intake.table.length, 0);
  assert.equal(intake.causes.length, 0);
  assert.equal(intake.likelyCauseId, null);
  assert.equal(spec.causes.length, 0);
  assert.equal(spec.likelyCauseId, null);
  assert.equal(spec.actions.items.length, 0, 'no case answer actions in the IS / IS NOT projection');
  assert.equal(intake.actions.items.length, 0, 'no case answer actions in Intake');
  assert.equal(intake.ops.containDesc, '', 'historical containment answer must not leak into Intake');
  assert.equal(spec.ops.containDesc, '', 'historical containment answer must not leak into IS / IS NOT');
  assert.equal(intake.notesWorkspace.notes.length, 0, 'instructor/answer notes must not leak into the starter');
  assert.ok(findQuestion(spec, 'what-object').is);
  assert.ok(findQuestion(spec, 'where-location').no);
  for (const row of spec.table) {
    assert.equal(row.di || '', '');
    assert.equal(row.ch || '', '');
  }
});

test('D&C view reveals source-scoped distinctions and dated changes, but no causes', () => {
  const dc = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.DC);
  assert.ok(dc);
  assert.equal(dc.causes.length, 0);
  assert.equal(dc.likelyCauseId, null);
  assert.equal(dc.actions.items.length, 0, 'D&C must not reveal answer-key actions');
  assert.equal(dc.decisionAnalysis.decision, undefined, 'D&C does not include final decision exemplar');
  assert.match(findQuestion(dc, 'what-object').di, /vests/i);
  assert.match(findQuestion(dc, 'what-object').ch, /early January 1980/i);
  assert.match(findQuestion(dc, 'where-location').di, /over water/i);
  assert.match(findQuestion(dc, 'where-location').ch, /air-filter/i);
  assert.match(findQuestion(dc, 'where-location').ch, /later than the deviation/i);
  assert.match(findQuestion(dc, 'when-description').di, /safety demonstration/i);
  for (const row of dc.table.filter(row => row.di || row.ch)) {
    assert.ok(row.is && row.no, 'a worked distinction needs its exact IS and IS NOT pair');
    assert.ok(row.di, 'a change must attach to a distinction');
  }
});

test('Full view includes causes, test verdicts, assumptions, elimination and confirmation', () => {
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  assert.ok(full);
  assert.equal(full.meta.intakeMode, 'general');
  assert.equal(full.causes.length, 4);
  assert.equal(full.likelyCauseId, VEST_CAUSE_ID);
  assert.ok(full.steps.items.length >= 20, 'Full retains the canonical Major Incident checklist');
  assert.equal(full.actions.items.length, 4, 'Full includes illustrative verification and corrective actions');
  assert.ok(full.actions.items.every(item => item.status === 'Planned'), 'do not invent performed historical action status');
  assert.ok(full.actions.items.every(item => item.notes.includes('not a documented historical')), 'proposed actions are explicitly distinguished');
  assert.match(full.ops.containDesc, /HISTORICAL POST-EXERCISE RESULT/);
  assert.match(full.decisionAnalysis.decision, /ILLUSTRATIVE EXERCISE/);
  assert.match(full.decisionAnalysis.options, /A\\. Inspect/);
  assert.equal(full.decisionAnalysis.timestamp, '', 'no fabricated historical decision timestamp');
  assert.match(full.potentialProblemAnalysis.risk.impactIfFails, /ILLUSTRATIVE IF\\/THEN/);
  assert.equal(full.potentialProblemAnalysis.changeControl.required, true);
  assert.equal(full.potentialProblemAnalysis.verification.required, true);
  assert.ok(full.handover['remaining-risks'].length > 0);
  assert.ok(full.handover['must-watch-metrics'].length > 0);
  assert.ok(full.notesWorkspace.notes.length >= 4);
  const vested = full.causes.find(c => c.id === VEST_CAUSE_ID);
  const filter = full.causes.find(c => c.id === FILTER_CAUSE_ID);
  assert.ok(vested);
  assert.ok(filter);
  assert.equal(vested.testingOpen, true);
  assert.match(vested.evidence, /POST-EXERCISE REVEAL/);
  assert.match(vested.evidence, /reports stopped/i);
  assert.match(vested.evidence, /verify|observe|experiment|monitor/i);
  assert.match(filter.evidence, /later rollout|after the deviation began/i);
  assert.equal(filter.findings['what-object'].mode, 'fail');
  assert.equal(filter.findings['when-description'].mode, 'fail');

  const validModes = new Set(['yes', 'assumption', 'fail']);
  for (const cause of full.causes) {
    assert.ok(cause.suspect && cause.accusation && cause.impact);
    assert.equal(cause.editing, false);
    for (const id of TESTABLE_ROW_IDS) {
      assert.ok(findQuestion(full, id).is && findQuestion(full, id).no);
      const testResult = cause.findings[id];
      assert.ok(testResult, `${cause.id} missing testing for ${id}`);
      assert.ok(validModes.has(testResult.mode));
      assert.ok(testResult.note.length >= 40, 'test needs mechanism/assumption rationale');
    }
  }
});

test('unsubstantiated NMD comparisons are not passed off as factual IS NOT pairs', () => {
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  const unknownIds = [
    'what-deviation',
    'where-on-object',
    'when-first-observed',
    'when-pattern',
    'extent-population',
    'extent-size',
    'extent-count'
  ];
  for (const id of unknownIds) {
    assert.equal(findQuestion(full, id).no, '', `${id}: unknown is not a factual IS NOT`);
  }
});

test('Full case covers all supported MIM exemplar buckets while refusing unknown historical identities', () => {
  const source = TEMPLATE_MANIFEST.find(entry => entry.id === CASE_ID).state;
  const full = getTemplatePayload(CASE_ID, TEMPLATE_MODE_IDS.FULL);
  const expected = [
    'meta', 'pre', 'impact', 'ops', 'table', 'causes',
    'likelyCauseId', 'steps', 'actions', 'handover',
    'decisionAnalysis', 'potentialProblemAnalysis', 'notesWorkspace'
  ];
  for (const key of expected) {
    assert.ok(Object.prototype.hasOwnProperty.call(full, key), `missing full exemplar bucket ${key}`);
    assert.deepEqual(full[key], source[key], `template projection lost source content from ${key}`);
  }
  assert.equal(full.ops.icName, '');
  assert.equal(full.ops.bcName, '');
  assert.equal(full.ops.bridgeOpenedUtc, '');
  assert.equal(full.ops.severity, '');
  assert.equal(full.ops.commNextDueIso, '');
  assert.equal(full.decisionAnalysis.delegatedOwner, '');
  assert.equal(full.decisionAnalysis.timestamp, '');
  assert.ok(full.ops.detectUserReport, 'reported symptoms are the evidence source');
  assert.ok(full.ops.evOther, 'participant case dossier is the exhibit');
});
