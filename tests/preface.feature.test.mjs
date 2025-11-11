/**
 * Preface feature integration tests.
 *
 * Validates that the preface module wires DOM inputs to KT mirrors,
 * normalises legacy containment statuses, and refreshes dynamic titles
 * when users provide context.
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
    clearInterval: globalThis.clearInterval
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
  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.getComputedStyle = previousGlobals.getComputedStyle;
  globalThis.requestAnimationFrame = previousGlobals.requestAnimationFrame;
  globalThis.cancelAnimationFrame = previousGlobals.cancelAnimationFrame;
  globalThis.setInterval = previousGlobals.setInterval;
  globalThis.clearInterval = previousGlobals.clearInterval;

  previousGlobals = {};
});

test('preface: mirrors KT fields, normalises containment, and updates titles', async () => {
  const { document } = globalThis;
  document.title = 'KT Intake';
  document.body.innerHTML = `
    <main>
      <h1 id="docTitle">KT Intake</h1>
      <p id="docSubtitle"></p>
      <label id="labelNow" for="now"></label>
      <label id="labelHealthy" for="healthy"></label>
      <textarea id="oneLine"></textarea>
      <textarea id="proof"></textarea>
      <textarea id="objectPrefill"></textarea>
      <textarea id="healthy"></textarea>
      <textarea id="now"></textarea>
      <textarea id="impactNow"></textarea>
      <textarea id="impactFuture"></textarea>
      <textarea id="impactTime"></textarea>
      <input id="bridgeOpenedUtc" />
      <input id="icName" />
      <input id="bcName" />
      <input id="semOpsName" />
      <select id="severity"></select>
      <input type="checkbox" id="detectMonitoring" />
      <input type="checkbox" id="detectUserReport" />
      <input type="checkbox" id="detectAutomation" />
      <input type="checkbox" id="detectOther" />
      <input type="checkbox" id="evScreenshot" />
      <input type="checkbox" id="evLogs" />
      <input type="checkbox" id="evMetrics" />
      <input type="checkbox" id="evRepro" />
      <input type="checkbox" id="evOther" />
      <textarea id="containDesc"></textarea>
      <input type="radio" id="containAssessing" name="containment" />
      <input type="radio" id="containStoppingImpact" name="containment" />
      <input type="radio" id="containStabilized" name="containment" />
      <input type="radio" id="containFixInProgress" name="containment" />
      <input type="radio" id="containRestoring" name="containment" />
      <input type="radio" id="containMonitoring" name="containment" />
      <input type="radio" id="containClosed" name="containment" />
    </main>
  `;

  const objectISField = document.createElement('textarea');
  objectISField.id = 'ktObject';
  const deviationISField = document.createElement('textarea');
  deviationISField.id = 'ktDeviation';
  document.body.append(objectISField, deviationISField);

  const actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(() => ({})),
    patchAction: mock.fn(() => ({})),
    removeAction: mock.fn(() => true),
    sortActions: mock.fn(() => []),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn(() => [])
  };
  const appStateMocks = {
    getAnalysisId: mock.fn(() => 'analysis-test'),
    getLikelyCauseId: mock.fn(() => '')
  };
  const refreshSpy = mock.fn(() => {});
  const ktMocks = {
    getPossibleCauses: () => [],
    causeHasFailure: () => false,
    buildHypothesisSentence: () => '',
    getObjectISField: () => objectISField,
    getDeviationISField: () => deviationISField,
    isObjectISDirty: () => false,
    isDeviationISDirty: () => false,
    refreshAllTokenizedText: refreshSpy
  };
  globalThis.__actionsStoreMocks = actionsStoreMocks;
  globalThis.__appStateMocks = appStateMocks;
  globalThis.__ktMocks = ktMocks;

  const { applyPrefaceState, initPreface } = await import('../src/preface.js');

  const saveSpy = mock.fn();
  initPreface({ onSave: saveSpy });

  const objectPrefill = document.getElementById('objectPrefill');
  objectPrefill.value = 'Edge Router service';
  objectPrefill.dispatchEvent(new window.Event('input', { bubbles: true }));

  assert.equal(objectISField.value, 'Edge Router service');
  assert.equal(document.getElementById('labelNow').textContent, 'What is happening now to Edge Router service?');
  assert.equal(document.getElementById('labelHealthy').textContent, 'What does healthy look like here for Edge Router service?');
  assert.equal(document.getElementById('docTitle').textContent, 'KT Intake');
  assert.equal(document.getElementById('docSubtitle').textContent, '');
  assert.equal(document.title, 'KT Intake');

  const oneLine = document.getElementById('oneLine');
  oneLine.value = 'Outage summary in progress';
  deviationISField.value = '';
  oneLine.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(deviationISField.value, 'Outage summary in progress');

  const nowField = document.getElementById('now');
  deviationISField.value = '';
  nowField.value = 'Traffic drop for users';
  nowField.dispatchEvent(new window.Event('input', { bubbles: true }));

  assert.equal(deviationISField.value, 'Traffic drop for users');
  assert.equal(document.getElementById('docTitle').textContent, 'Edge Router service — Traffic drop for users');
  assert.equal(
    document.getElementById('docSubtitle').textContent,
    'What is happening now to Edge Router service: Traffic drop for users'
  );
  assert.equal(document.title, 'Edge Router service — Traffic drop for users · KT Intake');
  assert.equal(document.getElementById('labelHealthy').textContent, 'What does healthy look like here for Edge Router service?');

  deviationISField.value = '';
  nowField.value = '';
  nowField.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.getElementById('docTitle').textContent, 'KT Intake');
  assert.equal(document.getElementById('docSubtitle').textContent, '');
  assert.equal(document.getElementById('labelNow').textContent, 'What is happening now to Edge Router service?');
  assert.equal(document.getElementById('labelHealthy').textContent, 'What does healthy look like here for Edge Router service?');
  assert.equal(document.title, 'KT Intake');

  objectISField.value = '';
  objectPrefill.value = '';
  objectPrefill.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.getElementById('docTitle').textContent, 'KT Intake');
  assert.equal(document.getElementById('docSubtitle').textContent, '');
  assert.equal(document.getElementById('labelNow').textContent, 'What is happening now to the object?');
  assert.equal(document.getElementById('labelHealthy').textContent, 'What does healthy look like here for the object?');

  applyPrefaceState({
    ops: { containStatus: 'mitigation' }
  });

  assert.equal(document.getElementById('containStabilized').checked, true);
  assert.equal(document.getElementById('containAssessing').checked, false);

  assert.ok(saveSpy.mock.callCount() >= 3, 'save handler should run after inputs');
  assert.ok(refreshSpy.mock.callCount() >= 1, 'preface inputs should refresh tokens');
});
