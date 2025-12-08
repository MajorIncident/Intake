/**
 * Handover persistence integration tests.
 *
 * Confirms that handover entries round-trip through app state collection,
 * file/template transfers, and summary generation alongside existing sections.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { HANDOVER_SECTIONS, mountHandoverCard } from '../components/handover/HandoverCard.js';

let dom = null;
let jsdomSnapshot = null;

function installGlobals(window) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    navigator: globalThis.navigator
  };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    get: () => window.navigator
  });
  return previous;
}

function restoreGlobals(previous = {}) {
  if (previous.window) {
    globalThis.window = previous.window;
  } else {
    delete globalThis.window;
  }
  if (previous.document) {
    globalThis.document = previous.document;
  } else {
    delete globalThis.document;
  }
  if (previous.HTMLElement) {
    globalThis.HTMLElement = previous.HTMLElement;
  } else {
    delete globalThis.HTMLElement;
  }
  if (previous.HTMLTextAreaElement) {
    globalThis.HTMLTextAreaElement = previous.HTMLTextAreaElement;
  } else {
    delete globalThis.HTMLTextAreaElement;
  }
  if (previous.Event) {
    globalThis.Event = previous.Event;
  } else {
    delete globalThis.Event;
  }
  if (previous.CustomEvent) {
    globalThis.CustomEvent = previous.CustomEvent;
  } else {
    delete globalThis.CustomEvent;
  }
  if ('navigator' in previous) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      get: () => previous.navigator
    });
  } else {
    delete globalThis.navigator;
  }
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="handover-host"></div></body></html>', {
    url: 'http://localhost/'
  });
  jsdomSnapshot = installGlobals(dom.window);
  globalThis.__actionsStoreMocks = {
    listActions: mock.fn(() => []),
    createAction: mock.fn(),
    patchAction: mock.fn(),
    removeAction: mock.fn(),
    sortActions: mock.fn(),
    exportActionsState: mock.fn(() => []),
    importActionsState: mock.fn((analysisId, items = []) => items),
    normalizeActionSnapshot: mock.fn(payload => ({ ...(payload || {}) }))
  };
  globalThis.__ktMocks = {
    exportKTTableState: mock.fn(() => []),
    importKTTableState: mock.fn(() => {}),
    getTableFocusMode: mock.fn(() => ''),
    setTableFocusMode: mock.fn(() => {}),
    getPossibleCauses: mock.fn(() => []),
    setPossibleCauses: mock.fn(() => {}),
    ensurePossibleCausesUI: mock.fn(() => {}),
    renderCauses: mock.fn(() => {}),
    focusFirstEditableCause: mock.fn(() => {}),
    updateCauseEvidencePreviews: mock.fn(() => {}),
    getLikelyCauseId: mock.fn(() => null),
    setLikelyCauseId: mock.fn(() => {}),
    getRowsBuilt: mock.fn(() => []),
    evidencePairIndexes: mock.fn(() => []),
    countCompletedEvidence: mock.fn(() => 0),
    getRowKeyByIndex: mock.fn(() => ''),
    peekCauseFinding: mock.fn(() => null),
    findingMode: mock.fn(() => ''),
    findingNote: mock.fn(() => ''),
    fillTokens: mock.fn(() => '')
  };
  globalThis.__toastMocks = { showToast: mock.fn(() => {}) };
});

afterEach(() => {
  mock.restoreAll();
  delete globalThis.__actionsStoreMocks;
  delete globalThis.__ktMocks;
  delete globalThis.__toastMocks;
  if (dom) {
    dom.window.close();
    dom = null;
  }
  if (jsdomSnapshot) {
    restoreGlobals(jsdomSnapshot);
    jsdomSnapshot = null;
  }
});

function populateHandoverSections(documentRef) {
  const expected = {};
  HANDOVER_SECTIONS.forEach((section, index) => {
    const textarea = documentRef.querySelector(`[data-section="${section.id}"]`);
    const items = [`Item ${index + 1}A`, `Item ${index + 1}B`];
    textarea.value = items.join('\n');
    textarea.dispatchEvent(new documentRef.defaultView.Event('input', { bubbles: true }));
    expected[section.id] = items;
  });
  return expected;
}

test('handover: app state roundtrips through file and template transfers', async () => {
  const { document } = dom.window;
  const host = document.getElementById('handover-host');
  mountHandoverCard(host);
  const handoverSnapshot = populateHandoverSections(document);

  const appStateModule = await import('../src/appState.js?actual');
  const fileTransferModule = await import('../src/fileTransfer.js?actual');
  const templateExportModule = await import('../src/templateExport.js?actual');

  const collected = appStateModule.collectAppState();
  assert.deepEqual(collected.handover, handoverSnapshot, 'collectAppState captures all handover bullets');

  const blobs = [];
  class FakeBlob {
    constructor(chunks, options) {
      this.chunks = chunks;
      this.options = options;
      blobs.push(this);
    }
  }
  const link = { clickCalled: false, href: '', download: '', rel: '', click() { this.clickCalled = true; } };
  const documentRef = { createElement: () => link, createEvent: () => ({ initEvent() {} }) };
  const urlRef = { createObjectURL: () => 'blob:h' , revokeObjectURL: mock.fn(() => {}) };
  const exported = fileTransferModule.exportAppStateToFile({ collect: () => collected, BlobCtor: FakeBlob, documentRef, urlRef, now: () => new Date('2024-01-01T00:00:00Z') });
  assert.equal(exported.success, true);
  const serializedState = JSON.parse(blobs[0].chunks.join(''));
  assert.deepEqual(serializedState.handover, handoverSnapshot, 'file export preserves handover sections');

  let appliedState = null;
  const importResult = await fileTransferModule.importAppStateFromFile(new Blob([JSON.stringify(serializedState)]), {
    createReader: () => ({
      result: JSON.stringify(serializedState),
      onload: null,
      onerror: null,
      readAsText() { this.onload?.(); }
    }),
    migrate: data => data,
    apply: (state) => { appliedState = state; },
    reset: () => {}
  });
  assert.equal(importResult.success, true);
  assert.deepEqual(appliedState.handover, handoverSnapshot, 'imported snapshot carries handover notes');

  const templateBlobs = [];
  class TemplateBlob {
    constructor(chunks, options) {
      this.chunks = chunks;
      this.options = options;
      templateBlobs.push(this);
    }
  }
  const templateExport = templateExportModule.exportCurrentStateAsTemplate({
    name: 'Handover Template',
    description: 'Captures handover values',
    templateKind: 'CASE_STUDY',
    collect: () => collected,
    BlobCtor: TemplateBlob,
    documentRef,
    urlRef,
    now: () => new Date('2024-01-01T00:00:00Z')
  });
  assert.equal(templateExport.success, true);
  const templatePayload = JSON.parse(templateBlobs[0].chunks.join(''));
  assert.deepEqual(templatePayload.state.handover, handoverSnapshot, 'template payload stores handover bullets');

  const freshDom = new JSDOM('<!doctype html><html><body><div id="handover-host"></div></body></html>');
  const freshHost = freshDom.window.document.getElementById('handover-host');
  mountHandoverCard(freshHost);
  const previousGlobals = installGlobals(freshDom.window);
  appStateModule.applyAppState({ ...appliedState, handover: handoverSnapshot });
  restoreGlobals(previousGlobals);
  const bullets = freshHost.querySelectorAll('[data-section-list] li');
  assert.equal(bullets.length, HANDOVER_SECTIONS.length * 2, 'applied state rebuilds all bullets');
});

test('handover: summaries include formatted handover section', async () => {
  const domSummary = new JSDOM('<!doctype html><html><body><div class="wrap"></div></body></html>', {
    url: 'http://localhost/'
  });
  const previous = installGlobals(domSummary.window);
  try {
    const summaryModule = await import('../src/summary.js?actual');
    const { buildSummaryText, generateSummary } = summaryModule;
    const summaryState = {
      docTitle: { textContent: 'Incident with Handover' },
      docSubtitle: { textContent: 'Service instability' },
      oneLine: { value: 'Outage affecting auth flows' },
      proof: { value: 'Errors across regions' },
      objectPrefill: { value: 'Authentication service' },
      healthy: { value: 'Auth succeeds within 200ms' },
      now: { value: 'Majority of users are blocked' },
      detectMonitoring: { checked: true },
      detectUserReport: { checked: false },
      detectAutomation: { checked: false },
      detectOther: { checked: false },
      evScreenshot: { checked: true },
      evLogs: { checked: true },
      evMetrics: { checked: true },
      evRepro: { checked: false },
      evOther: { checked: false },
      impactNow: { value: 'High login failure rate' },
      impactFuture: { value: 'Risk of prolonged lockouts' },
      impactTime: { value: 'Began 10:00 UTC' },
      getContainmentStatus: () => 'stabilized',
      containDesc: { value: 'Mitigation live and holding' },
      commLog: [{ type: 'internal', ts: '2024-03-01T10:15:00Z' }],
      commNextDueIso: '2024-03-01T10:45:00Z',
      bridgeOpenedUtc: { value: '2024-03-01 10:05Z' },
      icName: { value: 'Jamie Lee' },
      bcName: { value: 'Riley Park' },
      semOpsName: { value: 'Morgan Diaz' },
      severity: { value: 'SEV-1' },
      stepsItems: [],
      getStepsCounts: () => ({ total: 0, completed: 0 }),
      possibleCauses: [],
      likelyCauseId: '',
      buildHypothesisSentence: () => '',
      evidencePairIndexes: () => [],
      rowsBuilt: [],
      peekCauseFinding: () => null,
      getRowKeyByIndex: () => '',
      findingMode: () => '',
      findingNote: () => '',
      countCompletedEvidence: () => 0,
      causeHasFailure: () => false,
      causeStatusLabel: () => '',
      tbody: { querySelectorAll: () => [] },
      actions: [],
      showToast: mock.fn(() => {}),
      handover: {
        'current-state': ['Mitigation applied', 'Traffic stable'],
        'what-changed': ['Failover completed'],
        'remaining-risks': ['Need to monitor auth cache'],
        'must-watch-metrics': ['Login success rate', 'Error ratio'],
        'whats-next': ['Confirm rollback viability']
      }
    };

    const text = buildSummaryText(summaryState);
    assert.ok(text.includes('— Major Incident Handover —'), 'summary text prints handover heading');
    assert.ok(text.includes('Current State:'), 'current state label present');
    assert.ok(text.includes('• Mitigation applied'), 'handover bullets rendered');
    assert.ok(text.includes('What Changed:'), 'what changed subsection present');
    assert.ok(text.includes('— Preface —'), 'existing summary sections remain');

    const output = await generateSummary('summary', '', summaryState);
    assert.equal(output, text, 'generateSummary returns the built summary');
    const pre = domSummary.window.document.getElementById('summaryPre');
    assert.ok(pre?.textContent?.includes('Major Incident Handover'), 'generated summary is written to DOM');
  } finally {
    restoreGlobals(previous);
    domSummary.window.close();
  }
});
