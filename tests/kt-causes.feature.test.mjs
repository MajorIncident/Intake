/**
 * KT possible causes integration tests.
 *
 * Validates that cause testing UI renders expected evidence previews,
 * action badges, and toast/save callbacks when users manipulate
 * Likely Cause state.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

const BASE_HTML = `
<!doctype html>
<html>
  <body>
    <div class="wrap">
      <div id="possibleCausesCard">
        <div id="causeList" class="cause-list"></div>
        <button id="addCauseBtn" type="button">Add Possible Cause</button>
      </div>
    </div>
    <div id="summaryCard"></div>
    <table>
      <tbody id="tbody"></tbody>
    </table>
  </body>
</html>
`;

let dom = null;
let previousGlobals = {};
let importCounter = 0;

before(async () => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    KeyboardEvent: globalThis.KeyboardEvent,
    MouseEvent: globalThis.MouseEvent,
    confirm: globalThis.confirm,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    localStorage: globalThis.localStorage,
    actionsStoreMocks: globalThis.__actionsStoreMocks,
    appStateMocks: globalThis.__appStateMocks
  };

  dom = new JSDOM(BASE_HTML, { url: 'http://localhost/' });
  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;

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

  const confirmStub = () => true;
  window.confirm = confirmStub;
  globalThis.confirm = confirmStub;

  globalThis.__actionsStoreMocks = {
    listActions: () => [],
    createAction: () => { throw new Error('not implemented'); },
    patchAction: () => { throw new Error('not implemented'); },
    removeAction: () => { throw new Error('not implemented'); },
    sortActions: () => [],
    exportActionsState: () => [],
    importActionsState: () => []
  };
  globalThis.__appStateMocks = {
    getAnalysisId: () => 'analysis-test',
    getLikelyCauseId: () => null
  };
});

async function loadKtModule() {
  importCounter += 1;
  return import(`../src/kt.js?scenario=${importCounter}`);
}

beforeEach(() => {
  const { document } = dom.window;
  const causeList = document.getElementById('causeList');
  causeList.replaceChildren();
  const tbody = document.getElementById('tbody');
  tbody.replaceChildren();

  if (globalThis.__actionsStoreMocks) {
    globalThis.__actionsStoreMocks.listActions = () => [];
  }
  if (globalThis.__appStateMocks) {
    globalThis.__appStateMocks.getAnalysisId = () => 'analysis-test';
    globalThis.__appStateMocks.getLikelyCauseId = () => null;
  }
});

afterEach(() => {
  mock.restoreAll();
  mock.reset();
});

after(() => {
  if (dom) {
    dom.window.close();
    dom = null;
  }

  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.CustomEvent = previousGlobals.CustomEvent;
  globalThis.Event = previousGlobals.Event;
  globalThis.KeyboardEvent = previousGlobals.KeyboardEvent;
  globalThis.MouseEvent = previousGlobals.MouseEvent;
  globalThis.confirm = previousGlobals.confirm;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.localStorage = previousGlobals.localStorage;
  if (previousGlobals.actionsStoreMocks) {
    globalThis.__actionsStoreMocks = previousGlobals.actionsStoreMocks;
  } else {
    delete globalThis.__actionsStoreMocks;
  }
  if (previousGlobals.appStateMocks) {
    globalThis.__appStateMocks = previousGlobals.appStateMocks;
  } else {
    delete globalThis.__appStateMocks;
  }
  previousGlobals = {};
});

test('kt causes: refreshes action badges from mocked counts', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const actions = [
    { id: 'action-1', links: { hypothesisId: 'cause-a' } },
    { id: 'action-2', links: { hypothesisId: 'cause-a' } },
    { id: 'action-3', links: { hypothesisId: 'cause-a' } }
  ];
  const listActionsMock = mock.fn(() => actions.map(action => ({ ...action })));
  globalThis.__actionsStoreMocks.listActions = listActionsMock;

  const saveSpy = mock.fn();
  const toastSpy = mock.fn();
  ktModule.configureKT({ autoResize: () => {}, onSave: saveSpy, showToast: toastSpy });

  ktModule.setPossibleCauses([
    { id: 'cause-a', suspect: 'Caching layer', accusation: '', impact: '', findings: {} },
    { id: 'cause-b', suspect: 'Queue backlog', accusation: '', impact: '', findings: {} }
  ]);
  ktModule.renderCauses();

  const badges = [...document.querySelectorAll('[data-role="action-count"]')];
  assert.equal(badges.length, 2, 'renders an action badge for each cause');

  const [firstBadge, secondBadge] = badges;
  assert.equal(firstBadge.textContent, '3 actions assigned');
  assert.equal(firstBadge.dataset.count, '3');
  assert.equal(firstBadge.getAttribute('aria-label'), '3 actions assigned');
  assert.equal(secondBadge.textContent, 'No actions yet');
  assert.equal(secondBadge.dataset.count, '0');

  assert.ok(listActionsMock.mock.calls.length >= 1, 'cause action counts are refreshed via the mocked builder');
  assert.equal(listActionsMock.mock.calls[0].arguments[0], 'analysis-test');
});

test('kt causes: updates evidence previews and emits toast/save callbacks', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const saveSpy = mock.fn();
  const toastSpy = mock.fn();
  ktModule.configureKT({ autoResize: () => {}, onSave: saveSpy, showToast: toastSpy });

  const cause = { id: 'cause-a', suspect: 'Alpha subsystem', findings: {} };
  ktModule.setPossibleCauses([cause]);

  const isTextarea = document.createElement('textarea');
  const notTextarea = document.createElement('textarea');
  isTextarea.value = 'Alpha detail';
  notTextarea.value = 'Beta detail';
  rows.push({
    tr: { hidden: false },
    th: { textContent: 'Where is it failing?' },
    def: { q: 'Where is {OBJECT} misbehaving?' },
    isTA: isTextarea,
    notTA: notTextarea
  });

  const causeList = document.getElementById('causeList');
  const rowEl = document.createElement('section');
  rowEl.className = 'cause-eval-row';
  rowEl.dataset.rowIndex = '0';

  const questionEl = document.createElement('div');
  questionEl.dataset.role = 'question';

  const evidenceWrap = document.createElement('div');
  const isValue = document.createElement('div');
  isValue.dataset.role = 'is-value';
  const notValue = document.createElement('div');
  notValue.dataset.role = 'not-value';
  evidenceWrap.append(isValue, notValue);

  const inputsWrap = document.createElement('div');
  const noteField = document.createElement('div');
  const noteLabel = document.createElement('label');
  noteLabel.dataset.role = 'note-label';
  noteLabel.dataset.template = 'Explain <is> vs <is not>';
  const noteInput = document.createElement('textarea');
  noteInput.dataset.role = 'finding-note';
  noteInput.dataset.placeholderTemplate = 'Notes about <is>';
  noteField.append(noteLabel, noteInput);
  inputsWrap.append(noteField);

  rowEl.append(questionEl, evidenceWrap, inputsWrap);
  causeList.append(rowEl);

  ktModule.updateCauseEvidencePreviews();

  assert.equal(questionEl.textContent, 'Where is it failing?');
  assert.equal(isValue.textContent, '• Alpha detail');
  assert.equal(notValue.textContent, '• Beta detail');
  assert.equal(noteLabel.textContent, 'Explain Alpha detail vs Beta detail');
  assert.equal(noteInput.placeholder, 'Notes about Alpha detail');

  isTextarea.value = 'Alpha detail\nDelta factor';
  notTextarea.value = '';
  ktModule.updateCauseEvidencePreviews();

  assert.equal(isValue.textContent, '• Alpha detail\n• Delta factor');
  assert.equal(notValue.textContent, '—');
  assert.equal(noteLabel.textContent, 'Explain Alpha detail\nDelta factor vs IS NOT column');
  assert.equal(noteInput.placeholder, 'Notes about Alpha detail\nDelta factor');

  ktModule.setLikelyCauseId('cause-a', { skipRender: true });
  assert.equal(saveSpy.mock.calls.length, 1, 'setLikelyCauseId triggers the save callback');
  assert.equal(toastSpy.mock.calls.length, 1, 'setLikelyCauseId emits a toast message');
  assert.equal(toastSpy.mock.calls[0].arguments[0], 'Likely Cause set to: Alpha subsystem.');
});
