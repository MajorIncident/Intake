/**
 * Feature-level DOM integration coverage for the intake mode controller.
 *
 * The suite renders the real `index.html` evidence card, initializes the
 * controller after the DOM is mounted, and verifies mode switching keeps the
 * Major Incident-only evidence controls hidden or visible as configured.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  applyIntakeMode,
  initIntakeModeController
} from '../src/intakeModeController.js';
import { INTAKE_MODE_IDS } from '../src/intakeModes.js';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const EVIDENCE_SECTION_SELECTOR = '#evidence-objects';
const MODE_CONTROLLED_EVIDENCE_SECTIONS = [
  ['detectionSource', 'Detection Source'],
  ['evidenceCollected', 'Evidence Collected']
];

let dom = null;
let globalsSnapshot = null;

/**
 * Builds the mounted intake document from the production HTML shell.
 * @returns {Document} The mounted jsdom document used by the test.
 */
function mountIndexDocument() {
  dom = new JSDOM(INDEX_HTML, { url: 'http://localhost/' });
  globalsSnapshot = installJsdomGlobals(dom.window);
  return dom.window.document;
}

/**
 * Finds an evidence card control by its mode-section key and expected label.
 * @param {string} sectionKey - The `data-mode-section` key to locate.
 * @param {string} expectedText - Text expected within the matching element.
 * @returns {HTMLElement} The matching evidence control element.
 */
function getEvidenceControl(sectionKey, expectedText) {
  const element = document.querySelector(`${EVIDENCE_SECTION_SELECTOR} [data-mode-section="${sectionKey}"]`);

  assert.ok(element, `${sectionKey} should exist inside the Evidence card`);
  assert.match(element.textContent, new RegExp(expectedText), `${sectionKey} should contain ${expectedText}`);

  return element;
}

/**
 * Asserts both Evidence card controls match the requested visibility state.
 * @param {boolean} expectedHidden - Whether the controls should be hidden.
 * @returns {void}
 */
function assertEvidenceControlsHidden(expectedHidden) {
  MODE_CONTROLLED_EVIDENCE_SECTIONS.forEach(([sectionKey, expectedText]) => {
    const element = getEvidenceControl(sectionKey, expectedText);

    assert.equal(element.hidden, expectedHidden, `${sectionKey} hidden state`);
    assert.equal(element.getAttribute('aria-hidden'), expectedHidden ? 'true' : 'false', `${sectionKey} aria-hidden state`);
  });
}

beforeEach(() => {
  mountIndexDocument();
});

afterEach(() => {
  restoreJsdomGlobals(globalsSnapshot);
  globalsSnapshot = null;
  dom?.window.close();
  dom = null;
});

test('Evidence card mode controls are hidden for General, IT, and Pharma after mounted initialization', () => {
  const selector = document.getElementById('intakeModeSelect');

  assert.ok(selector, 'mode selector should be mounted before initialization');

  for (const mode of [INTAKE_MODE_IDS.GENERAL, INTAKE_MODE_IDS.IT, INTAKE_MODE_IDS.PHARMA]) {
    const appliedMode = initIntakeModeController({ state: { meta: { intakeMode: mode } } });

    assert.equal(appliedMode, mode, `${mode} should be initialized from explicit state`);
    assert.equal(selector.value, mode, `${mode} should be selected after initialization`);
    assertEvidenceControlsHidden(true);
  }
});

test('Evidence card mode controls are hidden for non-major selector changes and visible for Major Incident', () => {
  const selector = document.getElementById('intakeModeSelect');
  const changedModes = [];

  initIntakeModeController({
    state: { meta: { intakeMode: INTAKE_MODE_IDS.GENERAL } },
    onChange: (mode) => changedModes.push(mode)
  });
  assertEvidenceControlsHidden(true);

  for (const mode of [INTAKE_MODE_IDS.IT, INTAKE_MODE_IDS.PHARMA]) {
    selector.value = mode;
    selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.equal(selector.value, mode, `${mode} should remain selected after change`);
    assertEvidenceControlsHidden(true);
  }

  selector.value = INTAKE_MODE_IDS.MAJOR_INCIDENT;
  selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(selector.value, INTAKE_MODE_IDS.MAJOR_INCIDENT, 'Major Incident should remain selected after change');
  assertEvidenceControlsHidden(false);
  assert.deepEqual(changedModes, [
    INTAKE_MODE_IDS.IT,
    INTAKE_MODE_IDS.PHARMA,
    INTAKE_MODE_IDS.MAJOR_INCIDENT
  ]);
});

test('explicit General state is not overwritten by a stale Major Incident active mode', () => {
  applyIntakeMode(INTAKE_MODE_IDS.MAJOR_INCIDENT, { silent: true });

  const appliedMode = initIntakeModeController({ state: { meta: { intakeMode: INTAKE_MODE_IDS.GENERAL } } });

  assert.equal(appliedMode, INTAKE_MODE_IDS.GENERAL);
  assert.equal(document.getElementById('intakeModeSelect').value, INTAKE_MODE_IDS.GENERAL);
  assertEvidenceControlsHidden(true);
});
