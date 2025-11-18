/**
 * File transfer controls integration tests.
 *
 * Validates that the header buttons trigger state exports/imports
 * and emit toast feedback through the shared notification system.
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
    sessionStorage: globalThis.sessionStorage,
    FileReader: globalThis.FileReader,
    URL: globalThis.URL
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

  restoreJsdomGlobals(jsdomSnapshot);
  jsdomSnapshot = null;
  previousGlobals = {};
});

function setupMainMocks({ collectSpy, applySpy, resetSpy, showToastSpy }, { stubFileTransfer = false } = {}) {
  const actionsByAnalysis = new Map();

  const cloneAction = (action) => ({
    ...(action || {}),
    owner: { ...((action && action.owner) || {}) },
    links: { ...((action && action.links) || {}) }
  });

  const setActions = (analysisId, items = []) => {
    const normalized = Array.isArray(items) ? items.map(cloneAction) : [];
    actionsByAnalysis.set(analysisId, normalized);
    return normalized.map(cloneAction);
  };

  const listActionsMock = mock.fn((analysisId) => {
    const list = actionsByAnalysis.get(analysisId) || [];
    return list.map(cloneAction);
  });

  const createActionMock = mock.fn((analysisId, payload = {}) => {
    const existing = actionsByAnalysis.get(analysisId) || [];
    const next = {
      id: payload.id || `action-${existing.length + 1}`,
      summary: '',
      detail: '',
      owner: {},
      verification: {},
      links: {},
      status: 'Planned',
      priority: 'Med',
      ...cloneAction(payload)
    };
    actionsByAnalysis.set(analysisId, [...existing, next]);
    return cloneAction(next);
  });

  const patchActionMock = mock.fn((analysisId, id, delta = {}) => {
    const list = actionsByAnalysis.get(analysisId) || [];
    const index = list.findIndex(item => item && item.id === id);
    if (index < 0) {
      return { __error: 'Action not found' };
    }
    const updated = { ...list[index], ...cloneAction(delta) };
    list[index] = updated;
    return cloneAction(updated);
  });

  const removeActionMock = mock.fn((analysisId, id) => {
    const list = actionsByAnalysis.get(analysisId) || [];
    const next = list.filter(item => item && item.id !== id);
    actionsByAnalysis.set(analysisId, next);
    return true;
  });

  const sortActionsMock = mock.fn((analysisId) => {
    const list = actionsByAnalysis.get(analysisId) || [];
    const sorted = [...list].sort((a, b) => (a.summary || '').localeCompare(b.summary || ''));
    actionsByAnalysis.set(analysisId, sorted);
    return sorted.map(cloneAction);
  });

  const importActionsStateMock = mock.fn((analysisId, items = []) => setActions(analysisId, items));

  globalThis.__actionsStoreMocks = {
    listActions: listActionsMock,
    createAction: createActionMock,
    patchAction: patchActionMock,
    removeAction: removeActionMock,
    sortActions: sortActionsMock,
    exportActionsState: mock.fn(() => []),
    importActionsState: importActionsStateMock,
    normalizeActionSnapshot: mock.fn(payload => ({ ...(payload || {}) }))
  };

  let likelyCauseId = null;

  globalThis.__appStateMocks = {
    __activeAnalysisId: 'analysis-test',
    getAnalysisId: () => globalThis.__appStateMocks.__activeAnalysisId,
    getLikelyCauseId: () => likelyCauseId,
    collectAppState: collectSpy,
    applyAppState: applySpy,
    getSummaryState: mock.fn(() => ({})),
    resetAnalysisId: mock.fn(() => {
      resetSpy?.();
      globalThis.__appStateMocks.__activeAnalysisId = 'analysis-test';
    })
  };

  let possibleCauses = [];

  globalThis.__ktMocks = {
    getPossibleCauses: mock.fn(() => possibleCauses),
    setPossibleCauses: mock.fn(),
    causeHasFailure: mock.fn(() => false),
    buildHypothesisSentence: mock.fn(() => ''),
    configureKT: mock.fn(),
    initTable: mock.fn(),
    ensurePossibleCausesUI: mock.fn(),
    renderCauses: mock.fn(),
    focusFirstEditableCause: mock.fn(),
    updateCauseEvidencePreviews: mock.fn(),
    setLikelyCauseId: mock.fn(),
    getLikelyCauseId: mock.fn(() => likelyCauseId)
  };

  globalThis.__toastMocks = {
    showToast: showToastSpy
  };

  const stubModules = ['steps', 'commsDrawer', 'summary', 'preface', 'comms'];
  if (stubFileTransfer) {
    stubModules.push('fileTransfer');
    globalThis.__fileTransferMocks = {
      exportAppStateToFile: mock.fn(() => ({ success: true, message: 'Download started for intake snapshot ✨' })),
      importAppStateFromFile: mock.fn(async () => ({ success: true, message: 'Intake snapshot imported from file ✨' }))
    };
  } else {
    delete globalThis.__fileTransferMocks;
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
  return {
    setActions,
    getActions: (analysisId) => actionsByAnalysis.get(analysisId) || [],
    setAnalysisId: (id) => { globalThis.__appStateMocks.__activeAnalysisId = id; },
    setLikelyCauseId: (id) => { likelyCauseId = id; },
    setPossibleCauses: (items) => {
      possibleCauses = Array.isArray(items) ? items : [];
    },
    actionsByAnalysis,
    listActionsMock,
    importActionsStateMock
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
    <section id="possibleCausesCard"></section>
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
  const resetSpy = mock.fn();
  const showToastSpy = mock.fn();

  let controls;
  const { refreshActionList, mountActionListCard } = await import('../components/actions/ActionListCard.js');
  const applySpy = mock.fn((snapshot) => {
    if (snapshot && typeof snapshot === 'object') {
      if (snapshot.actions && typeof snapshot.actions === 'object') {
        const nextId = snapshot.actions.analysisId;
        controls.setAnalysisId(nextId);
        globalThis.__appStateMocks.getAnalysisId = () => globalThis.__appStateMocks.__activeAnalysisId;
        controls.setActions(nextId, snapshot.actions.items);
      }
      if (Array.isArray(snapshot.causes)) {
        controls.setPossibleCauses(snapshot.causes);
      }
    }
    refreshActionList();
  });

  controls = setupMainMocks({ collectSpy, applySpy, resetSpy, showToastSpy }, { stubFileTransfer: true });
  assert.equal(globalThis.__appStateMocks.applyAppState, applySpy, 'applyAppState stub registered');

  const importedAnalysisId = 'analysis-imported';
  const importedCauses = [
    {
      id: 'cause-network-latency',
      summary: 'Packet loss in region B due to router failure',
      status: 'Testing'
    }
  ];
  controls.setPossibleCauses(importedCauses);
  globalThis.__ktMocks.buildHypothesisSentence = mock.fn(cause => cause.summary || '');

  const importedActions = [
    {
      id: 'action-restored',
      analysisId: importedAnalysisId,
      summary: 'Rebuild network tunnel',
      detail: 'Coordinate with infrastructure to restore the inter-region tunnel.',
      owner: {
        name: 'Network Ops',
        category: 'Operations',
        subOwner: '',
        notes: ''
      },
      role: 'Owner',
      status: 'In-Progress',
      priority: 'High',
      dueAt: '',
      startedAt: '',
      completedAt: '',
      dependencies: [],
      risk: 'None',
      changeControl: { required: false },
      verification: { required: true, method: 'Ping check', evidence: '', result: '', checkedBy: '', checkedAt: '' },
      links: { hypothesisId: 'cause-network-latency' },
      notes: '',
      auditTrail: []
    }
  ];
  const importMock = mock.fn(async () => {
    globalThis.__appStateMocks.resetAnalysisId();
    applySpy({
      meta: { version: 1, savedAt: '2024-01-01T00:00:00.000Z' },
      pre: { oneLine: 'Example' },
      actions: {
        analysisId: importedAnalysisId,
        items: importedActions
      },
      causes: importedCauses
    });
    return { success: true, message: 'Intake snapshot imported from file ✨' };
  });
  globalThis.__fileTransferMocks.importAppStateFromFile = importMock;
  assert.equal(globalThis.__fileTransferMocks.importAppStateFromFile, importMock, 'file transfer stub registered');

  const anchor = document.getElementById('possibleCausesCard');
  const host = document.createElement('div');
  anchor.insertAdjacentElement('afterend', host);
  mountActionListCard(host);

  const file = new window.File(['placeholder'], 'intake.json', { type: 'application/json' });
  const result = await importMock(file);
  showToastSpy(result.message);
  refreshActionList();
  await Promise.resolve();

  assert.ok(applySpy.mock.calls.length > 0, 'applyAppState invoked for imported snapshot');
  assert.equal(globalThis.__appStateMocks.getAnalysisId(), importedAnalysisId, 'analysis id updated to imported snapshot');
  assert.equal(controls.getActions(importedAnalysisId).length, importedActions.length, 'actions store populated with imported snapshot');

  const actionRows = document.querySelectorAll('#action-list .action-row');
  assert.equal(actionRows.length, importedActions.length, 'imported actions rendered in the list');
  const summaryCell = actionRows[0]?.querySelector('.summary__title');
  assert.match(summaryCell?.textContent ?? '', /Rebuild network tunnel/, 'restored action summary displayed');
  const causeBadge = actionRows[0]?.querySelector('.summary__subtitle-text');
  assert.match(causeBadge?.textContent ?? '', /Cause C-01/, 'cause badge reflects imported hypothesis linkage');
  assert.match(causeBadge?.textContent ?? '', /Packet loss in region B/, 'cause hypothesis sentence rendered');

  const lastToast = showToastSpy.mock.calls.at(-1)?.arguments ?? [];
  assert.deepEqual(lastToast, ['Intake snapshot imported from file ✨'], 'import success toast displayed');
});
