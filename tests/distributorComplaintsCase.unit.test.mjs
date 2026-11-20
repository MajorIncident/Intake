/** Official PSDM Distributor Complaints: source, stage separation and PA testing. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';
import { TEMPLATE_MANIFEST } from '../src/templates.manifest.js';
import { projectTemplateState, TEMPLATE_MODE_IDS, TEMPLATE_KINDS } from '../src/templates.js';
import { STANDALONE_PUBLIC_CASE_STUDY_IDS } from '../scripts/standalone-public-case-studies.mjs';

const ID = 'distributor-complaints';
const MPC_ID = 'cause-distributor-fractionator-residue';
const record = PROTECTED_CASE_STUDY_MANIFEST.find(item => item.id === ID);
const full = () => projectTemplateState(record.state, TEMPLATE_MODE_IDS.FULL, record.supportedModes, TEMPLATE_KINDS.CASE_STUDY);
const project = mode => projectTemplateState(record.state, mode, record.supportedModes, TEMPLATE_KINDS.CASE_STUDY);
const getRow = (state, id) => state.table.find(row => row.questionId === id);

test('Distributor Complaints is protected PSDM, not silently published to Standalone', () => {
  assert.ok(record);
  assert.equal(record.templateKind, 'case-study');
  assert.equal(record.libraryGroup, 'psdm');
  assert.equal(record.state.meta.intakeMode, 'general');
  assert.equal(record.simulation, undefined);
  assert.equal(TEMPLATE_MANIFEST.some(item => item.id === ID), false);
  assert.equal(STANDALONE_PUBLIC_CASE_STUDY_IDS.includes(ID), false);
});

test('participant reading presents actual discovery evidence without instructor answer', () => {
  assert.equal(record.participantCase.sections.length, 7);
  const learner = JSON.stringify(record.participantCase);
  assert.match(learner, /Soter Safety|Soter Medi-Lite/);
  assert.match(learner, /Fractionator/);
  assert.match(learner, /18 May/);
  assert.match(learner, /7 May/);
  assert.match(learner, /three questions/);
  assert.doesNotMatch(learner, /contaminants not purged|Most Probable Cause is|True Cause:|confirmed fractionator residue/i);
  assert.equal(record.participantCase.sections.some(section => section.reveal === true), false);
});

test('Full preferred answer distinguishes official MPC from unverified true cause', () => {
  const state = full();
  assert.ok(state);
  assert.equal(state.pre.oneLine, 'Soter protective shoes have smudges.');
  assert.equal(state.likelyCauseId, MPC_ID);
  assert.equal(state.causes.length, 4);
  assert.match(state.causes.find(cause => cause.id === MPC_ID).evidence, /not a confirmed True Cause/);
  assert.match(state.causes.find(cause => cause.id === MPC_ID).summaryText, /7 May/);
  assert.match(state.handover['whats-next'].join(' '), /test|reconcile|inspect/i);
  assert.equal(state.ops.containDesc, '');
  assert.equal(state.ops.icName, '');
  assert.equal(state.ops.severity, '');
  assert.equal(state.actions.items.length, 0, 'no fabricated corrective action');
  assert.equal(state.steps.items.length, 0, 'no invented incident roles or checklist events');
  assert.equal(state.decisionAnalysis.decision, '');
  assert.equal(state.potentialProblemAnalysis.risk.impactIfFails, '');
});

test('PA IS NOT comparison and cause tests use all documented factual close pairs', () => {
  const state = full();
  const pairs = state.table.filter(row => row.questionId && row.no);
  assert.deepEqual(pairs.map(row => row.questionId), [
    'what-object', 'where-location', 'when-description'
  ]);
  for(const cause of state.causes) {
    assert.ok(cause.suspect && cause.accusation && cause.impact && cause.summaryText);
    for(const pair of pairs) {
      const result=cause.findings[pair.questionId];
      assert.ok(result, `${cause.id} missing ${pair.questionId} cause test`);
      assert.ok(['yes','assumption','fail'].includes(result.mode));
      assert.ok(result.note.length > 35);
    }
  }
  assert.equal(getRow(state,'when-first-observed').no,'', 'absence of evidence is not a verified IS NOT');
  assert.equal(getRow(state,'what-object').di,'', 'do not restate a comparison as a new Distinction');
  assert.equal(getRow(state,'when-first-observed').ch, '', 'do not attach a Change to an unpaired WHEN row');
  assert.match(getRow(state,'where-location').ch,/7 May/);
  assert.match(getRow(state,'where-location').di,/post-production holding/);
  assert.equal(state.causes.find(cause=>cause.id==='cause-distributor-hvac-dust').findings['where-location'].mode,'fail');
  assert.equal(state.causes.find(cause=>cause.id==='cause-distributor-shipping-mark').findings['where-location'].mode,'fail');
});

test('source-backed impact fields do not confuse dates or fabricate downstream inability', () => {
  const {impact,pre}=full();
  assert.match(impact.now,/returns|complaint/i);
  assert.match(impact.future,/further|more distributors/i);
  assert.match(impact.time,/before further|no contractual resolution deadline/i);
  assert.doesNotMatch(impact.time,/7 May|18 May|power outage/);
  assert.match(pre.proof,/QC|Quality Control/);
});

test('case projections withhold worked causes while Full preserves the MIM superset', () => {
  const state=full();
  for (const key of ['meta','pre','impact','ops','table','causes','likelyCauseId',
    'steps','actions','appearance','handover','decisionAnalysis','potentialProblemAnalysis','notesWorkspace']) {
    assert.deepEqual(state[key],record.state[key],`missing Full bucket ${key}`);
  }
  for(const mode of [TEMPLATE_MODE_IDS.INTAKE,TEMPLATE_MODE_IDS.IS_IS_NOT,TEMPLATE_MODE_IDS.DC]) {
    const early=project(mode);
    assert.ok(early);
    assert.equal(early.causes.length,0);
    assert.equal(early.likelyCauseId,null);
    assert.deepEqual(early.notesWorkspace.notes,[]);
    assert.deepEqual(early.handover,{});
    assert.equal(early.ops.containDesc,'');
    assert.deepEqual(early.actions.items,[]);
  }
  assert.equal(project(TEMPLATE_MODE_IDS.INTAKE).table.length,0);
  assert.equal(getRow(project(TEMPLATE_MODE_IDS.IS_IS_NOT),'when-first-observed').ch,'');
  assert.equal(getRow(project(TEMPLATE_MODE_IDS.DC),'when-first-observed').ch, '');
  assert.match(getRow(project(TEMPLATE_MODE_IDS.DC),'where-location').ch,/7 May/);
});
