/**
 * Communications feature integration tests.
 *
 * Validates that the communications module wires its DOM controls,
 * schedules cadence reminders, and hydrates persisted state snapshots.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  applyCommunicationsState,
  disposeCommunications,
  getCommunicationsState,
  initializeCommunications,
  logCommunication,
  setCadence,
  setManualNextUpdate,
  toggleLogVisibility
} from '../src/comms.js';

let dom = null;
let previousGlobals = {};
const NativeDate = globalThis.Date;
let currentNow = null;
let setIntervalStub = null;
let clearIntervalStub = null;
let originalSetInterval = null;
let originalClearInterval = null;
let intervalCallbacks = new Map();
let lastTimerId = null;

function ensureCommsMarkup(document) {
  if (document.getElementById('commControlsCard')) return;

  document.body.innerHTML = `
    <section id="commsFixture">
      <div id="commControlsCard" class="card">
        <div class="field" id="communication-cadence">
          <div id="commCadenceGroup" role="radiogroup">
            <label><input type="radio" name="commCadence" value="10" /></label>
            <label><input type="radio" name="commCadence" value="15" /></label>
            <label><input type="radio" name="commCadence" value="20" /></label>
            <label><input type="radio" name="commCadence" value="30" /></label>
            <label><input type="radio" name="commCadence" value="60" /></label>
          </div>
        </div>
        <div class="comm-actions">
          <button type="button" id="commInternalStampBtn">Internal</button>
          <button type="button" id="commExternalStampBtn">External</button>
          <span class="countdown" id="commCountdown" aria-live="polite"></span>
        </div>
        <div class="comm-alert" id="commDueAlert" role="alert" hidden></div>
        <div class="field">
          <label for="commNextUpdateTime">Next update scheduled for</label>
          <input type="time" id="commNextUpdateTime" />
        </div>
        <div class="field" id="communication-log">
          <label for="commLogList">Communication log</label>
          <ul id="commLogList" class="comm-log" aria-live="polite"></ul>
          <button
            type="button"
            class="btn-mini comm-log-toggle"
            id="commLogToggleBtn"
            hidden
            aria-expanded="false"
          >Show all</button>
        </div>
      </div>
    </section>
  `;
}

function setMockNow(isoString) {
  currentNow = new NativeDate(isoString);
}

function flushCadenceTick() {
  if (lastTimerId && intervalCallbacks.has(lastTimerId)) {
    const callback = intervalCallbacks.get(lastTimerId);
    if (typeof callback === 'function') {
      callback();
    }
  }
}

beforeEach(() => {
  previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    Date: globalThis.Date
  };

  if (!dom) {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'http://localhost/'
    });
  }

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;

  ensureCommsMarkup(document);

  intervalCallbacks = new Map();
  let nextTimerId = 1;
  lastTimerId = null;

  setIntervalStub = mock.fn((fn) => {
    const id = nextTimerId++;
    intervalCallbacks.set(id, fn);
    lastTimerId = id;
    return id;
  });
  clearIntervalStub = mock.fn((id) => {
    intervalCallbacks.delete(id);
    if (lastTimerId === id) {
      lastTimerId = null;
    }
  });

  if (!originalSetInterval) {
    originalSetInterval = window.setInterval;
  }
  if (!originalClearInterval) {
    originalClearInterval = window.clearInterval;
  }

  window.setInterval = setIntervalStub;
  window.clearInterval = clearIntervalStub;
  globalThis.setInterval = setIntervalStub;
  globalThis.clearInterval = clearIntervalStub;

  setMockNow('2024-05-01T10:00:00.000Z');
  class MockDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) {
        super(currentNow.getTime());
      } else {
        super(...args);
      }
    }

    static now() {
      return currentNow.getTime();
    }

    static parse(value) {
      return NativeDate.parse(value);
    }

    static UTC(...args) {
      return NativeDate.UTC(...args);
    }
  }

  window.Date = MockDate;
  globalThis.Date = MockDate;

  applyCommunicationsState({
    commCadence: '',
    commLog: [],
    commNextDueIso: '',
    commNextUpdateTime: ''
  });
});

afterEach(() => {
  disposeCommunications();
  mock.restoreAll();

  if (dom) {
    const { window } = dom;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
    window.Date = NativeDate;
  }

  globalThis.window = previousGlobals.window;
  globalThis.document = previousGlobals.document;
  globalThis.navigator = previousGlobals.navigator;
  globalThis.HTMLElement = previousGlobals.HTMLElement;
  globalThis.setInterval = previousGlobals.setInterval;
  globalThis.clearInterval = previousGlobals.clearInterval;
  globalThis.Date = previousGlobals.Date ?? NativeDate;

  previousGlobals = {};
  intervalCallbacks.clear();
  lastTimerId = null;
  currentNow = null;
  setIntervalStub = null;
  clearIntervalStub = null;
});

test('communications: logs updates, toggles visibility, and drives cadence reminders', async () => {
  const { document } = globalThis;
  const saveSpy = mock.fn(() => {});
  const toastSpy = mock.fn(() => {});

  initializeCommunications({ onSave: saveSpy, showToast: toastSpy });
  setCadence('15');

  for (let i = 0; i < 7; i += 1) {
    const type = i % 2 === 0 ? 'internal' : 'external';
    logCommunication(type, `Update ${i + 1}`);
  }

  const logList = document.getElementById('commLogList');
  assert.equal(logList.children.length, 6, 'collapsed log should show the six most recent entries');

  const toggleBtn = document.getElementById('commLogToggleBtn');
  assert.equal(toggleBtn.hidden, false);
  assert.equal(toggleBtn.textContent, 'Show all');
  assert.equal(toggleBtn.getAttribute('aria-expanded'), 'false');

  const latestMessage = logList.querySelector('li:first-child .comm-log__message');
  assert.ok(latestMessage);
  assert.equal(latestMessage.textContent, 'Update 7');

  const countdown = document.getElementById('commCountdown');
  assert.equal(countdown.textContent, 'Next in 15m 00s');

  toggleLogVisibility();
  assert.equal(logList.children.length, 7, 'expanded log should reveal all entries');
  assert.equal(toggleBtn.textContent, 'Show less');
  assert.equal(toggleBtn.getAttribute('aria-expanded'), 'true');

  const snapshot = getCommunicationsState();
  assert.equal(snapshot.commCadence, '15');
  assert.equal(snapshot.commLog.length, 7);
  assert.ok(snapshot.commNextDueIso);
  assert.equal(
    snapshot.commNextUpdateTime,
    document.getElementById('commNextUpdateTime').value
  );

  setMockNow('2024-05-01T10:16:00.000Z');
  flushCadenceTick();

  const dueAlert = document.getElementById('commDueAlert');
  assert.equal(countdown.textContent, 'Due now');
  assert.equal(dueAlert.hidden, false);
  assert.equal(dueAlert.textContent, 'Next communication is due now. Reconfirm updates.');
  assert.ok(document.getElementById('commControlsCard').classList.contains('communication-due'));
  assert.equal(toastSpy.mock.callCount(), 1);
  assert.deepEqual(toastSpy.mock.calls[0].arguments, ['Next communication is due now.']);

  flushCadenceTick();
  assert.equal(toastSpy.mock.callCount(), 1, 'toast should only fire once while overdue');

  setManualNextUpdate('10:45');
  assert.equal(document.getElementById('commNextUpdateTime').value, '10:45');
  assert.equal(countdown.textContent, 'Next in 29m 00s');
  assert.equal(dueAlert.hidden, true);
  assert.ok(!document.getElementById('commControlsCard').classList.contains('communication-due'));

  setManualNextUpdate('');
  assert.equal(document.getElementById('commNextUpdateTime').value, '');
  assert.equal(countdown.textContent, '');

  assert.equal(saveSpy.mock.callCount(), 10);
});

test('communications: applyCommunicationsState hydrates persisted controls', async () => {
  const { document } = globalThis;
  const saveSpy = mock.fn(() => {});
  const toastSpy = mock.fn(() => {});

  initializeCommunications({ onSave: saveSpy, showToast: toastSpy });

  applyCommunicationsState({
    commCadence: '30',
    commLog: [
      { type: 'internal', ts: '2024-05-01T08:00:00.000Z', message: 'Bridge formed' },
      { type: 'external', ts: '2024-05-01T09:30:00.000Z', message: 'Customer notice sent' }
    ],
    commNextDueIso: '',
    commNextUpdateTime: '11:15'
  });

  const radios = [...document.querySelectorAll('input[name="commCadence"]')];
  const checked = radios.find(radio => radio.checked);
  assert.ok(checked, 'a cadence radio should be selected');
  assert.equal(checked.value, '30');

  const logList = document.getElementById('commLogList');
  assert.equal(logList.children.length, 2);
  assert.equal(logList.children[0].querySelector('.comm-log__message').textContent, 'Bridge formed');
  assert.equal(logList.children[1].querySelector('.comm-log__message').textContent, 'Customer notice sent');
  assert.equal(document.getElementById('commLogToggleBtn').hidden, true);

  const nextInput = document.getElementById('commNextUpdateTime');
  assert.equal(nextInput.value, '11:15');
  assert.equal(document.getElementById('commCountdown').textContent, 'Next in 1h 15m');
  assert.equal(saveSpy.mock.callCount(), 0, 'hydration should not trigger persistence');

  applyCommunicationsState({
    commCadence: '10',
    commLog: [
      { type: 'internal', ts: '2024-05-01T08:00:00.000Z', message: 'Bridge formed' }
    ],
    commNextDueIso: '2024-05-01T10:10:00.000Z',
    commNextUpdateTime: '11:15'
  });

  const updatedChecked = [...document.querySelectorAll('input[name="commCadence"]')]
    .find(radio => radio.checked);
  assert.ok(updatedChecked);
  assert.equal(updatedChecked.value, '10');
  assert.equal(nextInput.value, '10:10');
  assert.equal(document.getElementById('commCountdown').textContent, 'Next in 10m 00s');
  assert.equal(toastSpy.mock.callCount(), 0);
});
