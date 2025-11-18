/**
 * Steps feature integration tests.
 *
 * Validates that the checklist renders into the DOM, user interactions
 * persist progress, and drawer controls respect accessibility contracts.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

import {
  initStepsFeature,
  getStepsCounts,
  importStepsState,
  STEPS_ITEMS_KEY,
  STEPS_DRAWER_KEY
} from '../src/steps.js';

let dom = null;
let previousGlobals = {};
let jsdomSnapshot = null;

beforeEach(() => {
  previousGlobals = {
    HTMLButtonElement: globalThis.HTMLButtonElement,
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

  jsdomSnapshot = installJsdomGlobals(window);
  globalThis.HTMLButtonElement = window.HTMLButtonElement;

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

  globalThis.HTMLButtonElement = previousGlobals.HTMLButtonElement;
  globalThis.localStorage = previousGlobals.localStorage;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.setTimeout = previousGlobals.setTimeout;
  globalThis.clearTimeout = previousGlobals.clearTimeout;

  restoreJsdomGlobals(jsdomSnapshot);
  jsdomSnapshot = null;
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
        <div id="stepsTools">
          <div class="steps-search">
            <label for="stepsSearchInput" class="visually-hidden">Search steps</label>
            <input type="search" id="stepsSearchInput" placeholder="Search steps" autocomplete="off" />
            <button type="button" id="stepsSearchClearBtn" class="steps-search__clear" aria-label="Clear search" hidden>✕</button>
          </div>
          <div class="steps-filter" role="radiogroup" aria-label="Filter steps">
            <button type="button" class="steps-filter__btn is-active" data-filter="all" aria-pressed="true">All</button>
            <button type="button" class="steps-filter__btn" data-filter="active" aria-pressed="false">In Progress</button>
            <button type="button" class="steps-filter__btn" data-filter="complete" aria-pressed="false">Completed</button>
          </div>
        </div>
        <button id="stepsCloseBtn" type="button">Close</button>
        <div id="stepsList"></div>
        <div id="stepsEmptyState" hidden>
          <p id="stepsEmptyStateMessage"></p>
        </div>
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

test('steps: status filters toggle visibility based on checkbox state', async () => {
  renderStepsFixture();

  initStepsFeature();

  const { document, window } = globalThis;
  const allBtn = document.querySelector('.steps-filter__btn[data-filter="all"]');
  const activeBtn = document.querySelector('.steps-filter__btn[data-filter="active"]');
  const completeBtn = document.querySelector('.steps-filter__btn[data-filter="complete"]');
  assert.ok(allBtn && activeBtn && completeBtn, 'filter buttons render in the DOM');

  const firstItem = document.querySelector('.steps-item');
  assert.ok(firstItem, 'a checklist row is present');
  const phaseSection = firstItem.closest('.steps-category');
  assert.ok(phaseSection, 'row is grouped inside a phase section');
  const checkbox = firstItem.querySelector('input[type="checkbox"]');
  assert.ok(checkbox, 'row includes a checkbox');

  activeBtn.click();
  assert.equal(firstItem.hidden, false, 'unchecked step is visible under the In Progress filter');
  assert.equal(phaseSection.hidden, false, 'phase remains visible while it contains unchecked work');

  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(firstItem.hidden, true, 'completed step is hidden once marked done in the In Progress view');

  completeBtn.click();
  assert.equal(firstItem.hidden, false, 'completed step is shown in the Completed view');
  assert.equal(phaseSection.hidden, false, 'phase is visible when it contains completed work');
  const emptyState = document.getElementById('stepsEmptyState');
  assert.ok(emptyState, 'empty state container renders');
  assert.ok(emptyState.hidden, 'completed view hides the empty state when rows are visible');

  checkbox.checked = false;
  checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(firstItem.hidden, true, 'unchecked step disappears from the Completed view');
  assert.equal(phaseSection.hidden, true, 'phase hides when no rows match the current filter');
  assert.equal(emptyState.hidden, false, 'empty state appears after all rows are filtered out');

  activeBtn.click();
  assert.equal(firstItem.hidden, false, 'unchecked step returns when switching back to In Progress');
  assert.equal(phaseSection.hidden, false, 'phase reappears with matching rows');

  allBtn.click();
  assert.equal(firstItem.hidden, false, 'step remains visible in the All view');
  assert.equal(emptyState.hidden, true, 'empty state hides once rows are visible again');
});
