/**
 * @file Verifies Major Incident role guidance rendering and mode containment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { applyIntakeMode } from '../src/intakeModeController.js';
import { ROWS } from '../src/constants.js';
import { MAJOR_INCIDENT_WORKFLOW_METADATA } from '../src/intakeModes.js';
import { initMajorIncidentRoles } from '../src/majorIncidentRoles.js';

test('renders all phases and exposes badges only for Major Incident mode', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="majorIncidentRoleLegend" hidden><h2 id="majorIncidentRoleLegendTitle">Roles</h2><div id="majorIncidentRoleLegendItems"></div></section>
    <div id="problem-summary"><h3>Problem Summary</h3><textarea id="oneLine">Customer-entered incident detail</textarea></div>
    <div class="card impact"><h3>Impact</h3></div>
    <h3 id="kt-is-is-not">Problem Analysis</h3>
    <div id="possibleCausesCard"><h3>Possible Causes</h3></div>
    <details id="decisionAnalysisCard"><summary>Decision Analysis</summary></details>
    <details id="potentialProblemAnalysisCard"><summary>Potential Problem Analysis</summary></details>
    <h2 id="commsDrawerTitle">Bridge &amp; Communications</h2>
    <h3 id="stepsDrawerTitle">Incident Steps</h3>
    <table><tbody id="tbody">${ROWS.map(row => `<tr data-question-id="${row.id}"><th>${row.id}</th></tr>`).join('')}</tbody></table>
  </body>`, { url: 'http://localhost' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;

  applyIntakeMode('general', { silent: true });
  initMajorIncidentRoles();
  assert.equal(document.querySelectorAll('.major-incident-role-legend__item').length, 4);
  assert.equal(document.querySelectorAll('.major-incident-role-icon').length, 4 + 8 + ROWS.length);
  assert.ok([...document.querySelectorAll('.major-incident-role-icon')].every((icon) => icon.getAttribute('aria-hidden') === 'true'));
  assert.equal(document.querySelectorAll('.major-incident-role-badge').length, 8 + ROWS.length);
  assert.ok([...document.querySelectorAll('.major-incident-role-badge')].every((badge) => badge.hidden));

  applyIntakeMode('majorIncident');
  const badge = document.querySelector('#problem-summary .major-incident-role-badge');
  assert.equal(document.getElementById('majorIncidentRoleLegend').hidden, false);
  assert.ok(badge, 'mode caption refresh restores the Problem Summary role badge');
  assert.match(badge.textContent, /Situation Appraisal — Incident Manager leads/);
  assert.equal(badge.tabIndex, 0);
  assert.equal(document.body.dataset.intakeMode, 'majorIncident');
  assert.match(badge.title, /Consulted:/);
  assert.match(badge.title, /Approver:/);

  const expectedTargets = [
    ['#problem-summary > h3', 'problemSummary'], ['.card.impact > h3', 'impact'],
    ['#kt-is-is-not', 'problemAnalysis'], ['#possibleCausesCard > h3', 'possibleCauses'],
    ['#decisionAnalysisCard > summary', 'decisionAnalysis'], ['#potentialProblemAnalysisCard > summary', 'potentialProblemAnalysis'],
    ['#commsDrawerTitle', 'communications'], ['#stepsDrawerTitle', 'steps']
  ];
  expectedTargets.forEach(([selector, area]) => {
    const targetBadge = document.querySelector(`${selector} .major-incident-role-badge`);
    const metadata = MAJOR_INCIDENT_WORKFLOW_METADATA[area];
    assert.match(targetBadge?.textContent || '', new RegExp(metadata.phase.label), `${area} exposes its KT phase`);
    assert.match(targetBadge?.getAttribute('aria-label') || '', new RegExp(`Primary: ${metadata.primaryRespondent.role}`), `${area} exposes its primary role`);
  });
  assert.equal(
    document.querySelector('#decisionAnalysisCard .major-incident-role-badge')?.dataset.phase,
    'decisionAnalysis',
    'Decision Analysis uses the green semantic phase pill'
  );
  assert.equal(
    document.querySelector('#potentialProblemAnalysisCard .major-incident-role-badge')?.dataset.phase,
    'potentialProblemAnalysis',
    'Potential Problem Analysis uses the orange semantic phase pill'
  );
  document.querySelectorAll('#tbody tr[data-question-id]').forEach(row => {
    const rowBadge = row.querySelector('.major-incident-role-badge');
    assert.match(rowBadge?.textContent || '', /Problem Analysis/, `${row.dataset.questionId} exposes its phase`);
    assert.match(rowBadge?.getAttribute('aria-label') || '', /Primary: Subject-Matter Expert/, `${row.dataset.questionId} exposes its primary role`);
  });
  document.querySelectorAll('.major-incident-role-legend__item').forEach(item => {
    assert.match(item.getAttribute('aria-label') || '', /Primary:/, 'legend colour has a textual role alternative');
  });

  applyIntakeMode('it');
  assert.equal(document.getElementById('majorIncidentRoleLegend').hidden, true);
  assert.ok([...document.querySelectorAll('.major-incident-role-badge')].every((item) => item.hidden));
  assert.equal(document.getElementById('oneLine').value, 'Customer-entered incident detail', 'hiding roles does not delete entered data');

  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
});
