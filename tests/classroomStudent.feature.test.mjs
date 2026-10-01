/**
 * Feature coverage for Student class admission, resume, recovery, and role lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  STUDENT_RECOVERY_STORAGE_KEY,
  STUDENT_SESSION_STORAGE_KEY,
  STUDENT_SESSION_VERSION,
  createStudentClassroomController,
  persistStudentSession
} from '../src/classroomStudent.js';
import {
  applyExperienceRole,
  initExperienceRoleController,
  persistExperienceRolePreference
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const JOIN_TOKEN = 'c'.repeat(43);
const ASSIGNMENT_TOKEN = 'x'.repeat(43);
const WORKSPACE_TOKEN = 's'.repeat(43);
const PARTICIPANT_ID = '11111111-1111-4111-8111-111111111111';

let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function session() {
  return {
    version: STUDENT_SESSION_VERSION,
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    workspace: { id: 'workspace-1', kind: 'group', label: 'Team Alpha', expiresAt: '2099-01-01T00:00:00Z' },
    participant: { id: PARTICIPANT_ID, displayName: 'Alex' },
    workspaceToken: WORKSPACE_TOKEN,
    joinedAt: '2026-10-01T00:00:00Z'
  };
}

function mount({
  storedSession = null,
  recovery = null,
  connectResult = true,
  terminal = false,
  fetchImpl,
  onClassConnected = () => {},
  onClassDisconnected = () => {}
} = {}) {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STUDENT, dom.window.localStorage);
  if (storedSession) persistStudentSession(dom.window.localStorage, storedSession);
  if (recovery) dom.window.localStorage.setItem(STUDENT_RECOVERY_STORAGE_KEY, JSON.stringify({ savedAt: 'now', snapshot: recovery }));

  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });

  const calls = { connect: [], leave: [], apply: [], save: [], fetch: [] };
  const collaborationState = {
    profile: { participantId: PARTICIPANT_ID, displayName: '' },
    sessionKind: 'local',
    pollingStopped: false,
    terminalStatus: null
  };
  const collaboration = {
    getState: () => collaborationState,
    connect: async (token, options) => {
      calls.connect.push([token, options]);
      if (connectResult) collaborationState.sessionKind = 'classroom';
      if (terminal) {
        collaborationState.pollingStopped = true;
        collaborationState.terminalStatus = 'Missing or expired session';
      }
      return connectResult;
    },
    leave: options => {
      calls.leave.push(options);
      collaborationState.sessionKind = 'local';
      collaborationState.pollingStopped = true;
    }
  };
  const localState = { pre: { oneLine: 'My local Intake' } };
  const fetcher = async (...args) => {
    calls.fetch.push(args);
    if (fetchImpl) return fetchImpl(...args);
    return response(500, {});
  };
  const controller = createStudentClassroomController({
    collaboration,
    collect: () => localState,
    apply: value => calls.apply.push(value),
    saveLocal: value => calls.save.push(value),
    fetchImpl: fetcher,
    storage: dom.window.localStorage,
    documentRef: dom.window.document,
    windowRef: dom.window,
    now: () => Date.parse('2026-10-01T00:00:00Z'),
    toast: () => {},
    onClassConnected,
    onClassDisconnected
  });
  controller.init();
  return { controller, calls, collaborationState };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('Student join uses one-time class and assignment codes then attaches the issued workspace capability', async () => {
  const env = mount({
    fetchImpl: async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, `Bearer ${JOIN_TOKEN}`);
      assert.equal(sent.assignmentToken, ASSIGNMENT_TOKEN);
      assert.equal(sent.participantId, PARTICIPANT_ID);
      assert.equal(sent.displayName, 'Alex');
      return response(200, {
        class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
        workspace: { id: 'workspace-1', kind: 'group', label: 'Team Alpha', expiresAt: '2099-01-01T00:00:00Z' },
        workspaceToken: WORKSPACE_TOKEN,
        self: { id: PARTICIPANT_ID, displayName: 'Alex' },
        participants: [{ id: PARTICIPANT_ID, displayName: 'Alex' }]
      });
    }
  });
  await settle();
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'disconnected');

  dom.window.document.getElementById('studentDisplayName').value = 'Alex';
  dom.window.document.getElementById('studentClassCode').value = JOIN_TOKEN;
  dom.window.document.getElementById('studentAssignmentCode').value = ASSIGNMENT_TOKEN;
  dom.window.document.getElementById('studentClassJoinForm').dispatchEvent(
    new dom.window.Event('submit', { bubbles: true, cancelable: true })
  );
  await settle();

  assert.equal(env.calls.fetch.length, 1, 'Student admission never enumerates workspaces');
  assert.deepEqual(env.calls.connect, [[WORKSPACE_TOKEN, { displayName: 'Alex', classroom: true }]]);
  const stored = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(stored.workspaceToken, WORKSPACE_TOKEN);
  assert.equal('studentJoinToken' in stored, false);
  assert.equal('assignmentToken' in stored, false);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY).includes(JOIN_TOKEN), false);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY).includes(ASSIGNMENT_TOKEN), false);
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(STUDENT_RECOVERY_STORAGE_KEY)).snapshot, { pre: { oneLine: 'My local Intake' } });
  assert.equal(dom.window.document.getElementById('studentClassCode').value, '');
  assert.equal(dom.window.document.getElementById('studentAssignmentCode').value, '');
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'connected');
  assert.equal(dom.window.document.querySelector('.wrap').hidden, false);
  assert.equal(dom.window.document.getElementById('studentClassContextTitle').textContent, 'Problem Solving 101');
  assert.equal(dom.window.document.getElementById('studentClassWorkspace').textContent, 'Team Alpha');
  assert.equal(dom.window.document.getElementById('studentClassIdentity').textContent, 'Alex');
});

test('Student resume reconnects from workspace capability without replaying join or assignment codes', async () => {
  const env = mount({ storedSession: session() });
  await settle();

  assert.equal(env.calls.fetch.length, 0);
  assert.deepEqual(env.calls.connect, [[WORKSPACE_TOKEN, { displayName: 'Alex', classroom: true }]]);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'connected');
});

test('expired or revoked Student resume clears the capability and restores the pre-class local Intake', async () => {
  const recovery = { pre: { oneLine: 'Before class' } };
  const env = mount({ storedSession: session(), recovery, connectResult: false, terminal: true });
  await settle();

  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.localStorage.getItem(STUDENT_RECOVERY_STORAGE_KEY), null);
  assert.deepEqual(env.calls.apply, [recovery]);
  assert.deepEqual(env.calls.save, [recovery]);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'disconnected');
  assert.match(dom.window.document.getElementById('studentClassJoinError').textContent, /no longer available/i);
});

test('Leave class clears resume capability and restores the prior local Intake', async () => {
  const recovery = { pre: { oneLine: 'Before class' } };
  const env = mount({ storedSession: session(), recovery });
  await settle();

  assert.equal(env.controller.leaveClass(), true);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.localStorage.getItem(STUDENT_RECOVERY_STORAGE_KEY), null);
  assert.deepEqual(env.calls.leave.at(-1), { silent: true });
  assert.deepEqual(env.calls.apply.at(-1), recovery);
  assert.deepEqual(env.calls.save.at(-1), recovery);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'disconnected');
});

test('switching away from Student pauses classroom sync but keeps the resume envelope', async () => {
  const env = mount({ storedSession: session() });
  await settle();

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();

  assert.deepEqual(env.calls.leave.at(-1), { silent: true });
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), 'resume capability is retained');
  assert.equal(dom.window.document.body.dataset.experienceRole, EXPERIENCE_ROLE_IDS.STANDALONE);
});


test('entering Student disconnects an existing Standalone collaboration before showing class entry', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STANDALONE, dom.window.localStorage);
  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });

  const calls = [];
  const state = {
    profile: { participantId: PARTICIPANT_ID, displayName: 'Alex' },
    sessionKind: 'standalone',
    token: 'z'.repeat(43)
  };
  const controller = createStudentClassroomController({
    collaboration: {
      getState: () => state,
      leave: options => {
        calls.push(options);
        state.token = null;
        state.sessionKind = 'local';
      }
    },
    collect: () => ({ pre: { oneLine: 'Local' } }),
    apply: () => {},
    saveLocal: () => {},
    fetchImpl: async () => response(500, {}),
    storage: dom.window.localStorage,
    documentRef: dom.window.document,
    windowRef: dom.window,
    toast: () => {}
  });
  controller.init();

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STUDENT);
  await settle();

  assert.deepEqual(calls, [{ silent: true }]);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'disconnected');
  assert.equal(dom.window.document.querySelector('.wrap').hidden, true);
});


test('switching away from Student restores the pre-class local Intake without clearing resume', async () => {
  const recovery = { pre: { oneLine: 'Before class' } };
  const env = mount({ storedSession: session(), recovery });
  await settle();

  applyExperienceRole(EXPERIENCE_ROLE_IDS.INSTRUCTOR);
  await settle();

  assert.deepEqual(env.calls.leave.at(-1), { silent: true });
  assert.deepEqual(env.calls.apply.at(-1), recovery);
  assert.deepEqual(env.calls.save.at(-1), recovery);
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), 'Student resume remains available');
  assert.ok(dom.window.localStorage.getItem(STUDENT_RECOVERY_STORAGE_KEY), 'pre-class recovery remains for future role switches');
});


test('Student classroom lifecycle exposes coaching connect/disconnect hooks without persisting feedback', async () => {
  const connected = [];
  let disconnected = 0;
  const env = mount({
    storedSession: session(),
    onClassConnected: token => connected.push(token),
    onClassDisconnected: () => { disconnected += 1; }
  });
  await settle();

  assert.deepEqual(connected, [WORKSPACE_TOKEN]);

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();

  assert.ok(disconnected >= 1);
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), 'Student class resume remains independent of coaching UI');
  assert.equal('coaching' in env.controller.getState(), false);
});
