/** Collaboration browser controller tests covering URL join, recovery, loops, and leave safety. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createCollaborationController, RECOVERY_STORAGE_KEY } from '../src/collaboration.js';

/** Builds a collaboration controller test environment. @param {string} url Page URL. @returns {object} Environment. */
function setup(url = 'https://intake.test/') {
  const dom = new JSDOM(`<!doctype html><body><div id="collaborationStatus"></div><button id="startCollaborationBtn"></button><button id="copyCollaborationLinkBtn"></button><button id="leaveCollaborationBtn"></button><div id="collaborationConflictActions"></div><button id="loadSharedVersionBtn"></button><button id="exportRecoveryBtn"></button></body>`, { url });
  const timers = []; const requests = []; const applyCalls = []; const localSaves = [];
  const controller = createCollaborationController({
    collect: () => ({ local: true }), apply: value => applyCalls.push(value), saveLocal: value => localSaves.push(value),
    fetchImpl: async (...args) => { requests.push(args); return setup.reply(...args); },
    location: dom.window.location, history: dom.window.history, storage: dom.window.localStorage, documentRef: dom.window.document,
    setTimeoutImpl: callback => { timers.push(callback); return timers.length; }, clearTimeoutImpl: () => {}
  });
  return { dom, controller, timers, requests, applyCalls, localSaves };
}
setup.reply = async () => ({ ok: true, status: 200, json: async () => ({ revision: 1, snapshot: { shared: true } }) });

test('joining from a workspace URL applies and locally preserves the snapshot without a remote save loop', async () => {
  const token = 'a'.repeat(43); const env = setup(`https://intake.test/?workspace=${token}`);
  await env.controller.init();
  assert.deepEqual(env.applyCalls, [{ shared: true }]); assert.deepEqual(env.localSaves, [{ shared: true }]);
  assert.equal(env.requests.length, 1);
  assert.equal(env.timers.length, 0, 'hidden test documents do not poll, and applying the remote snapshot did not queue a save');
});

test('revision conflict preserves the losing local snapshot for recovery', async () => {
  const env = setup();
  setup.reply = async (_url, options) => options.method === 'POST'
    ? ({ ok: true, status: 201, json: async () => ({ token: 'b'.repeat(43), revision: 1 }) })
    : ({ ok: false, status: 409, json: async () => ({ revision: 2 }) });
  await env.controller.start(); env.controller.notifyLocalChange({ losing: 'copy' });
  await env.timers.at(-1)();
  assert.deepEqual(JSON.parse(env.dom.window.localStorage.getItem(RECOVERY_STORAGE_KEY)).snapshot, { losing: 'copy' });
  assert.equal(env.controller.getState().conflicted, true);
});

test('leaving removes the secret URL but keeps local recovery data', async () => {
  const env = setup(); env.dom.window.localStorage.setItem(RECOVERY_STORAGE_KEY, '{"kept":true}');
  setup.reply = async () => ({ ok: true, status: 201, json: async () => ({ token: 'c'.repeat(43), revision: 1 }) });
  await env.controller.start(); env.controller.leave();
  assert.equal(env.dom.window.location.search, '');
  assert.equal(env.dom.window.localStorage.getItem(RECOVERY_STORAGE_KEY), '{"kept":true}');
  assert.equal(env.controller.getState().token, null);
});
