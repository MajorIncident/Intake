/** Collaboration browser controller tests covering race safety, URL privacy, recovery, joining, and leaving. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createCollaborationController, RECOVERY_STORAGE_KEY } from '../src/collaboration.js';

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
  const dom = new JSDOM(`<!doctype html><body><div id="collaborationStatus"></div><button id="startCollaborationBtn"></button><button id="copyCollaborationLinkBtn"></button><button id="leaveCollaborationBtn"></button><div id="collaborationConflictActions"></div><button id="loadSharedVersionBtn"></button><button id="exportRecoveryBtn"></button></body>`, { url });
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
    setTimeoutImpl: callback => { const timer = { callback, cancelled: false }; timers.push(timer); return timer; },
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

test('joining uses bearer authorization on a stable API URL and does not queue a save loop', async () => {
  const env = setup(`https://intake.test/?workspace=${token}`);
  await join(env);
  assert.deepEqual(env.applyCalls, [{ shared: true }]);
  assert.deepEqual(env.localSaves, [{ shared: true }]);
  assert.equal(env.requests[0][0], '/api/workspaces/session');
  assert.equal(env.requests[0][0].includes(token), false);
  assert.equal(env.requests[0][1].headers.Authorization, `Bearer ${token}`);
  assert.equal(env.controller.getState().pendingSave, null);
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
  }
  const server = setup(`https://intake.test/?workspace=${token}`);
  setup.handler = async () => reply(500, {}); await server.controller.init();
  assert.equal(server.controller.getState().pollingStopped, false);
  assert.equal(server.dom.window.document.getElementById('collaborationStatus').textContent, 'Temporary server error');
  const offline = setup(`https://intake.test/?workspace=${token}`);
  setup.handler = async () => { throw new Error('network'); }; await offline.controller.init();
  assert.equal(offline.controller.getState().pollingStopped, false);
  assert.equal(offline.dom.window.document.getElementById('collaborationStatus').textContent, 'Offline');
});
