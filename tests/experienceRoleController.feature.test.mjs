/**
 * Feature coverage for first-run experience selection and role resume.
 *
 * The suite mounts production index.html without running main.js so the role
 * controller can be exercised against real anchors and role-controlled surfaces.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  EXPERIENCE_ROLE_STORAGE_KEY,
  applyExperienceRole,
  getActiveExperienceRole,
  initExperienceRoleController,
  persistExperienceRolePreference
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';
import { STORAGE_KEY } from '../src/storage.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let dom = null;

/**
 * Mount production HTML at an optional URL.
 *
 * @param {string} [url='https://intake.test/'] - Test URL.
 * @returns {Document} Mounted document.
 */
function mount(url = 'https://intake.test/') {
  dom = new JSDOM(INDEX_HTML, { url });
  return dom.window.document;
}

/**
 * Initialize the role controller against the mounted jsdom environment.
 *
 * @returns {string|null} Applied role or null while selection is required.
 */
function initialize() {
  return initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });
}

beforeEach(() => {
  mount();
  dom.window.localStorage.clear();
});

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('a genuinely new browser receives the required accessible role chooser', () => {
  const role = initialize();
  const gate = dom.window.document.getElementById('experienceRoleGate');
  const cancel = dom.window.document.getElementById('experienceRoleCancelBtn');

  assert.equal(role, null);
  assert.equal(getActiveExperienceRole(), null);
  assert.equal(dom.window.document.body.dataset.experienceRole, 'unselected');
  assert.equal(gate.hidden, false);
  assert.equal(gate.getAttribute('aria-hidden'), 'false');
  assert.equal(cancel.hidden, true, 'first-run chooser cannot be dismissed without a role');
  assert.equal(dom.window.document.activeElement?.dataset.experienceRoleChoice, EXPERIENCE_ROLE_IDS.STANDALONE);
});

test('first-run Standalone selection persists independently and exposes the normal Intake', () => {
  initialize();

  dom.window.document.querySelector('[data-experience-role-choice="standalone"]').click();

  const stored = JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY));
  assert.equal(stored.role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, false);
  assert.equal(dom.window.document.getElementById('instructorExperienceShell').hidden, true);
  assert.equal(dom.window.document.getElementById('studentExperienceNotice').hidden, true);
  assert.equal(dom.window.document.querySelector('[data-experience-role-label]').textContent, 'Standalone');
});

test('existing Intake users silently migrate to Standalone instead of seeing first-run choice', () => {
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta: { version: 2 } }));

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STANDALONE);
});

test('existing collaboration links silently enter Standalone for backward compatibility', () => {
  dom.window.close();
  mount('https://intake.test/?workspace=existing-secret');
  dom.window.localStorage.clear();

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
});

test('a valid Classroom join fragment enters Student experience before the first-run chooser', () => {
  dom.window.close();
  mount('https://intake.test/#join=K7FMP4Q2');
  dom.window.localStorage.clear();

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
  assert.equal(dom.window.document.getElementById('studentClassEntryShell').hidden, false);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STUDENT);
});

test('legacy collaboration query authority wins over a simultaneous Classroom join fragment', () => {
  dom.window.close();
  mount('https://intake.test/?workspace=existing-secret#join=K7FMP4Q2');
  dom.window.localStorage.clear();

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, false);
});

test('explicit legacy collaboration link overrides a stored Instructor preference', () => {
  dom.window.close();
  mount('https://intake.test/?workspace=existing-secret');
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.INSTRUCTOR, dom.window.localStorage);

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, false);
  assert.equal(dom.window.document.getElementById('instructorExperienceShell').hidden, true);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STANDALONE);
});

test('stored Student role resumes the Intake and shows student context without a class dependency', () => {
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STUDENT, dom.window.localStorage);

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, false);
  assert.equal(dom.window.document.getElementById('studentExperienceNotice').hidden, false);
  assert.equal(dom.window.document.getElementById('instructorExperienceShell').hidden, true);
});

test('stored Instructor role resumes the instructor shell and hides editable Intake surfaces', () => {
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.INSTRUCTOR, dom.window.localStorage);

  const role = initialize();

  assert.equal(role, EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, true);
  assert.equal(dom.window.document.querySelector('.workspace-dock').hidden, true);
  assert.equal(dom.window.document.getElementById('instructorExperienceShell').hidden, false);
  dom.window.document.querySelectorAll('[data-experience-surface="intake-control"]').forEach((control) => {
    assert.equal(control.hidden, true);
  });
});

test('role switching can be dismissed with Escape and restores focus when it is not first-run', () => {
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STANDALONE, dom.window.localStorage);
  initialize();

  const switcher = dom.window.document.getElementById('experienceRoleMenuBtn');
  const viewTrigger = dom.window.document.querySelector('[data-menu-target="viewMenu"]');
  switcher.click();

  const gate = dom.window.document.getElementById('experienceRoleGate');
  assert.equal(gate.hidden, false);
  assert.equal(dom.window.document.getElementById('experienceRoleCancelBtn').hidden, false);

  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true
  }));

  assert.equal(gate.hidden, true);
  assert.equal(dom.window.document.activeElement, viewTrigger);
  assert.equal(getActiveExperienceRole(), EXPERIENCE_ROLE_IDS.STANDALONE);
});

test('role changes are announced without writing through the Intake save path', () => {
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STANDALONE, dom.window.localStorage);
  initialize();

  const changes = [];
  dom.window.addEventListener('intake:experience-role-changed', (event) => changes.push(event.detail.role));

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STUDENT);

  assert.deepEqual(changes, [EXPERIENCE_ROLE_IDS.STUDENT]);
  assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), null);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STUDENT);
});
