/** Collaboration browser controller tests covering race safety, URL privacy, recovery, joining, and leaving. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createCollaborationController, POLL_DELAY_MS, RECOVERY_STORAGE_KEY, SAVE_DELAY_MS } from '../src/collaboration.js';

/** Creates a manually resolvable promise. @returns {object} Deferred promise. */
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
/** Builds a fetch response double. @param {number} status HTTP status. @param {object} body JSON body. @returns {object} Response. */
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
/** Builds a deterministic collaboration controller environment. @param {string} url Page URL. @returns {object} Environment. */
function setup(url = 'https://intake.test/', initial = { local: true }) {
  const dom = new JSDOM(`<!doctype html><body><div id="collaborationStatus"></div><div id="collaborationSyncDetail"></div><button id="syncCollaborationBtn"></button><button id="startCollaborationBtn"></button><button id="copyCollaborationLinkBtn"></button><button id="leaveCollaborationBtn"></button><div id="collaborationConflictActions"></div><button id="loadSharedVersionBtn"></button><button id="exportRecoveryBtn"></button><input id="field"></body>`, { url });
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, value: false });
  const timers = []; const requests = []; const applyCalls = []; const localSaves = [];
  let current = initial;
  const fetchImpl = async (...args) => {
    requests.push(args);
    if (!setup.handler) throw new Error('No test response configured');
    return setup.handler(...args);
  };
  const controller = createCollaborationController({
    collect: () => current, apply: value => { applyCalls.push(value); current = value; }, saveLocal: value => localSaves.push(value), fetchImpl,
    location: dom.window.location, history: dom.window.history, storage: dom.window.localStorage, documentRef: dom.window.document,
    windowRef: dom.window, navigatorRef: dom.window.navigator,
    setTimeoutImpl: (callback, delay) => { const timer = { callback, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeoutImpl: timer => { if (timer) timer.cancelled = true; }
  });
  const runNextTimer = async () => {
    const timer = [...timers].reverse().find(candidate => !candidate.cancelled && !candidate.ran);
    if (!timer) return false;
    timer.ran = true; await timer.callback(); return true;
  };
  return { dom, controller, timers, requests, applyCalls, localSaves, runNextTimer, setCurrent: value => { current = value; } };
}
const token = 'a'.repeat(43);

/** Joins an environment to a mocked workspace. @param {object} env Environment. @param {number} revision Revision. @param {object} snapshot Snapshot. @returns {Promise<void>} */
async function join(env, revision = 1, snapshot = { shared: true }) {
  setup.handler = async () => reply(200, { revision, snapshot });
  await env.controller.init();
}

test('a fresh shared link omits revision zero, applies the server snapshot, then polls with the adopted revision', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  assert.equal(env.controller.getState().revision, 0);
  await join(env);
  assert.deepEqual(env.applyCalls, [{ shared: true }]);
  assert.deepEqual(env.localSaves, [{ shared: true }]);
  assert.equal(env.requests[0][0], '/api/workspaces/session');
  assert.equal(env.requests[0][0].includes(token), false);
  assert.equal(env.requests[0][1].headers.Authorization, `Bearer ${token}`);
  assert.equal(env.controller.getState().pendingSave, null);
  assert.equal(env.controller.getState().revision, 1);
  setup.handler = async () => reply(204, {});
  await env.controller.poll();
  assert.equal(env.requests[1][0], '/api/workspaces/session?afterRevision=1');
});

test('no-op blur, manual sync, and hidden polling never create false Offline states', async () => {
  const local = setup(); await local.controller.init();
  local.dom.window.document.getElementById('field').dispatchEvent(new local.dom.window.Event('focusout', { bubbles: true }));
  assert.equal(local.dom.window.document.getElementById('collaborationStatus').textContent, 'Local only');

  const shared = setup(`https://intake.test/?workspace=${token}`); await join(shared);
  await shared.controller.syncNow();
  assert.equal(shared.dom.window.document.getElementById('collaborationStatus').textContent, 'Shared · Revision 1');
  Object.defineProperty(shared.dom.window.document, 'hidden', { configurable: true, value: true });
  await shared.controller.poll();
  assert.equal(shared.dom.window.document.getElementById('collaborationStatus').textContent, 'Shared · Revision 1');
});

test('destroy clears status, save, and poll timers and removes lifecycle listeners', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`); await join(env);
  env.controller.notifyLocalChange({ pending: true });
  const requestsBeforeDestroy = env.requests.length;
  const epochBeforeDestroy = env.controller.getState().sessionEpoch;

  env.controller.destroy();
  env.controller.destroy();

  assert.equal(env.timers.filter(timer => !timer.cancelled).length, 0, 'all controller timers are cancelled');
  assert.equal(env.controller.getState().pendingSave, null);
  assert.equal(env.controller.getState().destroyed, true);
  assert.equal(env.controller.getState().sessionEpoch, epochBeforeDestroy + 1, 'idempotent destroy invalidates work once');

  env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));
  env.dom.window.dispatchEvent(new env.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  env.dom.window.dispatchEvent(new env.dom.window.Event('online'));
  env.dom.window.document.dispatchEvent(new env.dom.window.Event('visibilitychange'));
  await Promise.resolve();
  assert.equal(env.requests.length, requestsBeforeDestroy, 'destroyed lifecycle listeners cannot issue requests');
});

test('default scheduling uses the provided JSDOM window timer and teardown cancels it', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="collaborationStatus"></div></body>', { url: 'https://intake.test/' });
  const scheduled = []; const cancelled = [];
  dom.window.setTimeout = (callback, delay) => { const timer = { callback, delay }; scheduled.push(timer); return timer; };
  dom.window.clearTimeout = timer => { cancelled.push(timer); };
  const controller = createCollaborationController({
    collect: () => ({}), apply: () => {}, saveLocal: () => {}, fetchImpl: async () => reply(204, {}),
    location: dom.window.location, history: dom.window.history, storage: dom.window.localStorage,
    documentRef: dom.window.document, windowRef: dom.window, navigatorRef: dom.window.navigator
  });
  await controller.init();
  assert.equal(scheduled.some(timer => timer.delay === 1000), true);
  controller.destroy();
  assert.equal(cancelled.includes(scheduled.find(timer => timer.delay === 1000)), true);
  dom.window.close();
});

test('text changes use the 300ms debounce while structured changes can save immediately', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`); await join(env);
  env.controller.notifyLocalChange({ text: 'typing' });
  assert.equal(env.timers.at(-1).delay, SAVE_DELAY_MS);
  env.controller.notifyLocalChange({ selected: true }, { immediate: true });
  assert.equal(env.timers.at(-1).delay, 0);
});

test('foreground polling uses the mobile cadence and lifecycle bursts share one GET', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`); await join(env);
  assert.equal(env.timers.some(timer => timer.delay === POLL_DELAY_MS), true);
  const get = deferred(); setup.handler = async () => get.promise;
  env.dom.window.dispatchEvent(new env.dom.window.Event('focus'));
  env.dom.window.dispatchEvent(new env.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
  env.dom.window.dispatchEvent(new env.dom.window.Event('online'));
  await Promise.resolve();
  assert.equal(env.requests.length, 2, 'only one lifecycle GET joins the initial GET');
  get.resolve(reply(204, {})); await Promise.resolve(); await Promise.resolve();
});

test('visibility recovery does not depend on suspended polling timers and flushes local work', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`); await join(env);
  env.controller.notifyLocalChange({ mobile: 'kept' });
  Object.defineProperty(env.dom.window.document, 'hidden', { configurable: true, value: true });
  env.dom.window.document.dispatchEvent(new env.dom.window.Event('visibilitychange'));
  Object.defineProperty(env.dom.window.document, 'hidden', { configurable: true, value: false });
  setup.handler = async (_url, options) => options.method === 'PUT' ? reply(200, { revision: 2 }) : reply(204, {});
  env.dom.window.document.dispatchEvent(new env.dom.window.Event('visibilitychange'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.requests.some(([, options]) => options.method === 'PUT'), true);
});

test('pending local save followed by a newer poll preserves local state and conflicts', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  await join(env);
  env.setCurrent({ local: 'dirty' });
  env.controller.notifyLocalChange({ local: 'dirty' });
  setup.handler = async () => reply(200, { revision: 2, snapshot: { remote: 'newer' } });
  await env.controller.loadNewest();
  assert.equal(env.controller.getState().conflicted, true);
  assert.deepEqual(JSON.parse(env.dom.window.localStorage.getItem(RECOVERY_STORAGE_KEY)).snapshot, { local: 'dirty' });
  assert.deepEqual(env.applyCalls, [{ shared: true }]);
  await env.runNextTimer();
  assert.equal(env.requests.filter(([, options]) => options.method === 'PUT').length, 0);
});

test('newer remote revision arriving while a PUT is in flight never silently overwrites local changes', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  await join(env);
  const put = deferred();
  setup.handler = async (_url, options) => options.method === 'PUT' ? put.promise : reply(200, { revision: 3, snapshot: { remote: 3 } });
  env.setCurrent({ local: 2 }); env.controller.notifyLocalChange({ local: 2 });
  const savePromise = env.runNextTimer();
  await Promise.resolve();
  await env.controller.loadNewest();
  assert.equal(env.controller.getState().conflicted, true);
  assert.deepEqual(JSON.parse(env.dom.window.localStorage.getItem(RECOVERY_STORAGE_KEY)).snapshot, { local: 2 });
  put.resolve(reply(200, { revision: 2 })); await savePromise;
  assert.equal(env.controller.getState().revision, 1, 'completion is ignored after conflict');
});

test('rapid edits serialize PUTs, retain only the latest snapshot, and ignore an older GET completion', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  await join(env);
  const firstPut = deferred(); const oldGet = deferred(); let putCount = 0;
  setup.handler = async (_url, options) => {
    if (options.method === 'PUT') {
      putCount += 1;
      return putCount === 1 ? firstPut.promise : reply(200, { revision: 3 });
    }
    return oldGet.promise;
  };
  env.controller.notifyLocalChange({ edit: 1 });
  const firstSave = env.runNextTimer(); await Promise.resolve();
  env.controller.notifyLocalChange({ edit: 2 });
  env.controller.notifyLocalChange({ edit: 3 });
  const oldLoad = env.controller.loadNewest();
  assert.equal(putCount, 1, 'only one PUT is in flight');
  firstPut.resolve(reply(200, { revision: 2 }));
  await firstSave;
  assert.equal(putCount, 2);
  const putBodies = env.requests.filter(([, options]) => options.method === 'PUT').map(([, options]) => JSON.parse(options.body));
  assert.deepEqual(putBodies, [
    { snapshot: { edit: 1 }, revision: 1 },
    { snapshot: { edit: 3 }, revision: 2 }
  ]);
  oldGet.resolve(reply(200, { revision: 1, snapshot: { old: true } })); await oldLoad;
  assert.equal(env.controller.getState().revision, 3);
  assert.equal(env.applyCalls.some(value => value.old), false);
});

test('leaving while a request is in flight prevents its completion from changing local session state', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  await join(env);
  const put = deferred(); setup.handler = async () => put.promise;
  env.controller.notifyLocalChange({ leaving: true });
  const save = env.runNextTimer(); await Promise.resolve();
  env.dom.window.localStorage.setItem(RECOVERY_STORAGE_KEY, '{"kept":true}');
  env.controller.leave();
  put.resolve(reply(409, { revision: 9 })); await save;
  assert.equal(env.controller.getState().token, null);
  assert.equal(env.controller.getState().revision, 0);
  assert.equal(env.controller.getState().conflicted, false);
  assert.equal(env.dom.window.localStorage.getItem(RECOVERY_STORAGE_KEY), '{"kept":true}');
});

test('invalid and missing sessions stop polling while network and server failures remain retryable', async () => {
  for (const [status, label] of [[400, 'Invalid collaboration link'], [401, 'Invalid collaboration link'], [404, 'Missing or expired session']]) {
    const env = setup(`https://intake.test/?workspace=${token}`);
    setup.handler = async () => reply(status, {}); await env.controller.init();
    assert.equal(env.controller.getState().pollingStopped, true);
    assert.equal(env.dom.window.document.getElementById('collaborationStatus').textContent, label);
    const refresh = env.timers.find(timer => timer.delay === 1000 && !timer.cancelled);
    await refresh.callback();
    assert.equal(env.dom.window.document.getElementById('collaborationStatus').textContent, label, 'terminal status survives refresh');
  }
  const server = setup(`https://intake.test/?workspace=${token}`);
  setup.handler = async () => reply(500, {}); await server.controller.init();
  assert.equal(server.controller.getState().pollingStopped, false);
  assert.equal(server.dom.window.document.getElementById('collaborationStatus').textContent, 'Retrying…');
  const offline = setup(`https://intake.test/?workspace=${token}`);
  setup.handler = async () => { throw new Error('network'); }; await offline.controller.init();
  assert.equal(offline.controller.getState().pollingStopped, false);
  assert.equal(offline.dom.window.document.getElementById('collaborationStatus').textContent, 'Offline · Changes kept locally');
});
