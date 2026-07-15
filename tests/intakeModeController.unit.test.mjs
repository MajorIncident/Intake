import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  applyIntakeMode,
  getActiveIntakeMode,
  initIntakeModeController
} from '../src/intakeModeController.js';
import { DEFAULT_INTAKE_MODE, INTAKE_MODE_IDS } from '../src/intakeModes.js';

let dom = null;

/**
 * Mounts a minimal intake-mode DOM with all controlled sections present.
 * @returns {Document} Test document containing selector and controlled sections.
 */
function mountModeDom() {
  dom = new JSDOM(`<!doctype html><html><body>
    <select id="intakeModeSelect">
      <option value="general">General</option>
      <option value="it">IT</option>
      <option value="pharma">Pharma</option>
      <option value="majorIncident">Major Incident Management</option>
    </select>
    <section id="impact" data-mode-section="impact">
      <div class="field"><h3 id="impactNowHeading"></h3><label for="impactNow"></label><small></small><textarea id="impactNow"></textarea></div>
      <div class="field"><h3 id="impactFutureHeading"></h3><label for="impactFuture"></label><small></small><textarea id="impactFuture"></textarea></div>
      <div class="field"><h3 id="impactTimeHeading"></h3><label for="impactTime"></label><small></small><textarea id="impactTime"></textarea></div>
    </section>
    <section id="problem-summary"><h3></h3><div class="field"><label for="oneLine"></label><small></small><textarea id="oneLine"></textarea></div></section>
    <section id="evidence-objects"><h3></h3><div class="field"><label for="proof"></label><small></small><textarea id="proof"></textarea></div><div class="field"><label for="objectPrefill"></label><small></small><textarea id="objectPrefill"></textarea></div></section>
    <section id="baseline-current"><h3></h3><div class="field"><label id="labelHealthy" for="healthy"></label><small></small><textarea id="healthy"></textarea></div><div class="field"><label id="labelNow" for="now"></label><small></small><textarea id="now"></textarea></div></section>
    <section id="containment" data-mode-section="containment"><input id="containDesc" value="keep me" /></section>
    <button id="commsBtn" data-mode-section="communications"></button>
    <aside id="commsDrawer" data-mode-section="communications"><input id="bridgeOpenedUtc" value="2026-01-01T00:00:00Z" /></aside>
    <button id="stepsBtn" data-mode-section="steps"></button>
    <aside id="stepsDrawer" data-mode-section="steps"><input id="stepField" value="mounted" /></aside>
    <section id="handover" data-mode-section="handover"><textarea>handover text</textarea></section>
  </body></html>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  return dom.window.document;
}

afterEach(() => {
  dom?.window.close();
  dom = null;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.CustomEvent;
});

test('intake mode controller defaults to Major Incident Management and keeps all sections visible', () => {
  const document = mountModeDom();

  const mode = initIntakeModeController();

  assert.equal(mode, DEFAULT_INTAKE_MODE);
  assert.equal(getActiveIntakeMode(), DEFAULT_INTAKE_MODE);
  assert.equal(document.getElementById('intakeModeSelect').value, DEFAULT_INTAKE_MODE);
  assert.equal(document.querySelector('[data-mode-section="communications"]').hidden, false);
  assert.equal(document.getElementById('containment').hidden, false);
});

test('non-major modes hide Major Incident-only regions without unmounting fields', () => {
  const document = mountModeDom();
  initIntakeModeController({ state: { meta: { intakeMode: INTAKE_MODE_IDS.IT } } });

  ['containment', 'communications', 'steps', 'handover'].forEach((section) => {
    document.querySelectorAll(`[data-mode-section="${section}"]`).forEach((element) => {
      assert.equal(element.hidden, true, `${section} should be hidden`);
      assert.equal(element.getAttribute('aria-hidden'), 'true');
    });
  });

  assert.equal(document.getElementById('impact').hidden, false);
  assert.equal(document.getElementById('containDesc').value, 'keep me');
  assert.ok(document.getElementById('bridgeOpenedUtc'), 'bridge field remains mounted for imports');
  assert.ok(document.getElementById('stepField'), 'steps field remains mounted for imports');
});

test('selector changes apply mode visibility and emit a save callback', () => {
  const document = mountModeDom();
  const changes = [];
  initIntakeModeController({ onChange: (mode) => changes.push(mode) });

  const selector = document.getElementById('intakeModeSelect');
  selector.value = INTAKE_MODE_IDS.PHARMA;
  selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(getActiveIntakeMode(), INTAKE_MODE_IDS.PHARMA);
  assert.deepEqual(changes, [INTAKE_MODE_IDS.PHARMA]);
  assert.equal(document.getElementById('commsDrawer').hidden, true);
  assert.equal(document.querySelector('label[for="proof"]').textContent, 'Deviation evidence');
  assert.equal(document.getElementById('impactNowHeading').textContent, 'Current quality or patient impact');

  applyIntakeMode(INTAKE_MODE_IDS.MAJOR_INCIDENT, { silent: true });
  assert.equal(document.getElementById('commsDrawer').hidden, false);
  assert.equal(document.getElementById('containment').hidden, false);
});

test('saved General, IT, Pharma, and Major Incident states restore the active mode', () => {
  const cases = [
    [INTAKE_MODE_IDS.GENERAL, true],
    [INTAKE_MODE_IDS.IT, true],
    [INTAKE_MODE_IDS.PHARMA, true],
    [INTAKE_MODE_IDS.MAJOR_INCIDENT, false]
  ];

  cases.forEach(([intakeMode, hidesMajorIncidentRegions]) => {
    const document = mountModeDom();
    initIntakeModeController({ state: { meta: { intakeMode } } });

    assert.equal(getActiveIntakeMode(), intakeMode);
    assert.equal(document.getElementById('intakeModeSelect').value, intakeMode);
    assert.equal(document.getElementById('commsDrawer').hidden, hidesMajorIncidentRegions);

    dom.window.close();
    dom = null;
  });
});
