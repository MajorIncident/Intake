/**
 * @file Verifies Major Incident role guidance rendering and mode containment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { applyIntakeMode } from '../src/intakeModeController.js';
import { initMajorIncidentRoles } from '../src/majorIncidentRoles.js';

test('renders all phases and exposes badges only for Major Incident mode', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="majorIncidentRoleLegend" hidden><h2 id="majorIncidentRoleLegendTitle">Roles</h2><div id="majorIncidentRoleLegendItems"></div></section>
    <div id="problem-summary"><h3>Problem Summary</h3></div>
    <h3 id="kt-is-is-not">Problem Analysis</h3>
    <table><tbody id="tbody"><tr data-question-id="what"><th>What?</th></tr></tbody></table>
  </body>`, { url: 'http://localhost' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;

  applyIntakeMode('general', { silent: true });
  initMajorIncidentRoles();
  assert.equal(document.querySelectorAll('.major-incident-role-legend__item').length, 4);
  assert.equal(document.querySelectorAll('.major-incident-role-icon').length, 7);
  assert.ok([...document.querySelectorAll('.major-incident-role-icon')].every((icon) => icon.getAttribute('aria-hidden') === 'true'));
  assert.equal(document.querySelectorAll('.major-incident-role-badge').length, 3);
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

  applyIntakeMode('it');
  assert.equal(document.getElementById('majorIncidentRoleLegend').hidden, true);
  assert.ok([...document.querySelectorAll('.major-incident-role-badge')].every((item) => item.hidden));

  dom.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
});
