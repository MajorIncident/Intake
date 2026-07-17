/**
 * KT possible causes integration tests.
 *
 * Validates that cause testing UI renders compact verdict controls,
 * action badges, and toast/save callbacks when users manipulate
 * Likely Cause state.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';
import { CAUSE_TEST_METADATA, ROWS } from '../src/constants.js';

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

test('KT rows: define immutable cause-test metadata for every stable question ID', () => {
  const questionRows = ROWS.filter(row => row.id);

  assert.deepEqual(
    questionRows.map(row => row.id),
    Object.keys(CAUSE_TEST_METADATA),
    'metadata keys stay aligned with persisted question IDs'
  );
  questionRows.forEach(row => {
    assert.equal(row.causeTest, CAUSE_TEST_METADATA[row.id]);
    assert.match(row.causeTest.template, /\{cause\}.*\{problem\}.*\{is\}.*\{isNot\}/u);
    assert.equal(Object.isFrozen(row.causeTest), true);
  });
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

test('kt causes: renders compact verdict controls and preserves finding callbacks', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const saveSpy = mock.fn();
  const toastSpy = mock.fn();
  const resizeSpy = mock.fn();
  ktModule.configureKT({
    autoResize: resizeSpy,
    onSave: saveSpy,
    showToast: toastSpy,
    getObjectFull: () => 'payment service',
    getDeviationFull: () => 'timeouts'
  });

  const cause = { id: 'cause-a', suspect: 'Alpha subsystem', accusation: 'is failing health checks', findings: {}, testingOpen: true };
  ktModule.setPossibleCauses([cause]);

  const isTextarea = document.createElement('textarea');
  const notTextarea = document.createElement('textarea');
  isTextarea.value = 'Alpha detail';
  notTextarea.value = 'Beta detail';
  rows.push({
    tr: { hidden: false },
    th: { textContent: 'WHERE — Where is it failing?' },
    def: {
      id: 'fallback-row-id',
      q: 'Where is {OBJECT} misbehaving?',
      causeTest: CAUSE_TEST_METADATA['where-location']
    },
    questionId: 'where-location',
    isTA: isTextarea,
    notTA: notTextarea
  });

  ktModule.renderCauses();

  const rowEl = document.querySelector('.cause-eval-row');
  const questionEl = rowEl.querySelector('[data-role="question"]');
  const noteField = rowEl.querySelector('.cause-eval-note');
  const noteLabel = rowEl.querySelector('[data-role="note-label"]');
  const noteInput = rowEl.querySelector('[data-role="finding-note"]');
  const verdicts = rowEl.querySelectorAll('.cause-eval-option');
  const verdictInputs = rowEl.querySelectorAll('.cause-eval-option input[type="radio"]');
  const findingKey = ktModule.getRowKeyByIndex(0);
  assert.equal(findingKey, 'where-location', 'findings prefer the stable question ID over the row definition and prompt text');

  assert.equal(rowEl.querySelector('.cause-eval-dimension').textContent, 'WHERE');
  assert.equal(questionEl.textContent, 'If Alpha subsystem is failing health checks, why does the issue affecting payment service (timeouts) occur at Alpha detail but not at Beta detail?');
  assert.equal(verdicts.length, 3, 'each evidence pair gets exactly three verdict controls');
  assert.equal(rowEl.querySelector('.cause-eval-options').tagName, 'FIELDSET', 'verdict controls are an accessible choice group');
  assert.deepEqual(
    [...verdictInputs].map(input => [input.value, input.parentElement.textContent]),
    [
      ['yes', 'Explains Naturally'],
      ['assumption', 'Requires Assumptions'],
      ['fail', 'Does Not Explain']
    ],
    'verdicts retain the prescribed values, labels, and order'
  );
  assert.equal(new Set([...verdictInputs].map(input => input.name)).size, 1, 'verdict radios share one exclusive-choice group');
  assert.equal(noteField.hidden, true, 'reasoning is hidden until a verdict is selected');
  assert.equal(rowEl.querySelector('[data-role="is-value"]'), null, 'IS evidence cards are not rendered');
  assert.equal(rowEl.querySelector('[data-role="not-value"]'), null, 'IS NOT evidence cards are not rendered');

  verdictInputs[0].click();
  assert.equal(cause.findings[findingKey].mode, 'yes');
  assert.equal(noteField.hidden, false);
  assert.equal(
    noteInput.value,
    'This cause naturally explains the IS / IS NOT relationship because ',
    'the selected verdict supplies its reasoning starter'
  );
  assert.equal(cause.findings[findingKey].note, noteInput.value, 'the reasoning starter persists with the finding');
  assert.equal(ktModule.countCompletedEvidence(cause), 1, 'a verdict with non-empty starter reasoning completes a finding');
  assert.match(noteLabel.textContent, /Alpha detail/);
  assert.match(noteLabel.textContent, /Beta detail/);

  noteInput.value = 'It matches the observed region.';
  noteInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(cause.findings[findingKey].note, 'It matches the observed region.');
  assert.equal(ktModule.countCompletedEvidence(cause), 1, 'a finding is complete only after its note is supplied');

  verdictInputs[1].click();
  assert.equal(
    noteInput.value,
    'It matches the observed region.',
    'changing verdicts preserves user-modified reasoning'
  );

  noteInput.value = 'This explanation requires assuming that ';
  noteInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  verdictInputs[2].click();
  assert.equal(
    noteInput.value,
    'This cause does not explain the IS / IS NOT relationship because ',
    'changing a mode replaces only the prior mode starter'
  );
  assert.equal(cause.findings[findingKey].note, noteInput.value, 'the replacement starter persists with the finding');
  assert.ok(resizeSpy.mock.calls.length > 0, 'autosize runs for the conditional textarea');
  assert.ok(saveSpy.mock.calls.length >= 2, 'verdict and reasoning changes retain save callbacks');

  const savesBeforeLikelyCause = saveSpy.mock.calls.length;
  ktModule.setLikelyCauseId('cause-a', { skipRender: true });
  assert.equal(saveSpy.mock.calls.length, savesBeforeLikelyCause + 1, 'setLikelyCauseId triggers the save callback');
  assert.equal(toastSpy.mock.calls.length, 1, 'setLikelyCauseId emits a toast message');
  assert.equal(toastSpy.mock.calls[0].arguments[0], 'Likely Cause set to: Alpha subsystem.');
});

test('kt causes: renders standardized testing prompts for plural suspects', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const isTextarea = document.createElement('textarea');
  const notTextarea = document.createElement('textarea');
  isTextarea.value = 'Cache nodes at AZ-1';
  notTextarea.value = 'Cache nodes at AZ-2';
  rows.push({
    tr: { hidden: false },
    th: { textContent: 'When does it occur?' },
    def: {
      q: 'When does the {OBJECT} show the {DEVIATION}?',
      causeTest: CAUSE_TEST_METADATA['when-pattern']
    },
    isTA: isTextarea,
    notTA: notTextarea
  });

  ktModule.configureKT({
    getObjectFull: () => 'checkout API',
    getDeviationFull: () => 'latency spikes'
  });
  ktModule.setPossibleCauses([
    { id: 'cause-b', suspect: 'API nodes', accusation: 'were throttled overnight', findings: {}, testingOpen: true }
  ]);

  ktModule.renderCauses();

  const questionEl = document.querySelector('.cause-eval-row [data-role="question"]');
  assert.ok(questionEl, 'question prompt renders');
  assert.equal(questionEl.textContent, 'If API nodes were throttled overnight, why does the issue affecting checkout API (latency spikes) follow the pattern Cache nodes at AZ-1 but not Cache nodes at AZ-2?');
});

test('kt causes: uses one generic evidence-aware prompt when a row cannot use metadata', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const isTextarea = document.createElement('textarea');
  const notTextarea = document.createElement('textarea');
  isTextarea.value = 'cluster A';
  notTextarea.value = 'cluster B';
  rows.push({
    tr: { hidden: false },
    def: { q: 'Custom diagnostic question' },
    isTA: isTextarea,
    notTA: notTextarea
  });
  ktModule.configureKT({
    getObjectFull: () => '',
    getDeviationFull: () => ''
  });
  ktModule.setPossibleCauses([
    { id: 'cause-fallback', suspect: 'A cache rule', accusation: 'is misconfigured', findings: {}, testingOpen: true }
  ]);

  ktModule.renderCauses();

  const rowEl = document.querySelector('.cause-eval-row');
  assert.equal(
    rowEl.querySelector('[data-role="question"]').textContent,
    'If A cache rule is misconfigured, how does that explain the problem is cluster A but not cluster B?'
  );
  assert.equal(rowEl.querySelector('[data-role="is-value"]'), null);
  assert.equal(rowEl.querySelector('[data-role="not-value"]'), null);
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
