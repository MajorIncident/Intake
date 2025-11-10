/**
 * KT table persistence regression tests.
 *
 * Ensures Kepner-Tregoe evidence rows export stable identifiers and re-import
 * the correct textarea values even when question prompts change token values
 * or the serialized payload omits the new identifiers.
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
  return import(`../src/kt.js?scenario=persistence-${importCounter}`);
}

beforeEach(() => {
  const { document } = dom.window;
  document.getElementById('causeList')?.replaceChildren();
  document.getElementById('tbody')?.replaceChildren();

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

function dispatchInput(textarea, value) {
  textarea.value = value;
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

test('kt table persistence: retains evidence alignment when prompt tokens change', async () => {
  const ktModule = await loadKtModule();
  const saveSpy = mock.fn();
  ktModule.configureKT({ autoResize: () => {}, onSave: saveSpy });
  ktModule.initTable();

  const rows = ktModule.getRowsBuilt();
  const objectRow = rows.find(row => row.questionId === 'what-object');
  const targetRow = rows.find(row => row.questionId === 'extent-count');

  assert.ok(objectRow, 'object row is available');
  assert.ok(targetRow, 'target row is available');

  dispatchInput(objectRow.isTA, 'Widget 5000');

  const targetValues = {
    is: 'Extent count IS',
    no: 'Extent count NO',
    di: 'Extent count DI',
    ch: 'Extent count CH'
  };
  dispatchInput(targetRow.isTA, targetValues.is);
  dispatchInput(targetRow.notTA, targetValues.no);
  dispatchInput(targetRow.distTA, targetValues.di);
  dispatchInput(targetRow.chgTA, targetValues.ch);

  const exported = ktModule.exportKTTableState();
  const exportedRecord = exported.find(entry => entry && entry.questionId === 'extent-count');

  assert.ok(exportedRecord, 'export includes the stable question identifier');
  assert.equal(exportedRecord.is, targetValues.is);
  assert.equal(exportedRecord.no, targetValues.no);
  assert.equal(exportedRecord.di, targetValues.di);
  assert.equal(exportedRecord.ch, targetValues.ch);

  dispatchInput(targetRow.isTA, '');
  dispatchInput(targetRow.notTA, '');
  dispatchInput(targetRow.distTA, '');
  dispatchInput(targetRow.chgTA, '');

  dispatchInput(objectRow.isTA, 'Gadget Z');

  assert.match(
    targetRow.th.textContent,
    /Gadget Z/,
    'question text reflects the latest token values prior to import'
  );

  ktModule.importKTTableState(exported);

  assert.equal(targetRow.isTA.value, targetValues.is, 'IS evidence restored to the same question');
  assert.equal(targetRow.notTA.value, targetValues.no, 'IS NOT evidence restored to the same question');
  assert.equal(targetRow.distTA.value, targetValues.di, 'Distinctions restored to the same question');
  assert.equal(targetRow.chgTA.value, targetValues.ch, 'Changes restored to the same question');
});

test('kt table persistence: sequential fallback skips band rows for legacy data', async () => {
  const ktModule = await loadKtModule();
  ktModule.configureKT({ autoResize: () => {}, onSave: () => {} });
  ktModule.initTable();

  const rows = ktModule.getRowsBuilt();
  const objectRow = rows.find(row => row.questionId === 'what-object');
  const whereLocation = rows.find(row => row.questionId === 'where-location');
  const whereOnObject = rows.find(row => row.questionId === 'where-on-object');

  assert.ok(objectRow, 'object row is present');
  assert.ok(whereLocation, 'WHERE location row is present');
  assert.ok(whereOnObject, 'WHERE on object row is present');

  const whereLocationValues = { is: 'Where IS', no: 'Where NO', di: 'Where DI', ch: 'Where CH' };
  const whereOnObjectValues = { is: 'On IS', no: 'On NO', di: 'On DI', ch: 'On CH' };

  dispatchInput(whereLocation.isTA, whereLocationValues.is);
  dispatchInput(whereLocation.notTA, whereLocationValues.no);
  dispatchInput(whereLocation.distTA, whereLocationValues.di);
  dispatchInput(whereLocation.chgTA, whereLocationValues.ch);

  dispatchInput(whereOnObject.isTA, whereOnObjectValues.is);
  dispatchInput(whereOnObject.notTA, whereOnObjectValues.no);
  dispatchInput(whereOnObject.distTA, whereOnObjectValues.di);
  dispatchInput(whereOnObject.chgTA, whereOnObjectValues.ch);

  const exported = ktModule.exportKTTableState();
  const legacyState = exported.map(record => {
    if(record && record.band){
      return { band: record.band };
    }
    return {
      q: record.q,
      is: record.is,
      no: record.no,
      di: record.di,
      ch: record.ch
    };
  });

  dispatchInput(whereLocation.isTA, '');
  dispatchInput(whereLocation.notTA, '');
  dispatchInput(whereLocation.distTA, '');
  dispatchInput(whereLocation.chgTA, '');

  dispatchInput(whereOnObject.isTA, '');
  dispatchInput(whereOnObject.notTA, '');
  dispatchInput(whereOnObject.distTA, '');
  dispatchInput(whereOnObject.chgTA, '');

  dispatchInput(objectRow.isTA, 'Different Object');

  ktModule.importKTTableState(legacyState);

  assert.equal(whereLocation.isTA.value, whereLocationValues.is, 'WHERE location IS text restored');
  assert.equal(whereLocation.notTA.value, whereLocationValues.no, 'WHERE location IS NOT text restored');
  assert.equal(whereLocation.distTA.value, whereLocationValues.di, 'WHERE location distinctions restored');
  assert.equal(whereLocation.chgTA.value, whereLocationValues.ch, 'WHERE location changes restored');

  assert.equal(whereOnObject.isTA.value, whereOnObjectValues.is, 'WHERE on object IS text restored');
  assert.equal(whereOnObject.notTA.value, whereOnObjectValues.no, 'WHERE on object IS NOT text restored');
  assert.equal(whereOnObject.distTA.value, whereOnObjectValues.di, 'WHERE on object distinctions restored');
  assert.equal(whereOnObject.chgTA.value, whereOnObjectValues.ch, 'WHERE on object changes restored');
});

