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
    globalThis.__actionsStoreMocks.createAction = () => { throw new Error('not implemented'); };
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
    {
      id: 'cause-a',
      suspect: 'Caching layer',
      accusation: '',
      impact: '',
      decision: '',
      explanation_is: '',
      explanation_is_not: '',
      assumptions: '',
      next_test: { text: '', owner: '', eta: '' }
    },
    {
      id: 'cause-b',
      suspect: 'Queue backlog',
      accusation: '',
      impact: '',
      decision: '',
      explanation_is: '',
      explanation_is_not: '',
      assumptions: '',
      next_test: { text: '', owner: '', eta: '' }
    }
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

test('kt causes: decision flow updates evidence, preview, and action conversion', async () => {
  const ktModule = await loadKtModule();
  const rows = ktModule.getRowsBuilt();
  rows.length = 0;

  const saveSpy = mock.fn();
  const toastSpy = mock.fn();
  const createActionMock = mock.fn(() => ({ id: 'action-42' }));
  globalThis.__actionsStoreMocks.createAction = createActionMock;

  ktModule.configureKT({ autoResize: () => {}, onSave: saveSpy, showToast: toastSpy });

  const cause = {
    id: 'cause-a',
    suspect: 'Alpha subsystem',
    accusation: 'Queues the wrong shard',
    impact: 'Customers see long waits',
    decision: '',
    explanation_is: '',
    explanation_is_not: '',
    assumptions: '',
    next_test: { text: '', owner: '', eta: '' },
    testingOpen: true
  };
  ktModule.setPossibleCauses([cause]);
  ktModule.ensurePossibleCausesUI();
  ktModule.renderCauses();

  const { document: doc } = dom.window;
  const card = doc.querySelector('.cause-card');
  assert.ok(card, `Cause card should render for testing flow. DOM: ${doc.body.innerHTML}`);
  const evidenceContent = card.querySelector('.cause-test__evidence-content');
  const preview = card.querySelector('.cause-test__preview');
  const [explainsBtn, conditionalBtn, failBtn] = card.querySelectorAll('.cause-test__segment');
  void failBtn; // not used in this flow but ensures destructuring remains stable.

  const isTextarea = document.createElement('textarea');
  const notTextarea = document.createElement('textarea');
  isTextarea.value = 'Alpha detail';
  notTextarea.value = 'Beta detail';
  rows.push({
    tr: { hidden: false },
    th: { textContent: 'WHERE — Where is the failure?' },
    def: { q: 'WHERE — Where is {OBJECT} misbehaving?' },
    isTA: isTextarea,
    notTA: notTextarea
  });

  ktModule.updateCauseEvidencePreviews();

  const sections = evidenceContent.querySelectorAll('section');
  assert.equal(sections.length, 2, 'renders IS and IS NOT sections');
  const isItems = sections[0].querySelectorAll('li');
  assert.equal(isItems.length, 1, 'shows each IS evidence line');
  assert.ok(isItems[0].textContent.includes('Alpha detail'));
  const notItems = sections[1].querySelectorAll('li');
  assert.equal(notItems.length, 1, 'shows each IS NOT evidence line');
  assert.ok(notItems[0].textContent.includes('Beta detail'));

  explainsBtn.click();
  const groups = card.querySelectorAll('.cause-test__group');
  const explainsGroup = groups[0];
  const conditionalGroup = groups[1];
  const failGroup = groups[2];
  assert.equal(explainsGroup.hidden, false, 'explains group visible when explains selected');
  assert.equal(conditionalGroup.hidden, true, 'conditional group hidden when explains selected');
  assert.equal(failGroup.hidden, true, 'fail group hidden when explains selected');

  const explainTextareas = explainsGroup.querySelectorAll('textarea');
  const explainIsField = explainTextareas[0];
  const explainNotField = explainTextareas[1];
  assert.ok(explainIsField && explainNotField, 'Explains prompts render textareas');
  explainIsField.value = 'It introduces latency.';
  explainIsField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  explainNotField.value = 'Because unaffected paths use cached data.';
  explainNotField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.ok(preview.textContent.includes('This cause explains the pattern because It introduces latency.'), 'preview reflects IS reasoning');
  assert.ok(preview.textContent.includes('unaffected cases because Because unaffected paths use cached data.'), 'preview reflects IS NOT reasoning');

  conditionalBtn.click();
  assert.equal(explainsGroup.hidden, true, 'explains group hidden after selecting conditional');
  assert.equal(conditionalGroup.hidden, false, 'conditional prompts visible');

  const conditionalTextareas = conditionalGroup.querySelectorAll('textarea');
  const assumptionField = conditionalTextareas[0];
  const testField = conditionalTextareas[1];
  assert.ok(assumptionField && testField, 'Conditional prompts render textareas');
  assert.equal(conditionalTextareas.length, 2, `Expected two conditional textareas, found ${conditionalTextareas.length}`);
  const ownerBtn = card.querySelector('.cause-test__owner');
  const etaBtn = card.querySelector('.cause-test__eta');
  const convertBtn = card.querySelector('.cause-test__convert');

  assumptionField.value = 'Only shard A routes through the proxy.';
  assumptionField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  testField.value = 'Inspect routing tables for shard A.';
  testField.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(convertBtn.hidden, true, 'convert button hidden until owner and ETA captured');

  assert.equal(cause.assumptions, 'Only shard A routes through the proxy.', 'assumptions persisted to cause state');
  assert.equal(cause.next_test.text, 'Inspect routing tables for shard A.', 'test summary persisted to cause state');

  ownerBtn.click();
  const ownerOverlay = doc.querySelector('.owner-picker-overlay[data-role="cause-test-owner"]');
  const ownerInput = ownerOverlay.querySelector('input[name="ownerName"]');
  ownerInput.value = 'Jordan Lee';
  ownerOverlay.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  assert.equal(ownerBtn.textContent, 'Jordan Lee');
  assert.equal(cause.next_test.owner, 'Jordan Lee', 'owner persisted to cause state');
  assert.equal(convertBtn.hidden, true, 'convert still hidden until ETA captured');

  etaBtn.click();
  const etaOverlay = doc.querySelector('.eta-picker-overlay[data-role="cause-test-eta"]');
  const etaInput = etaOverlay.querySelector('input[type="datetime-local"]');
  etaInput.value = '2024-05-01T12:30';
  etaOverlay.querySelector('[data-action="save"]').click();

  assert.equal(etaBtn.dataset.empty, '0');
  assert.ok(cause.next_test.eta.endsWith('Z'), 'eta stored as ISO string');
  assert.equal(convertBtn.hidden, false, 'convert button appears once test, owner, and ETA are set');

  convertBtn.click();

  assert.equal(createActionMock.mock.calls.length, 1, 'convert to action delegates to action store');
  const payload = createActionMock.mock.calls[0].arguments[1];
  assert.equal(payload.summary, 'Inspect routing tables for shard A.');
  assert.equal(payload.owner.name, 'Jordan Lee');
  assert.ok(payload.detail.includes('Hypothesis:'));
  assert.ok(payload.detail.includes('Explains only if.'));
  assert.equal(toastSpy.mock.calls.at(-1).arguments[0], 'Test converted into an action item.');
  assert.ok(saveSpy.mock.calls.length >= 3, 'decision edits trigger autosave');
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
    'We suspect Primer lot 7C because Changed to 160°F. This could lead to Uneven coverage and fisheyes.'
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
    'We suspect Primer lot 7C because Changed to 160°F. This could lead to Uneven coverage and fisheyes.'
  );
  assert.equal(cause.suspect, 'Primer lot 7C');
  assert.equal(cause.accusation, 'Changed to 160°F');
  assert.equal(cause.impact, 'Uneven coverage and fisheyes');
});
