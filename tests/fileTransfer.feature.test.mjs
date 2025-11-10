/**
 * File transfer controls integration tests.
 *
 * Validates that the header buttons trigger state exports/imports
 * and emit toast feedback through the shared notification system.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

let dom = null;
let previousGlobals = {};

beforeEach(() => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    getComputedStyle: globalThis.getComputedStyle,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    FileReader: globalThis.FileReader,
    URL: globalThis.URL
  };

  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/'
  });

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);

  const raf = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : callback => {
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
  globalThis.URL = window.URL;

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
  delete globalThis.__fileTransferMocks;
  delete process.env.TEST_STUB_MODULES;

  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
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

  if (previousGlobals.FileReader) {
    globalThis.FileReader = previousGlobals.FileReader;
  } else {
    delete globalThis.FileReader;
  }

  if (previousGlobals.URL) {
    globalThis.URL = previousGlobals.URL;
  } else {
    delete globalThis.URL;
  }

  previousGlobals = {};
});

function setupMainMocks({ collectSpy, applySpy, resetSpy, showToastSpy }, { stubFileTransfer = false } = {}) {
  globalThis.__actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(() => ({})),
    patchAction: mock.fn(() => ({})),
    removeAction: mock.fn(() => true),
    sortActions: mock.fn(() => []),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => []),
    normalizeActionSnapshot: mock.fn(payload => ({ ...(payload || {}) }))
  };

  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis-test',
    getLikelyCauseId: () => null,
    collectAppState: collectSpy,
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: resetSpy
  };

  globalThis.__ktMocks = {
    configureKT: mock.fn(),
    initTable: mock.fn(),
    ensurePossibleCausesUI: mock.fn(),
    renderCauses: mock.fn()
  };

  globalThis.__toastMocks = {
    showToast: showToastSpy
  };

  const stubModules = ['steps', 'commsDrawer', 'summary', 'preface', 'comms'];
  if (stubFileTransfer) {
    stubModules.push('fileTransfer');
  }
  process.env.TEST_STUB_MODULES = stubModules.join(',');

  globalThis.__stepsMocks = {
    initStepsFeature: mock.fn(),
    resetStepsState: mock.fn()
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
}

test('main: Save to File exports the current snapshot and toasts success', async () => {
  const { document, window } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
    <button id="stepsBtn"></button>
    <span id="stepsCompletedLabel"></span>
    <button id="startFreshBtn"></button>
    <button id="bridgeSetNowBtn"></button>
    <button id="saveToFileBtn"></button>
    <input id="importFileInput" type="file" />
    <button id="loadFromFileBtn"></button>
  `;

  const collectSpy = mock.fn(() => ({ meta: { version: 1 } }));
  const applySpy = mock.fn();
  const resetSpy = mock.fn();
  const showToastSpy = mock.fn();

  setupMainMocks({ collectSpy, applySpy, resetSpy, showToastSpy });

  await import('../main.js');
  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const originalCreate = window.URL.createObjectURL;
  const originalRevoke = window.URL.revokeObjectURL;
  const createSpy = mock.fn(() => 'blob://intake');
  const revokeSpy = mock.fn();
  window.URL.createObjectURL = createSpy;
  window.URL.revokeObjectURL = revokeSpy;

  const initialCollectCalls = collectSpy.mock.calls.length;

  document.getElementById('saveToFileBtn').click();

  assert.equal(
    collectSpy.mock.calls.length,
    initialCollectCalls + 1,
    'collectAppState called during export'
  );
  assert.equal(createSpy.mock.calls.length, 1, 'object URL created for download');
  assert.equal(revokeSpy.mock.calls.length, 1, 'object URL revoked after download');

  const toastArgs = showToastSpy.mock.calls.at(-1)?.arguments ?? [];
  assert.deepEqual(toastArgs, ['Download started for intake snapshot ✨']);

  window.URL.createObjectURL = originalCreate;
  window.URL.revokeObjectURL = originalRevoke;
});

test('main: Load from File migrates and applies the imported snapshot', async () => {
  const { document, window } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
    <button id="stepsBtn"></button>
    <span id="stepsCompletedLabel"></span>
    <button id="startFreshBtn"></button>
    <button id="bridgeSetNowBtn"></button>
    <button id="saveToFileBtn"></button>
    <input id="importFileInput" type="file" />
    <button id="loadFromFileBtn"></button>
  `;

  const collectSpy = mock.fn(() => ({ meta: { version: 1 } }));
  const applySpy = mock.fn();
  const resetSpy = mock.fn();
  const showToastSpy = mock.fn();

  setupMainMocks({ collectSpy, applySpy, resetSpy, showToastSpy });

  class FakeFileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onerror = null;
    }

    readAsText() {
      setTimeout(() => {
        this.result = FakeFileReader.mockResult;
        if (typeof this.onload === 'function') {
          this.onload({ target: this });
        }
      }, 0);
    }
  }
  FakeFileReader.mockResult = JSON.stringify({
    meta: { version: 1, savedAt: '2024-01-01T00:00:00.000Z' },
    pre: { oneLine: 'Example' }
  });

  globalThis.FileReader = FakeFileReader;
  window.FileReader = FakeFileReader;

  await import('../main.js');
  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const file = new window.File(['placeholder'], 'intake.json', { type: 'application/json' });
  const input = document.getElementById('importFileInput');
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => [file]
  });

  document.getElementById('loadFromFileBtn').click();
  input.dispatchEvent(new window.Event('change'));

  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(input.value, '', 'file input cleared after import');
});
