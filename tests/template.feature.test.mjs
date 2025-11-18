/**
 * Templates drawer DOM integration tests.
 *
 * Verifies that the curated templates drawer mounts, enforces the
 * `${mode}${minute}` password contract, and applies manifest payloads
 * through the existing save/load workflow helpers.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { collectAppState } from '../src/appState.js';
import { getTemplatePayload, listTemplates } from '../src/templates.js';
import {
  initTemplatesDrawer,
  openTemplatesDrawer,
  __dangerousResetTemplatesDrawerForTests as resetTemplatesDrawer
} from '../src/templatesDrawer.js';

let dom = null;
let previousGlobals = {};
let latestState = {};
const TEMPLATE_PASSWORD_MINUTE = 7;

function renderTemplatesFixture() {
  const { document } = globalThis;
  document.body.innerHTML = `
    <main>
      <button id="templatesBtn" aria-expanded="false">Templates</button>
      <div class="drawer-backdrop templates-backdrop" id="templatesBackdrop" aria-hidden="true"></div>
      <aside class="drawer templates-drawer" id="templatesDrawer" aria-hidden="true">
        <button id="templatesCloseBtn" type="button">Close</button>
        <ul class="templates-list" id="templatesList" role="listbox"></ul>
        <div class="templates-modes" id="templatesModeGroup" role="group"></div>
        <section class="templates-section templates-auth">
          <label for="templatesPassword">Confirm with bridge password</label>
          <input type="password" id="templatesPassword" autocomplete="off" />
        </section>
        <button type="button" class="btn templates-apply-btn" id="templatesApplyBtn">Apply template</button>
      </aside>
    </main>
  `;
}

beforeEach(() => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    Element: globalThis.Element,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    Date: globalThis.Date
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
  globalThis.HTMLButtonElement = window.HTMLButtonElement;
  globalThis.Element = window.Element;
  globalThis.requestAnimationFrame = (callback) => {
    if (typeof callback === 'function') {
      callback(0);
    }
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  if (!window.HTMLElement.prototype.focus) {
    window.HTMLElement.prototype.focus = () => {};
  }

  latestState = { meta: { version: 1 } };
  globalThis.__appStateMocks = {
    getAnalysisId: mock.fn(() => 'analysis-test'),
    getLikelyCauseId: mock.fn(() => null),
    collectAppState: mock.fn(() => latestState),
    applyAppState: mock.fn((state) => {
      latestState = state;
    }),
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: mock.fn()
  };

  globalThis.__toastMocks = {
    showToast: mock.fn()
  };
});

afterEach(() => {
  mock.restoreAll();
  resetTemplatesDrawer();

  if (dom) {
    dom.window.close();
    dom = null;
  }

  delete globalThis.__appStateMocks;
  delete globalThis.__toastMocks;

  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.HTMLButtonElement = previousGlobals.HTMLButtonElement;
  globalThis.Element = previousGlobals.Element;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.Date = previousGlobals.Date;

  previousGlobals = {};
});

function setFixedPasswordClock() {
  const OriginalDate = previousGlobals.Date || Date;
  class FixedDate extends OriginalDate {
    constructor(...args) {
      if (args.length) {
        super(...args);
        return;
      }
      super('2024-01-01T00:00:00Z');
    }

    getMinutes() {
      return TEMPLATE_PASSWORD_MINUTE;
    }
  }
  globalThis.Date = FixedDate;
}

function restoreRealClock() {
  globalThis.Date = previousGlobals.Date;
}

test('templates drawer enforces password confirmation and applies manifest payloads', async () => {
  renderTemplatesFixture();
  initTemplatesDrawer();
  openTemplatesDrawer();

  const { document } = globalThis;
  const drawer = document.getElementById('templatesDrawer');
  const backdrop = document.getElementById('templatesBackdrop');
  assert.equal(drawer.getAttribute('aria-hidden'), 'false');
  assert.equal(backdrop.getAttribute('aria-hidden'), 'false');
  assert.ok(document.body.classList.contains('templates-drawer-open'));

  const applyBtn = document.getElementById('templatesApplyBtn');
  const passwordInput = document.getElementById('templatesPassword');

  applyBtn.click();
  let errorEl = document.querySelector('.templates-auth__error');
  assert.ok(errorEl, 'drawer surfaces inline password errors');
  assert.equal(errorEl.textContent, 'Enter the bridge password to continue.');
  assert.equal(passwordInput.getAttribute('aria-invalid'), 'true');

  passwordInput.value = 'full99';
  applyBtn.click();
  errorEl = document.querySelector('.templates-auth__error');
  assert.equal(
    errorEl.textContent,
    'Password must match the mode key plus the current minute (e.g., full07).'
  );

  const templates = listTemplates();
  assert.ok(templates.length > 0, 'manifest exposes at least one template');
  const firstTemplateButton = document.querySelector(
    `.templates-list__item[data-template-id="${templates[0].id}"]`
  );
  assert.ok(firstTemplateButton, 'rendered template buttons expose metadata');
  firstTemplateButton.click();

  const fullModeBtn = document.querySelector('.templates-mode[data-mode="full"]');
  assert.ok(fullModeBtn, 'full mode chip renders in the drawer');
  fullModeBtn.click();

  setFixedPasswordClock();
  const expectedPassword = `full${String(TEMPLATE_PASSWORD_MINUTE).padStart(2, '0')}`;
  passwordInput.value = expectedPassword;
  applyBtn.click();
  restoreRealClock();

  const clearedError = document.querySelector('.templates-auth__error');
  assert.ok(!clearedError || clearedError.hidden, 'success hides the inline password error');
  assert.equal(passwordInput.value, '', 'successful apply clears password field');
  assert.equal(
    globalThis.__toastMocks.showToast.mock.calls.length,
    1,
    'applying a template emits toast feedback'
  );
  assert.equal(
    globalThis.__appStateMocks.applyAppState.mock.calls.length,
    1,
    'app state helper receives the manifest payload'
  );

  const expectedPayload = getTemplatePayload(templates[0].id, 'full');
  assert.deepEqual(
    globalThis.__appStateMocks.applyAppState.mock.calls[0].arguments[0],
    expectedPayload,
    'drawer applies the selected template payload'
  );
  assert.deepEqual(
    collectAppState(),
    expectedPayload,
    'collectAppState reflects the applied template after unlocking'
  );
  assert.equal(drawer.getAttribute('aria-hidden'), 'true', 'drawer closes after applying');
  assert.equal(backdrop.getAttribute('aria-hidden'), 'true');
  assert.ok(!document.body.classList.contains('templates-drawer-open'));
});
