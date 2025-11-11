/**
 * Action list feature integration tests.
 *
 * Exercises the ActionListCard component against a mocked store to
 * ensure user interactions drive the expected persistence calls and
 * DOM updates.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

const ANALYSIS_ID = 'analysis-test';
const AUTO_SORT_DELAY = 3000;

let dom = null;
let previousGlobals = {};

function makeAction(overrides = {}) {
  return {
    id: overrides.id || `action-${Math.random().toString(16).slice(2)}`,
    analysisId: ANALYSIS_ID,
    createdAt: overrides.createdAt || '2024-01-01T00:00:00.000Z',
    createdBy: overrides.createdBy || 'tester',
    summary: overrides.summary || 'Placeholder summary',
    detail: overrides.detail || '',
    owner: {
      name: '',
      category: '',
      subOwner: '',
      notes: '',
      lastAssignedBy: '',
      lastAssignedAt: '',
      source: 'Manual',
      ...(overrides.owner || {})
    },
    role: overrides.role || '',
    status: overrides.status || 'Planned',
    priority: overrides.priority || 'Med',
    dueAt: overrides.dueAt || '',
    startedAt: overrides.startedAt || '',
    completedAt: overrides.completedAt || '',
    dependencies: overrides.dependencies || [],
    risk: overrides.risk || 'None',
    changeControl: { required: false, ...(overrides.changeControl || {}) },
    verification: {
      required: false,
      result: '',
      method: '',
      checkedBy: '',
      checkedAt: '',
      evidence: '',
      ...(overrides.verification || {})
    },
    links: overrides.links || {},
    notes: overrides.notes || '',
    auditTrail: overrides.auditTrail || []
  };
}

beforeEach(() => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
    HTMLElement: globalThis.HTMLElement,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    confirm: globalThis.confirm,
    hadCrypto: typeof globalThis.crypto !== 'undefined'
  };

  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
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

  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto === 'object') {
    mock.method(globalCrypto, 'randomUUID', () => 'mocked-uuid');
  } else {
    globalThis.crypto = { randomUUID: () => 'mocked-uuid' };
  }

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

  const confirmStub = () => true;
  window.confirm = confirmStub;
  globalThis.confirm = confirmStub;

  if (window.HTMLElement && window.HTMLElement.prototype) {
    if (!window.HTMLElement.prototype.focus) {
      window.HTMLElement.prototype.focus = () => {};
    }
  }
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
  globalThis.CustomEvent = previousGlobals.CustomEvent;
  globalThis.Event = previousGlobals.Event;
  globalThis.KeyboardEvent = previousGlobals.KeyboardEvent;
  globalThis.MouseEvent = previousGlobals.MouseEvent;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.localStorage = previousGlobals.localStorage;
  if (!previousGlobals.hadCrypto) {
    try {
      delete globalThis.crypto;
    } catch {
      globalThis.crypto = undefined;
    }
  }
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.confirm = previousGlobals.confirm;

  previousGlobals = {};
});

test('actions: integrates with the store when users interact with the list', async (t) => {
  const STATUS_ORDER = new Map([
    ['Blocked', 0],
    ['In-Progress', 1],
    ['Planned', 2],
    ['Deferred', 3],
    ['Done', 4],
    ['Cancelled', 5]
  ]);
  const PRIORITY_ORDER = new Map([
    ['Blocked', 0],
    ['High', 1],
    ['Med', 2],
    ['Low', 3],
    ['Deferred', 4],
    ['Cancelled', 5]
  ]);

  const getStatusRank = (status) => STATUS_ORDER.get(status) ?? Number.POSITIVE_INFINITY;
  const getPriorityRank = (priority) => PRIORITY_ORDER.get(priority) ?? Number.POSITIVE_INFINITY;
  const getDueTime = (dueAt) => {
    if (!dueAt) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(dueAt);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };
  const sortSnapshot = (list) => [...list].sort((a, b) => {
    const statusDiff = getStatusRank(a.status) - getStatusRank(b.status);
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const etaDiff = getDueTime(a.dueAt) - getDueTime(b.dueAt);
    if (etaDiff !== 0) return etaDiff;

    const aCreated = a.createdAt || '';
    const bCreated = b.createdAt || '';
    if (aCreated === bCreated) return 0;
    return aCreated < bCreated ? -1 : 1;
  });

  let actions = [
    makeAction({ id: 'action-z', summary: 'Zeta patch routers', priority: 'Low', createdAt: '2024-01-01T01:00:00.000Z' }),
    makeAction({ id: 'action-b', summary: 'Beta calibrate sensors', priority: 'Med', createdAt: '2024-01-01T00:00:00.000Z' })
  ];
  let creationCounter = 0;

  const actionsStoreMocks = {
    listActions: mock.fn(() => actions.map(action => ({ ...action }))),
    createAction: mock.fn((analysisId, patch) => {
      creationCounter += 1;
      const createdAt = new Date(Date.parse('2024-01-01T02:00:00.000Z') + creationCounter * 60000).toISOString();
      const newItem = makeAction({
        id: 'action-created',
        summary: patch.summary,
        links: patch.links,
        priority: patch.priority || 'Med',
        createdAt
      });
      actions = [newItem, ...actions];
      return newItem;
    }),
    patchAction: mock.fn((analysisId, id, delta) => {
      actions = actions.map(action => (
        action.id === id
          ? { ...action, ...delta }
          : action
      ));
      return actions.find(action => action.id === id) || null;
    }),
    removeAction: mock.fn((analysisId, id) => {
      actions = actions.filter(action => action.id !== id);
      return true;
    }),
    sortActions: mock.fn(() => {
      actions = sortSnapshot(actions);
      return actions;
    }),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => [])
  };
  globalThis.__actionsStoreMocks = actionsStoreMocks;

  const appStateMocks = {
    getAnalysisId: () => ANALYSIS_ID,
    getLikelyCauseId: () => 'cause-mocked'
  };
  globalThis.__appStateMocks = appStateMocks;

  const ktMocks = {
    getPossibleCauses: () => [],
    causeHasFailure: () => false,
    buildHypothesisSentence: () => ''
  };
  globalThis.__ktMocks = ktMocks;

  const toastMocks = {
    showToast: () => {}
  };
  globalThis.__toastMocks = toastMocks;

  mock.timers.enable({ apis: ['setTimeout'] });

  t.after(() => {
    delete globalThis.__actionsStoreMocks;
    delete globalThis.__appStateMocks;
    delete globalThis.__ktMocks;
    delete globalThis.__toastMocks;
    mock.timers.reset();
  });

  const { mountActionListCard, refreshActionList } = await import('../components/actions/ActionListCard.js');

  const host = document.createElement('div');
  document.body.append(host);

  const updates = [];
  window.addEventListener('intake:actions-updated', (event) => {
    updates.push(event.detail);
  });

  mountActionListCard(host);

  assert.equal(updates.at(-1)?.total, actions.length, 'initial render emits total count');

  const input = host.querySelector('#action-new');
  const addBtn = host.querySelector('#action-add');
  assert.ok(input && addBtn, 'quick add controls render');

  const focusSpy = mock.fn();
  input.focus = focusSpy;

  input.value = 'Alpha build recovery';
  addBtn.click();

  assert.equal(actionsStoreMocks.createAction.mock.calls.length, 1, 'createAction called once');
  const createArgs = actionsStoreMocks.createAction.mock.calls[0].arguments;
  assert.equal(createArgs[0], ANALYSIS_ID);
  assert.deepEqual(createArgs[1].links, { hypothesisId: 'cause-mocked' });
  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 0, 'auto sort defers after quick add');
  assert.equal(focusSpy.mock.calls.length, 1, 'quick add refocuses the input');
  assert.equal(input.value, '', 'quick add input clears after creation');

  let rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'render reflects newly created action');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'render reflects current store order before auto sort');

  mock.timers.tick(AUTO_SORT_DELAY);

  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 1, 'sortActions invoked after quick add delay');

  rows = host.querySelectorAll('.action-row');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'render reflects sorted order after delayed refresh');

  const reprioritizeRow = host.querySelector('.action-row[data-id="action-z"]');
  assert.ok(reprioritizeRow, 'target row exists before reprioritization');
  reprioritizeRow.focus();
  reprioritizeRow.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', bubbles: true }));

  assert.equal(actionsStoreMocks.patchAction.mock.calls.length, 1, 'patchAction invoked for reprioritization');
  let patchArgs = actionsStoreMocks.patchAction.mock.calls[0].arguments;
  assert.equal(patchArgs[0], ANALYSIS_ID);
  assert.equal(patchArgs[1], 'action-z');
  assert.deepEqual(patchArgs[2], { priority: 'High' });
  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 1, 'auto sort defers after reprioritization');

  rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'list re-renders after reprioritizing');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'current order rendered before delayed sort');

  mock.timers.tick(AUTO_SORT_DELAY);

  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 2, 'sortActions invoked after reprioritization delay');

  rows = host.querySelectorAll('.action-row');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'sorted order refreshed after reprioritizing');

  const createdRow = host.querySelector('.action-row[data-id="action-created"]');
  assert.ok(createdRow, 'new action row rendered');
  createdRow.focus();
  createdRow.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  assert.equal(actionsStoreMocks.patchAction.mock.calls.length, 2, 'patchAction invoked for status shortcut');
  patchArgs = actionsStoreMocks.patchAction.mock.calls.at(-1).arguments;
  assert.equal(patchArgs[0], ANALYSIS_ID);
  assert.equal(patchArgs[1], 'action-created');
  assert.deepEqual(patchArgs[2], { status: 'In-Progress' });
  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 2, 'auto sort defers after status change');

  rows = host.querySelectorAll('.action-row');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'current order rendered before status sort');

  mock.timers.tick(AUTO_SORT_DELAY);

  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 3, 'sortActions invoked after status change delay');

  rows = host.querySelectorAll('.action-row');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'sorted order refreshed after status change');

  const rowToDelete = host.querySelector('.action-row[data-id="action-z"]');
  assert.ok(rowToDelete, 'target row exists before deletion');
  const moreBtn = rowToDelete.querySelector('.more');
  assert.ok(moreBtn, 'more menu button renders');
  moreBtn.click();

  const deleteBtn = document.querySelector('[data-action="delete"]');
  assert.ok(deleteBtn, 'delete option becomes available');
  deleteBtn.click();

  assert.equal(actionsStoreMocks.removeAction.mock.calls.length, 1, 'removeAction invoked once');
  assert.equal(actionsStoreMocks.removeAction.mock.calls[0].arguments[1], 'action-z');

  rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'list re-renders after deletion');
  assert.ok(!host.querySelector('.action-row[data-id="action-z"]'), 'deleted row removed from DOM');

  const refreshBtn = host.querySelector('#action-refresh');
  assert.ok(refreshBtn, 'refresh control renders');
  refreshBtn.click();

  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 4, 'sortActions invoked via refresh button');
  rows = host.querySelectorAll('.action-row');
  assert.deepEqual(Array.from(rows).map(row => row.dataset.id), actions.map(action => action.id), 'sorted order rendered');

  actions = [...actions, makeAction({ id: 'action-omega', summary: 'Omega finalize rollout' })];
  refreshActionList();

  rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'refreshActionList re-renders current store state');
  assert.match(rows[rows.length - 1].textContent, /Omega finalize rollout/, 'new store item appears after refresh');
  assert.equal(updates.at(-1)?.total, actions.length, 'refresh dispatch emits the latest count');
});

test('appState: applyAppState adopts imported action snapshots and updates the card UI', async (t) => {
  const importedAnalysisId = 'analysis-imported';
  const importedItems = [
    {
      id: 'action-imported-1',
      analysisId: importedAnalysisId,
      summary: 'Restore snapshot service',
      detail: '',
      owner: {
        name: 'Ops Rotation',
        category: 'Operations',
        subOwner: '',
        notes: '',
        lastAssignedBy: '',
        lastAssignedAt: '',
        source: 'Manual'
      },
      role: 'Owner',
      status: 'Planned',
      priority: 'High',
      dueAt: '',
      startedAt: '',
      completedAt: '',
      dependencies: [],
      risk: 'None',
      changeControl: { required: false },
      verification: { required: false },
      links: { hypothesisId: '' },
      notes: '',
      auditTrail: []
    }
  ];

  const storeState = new Map();
  const actionsStoreMocks = {
    listActions: mock.fn((analysisId) => {
      const stored = storeState.get(analysisId) ?? [];
      return stored.map(item => ({
        ...item,
        owner: { ...(item.owner || {}) },
        links: { ...(item.links || {}) },
        changeControl: { ...(item.changeControl || {}) },
        verification: { ...(item.verification || {}) }
      }));
    }),
    createAction: mock.fn(() => null),
    patchAction: mock.fn(() => null),
    removeAction: mock.fn(() => true),
    sortActions: mock.fn((analysisId) => {
      const stored = storeState.get(analysisId) ?? [];
      const cloned = stored.map(item => ({ ...item }));
      storeState.set(analysisId, cloned);
      return cloned;
    }),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn((analysisId, items) => {
      const cloned = Array.isArray(items)
        ? items.map(item => ({
          ...item,
          owner: { ...(item.owner || {}) },
          links: { ...(item.links || {}) },
          changeControl: { ...(item.changeControl || {}) },
          verification: { ...(item.verification || {}) }
        }))
        : [];
      storeState.set(analysisId, cloned);
      return cloned;
    })
  };

  const previousActionsMocks = globalThis.__actionsStoreMocks;
  globalThis.__actionsStoreMocks = actionsStoreMocks;

  t.after(() => {
    if (previousActionsMocks) {
      globalThis.__actionsStoreMocks = previousActionsMocks;
    } else {
      delete globalThis.__actionsStoreMocks;
    }
  });

  const previousKtMocks = globalThis.__ktMocks;
  globalThis.__ktMocks = {
    ...previousKtMocks,
    getPossibleCauses: () => previousKtMocks?.getPossibleCauses?.() ?? [],
    causeHasFailure: () => previousKtMocks?.causeHasFailure?.() ?? false,
    buildHypothesisSentence: () => previousKtMocks?.buildHypothesisSentence?.() ?? '',
    getObjectISField: () => previousKtMocks?.getObjectISField?.() ?? null,
    getDeviationISField: () => previousKtMocks?.getDeviationISField?.() ?? null,
    isObjectISDirty: () => previousKtMocks?.isObjectISDirty?.() ?? false,
    isDeviationISDirty: () => previousKtMocks?.isDeviationISDirty?.() ?? false,
    refreshAllTokenizedText: () => previousKtMocks?.refreshAllTokenizedText?.(),
    ensurePossibleCausesUI: () => previousKtMocks?.ensurePossibleCausesUI?.(),
    renderCauses: () => previousKtMocks?.renderCauses?.(),
    focusFirstEditableCause: () => previousKtMocks?.focusFirstEditableCause?.(),
    updateCauseEvidencePreviews: () => previousKtMocks?.updateCauseEvidencePreviews?.(),
    setPossibleCauses: (...args) => previousKtMocks?.setPossibleCauses?.(...args),
    exportKTTableState: (...args) => previousKtMocks?.exportKTTableState?.(...args) ?? [],
    importKTTableState: (...args) => previousKtMocks?.importKTTableState?.(...args) ?? [],
    getRowsBuilt: (...args) => previousKtMocks?.getRowsBuilt?.(...args) ?? [],
    causeStatusLabel: (...args) => previousKtMocks?.causeStatusLabel?.(...args) ?? '',
    getLikelyCauseId: (...args) => previousKtMocks?.getLikelyCauseId?.(...args) ?? null,
    setLikelyCauseId: (...args) => previousKtMocks?.setLikelyCauseId?.(...args),
    countCauseAssumptions: (...args) => previousKtMocks?.countCauseAssumptions?.(...args) ?? 0,
    evidencePairIndexes: (...args) => previousKtMocks?.evidencePairIndexes?.(...args) ?? [],
    countCompletedEvidence: (...args) => previousKtMocks?.countCompletedEvidence?.(...args) ?? 0,
    getRowKeyByIndex: (...args) => previousKtMocks?.getRowKeyByIndex?.(...args) ?? '',
    peekCauseFinding: (...args) => previousKtMocks?.peekCauseFinding?.(...args) ?? null,
    findingMode: (...args) => previousKtMocks?.findingMode?.(...args) ?? '',
    findingNote: (...args) => previousKtMocks?.findingNote?.(...args) ?? '',
    fillTokens: (...args) => previousKtMocks?.fillTokens?.(...args) ?? '',
    getTableElement: (...args) => previousKtMocks?.getTableElement?.(...args) ?? null,
    getTableFocusMode: (...args) => previousKtMocks?.getTableFocusMode?.(...args) ?? '',
    setTableFocusMode: (...args) => previousKtMocks?.setTableFocusMode?.(...args)
  };

  t.after(() => {
    if (previousKtMocks) {
      globalThis.__ktMocks = previousKtMocks;
    } else {
      delete globalThis.__ktMocks;
    }
  });

  const appStateModule = await import('../src/appState.js?actual');
  const previousAppStateMocks = globalThis.__appStateMocks;
  globalThis.__appStateMocks = {
    ...previousAppStateMocks,
    getAnalysisId: () => appStateModule.getAnalysisId(),
    getLikelyCauseId: () => previousAppStateMocks?.getLikelyCauseId?.() ?? 'cause-mocked'
  };

  t.after(() => {
    if (previousAppStateMocks) {
      globalThis.__appStateMocks = previousAppStateMocks;
    } else {
      delete globalThis.__appStateMocks;
    }
  });

  const payload = {
    actions: {
      analysisId: importedAnalysisId,
      items: importedItems
    }
  };

  assert.equal(localStorage.getItem('kt-analysis-id'), null, 'analysis storage key starts empty');

  appStateModule.applyAppState(payload);

  assert.equal(
    localStorage.getItem('kt-analysis-id'),
    importedAnalysisId,
    'applyAppState persists the imported analysis identifier'
  );
  assert.equal(appStateModule.getAnalysisId(), importedAnalysisId, 'getAnalysisId reflects the imported identifier');
  assert.equal(actionsStoreMocks.importActionsState.mock.calls.length, 1, 'actions snapshot imported once');
  const importCall = actionsStoreMocks.importActionsState.mock.calls[0].arguments;
  assert.equal(importCall[0], importedAnalysisId, 'actions import uses the adopted analysis id');
  assert.deepEqual(importCall[1], importedItems, 'imported actions payload passed through unchanged');

  const host = document.createElement('div');
  document.body.append(host);

  const { mountActionListCard } = await import('../components/actions/ActionListCard.js');
  mountActionListCard(host);

  const rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, importedItems.length, 'mounted list renders imported actions');
  assert.match(rows[0].textContent, /Restore snapshot service/, 'imported action summary is visible');

  host.remove();
});
