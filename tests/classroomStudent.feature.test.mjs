/**
 * Feature coverage for Student class admission, resume, recovery, and role lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { APP_STATE_VERSION } from '../src/appStateVersion.js';
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
const WORKSPACE_TOKEN = 's'.repeat(43);
const WORKSPACE_TOKEN_B = 't'.repeat(43);
const LIVE_SESSION_TOKEN = 'l'.repeat(43);
const PARTICIPANT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_A = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_B = '33333333-3333-4333-8333-333333333333';

let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function session() {
  return {
    version: STUDENT_SESSION_VERSION,
    mode: 'live',
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    participant: { id: PARTICIPANT_ID, displayName: 'Alex' },
    studentSessionToken: LIVE_SESSION_TOKEN,
    assignmentRevision: 1,
    assignment: { id: 'workspace-1', kind: 'group', label: 'Team Alpha' },
    joinedAt: '2026-10-01T00:00:00Z'
  };
}

function mount({
  storedSession = null,
  recovery = null,
  connectResult = true,
  fetchImpl,
  url = 'https://intake.test/',
  onClassConnected = () => {},
  onClassDisconnected = () => {},
  onSessionConnected = () => {},
  onSessionDisconnected = () => {},
  fakeTimers = false,
  mobile = false
} = {}) {
  dom = new JSDOM(INDEX_HTML, { url });
  const mediaListeners = new Set();
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: query => ({
      media: query,
      matches: mobile && query === '(max-width: 700px)',
      addEventListener: (_event, listener) => mediaListeners.add(listener),
      removeEventListener: (_event, listener) => mediaListeners.delete(listener)
    })
  });
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.STUDENT, dom.window.localStorage);
  if (storedSession) persistStudentSession(dom.window.localStorage, storedSession);
  if (recovery) dom.window.localStorage.setItem(STUDENT_RECOVERY_STORAGE_KEY, JSON.stringify({ savedAt: 'now', snapshot: recovery }));

  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });

  const calls = { connect: [], leave: [], apply: [], save: [], fetch: [], timers: [] };
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
      return connectResult;
    },
    leave: options => {
      calls.leave.push(options);
      collaborationState.sessionKind = 'local';
      collaborationState.pollingStopped = true;
    }
  };
  const localState = { meta: { version: APP_STATE_VERSION, savedAt: null }, pre: { oneLine: 'My local Intake' } };
  const fetcher = async (...args) => {
    calls.fetch.push(args);
    if (fetchImpl) return fetchImpl(...args);
    if (storedSession?.mode === 'live' && args[0] === '/api/classes/student') {
      return response(200, {
        class: storedSession.class,
        participant: {
          ...storedSession.participant,
          assignmentRevision: storedSession.assignmentRevision
        },
        assignment: storedSession.assignment
      });
    }
    if (storedSession?.mode === 'live' && args[0] === '/api/classes/student/access') {
      return response(200, {
        class: storedSession.class,
        participant: {
          ...storedSession.participant,
          assignmentRevision: storedSession.assignmentRevision
        },
        assignment: storedSession.assignment,
        workspaceToken: WORKSPACE_TOKEN
      });
    }
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
    onClassDisconnected,
    onSessionConnected,
    onSessionDisconnected,
    setTimeoutImpl: fakeTimers
      ? fn => {
          calls.timers.push(fn);
          return calls.timers.length;
        }
      : undefined,
    clearTimeoutImpl: fakeTimers ? () => {} : undefined
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

test('Student join link prefills the human class code, consumes the fragment, and still uses normal admission', async () => {
  const requests = [];
  const env = mount({
    url: 'https://intake.test/#join=K7FMP4Q2',
    fakeTimers: true,
    fetchImpl: async (url, options = {}) => {
      requests.push([url, options]);
      if (url === '/api/classes/admit') {
        const sent = JSON.parse(options.body);
        assert.equal(sent.joinCode, 'K7FMP4Q2');
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: 0 },
          assignment: null,
          studentSessionToken: LIVE_SESSION_TOKEN
        });
      }
      if (url === '/api/classes/student') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: 0 },
          assignment: null
        });
      }
      return response(500, {});
    }
  });
  await settle();

  assert.equal(dom.window.document.body.dataset.experienceRole, EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(dom.window.document.getElementById('studentClassCode').value, 'K7FM-P4Q2');
  assert.equal(dom.window.location.hash, '');
  assert.equal(dom.window.document.activeElement, dom.window.document.getElementById('studentDisplayName'));

  dom.window.document.getElementById('studentDisplayName').value = 'Alex';
  dom.window.document.getElementById('studentClassJoinForm').dispatchEvent(
    new dom.window.Event('submit', { bubbles: true, cancelable: true })
  );
  await settle();

  assert.equal(requests[0][0], '/api/classes/admit');
  assert.equal(JSON.stringify(requests).includes('workspace='), false);
  const stored = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(stored.studentSessionToken, LIVE_SESSION_TOKEN);
  assert.equal(JSON.stringify(stored).includes('K7FMP4Q2'), false);
  env.controller.destroy();
});

test('saved Student session wins over a new join fragment instead of silently replacing class access', async () => {
  const env = mount({
    url: 'https://intake.test/#join=K7FMP4Q2',
    storedSession: session()
  });
  await settle();

  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'connected');
  assert.equal(dom.window.document.getElementById('studentClassCode').value, '');
  assert.equal(dom.window.location.hash, '#join=K7FMP4Q2');
  assert.deepEqual(env.calls.connect, [[WORKSPACE_TOKEN, { displayName: 'Alex', classroom: true }]]);
  env.controller.destroy();
});

test('Student one-code admission persists only the class session and waits without collaboration access', async () => {
  const requests = [];
  const env = mount({
    fakeTimers: true,
    fetchImpl: async (url, options = {}) => {
      requests.push([url, options]);
      if (url === '/api/classes/admit') {
        const sent = JSON.parse(options.body);
        assert.deepEqual(sent, {
          joinCode: 'K7FMP4Q2',
          participantId: PARTICIPANT_ID,
          displayName: 'Alex'
        });
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: {
            id: PARTICIPANT_ID,
            displayName: 'Alex',
            assignmentRevision: 0
          },
          assignment: null,
          studentSessionToken: LIVE_SESSION_TOKEN
        });
      }
      if (url === '/api/classes/student') {
        assert.equal(options.headers.Authorization, `Bearer ${LIVE_SESSION_TOKEN}`);
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: {
            id: PARTICIPANT_ID,
            displayName: 'Alex',
            assignmentRevision: 0
          },
          assignment: null
        });
      }
      return response(500, {});
    }
  });
  await settle();

  assert.equal(await env.controller.join({
    classCode: 'K7FM-P4Q2',
    displayName: 'Alex'
  }), true);

  const stored = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(stored.mode, 'live');
  assert.equal(stored.studentSessionToken, LIVE_SESSION_TOKEN);
  assert.equal(stored.assignmentRevision, 0);
  assert.equal(stored.assignment, null);
  assert.equal('workspaceToken' in stored, false);
  assert.equal(JSON.stringify(stored).includes('K7FM-P4Q2'), false);
  assert.equal(env.calls.connect.length, 0);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'waiting');
  assert.equal(dom.window.document.getElementById('studentClassWaitingPanel').hidden, false);
  assert.equal(dom.window.document.getElementById('studentClassWaitingClass').textContent, 'Problem Solving 101');
  assert.equal(dom.window.document.getElementById('studentClassWaitingIdentity').textContent, 'Alex');
  assert.equal(dom.window.document.querySelector('.wrap').hidden, true);
  assert.equal(requests.some(([url]) => url === '/api/classes/student/access'), false);
  assert.ok(env.calls.timers.length >= 1, 'waiting state schedules own-status polling');
});

test('live Student assignment, reassignment, and unassign rotate workspace authority without merging local state', async () => {
  let assignment = {
    id: WORKSPACE_A,
    kind: 'group',
    label: 'Team Alpha'
  };
  let revision = 1;
  const accessTokens = [WORKSPACE_TOKEN, WORKSPACE_TOKEN_B];
  const connected = [];
  let disconnected = 0;

  const env = mount({
    fakeTimers: true,
    onClassConnected: token => connected.push(token),
    onClassDisconnected: () => { disconnected += 1; },
    fetchImpl: async (url, options = {}) => {
      if (url === '/api/classes/admit') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment,
          studentSessionToken: LIVE_SESSION_TOKEN
        });
      }
      if (url === '/api/classes/student') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment
        });
      }
      if (url === '/api/classes/student/access') {
        if (!assignment) {
          return response(409, {
            status: 'waiting',
            class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
            participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
            assignment: null
          });
        }
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment,
          workspaceToken: accessTokens.shift()
        });
      }
      return response(500, {});
    }
  });
  await settle();

  assert.equal(await env.controller.join({ classCode: 'K7FM-P4Q2', displayName: 'Alex' }), true);
  assert.deepEqual(env.calls.connect.at(-1), [WORKSPACE_TOKEN, { displayName: 'Alex', classroom: true }]);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'connected');
  assert.equal(dom.window.document.getElementById('studentClassWorkspace').textContent, 'Team Alpha');

  assignment = { id: WORKSPACE_B, kind: 'group', label: 'Team Beta' };
  revision = 2;
  assert.equal(await env.controller.refreshStatus(), true);
  assert.deepEqual(env.calls.leave.at(-1), { silent: true });
  assert.deepEqual(env.calls.connect.at(-1), [WORKSPACE_TOKEN_B, { displayName: 'Alex', classroom: true }]);
  assert.equal(dom.window.document.getElementById('studentClassWorkspace').textContent, 'Team Beta');
  assert.deepEqual(connected, [WORKSPACE_TOKEN, WORKSPACE_TOKEN_B]);
  assert.ok(disconnected >= 1, 'old classroom integration is disconnected before destination access');

  const storedAfterMove = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(storedAfterMove.assignment.id, WORKSPACE_B);
  assert.equal(storedAfterMove.assignmentRevision, 2);
  assert.equal('workspaceToken' in storedAfterMove, false);
  assert.equal(JSON.stringify(storedAfterMove).includes(WORKSPACE_TOKEN), false);
  assert.equal(JSON.stringify(storedAfterMove).includes(WORKSPACE_TOKEN_B), false);

  assignment = null;
  revision = 3;
  assert.equal(await env.controller.refreshStatus(), true);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'waiting');
  assert.equal(env.controller.getState().activeWorkspaceToken, '');
  assert.equal(dom.window.document.querySelector('.wrap').hidden, true);
  const storedWaiting = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(storedWaiting.assignment, null);
  assert.equal(storedWaiting.assignmentRevision, 3);
});

test('live Student session lifecycle is stable across assignment changes and disconnects on role exit', async () => {
  let assignment = {
    id: WORKSPACE_A,
    kind: 'group',
    label: 'Team Alpha'
  };
  let revision = 1;
  const sessionConnections = [];
  let sessionDisconnects = 0;
  const accessTokens = [WORKSPACE_TOKEN, WORKSPACE_TOKEN_B];

  const env = mount({
    fakeTimers: true,
    onSessionConnected: token => sessionConnections.push(token),
    onSessionDisconnected: () => { sessionDisconnects += 1; },
    fetchImpl: async url => {
      if (url === '/api/classes/admit') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment,
          studentSessionToken: LIVE_SESSION_TOKEN
        });
      }
      if (url === '/api/classes/student') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment
        });
      }
      if (url === '/api/classes/student/access') {
        return response(200, {
          class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
          participant: { id: PARTICIPANT_ID, displayName: 'Alex', assignmentRevision: revision },
          assignment,
          workspaceToken: accessTokens.shift()
        });
      }
      return response(500, {});
    }
  });
  await settle();

  assert.equal(await env.controller.join({ classCode: 'K7FM-P4Q2', displayName: 'Alex' }), true);
  assert.deepEqual(sessionConnections, [LIVE_SESSION_TOKEN]);
  assert.equal(sessionDisconnects, 0);

  assignment = { id: WORKSPACE_B, kind: 'group', label: 'Team Beta' };
  revision = 2;
  assert.equal(await env.controller.refreshStatus(), true);
  assert.deepEqual(sessionConnections, [LIVE_SESSION_TOKEN], 'workspace reassignment does not reconnect the class-session capability');
  assert.equal(sessionDisconnects, 0, 'workspace reassignment does not disconnect the class-session capability');

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();
  assert.equal(sessionDisconnects, 1);
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), 'role exit keeps the Student resume envelope');
});

test('Student class context defaults compact on mobile and expands without changing class persistence', async () => {
  const env = mount({ storedSession: session(), mobile: true });
  await settle();

  const panel = dom.window.document.getElementById('studentExperienceNotice');
  const toggle = dom.window.document.getElementById('studentClassContextToggle');
  const before = dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY);

  assert.equal(panel.classList.contains('is-collapsed'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.textContent, 'Open class');
  assert.equal(dom.window.document.getElementById('studentClassCompactSummary').textContent, 'Team Alpha · Alex');
  assert.equal(env.controller.getState().contextExpanded, false);

  toggle.click();

  assert.equal(panel.classList.contains('is-collapsed'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, 'Collapse class');
  assert.equal(env.controller.getState().contextExpanded, true);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), before, 'presentation toggle does not rewrite Student class authority');

  env.controller.destroy();
});

test('Student resume revalidates the class session and reacquires workspace authority', async () => {
  const env = mount({ storedSession: session() });
  await settle();

  assert.equal(env.calls.fetch.some(([url]) => url === '/api/classes/student'), true);
  assert.equal(env.calls.fetch.some(([url]) => url === '/api/classes/student/access'), true);
  assert.deepEqual(env.calls.connect, [[WORKSPACE_TOKEN, { displayName: 'Alex', classroom: true }]]);
  const stored = JSON.parse(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(stored.studentSessionToken, LIVE_SESSION_TOKEN);
  assert.equal('workspaceToken' in stored, false);
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'connected');
});

test('expired or revoked Student class-session resume clears authority and restores the pre-class local Intake', async () => {
  const recovery = { meta: { version: APP_STATE_VERSION, savedAt: null }, pre: { oneLine: 'Before class' } };
  const env = mount({
    storedSession: session(),
    recovery,
    fetchImpl: async url => (
      url === '/api/classes/student'
        ? response(404, { error: 'Class session not found.' })
        : response(500, {})
    )
  });
  await settle();

  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.localStorage.getItem(STUDENT_RECOVERY_STORAGE_KEY), null);
  assert.deepEqual(env.calls.apply, [recovery]);
  assert.deepEqual(env.calls.save, [recovery]);
  assert.equal(env.calls.connect.length, 0, 'revoked class-session authority never reaches collaboration');
  assert.equal(dom.window.document.body.dataset.studentClassStatus, 'disconnected');
  assert.match(dom.window.document.getElementById('studentClassJoinError').textContent, /no longer available/i);
});

test('Leave class clears resume capability and restores the prior local Intake', async () => {
  const recovery = { meta: { version: APP_STATE_VERSION, savedAt: null }, pre: { oneLine: 'Before class' } };
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
    collect: () => ({ meta: { version: APP_STATE_VERSION, savedAt: null }, pre: { oneLine: 'Local' } }),
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
  const recovery = { meta: { version: APP_STATE_VERSION, savedAt: null }, pre: { oneLine: 'Before class' } };
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
