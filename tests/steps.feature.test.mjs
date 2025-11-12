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
const STEP_FILTER_DISMISS_DELAY = 3000;

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
        <div id="stepsTools">
          <div class="steps-filter">
            <button type="button" class="steps-filter__btn" data-filter="all">All</button>
            <button type="button" class="steps-filter__btn" data-filter="active">Active</button>
            <button type="button" class="steps-filter__btn" data-filter="complete">Complete</button>
          </div>
        </div>
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

test('steps: active filter delays hiding newly completed steps', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    mock.timers.reset();
  });

  renderStepsFixture();
  initStepsFeature();

  const { document, window } = globalThis;
  const activeBtn = document.querySelector('.steps-filter__btn[data-filter="active"]');
  assert.ok(activeBtn, 'active filter button renders');
  activeBtn.click();

  const checkbox = document.querySelector('input[data-step-id="1"]');
  assert.ok(checkbox instanceof window.HTMLInputElement, 'first step checkbox available');
  const row = checkbox.closest('.steps-item');
  assert.ok(row, 'step row is present');

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.ok(row.classList.contains('steps-item--dismissing'), 'row enters dismissing state under active filter');
  assert.equal(row.hidden, false, 'row remains visible immediately after scheduling dismissal');

  mock.timers.tick(STEP_FILTER_DISMISS_DELAY - 1);
  assert.equal(row.hidden, false, 'row stays visible until the delay completes');
  assert.ok(row.classList.contains('steps-item--dismissing'), 'dismissal class persists until timeout completes');

  mock.timers.tick(1);
  assert.equal(row.hidden, true, 'row hides after the dismissal delay');
  assert.ok(!row.classList.contains('steps-item--dismissing'), 'dismissal class removed after timeout');
});

test('steps: complete filter delays hiding newly incomplete steps', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    mock.timers.reset();
  });

  renderStepsFixture();
  initStepsFeature();

  const { document, window } = globalThis;
  const checkbox = document.querySelector('input[data-step-id="1"]');
  assert.ok(checkbox instanceof window.HTMLInputElement, 'first step checkbox available');
  const row = checkbox.closest('.steps-item');
  assert.ok(row, 'step row is present');

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  const completeBtn = document.querySelector('.steps-filter__btn[data-filter="complete"]');
  assert.ok(completeBtn, 'complete filter button renders');
  completeBtn.click();

  assert.equal(row.hidden, false, 'completed row visible under the complete filter');

  checkbox.checked = false;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.ok(row.classList.contains('steps-item--dismissing'), 'row enters dismissing state when unchecked in complete filter');
  assert.equal(row.hidden, false, 'row remains visible while dismissal delay runs');

  mock.timers.tick(STEP_FILTER_DISMISS_DELAY);
  assert.equal(row.hidden, true, 'row hides after dismissal delay completes');
  assert.ok(!row.classList.contains('steps-item--dismissing'), 'dismissal class removed after timeout');
});

test('steps: changing filters cancels pending dismissals', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    mock.timers.reset();
  });

  renderStepsFixture();
  initStepsFeature();

  const { document, window } = globalThis;
  const activeBtn = document.querySelector('.steps-filter__btn[data-filter="active"]');
  const allBtn = document.querySelector('.steps-filter__btn[data-filter="all"]');
  assert.ok(activeBtn && allBtn, 'filter buttons render');
  activeBtn.click();

  const checkbox = document.querySelector('input[data-step-id="1"]');
  assert.ok(checkbox instanceof window.HTMLInputElement, 'first step checkbox available');
  const row = checkbox.closest('.steps-item');
  assert.ok(row, 'step row is present');

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.ok(row.classList.contains('steps-item--dismissing'), 'row enters dismissing state');

  allBtn.click();

  assert.ok(!row.classList.contains('steps-item--dismissing'), 'changing filter clears dismissing state');

  mock.timers.tick(STEP_FILTER_DISMISS_DELAY);
  assert.equal(row.hidden, false, 'row remains visible after filter change cancels dismissal');
});
