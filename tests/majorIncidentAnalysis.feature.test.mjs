/**
 * @file Verifies Major Incident decision and potential-problem collection, hydration, and summary output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('collects and restores decision fields with canonical action risk shapes', async () => {
  const dom = new JSDOM(`<!doctype html><input id="decisionToMake"><input id="decisionOptions"><input id="decisionSelectedOption"><input id="decisionOwnerRole" value="Application Owner"><input id="decisionDelegatedOwner"><input id="decisionRationale"><input id="decisionTimestamp"><input id="riskOwner"><select id="potentialRiskLevel"><option>High</option></select><input id="potentialFailure"><input id="preventiveControl"><input id="rollbackContingency"><input id="verificationCondition">`);
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const module = await import(`../src/majorIncidentAnalysis.js?test=${Date.now()}`);
  document.getElementById('decisionSelectedOption').value = 'Fail over';
  document.getElementById('decisionDelegatedOwner').value = 'Taylor';
  document.getElementById('riskOwner').value = 'Morgan';
  document.getElementById('potentialFailure').value = 'Replication falls behind';
  document.getElementById('preventiveControl').value = 'Check lag';
  document.getElementById('rollbackContingency').value = 'Return traffic';
  document.getElementById('verificationCondition').value = 'Errors remain below 1%';
  const state = module.collectMajorIncidentAnalysisState();
  assert.equal(state.decisionAnalysis.ownerRole, 'Application Owner');
  assert.equal(state.potentialProblemAnalysis.owner.name, 'Morgan');
  assert.deepEqual(state.potentialProblemAnalysis.risk, { level: 'High', impactIfFails: 'Replication falls behind', prevent: 'Check lag', ifHappens: 'Return traffic' });
  assert.equal(state.potentialProblemAnalysis.changeControl.rollbackPlan, 'Return traffic');
  assert.equal(state.potentialProblemAnalysis.verification.result, 'Errors remain below 1%');
  document.querySelectorAll('input').forEach(input => { input.value = ''; });
  module.applyMajorIncidentAnalysisState(state);
  assert.equal(document.getElementById('decisionSelectedOption').value, 'Fail over');
  assert.equal(document.getElementById('rollbackContingency').value, 'Return traffic');
  dom.window.close(); delete globalThis.window; delete globalThis.document;
});

test('Major Incident summary reports decision ownership and rollback readiness', async () => {
  const dom = new JSDOM('<!doctype html><div id="docTitle">Incident</div><div id="docSubtitle"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const { buildSummaryText } = await import(`../src/summary.js?workflow=${Date.now()}`);
  const text = buildSummaryText({
    intakeMode: 'majorIncident', actions: [], possibleCauses: [],
    decisionAnalysis: { decision: 'Recovery path', selectedOption: 'Fail over', ownerRole: 'Application Owner', delegatedOwner: 'Taylor' },
    potentialProblemAnalysis: { owner: { name: 'Morgan' }, risk: { impactIfFails: 'Lag' }, changeControl: { rollbackPlan: 'Return traffic' }, verification: { result: 'Error rate stable' } }
  });
  assert.match(text, /Selected Decision: Fail over/);
  assert.match(text, /Decision Owner: Taylor/);
  assert.match(text, /Change \/ Risk Owner: Morgan/);
  assert.match(text, /Rollback Readiness: Ready — Return traffic/);
  dom.window.close(); delete globalThis.window; delete globalThis.document;
});
