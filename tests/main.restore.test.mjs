/**
 * main.js restore behaviour tests.
 *
 * Ensures the entry module announces when a saved intake snapshot
 * is applied during boot.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

let dom = null;
let previousGlobals = {};
let jsdomSnapshot = null;

beforeEach(() => {
  previousGlobals = {
    getComputedStyle: globalThis.getComputedStyle,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage
  };

  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/'
  });

  const { window } = dom;
  const { document } = window;

  jsdomSnapshot = installJsdomGlobals(window);
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);

  const raf = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => {
        if (typeof callback === 'function') {
          callback(0);
        }
        return 1;
      };
  const cancelRaf = typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : () => {};
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = cancelRaf;
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = cancelRaf;

  globalThis.setInterval = window.setInterval.bind(window);
  globalThis.clearInterval = window.clearInterval.bind(window);
  globalThis.localStorage = window.localStorage;
  globalThis.sessionStorage = window.sessionStorage;

  if (!window.HTMLElement.prototype.focus) {
    window.HTMLElement.prototype.focus = () => {};
  }
});

afterEach(() => {
  mock.restoreAll();

  if (dom) {
    dom.window.close();
    dom = null;
  }

  delete globalThis.__actionsStoreMocks;
  delete globalThis.__appStateMocks;
  delete globalThis.__ktMocks;
  delete globalThis.__toastMocks;
  delete globalThis.__stepsMocks;
  delete globalThis.__commsDrawerMocks;
  delete globalThis.__summaryMocks;
  delete globalThis.__prefaceMocks;
  delete globalThis.__commsMocks;
  delete process.env.TEST_STUB_MODULES;

  globalThis.getComputedStyle = previousGlobals.getComputedStyle;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.setInterval = previousGlobals.setInterval;
  globalThis.clearInterval = previousGlobals.clearInterval;
  if (previousGlobals.localStorage) {
    globalThis.localStorage = previousGlobals.localStorage;
  } else {
    delete globalThis.localStorage;
  }
  if (previousGlobals.sessionStorage) {
    globalThis.sessionStorage = previousGlobals.sessionStorage;
  } else {
    delete globalThis.sessionStorage;
  }

  restoreJsdomGlobals(jsdomSnapshot);
  jsdomSnapshot = null;
  previousGlobals = {};
});

test('main: announces saved intake restore', async () => {
  const { document, window } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
    <button id="bridgeSetNowBtn"></button>
  `;

  const savedSnapshot = {
    meta: { version: 2, savedAt: '2024-05-21T00:00:00.000Z' },
    pre: {},
    impact: {},
    ops: {},
    table: [],
    causes: [],
    likelyCauseId: null,
    steps: { items: [], drawerOpen: false }
  };
  const applySpy = mock.fn();

  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis',
    getLikelyCauseId: () => 'cause',
    collectAppState: mock.fn(() => ({})),
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({}))
  };

  globalThis.__ktMocks = {
    configureKT: mock.fn(),
    initTable: mock.fn(),
    ensurePossibleCausesUI: mock.fn(),
    renderCauses: mock.fn()
  };

  const showToastSpy = mock.fn();
  globalThis.__toastMocks = {
    showToast: showToastSpy
  };

  process.env.TEST_STUB_MODULES = 'steps,commsDrawer,summary,preface,comms';
  globalThis.__stepsMocks = {
    initStepsFeature: mock.fn()
  };
  globalThis.__commsDrawerMocks = {
    initCommsDrawer: mock.fn(),
    toggleCommsDrawer: mock.fn(),
    closeCommsDrawer: mock.fn()
  };
  globalThis.__summaryMocks = {
    generateSummary: mock.fn(),
    setSummaryStateProvider: mock.fn()
  };
  globalThis.__prefaceMocks = {
    initPreface: mock.fn(),
    autoResize: mock.fn(),
    updatePrefaceTitles: mock.fn(),
    startMirrorSync: mock.fn(),
    setBridgeOpenedNow: mock.fn(),
    getPrefaceState: mock.fn(() => ({ ops: {} })),
    getObjectFull: mock.fn(() => ''),
    getDeviationFull: mock.fn(() => '')
  };
  globalThis.__commsMocks = {
    initializeCommunications: mock.fn(),
    logCommunication: mock.fn(),
    toggleLogVisibility: mock.fn(),
    setCadence: mock.fn(),
    setManualNextUpdate: mock.fn(),
    getCommunicationElements: mock.fn(() => ({
      internalBtn: null,
      externalBtn: null,
      logToggleBtn: null,
      nextUpdateInput: null,
      cadenceRadios: []
    }))
  };

  const storageModule = await import('../src/storage.js');
  window.localStorage.setItem(storageModule.STORAGE_KEY, JSON.stringify(savedSnapshot));

  await import('../main.js');

  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  assert.equal(applySpy.mock.calls.length, 1, 'applyAppState runs for the saved snapshot');
  const restoredArg = applySpy.mock.calls[0]?.arguments?.[0] ?? null;
  assert.ok(restoredArg && typeof restoredArg === 'object', 'restored snapshot is passed to applyAppState');
  assert.ok(restoredArg.meta, 'restored snapshot retains its metadata block');
  assert.equal(showToastSpy.mock.calls.length, 1, 'a toast announces the restore');
  assert.equal(showToastSpy.mock.calls[0].arguments[0], 'Saved intake reloaded ✨');
});
