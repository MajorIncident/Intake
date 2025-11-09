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
    priority: overrides.priority || 'P2',
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
  let actions = [
    makeAction({ id: 'action-z', summary: 'Zeta patch routers', priority: 'P3' }),
    makeAction({ id: 'action-b', summary: 'Beta calibrate sensors', priority: 'P2' })
  ];

  const actionsStoreMocks = {
    listActions: mock.fn(() => actions.map(action => ({ ...action }))),
    createAction: mock.fn((analysisId, patch) => {
      const newItem = makeAction({
        id: 'action-created',
        summary: patch.summary,
        links: patch.links,
        priority: patch.priority || 'P2'
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
      actions = [...actions].sort((a, b) => b.summary.localeCompare(a.summary));
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

  t.after(() => {
    delete globalThis.__actionsStoreMocks;
    delete globalThis.__appStateMocks;
    delete globalThis.__ktMocks;
    delete globalThis.__toastMocks;
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

  input.value = 'Alpha build recovery';
  addBtn.click();

  assert.equal(actionsStoreMocks.createAction.mock.calls.length, 1, 'createAction called once');
  const createArgs = actionsStoreMocks.createAction.mock.calls[0].arguments;
  assert.equal(createArgs[0], ANALYSIS_ID);
  assert.deepEqual(createArgs[1].links, { hypothesisId: 'cause-mocked' });

  let rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'render reflects newly created action');
  assert.match(rows[0].textContent, /Alpha build recovery/, 'new action appears first');

  const firstRow = rows[0];
  firstRow.focus();
  firstRow.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  assert.ok(actionsStoreMocks.patchAction.mock.calls.length >= 1, 'patchAction invoked for keyboard shortcut');
  const lastPatch = actionsStoreMocks.patchAction.mock.calls.at(-1).arguments;
  assert.equal(lastPatch[0], ANALYSIS_ID);
  assert.equal(lastPatch[1], 'action-created');
  assert.deepEqual(lastPatch[2], { status: 'In-Progress' });

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

  assert.equal(actionsStoreMocks.sortActions.mock.calls.length, 1, 'sortActions invoked via refresh button');
  rows = host.querySelectorAll('.action-row');
  assert.match(rows[0].textContent, /Beta calibrate sensors/, 'sorted order rendered');

  actions = [...actions, makeAction({ id: 'action-omega', summary: 'Omega finalize rollout' })];
  refreshActionList();

  rows = host.querySelectorAll('.action-row');
  assert.equal(rows.length, actions.length, 'refreshActionList re-renders current store state');
  assert.match(rows[rows.length - 1].textContent, /Omega finalize rollout/, 'new store item appears after refresh');
  assert.equal(updates.at(-1)?.total, actions.length, 'refresh dispatch emits the latest count');
});
