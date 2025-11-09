/**
 * Steps feature integration tests.
 *
 * Validates that the checklist renders into the DOM, user interactions
 * persist progress, and drawer controls respect accessibility contracts.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  initStepsFeature,
  getStepsCounts,
  importStepsState,
  STEPS_ITEMS_KEY,
  STEPS_DRAWER_KEY
} from '../src/steps.js';

let dom = null;
let previousGlobals = {};

beforeEach(() => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  };

  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;

  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)); },
    removeItem: (key) => { storage.delete(key); },
    clear: () => { storage.clear(); }
  };
  Object.defineProperty(window, 'localStorage', { value: localStorage, configurable: true });
  globalThis.localStorage = localStorage;

  const raf = (callback) => {
    if (typeof callback === 'function') {
      callback(0);
    }
    return 1;
  };
  const cancelRaf = () => {};
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = cancelRaf;
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = cancelRaf;

  if (window.HTMLElement && window.HTMLElement.prototype && !window.HTMLElement.prototype.focus) {
    window.HTMLElement.prototype.focus = () => {};
  }

  importStepsState({ items: [], drawerOpen: false });
  localStorage.clear();
});

afterEach(() => {
  mock.restoreAll();

  if (dom) {
    dom.window.close();
    dom = null;
  }

  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.localStorage = previousGlobals.localStorage;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.setTimeout = previousGlobals.setTimeout;
  globalThis.clearTimeout = previousGlobals.clearTimeout;

  previousGlobals = {};
});

function renderStepsFixture() {
  const { document } = globalThis;
  document.body.innerHTML = `
    <main>
      <button id="stepsBtn" aria-expanded="false">Steps</button>
      <span id="stepsCompletedLabel"></span>
      <aside id="stepsDrawer" aria-hidden="true">
        <div id="stepsDrawerProgress"></div>
        <button id="stepsCloseBtn" type="button">Close</button>
        <div id="stepsList"></div>
      </aside>
      <div id="stepsBackdrop" aria-hidden="true"></div>
    </main>
  `;
}

test('steps: toggling checklist items updates counts, storage, and logs', async () => {
  renderStepsFixture();

  const saveSpy = mock.fn();
  const logSpy = mock.fn();

  initStepsFeature({ onSave: saveSpy, onLog: logSpy });

  const { document, window } = globalThis;
  const stepsLabel = document.getElementById('stepsCompletedLabel');
  assert.equal(stepsLabel.textContent, '0 of 28', 'initial badge reflects zero completed steps');

  const firstCheckbox = document.querySelector('input[data-step-id="1"]');
  assert.ok(firstCheckbox, 'first checklist item renders into the DOM');

  firstCheckbox.checked = true;
  firstCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.deepEqual(getStepsCounts(), { total: 28, completed: 1 });
  assert.equal(stepsLabel.textContent, '1 of 28');

  const storedItems = JSON.parse(globalThis.localStorage.getItem(STEPS_ITEMS_KEY));
  assert.equal(storedItems[0].id, '1');
  assert.equal(storedItems[0].checked, true);

  assert.equal(saveSpy.mock.calls.length, 1, 'checking a step triggers persistence');
  assert.equal(logSpy.mock.calls.length, 1, 'checking a step emits a communication log entry');
  assert.equal(logSpy.mock.calls[0].arguments[0], 'internal');
  assert.match(logSpy.mock.calls[0].arguments[1], /^Step checked:/);

  firstCheckbox.checked = false;
  firstCheckbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.deepEqual(getStepsCounts(), { total: 28, completed: 0 });
  assert.equal(stepsLabel.textContent, '0 of 28');

  const updatedItems = JSON.parse(globalThis.localStorage.getItem(STEPS_ITEMS_KEY));
  assert.equal(updatedItems[0].checked, false);

  assert.equal(saveSpy.mock.calls.length, 2, 'unchecking a step triggers persistence again');
  assert.equal(logSpy.mock.calls.length, 2, 'unchecking a step emits a communication log entry');
  assert.match(logSpy.mock.calls[1].arguments[1], /^Step unchecked:/);
});


test('steps: drawer controls sync aria attributes and persisted state', async () => {
  const { localStorage } = globalThis;
  localStorage.setItem(STEPS_DRAWER_KEY, 'true');

  renderStepsFixture();

  const saveSpy = mock.fn();
  initStepsFeature({ onSave: saveSpy });

  const { document, window } = globalThis;
  const stepsBtn = document.getElementById('stepsBtn');
  const stepsDrawer = document.getElementById('stepsDrawer');
  const stepsBackdrop = document.getElementById('stepsBackdrop');
  const closeBtn = document.getElementById('stepsCloseBtn');

  assert.equal(stepsBtn.getAttribute('aria-expanded'), 'true', 'drawer resumes open state from storage');
  assert.equal(stepsDrawer.getAttribute('aria-hidden'), 'false');
  assert.equal(stepsBackdrop.getAttribute('aria-hidden'), 'false');
  assert.ok(document.body.classList.contains('steps-drawer-open'));
  assert.equal(saveSpy.mock.calls.length, 0, 'initial hydration does not trigger save');

  closeBtn.click();
  assert.equal(stepsBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(stepsDrawer.getAttribute('aria-hidden'), 'true');
  assert.equal(stepsBackdrop.getAttribute('aria-hidden'), 'true');
  assert.ok(!document.body.classList.contains('steps-drawer-open'));
  assert.equal(localStorage.getItem(STEPS_DRAWER_KEY), 'false');
  assert.equal(saveSpy.mock.calls.length, 1, 'closing drawer persists state');

  stepsBtn.click();
  assert.equal(stepsBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(stepsDrawer.getAttribute('aria-hidden'), 'false');
  assert.equal(stepsBackdrop.getAttribute('aria-hidden'), 'false');
  assert.ok(document.body.classList.contains('steps-drawer-open'));
  assert.equal(localStorage.getItem(STEPS_DRAWER_KEY), 'true');
  assert.equal(saveSpy.mock.calls.length, 2, 're-opening drawer persists state');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(stepsBtn.getAttribute('aria-expanded'), 'false', 'escape key closes the drawer');
  assert.equal(stepsDrawer.getAttribute('aria-hidden'), 'true');
  assert.equal(stepsBackdrop.getAttribute('aria-hidden'), 'true');
  assert.ok(!document.body.classList.contains('steps-drawer-open'));
  assert.equal(localStorage.getItem(STEPS_DRAWER_KEY), 'false');
  assert.equal(saveSpy.mock.calls.length, 3, 'escape close persists state');
});
