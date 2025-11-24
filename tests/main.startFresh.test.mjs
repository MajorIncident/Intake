/**
 * main.js "Start Fresh" workflow tests.
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

test('main: start fresh clears persisted storage', async () => {
  const { document, localStorage } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="startFreshBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
  `;

  const keys = [
    'kt-intake-full-v2',
    'steps.items',
    'steps.drawerOpen',
    'comms.drawerOpen',
    'kt-analysis-id',
    'kt-actions-by-analysis-v1'
  ];
  keys.forEach((key, index) => {
    localStorage.setItem(key, `value-${index}`);
  });

  const applySpy = mock.fn();
  const resetAnalysisSpy = mock.fn();
  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis-old',
    getLikelyCauseId: () => null,
    collectAppState: mock.fn(() => ({})),
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: resetAnalysisSpy
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
  const resetStepsSpy = mock.fn();
  globalThis.__stepsMocks = {
    initStepsFeature: mock.fn(),
    resetStepsState: resetStepsSpy
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
  globalThis.__actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(),
    patchAction: mock.fn(),
    removeAction: mock.fn(),
    sortActions: mock.fn(),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => []),
    normalizeActionSnapshot: mock.fn(payload => payload ?? {})
  };

  await import(`../main.js?startFresh=${Math.random()}`);

  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const startFreshBtn = document.getElementById('startFreshBtn');
  assert.ok(startFreshBtn, 'start fresh button renders');
  startFreshBtn.click();

  keys.forEach(key => {
    assert.equal(localStorage.getItem(key), null, `${key} removed from storage`);
  });
  assert.equal(applySpy.mock.calls.length, 1, 'applyAppState invoked during reset');
  assert.deepEqual(applySpy.mock.calls[0].arguments[0], {}, 'applyAppState receives an empty state');
  assert.ok(resetAnalysisSpy.mock.calls.length >= 2, 'analysis id reset before and after clearing');
  assert.ok(showToastSpy.mock.calls.length >= 1, 'toast shown');
  const toastArgs = showToastSpy.mock.calls.at(-1)?.arguments ?? [];
  assert.equal(toastArgs[0], 'Intake reset. Ready for a new incident ✨', 'toast message announces the reset');
});

test('main: start fresh restores the steps badge to 0 of 27', async () => {
  const { document, localStorage } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="startFreshBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
    <button id="stepsBtn"></button>
    <span id="stepsCompletedLabel">0 of 27</span>
    <aside id="stepsDrawer" class="steps-drawer" aria-hidden="true"></aside>
    <div id="stepsBackdrop" aria-hidden="true"></div>
    <div id="stepsList"></div>
    <button id="stepsCloseBtn"></button>
    <div id="stepsDrawerProgress"></div>
  `;

  localStorage.setItem('steps.items', JSON.stringify([
    { id: '1', label: 'Prefilled', checked: true }
  ]));
  localStorage.setItem('steps.drawerOpen', 'true');
  localStorage.setItem('kt-intake-full-v2', JSON.stringify({ meta: { version: 2 } }));
  localStorage.setItem('kt-actions-by-analysis-v1', JSON.stringify({ analysis: [] }));
  localStorage.setItem('kt-analysis-id', 'analysis-old');

  const applySpy = mock.fn();
  const resetAnalysisSpy = mock.fn();
  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis-old',
    getLikelyCauseId: () => null,
    collectAppState: mock.fn(() => ({})),
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: resetAnalysisSpy
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

  process.env.TEST_STUB_MODULES = 'commsDrawer,summary,preface,comms';
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
  globalThis.__actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(),
    patchAction: mock.fn(),
    removeAction: mock.fn(),
    sortActions: mock.fn(),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => []),
    normalizeActionSnapshot: mock.fn(payload => payload ?? {})
  };

  await import(`../main.js?startFresh=${Math.random()}`);

  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const stepsBadge = document.getElementById('stepsCompletedLabel');
  assert.ok(stepsBadge, 'steps badge exists');
  assert.equal(stepsBadge.textContent, '1 of 27', 'badge reflects stored completion before reset');

  document.getElementById('startFreshBtn').click();

  assert.equal(stepsBadge.textContent, '0 of 27', 'badge resets to zero after start fresh');
  assert.equal(document.body.classList.contains('steps-drawer-open'), false, 'steps drawer is closed');
  assert.equal(localStorage.getItem('steps.items'), null, 'steps persistence cleared');
  assert.equal(localStorage.getItem('steps.drawerOpen'), null, 'drawer persistence cleared');
  assert.equal(localStorage.getItem('kt-intake-full-v2'), null, 'primary intake snapshot cleared');
  assert.equal(localStorage.getItem('kt-analysis-id'), null, 'analysis id cleared');
  assert.ok(showToastSpy.mock.calls.length >= 1, 'toast rendered');
  const toastArgs = showToastSpy.mock.calls.at(-1)?.arguments ?? [];
  assert.equal(toastArgs[0], 'Intake reset. Ready for a new incident ✨', 'toast message matches expectation');
  assert.equal(resetAnalysisSpy.mock.calls.length >= 2, true, 'analysis id cache cleared twice');
});

test('main: start fresh clears KT table evidence fields', async () => {
  const { document } = globalThis;
  document.body.innerHTML = `
    <button id="genSummaryBtn"></button>
    <button id="generateAiSummaryBtn"></button>
    <button id="startFreshBtn"></button>
    <button id="commsBtn"></button>
    <button id="commsCloseBtn"></button>
    <div id="commsBackdrop"></div>
    <div id="causeList"></div>
    <table>
      <tbody id="tbody">
        <tr>
          <th>What is happening?</th>
          <td><textarea id="ktIsField" class="tableta">System unavailable</textarea></td>
          <td><textarea id="ktNotField" class="tableta">Feature X unaffected</textarea></td>
          <td><textarea id="ktDistField" class="tableta">Only premium tenants</textarea></td>
          <td><textarea id="ktChangeField" class="tableta">New deployment</textarea></td>
        </tr>
      </tbody>
    </table>
  `;

  const isField = document.getElementById('ktIsField');
  const notField = document.getElementById('ktNotField');
  const distField = document.getElementById('ktDistField');
  const changeField = document.getElementById('ktChangeField');

  process.env.TEST_STUB_MODULES = 'steps,commsDrawer,summary,preface,comms';

  const realKT = await import(`../src/kt.js?actual=${Math.random()}`);
  const autoResizeSpy = mock.fn();
  realKT.configureKT({ autoResize: autoResizeSpy });

  const realAppState = await import(`../src/appState.js?actual=${Math.random()}`);
  const applySpy = mock.fn(state => realAppState.applyAppState(state));
  const resetAnalysisSpy = mock.fn();

  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis-old',
    getLikelyCauseId: () => null,
    collectAppState: mock.fn(() => ({})),
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: resetAnalysisSpy
  };

  globalThis.__ktMocks = {
    configureKT: mock.fn(),
    initTable: mock.fn(),
    ensurePossibleCausesUI: mock.fn(),
    renderCauses: mock.fn(),
    getPossibleCauses: mock.fn(() => []),
    setPossibleCauses: mock.fn(),
    focusFirstEditableCause: mock.fn(),
    updateCauseEvidencePreviews: mock.fn(),
    exportKTTableState: mock.fn(() => []),
    importKTTableState: rows => realKT.importKTTableState(rows),
    getRowsBuilt: mock.fn(() => []),
    causeHasFailure: mock.fn(() => false),
    causeStatusLabel: mock.fn(() => ''),
    getLikelyCauseId: mock.fn(() => null),
    setLikelyCauseId: mock.fn(),
    countCauseAssumptions: mock.fn(() => 0),
    evidencePairIndexes: mock.fn(() => []),
    countCompletedEvidence: mock.fn(() => 0),
    getRowKeyByIndex: mock.fn(() => ''),
    peekCauseFinding: mock.fn(() => null),
    findingMode: mock.fn(() => ''),
    findingNote: mock.fn(() => ''),
    buildHypothesisSentence: mock.fn(() => ''),
    fillTokens: mock.fn(text => text),
    getTableElement: mock.fn(() => document.getElementById('tbody')),
    getTableFocusMode: mock.fn(() => ''),
    setTableFocusMode: mock.fn()
  };

  const showToastSpy = mock.fn();
  globalThis.__toastMocks = {
    showToast: showToastSpy
  };

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
  globalThis.__actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(),
    patchAction: mock.fn(),
    removeAction: mock.fn(),
    sortActions: mock.fn(),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => []),
    normalizeActionSnapshot: mock.fn(payload => payload ?? {})
  };

  await import(`../main.js?startFresh=${Math.random()}`);

  document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const startFreshBtn = document.getElementById('startFreshBtn');
  assert.ok(startFreshBtn, 'start fresh button renders');
  startFreshBtn.click();

  assert.equal(isField.value, '', 'IS textarea cleared');
  assert.equal(notField.value, '', 'IS NOT textarea cleared');
  assert.equal(distField.value, '', 'Distinctions textarea cleared');
  assert.equal(changeField.value, '', 'Changes textarea cleared');
  assert.equal(autoResizeSpy.mock.calls.length, 4, 'autoResize invoked for each KT textarea');
  assert.equal(applySpy.mock.calls.length, 1, 'applyAppState invoked once');
  assert.equal(resetAnalysisSpy.mock.calls.length >= 2, true, 'analysis id reset around start fresh');
});
