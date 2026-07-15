/**
 * @file Verifies production containment group visibility across intake modes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { applyIntakeMode } from '../src/intakeModeController.js';
import { INTAKE_MODE_IDS } from '../src/intakeModes.js';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let dom = null;
let globalsSnapshot = null;

/**
 * Mounts the production index markup so mode visibility can be asserted against real DOM hooks.
 * @returns {Document} Parsed intake document with browser globals installed.
 */
function mountIndexDom() {
  dom = new JSDOM(INDEX_HTML, { url: 'https://example.test/' });
  globalsSnapshot = installJsdomGlobals(dom.window);
  return dom.window.document;
}

/**
 * Finds the production containment card group and verifies its required fields remain colocated.
 * @param {Document} document - Mounted intake document.
 * @returns {HTMLElement} The containment group controlled by intake mode visibility.
 */
function getContainmentGroup(document) {
  const group = document.querySelector('[data-mode-section="containment"].containment-grid');

  assert.ok(group, 'expected the Impact card containment group to keep the containment mode hook and grid class');
  assert.equal(group.querySelector('legend')?.textContent.trim(), 'Current Service Recovery Stage');
  assert.ok(group.querySelectorAll('input[type="radio"][name="containStatus"]').length > 0, 'expected containment status radios inside the group');
  assert.equal(group.querySelector('label[for="containDesc"]')?.textContent.trim(), 'Containment / Mitigation Description');
  assert.ok(group.querySelector('input#containDesc'), 'expected the containment description input inside the group');

  return group;
}

beforeEach(() => {
  mountIndexDom();
});

afterEach(() => {
  restoreJsdomGlobals(globalsSnapshot);
  globalsSnapshot = null;
  dom?.window.close();
  dom = null;
});

test('containment group is hidden for General, IT, and Pharma intake modes', () => {
  const group = getContainmentGroup(document);

  [
    INTAKE_MODE_IDS.GENERAL,
    INTAKE_MODE_IDS.IT,
    INTAKE_MODE_IDS.PHARMA
  ].forEach((mode) => {
    applyIntakeMode(mode, { silent: true });

    assert.equal(group.hidden, true, `${mode} should hide the Impact card containment group`);
    assert.equal(group.getAttribute('aria-hidden'), 'true', `${mode} should expose hidden state to assistive tech`);
  });
});

test('containment group remains visible for Major Incident intake mode', () => {
  const group = getContainmentGroup(document);

  applyIntakeMode(INTAKE_MODE_IDS.MAJOR_INCIDENT, { silent: true });

  assert.equal(group.hidden, false, 'Major Incident should keep the Impact card containment group visible');
  assert.equal(group.getAttribute('aria-hidden'), 'false');
});
