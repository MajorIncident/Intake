/**
 * Summary formatting integration tests.
 *
 * Ensures the summary builder and generator produce correctly structured
 * sections, normalise timestamps, and update the clipboard card without
 * depending on DOM state outside the provided synthetic objects.
 */
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import * as summaryModule from '../src/summary.js';

const { buildSummaryText, generateSummary } = summaryModule;

afterEach(() => {
  mock.restoreAll();
});

test('summary: renders populated sections and normalises communication timestamps', () => {

  const state = {
    docTitle: { textContent: 'Major Incident Alpha' },
    docSubtitle: { textContent: 'Payments are timing out' },
    oneLine: { value: 'Card processing failures in NA region' },
    proof: { value: 'Error rate spiked beyond threshold' },
    objectPrefill: { value: 'Payments API' },
    healthy: { value: 'Transactions process within 200ms' },
    now: { value: 'Customers see payment failures >80% of the time' },
    detectMonitoring: { checked: true },
    detectUserReport: { checked: false },
    detectAutomation: { checked: true },
    detectOther: { checked: false },
    evScreenshot: { checked: true },
    evLogs: { checked: true },
    evMetrics: { checked: true },
    evRepro: { checked: false },
    evOther: { checked: false },
    impactNow: { value: 'Revenue transactions are failing for most users' },
    impactFuture: { value: 'Extended outage risks regulatory fines' },
    impactTime: { value: 'Started at 09:10 UTC' },
    getContainmentStatus: () => 'stabilized',
    containDesc: { value: 'Rollback applied and traffic routed to standby cluster' },
    commLog: [
      { type: 'internal', ts: '2024-01-01T10:00:00-05:00' },
      { type: 'external', ts: '2024-01-01T10:30:00-05:00' }
    ],
    commNextDueIso: '2024-01-01T16:00:00Z',
    bridgeOpenedUtc: { value: '2024-01-01 14:05Z' },
    icName: { value: 'Alex Morgan' },
    bcName: { value: 'Blake Chen' },
    semOpsName: { value: 'Casey Drew' },
    severity: { value: 'SEV-1' },
    stepsItems: [
      { id: 'step-activate', phase: 'A', checked: true },
      { id: 'step-hypothesize', phase: 'B', checked: false }
    ],
    getStepsCounts: () => ({ total: 2, completed: 1 }),
    possibleCauses: [
      { id: 'cause-1', title: 'Database replication lag', status: 'completed' },
      { id: 'cause-2', title: 'Network saturation', status: 'in_progress' }
    ],
    likelyCauseId: 'cause-1',
    buildHypothesisSentence: (cause) => `${cause.title} is impacting payments`,
    evidencePairIndexes: () => [],
    rowsBuilt: [],
    peekCauseFinding: () => null,
    getRowKeyByIndex: () => '',
    findingMode: () => '',
    findingNote: () => '',
    countCompletedEvidence: () => 0,
    causeHasFailure: () => false,
    causeStatusLabel: () => '',
    tbody: { querySelectorAll: () => [] }
  };

  const text = buildSummaryText(state);

  assert.ok(text.includes('— Preface —'));
  assert.ok(text.includes('— Containment —'));
  assert.ok(text.includes('— Communications —'));
  assert.ok(text.includes('— Steps Checklist —'));
  assert.ok(text.includes('— ⭐ Likely Cause —'));
  assert.ok(text.includes('— Possible Causes —'));

  assert.match(
    text,
    /— Communications —\nLast Internal Update: 2024-01-01T15:00:00\.000Z\nLast External Update: 2024-01-01T15:30:00\.000Z\nNext Update: 2024-01-01T16:00:00\.000Z/
  );
});


test('summary: omits optional sections when inputs are empty', () => {

  const state = {
    docTitle: { textContent: '' },
    docSubtitle: { textContent: '' },
    oneLine: { value: '   ' },
    proof: { value: '' },
    objectPrefill: { value: '' },
    healthy: { value: '' },
    now: { value: '' },
    detectMonitoring: { checked: false },
    detectUserReport: { checked: false },
    detectAutomation: { checked: false },
    detectOther: { checked: false },
    evScreenshot: { checked: false },
    evLogs: { checked: false },
    evMetrics: { checked: false },
    evRepro: { checked: false },
    evOther: { checked: false },
    impactNow: { value: '' },
    impactFuture: { value: '' },
    impactTime: { value: '' },
    getContainmentStatus: () => '',
    containDesc: { value: '   ' },
    commLog: [],
    commNextDueIso: '',
    commNextUpdateTime: { value: '' },
    bridgeOpenedUtc: { value: '' },
    icName: { value: '' },
    bcName: { value: '' },
    semOpsName: { value: '' },
    severity: { value: '' },
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
    tbody: { querySelectorAll: () => [] }
  };

  const text = buildSummaryText(state);

  assert.ok(!text.includes('— Preface —'));
  assert.ok(!text.includes('— Containment —'));
  assert.ok(!text.includes('— Communications —'));
  assert.ok(!text.includes('— Steps Checklist —'));
  assert.ok(!text.includes('— ⭐ Likely Cause —'));
  assert.ok(text.includes('— Possible Causes —'));
  assert.ok(text.includes('No possible causes captured.'));
});


test('summary: generateSummary writes output to the summary card', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div class="wrap"></div></body></html>', {
    url: 'http://localhost/'
  });

  const { window } = dom;
  const { document } = window;

  const state = {
    docTitle: { textContent: 'Incident Bravo' },
    docSubtitle: { textContent: 'Cache layer failures' },
    oneLine: { value: 'Elevated 5xx from cache cluster' },
    proof: { value: 'Errors confirmed via on-call dashboard' },
    objectPrefill: { value: 'Cache cluster' },
    healthy: { value: 'Requests served under 50ms' },
    now: { value: 'Users experience slow responses' },
    detectMonitoring: { checked: true },
    detectUserReport: { checked: true },
    detectAutomation: { checked: false },
    detectOther: { checked: false },
    evScreenshot: { checked: false },
    evLogs: { checked: true },
    evMetrics: { checked: true },
    evRepro: { checked: false },
    evOther: { checked: false },
    impactNow: { value: 'Major latency for 60% of traffic' },
    impactFuture: { value: 'Risk of cascading failures in dependent services' },
    impactTime: { value: 'Detected at 11:22 UTC' },
    getContainmentStatus: () => 'stoppingImpact',
    containDesc: { value: 'Traffic throttled and failover initiated' },
    commLog: [
      { type: 'internal', ts: '2024-02-02T08:15:00Z' }
    ],
    commNextDueIso: '2024-02-02T09:00:00Z',
    bridgeOpenedUtc: { value: '2024-02-02 08:05Z' },
    icName: { value: 'Dev Patel' },
    bcName: { value: 'Eli Moore' },
    semOpsName: { value: 'Farah Singh' },
    severity: { value: 'SEV-2' },
    stepsItems: [
      { id: 'step-assess', phase: 'A', checked: true },
      { id: 'step-restore', phase: 'D', checked: false }
    ],
    getStepsCounts: () => ({ total: 2, completed: 1 }),
    possibleCauses: [
      { id: 'c1', title: 'Cache flush required', status: 'in_progress' }
    ],
    likelyCauseId: '',
    buildHypothesisSentence: (cause) => `${cause.title} for cluster`,
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
    showToast: mock.fn(() => {})
  };

  const expected = buildSummaryText(state);

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;

  try {
    const output = await generateSummary('summary', '', state);

    assert.equal(output, expected);

    const pre = document.getElementById('summaryPre');
    assert.ok(pre, 'summaryPre element should be created');
    assert.equal(pre.textContent, expected);

    const card = document.getElementById('summaryCard');
    assert.ok(card, 'summary card should be rendered');
    assert.equal(card.style.display, 'block');

    assert.equal(state.showToast.mock.callCount(), 1);
    assert.deepEqual(state.showToast.mock.calls[0].arguments, [
      'Summary updated. Clipboard blocked — copy it from the bottom.'
    ]);
  } finally {
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
  }
});
