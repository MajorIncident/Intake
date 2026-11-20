/**
 * Precision Problems — official PSDM participant/final case boundaries.
 * Source: 2025 participant workbook and 2022 instructor reference pp. 321-330.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';
import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';
import { projectTemplateState, TEMPLATE_MODE_IDS, TEMPLATE_KINDS } from '../src/templates.js';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from '../scripts/standalone-public-case-studies.mjs';

const ID = 'precision-problems';
const MPC_ID = 'cause-precision-supplier-brass';
const record = PROTECTED_CASE_STUDY_MANIFEST.find(item => item.id === ID);
const project = mode => projectTemplateState(record.state, mode, record.supportedModes, TEMPLATE_KINDS.CASE_STUDY);
const row = (state, id) => state.table.find(entry => entry.questionId === id);

test('Precision Problems is an authored protected PSDM case, not a public Standalone export', () => {
  assert.ok(record);
  assert.equal(record.templateKind, 'case-study');
  assert.equal(record.libraryGroup, 'psdm');
  assert.equal(record.state.meta.intakeMode, 'general');
  assert.deepEqual(record.supportedModes, ['intake', 'is-is-not', 'dc', 'full']);
  assert.equal(record.simulation, undefined);
  assert.equal(STANDALONE_PUBLIC_CASE_STUDY_IDS.includes(ID), false);
  assert.equal(TEMPLATE_MANIFEST.some(item => item.id === ID), false);
});

test('participant brief covers the supplied facts and chronology without official cause spoilers', () => {
  const text = JSON.stringify(record.participantCase);
  assert.equal(record.participantCase.sections.length, 7);
  assert.match(text, /Engine-Ready|ERI/);
  assert.match(text, /Power-Pull/);
  assert.match(text, /Hi-Torque/);
  assert.match(text, /15 new high-speed CNC/);
  assert.match(text, /17 June/);
  assert.match(text, /26 June/);
  assert.match(text, /13%/);
  assert.match(text, /below 1%/);
  assert.match(text, /brass-receipt table/);
  assert.doesNotMatch(text, /supplier.*unsuitable|brass.*does not meet|Most Probable Cause|True Cause|material correction/i);
  assert.equal(record.participantCase.sections.some(section => section.reveal === true), false);
});

test('Full carries official two-feature aperture statement and exact-source inference limits', () => {
  const full = project(TEMPLATE_MODE_IDS.FULL);
  assert.ok(full);
  assert.equal(full.pre.oneLine, 'Hi-Torque fuel valves have uneven seat face and out-of-round hole.');
  assert.match(full.pre.proof, /26 June/);
  assert.match(full.pre.proof, /three new local brass suppliers/);
  assert.equal(full.likelyCauseId, MPC_ID);
  assert.equal(full.causes.length, 4);
  assert.match(full.causes.find(cause => cause.id === MPC_ID).evidence, /Official PSDM Instructor Reference Most Probable Cause/i);
  assert.match(full.causes.find(cause => cause.id === MPC_ID).evidence, /not a reported executed supplier correction/);
  assert.match(full.handover['whats-next'].join(' '), /Correlate.*material-use dates|suspect brass/);
  assert.equal(full.actions.items.length, 0);
  assert.equal(full.steps.items.length, 0);
  assert.equal(full.ops.icName, '');
  assert.equal(full.ops.severity, '');
  assert.equal(full.decisionAnalysis.decision, '');
  assert.equal(full.potentialProblemAnalysis.risk.impactIfFails, '');
});

test('Full tests every factual paired IS/IS NOT boundary against every possible cause', () => {
  const full = project(TEMPLATE_MODE_IDS.FULL);
  const pairs = full.table.filter(entry => entry.questionId && entry.no);
  assert.deepEqual(pairs.map(x => x.questionId), ['when-first-observed', 'when-pattern', 'extent-size']);
  for (const candidate of full.causes) {
    assert.ok(candidate.suspect && candidate.accusation && candidate.impact && candidate.summaryText);
    for (const pair of pairs) {
      const result = candidate.findings[pair.questionId];
      assert.ok(result, `${candidate.id} missing test for ${pair.questionId}`);
      assert.ok(['yes', 'assumption', 'fail'].includes(result.mode));
      assert.ok(result.note.length > 40);
    }
  }
  assert.equal(full.causes.find(cause => cause.id === 'cause-precision-fixed-tool-alignment').findings['when-pattern'].mode, 'fail');
  assert.equal(row(full, 'what-object').no, '', 'unverified Power-Pull reject history cannot become factual IS NOT');
  assert.equal(row(full, 'where-location').no, '', 'no verified unaffected comparison machine in source digest');
  assert.equal(full.table.some(x => x.di && !x.no), false, 'no unsupported Distinction attached to an unpaired row');
});

test('Current, future and resolution deadline fields answer different questions', () => {
  const full = project(TEMPLATE_MODE_IDS.FULL);
  assert.match(full.impact.now, /rejecting elevated proportions|13%/i);
  assert.match(full.impact.future, /1,000 Hi-Torque valves per day/);
  assert.match(full.impact.time, /next production and shipment requirements/);
  assert.doesNotMatch(full.impact.time, /26 June|17 June|three.day/i);
  assert.doesNotMatch(full.impact.now, /definitely missed|could not meet|halted production/i);
});

test('Full preserves complete MIM superset, and earlier projections never supply final causes', () => {
  const full = project(TEMPLATE_MODE_IDS.FULL);
  for (const key of ['meta','pre','impact','ops','table','causes','likelyCauseId','steps',
    'actions','appearance','handover','decisionAnalysis','potentialProblemAnalysis','notesWorkspace']) {
    assert.deepEqual(full[key], record.state[key], `lost Full bucket ${key}`);
  }
  for (const mode of [TEMPLATE_MODE_IDS.INTAKE,TEMPLATE_MODE_IDS.IS_IS_NOT,TEMPLATE_MODE_IDS.DC]) {
    const early = project(mode);
    assert.ok(early);
    assert.equal(early.causes.length, 0);
    assert.equal(early.likelyCauseId, null);
    assert.deepEqual(early.notesWorkspace.notes, []);
    assert.deepEqual(early.handover, {});
    assert.equal(early.ops.containDesc, '');
    assert.deepEqual(early.actions.items, []);
  }
  assert.equal(project(TEMPLATE_MODE_IDS.INTAKE).table.length, 0);
  assert.equal(row(project(TEMPLATE_MODE_IDS.IS_IS_NOT),'when-first-observed').is,
    row(full,'when-first-observed').is);
  assert.equal(row(project(TEMPLATE_MODE_IDS.IS_IS_NOT),'when-first-observed').di, '');
});
