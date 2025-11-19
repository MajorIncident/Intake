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

import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

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
let jsdomSnapshot = null;
let importCounter = 0;

before(async () => {
  previousGlobals = {
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

  jsdomSnapshot = installJsdomGlobals(window);

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
  restoreJsdomGlobals(jsdomSnapshot);
  jsdomSnapshot = null;
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

test('kt causes: hypothesis editor normalizes inputs and stores summary metadata', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const saveSpy = mock.fn();
  ktModule.configureKT({ autoResize: () => {}, onSave: saveSpy, showToast: () => {} });

  const cause = {
    id: 'cause-h1',
    suspect: '',
    accusation: '',
    impact: '',
    findings: {},
    editing: true,
    summaryText: '',
    confidence: '',
    evidence: ''
  };
  ktModule.setPossibleCauses([cause]);
  ktModule.renderCauses();

  const { document } = dom.window;
  const previewBody = document.querySelector('.cause-hypothesis-form__preview-body');
  assert.equal(previewBody.textContent, 'Add suspect, accusation, and impact to craft a strong hypothesis.');

  const suspectArea = document.getElementById('cause-h1-suspect');
  suspectArea.value = 'Primer lot 7C. ';
  suspectArea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));

  const accusationArea = document.getElementById('cause-h1-accusation');
  accusationArea.value = 'Temperature 160°F';
  accusationArea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));

  const accusationHint = document.getElementById('cause-h1-accusation-hint');
  assert.equal(accusationHint.hidden, false);
  assert.match(accusationHint.textContent, /Try describing an action or condition/);

  accusationArea.value = 'Changed to 160°F.';
  accusationArea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(accusationHint.hidden, true);

  const impactArea = document.getElementById('cause-h1-impact');
  impactArea.value = '  Uneven coverage and fisheyes..  ';
  impactArea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 250));

  assert.equal(
    previewBody.textContent,
    'We suspect Primer lot 7C is changed to 160°F. This could lead to uneven coverage and fisheyes.'
  );

  const inspirationDetails = document.querySelector('.field-examples');
  assert.equal(inspirationDetails, null, 'Need inspiration helper removed');

  const metaToggle = document.querySelector('.hypothesis-meta-toggle');
  assert.equal(metaToggle, null, 'supporting details toggle removed');
  const confidenceOption = document.querySelector('.hypothesis-confidence__option');
  assert.equal(confidenceOption, null, 'confidence buttons removed');
  const evidenceArea = document.getElementById('cause-h1-evidence');
  assert.equal(evidenceArea, null, 'evidence textarea removed');
  assert.equal(cause.confidence, '', 'confidence remains unchanged when metadata inputs are absent');
  assert.equal(cause.evidence, '', 'evidence remains unchanged when metadata inputs are absent');

  const saveButton = document.querySelector('.cause-controls .btn-mini');
  const beforeSaveCalls = saveSpy.mock.calls.length;
  saveButton.click();
  assert.equal(saveSpy.mock.calls.length, beforeSaveCalls + 1, 'saving the hypothesis persists state');
  assert.equal(
    cause.summaryText,
    'We suspect Primer lot 7C is changed to 160°F. This could lead to uneven coverage and fisheyes.'
  );
  assert.equal(cause.suspect, 'Primer lot 7C');
  assert.equal(cause.accusation, 'Changed to 160°F');
  assert.equal(cause.impact, 'Uneven coverage and fisheyes');
});
