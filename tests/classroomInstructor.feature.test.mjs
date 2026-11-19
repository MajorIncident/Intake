/**
 * Feature coverage for Instructor class entry, roster navigation, read-only projection, and lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_SESSION_STORAGE_KEY,
  INSTRUCTOR_SESSION_VERSION,
  createInstructorClassroomController,
  persistInstructorSession
} from '../src/classroomInstructor.js';
import {
  applyExperienceRole,
  initExperienceRoleController,
  persistExperienceRolePreference
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKEN = 'i'.repeat(43);
const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function rosterBody() {
  return {
    class: {
      id: 'class-1',
      title: 'Problem Solving 101',
      joinCode: 'K7FMP4Q2',
      expiresAt: '2099-01-01T00:00:00Z'
    },
    workspaces: [
      { id: W1, kind: 'individual', label: 'Alex', participantCount: 1, activeParticipantCount: 1, editingParticipantCount: 0 },
      { id: W2, kind: 'group', label: 'Team Beta', participantCount: 3, activeParticipantCount: 2, editingParticipantCount: 1 }
    ]
  };
}

function participantBody(overrides = {}) {
  return {
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    participants: [
      {
        id: P1,
        displayName: 'Alex',
        assignmentRevision: 1,
        joinedAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        assignment: { id: W1, kind: 'individual', label: 'Alex' }
      },
      {
        id: P2,
        displayName: 'Blair',
        assignmentRevision: 0,
        joinedAt: '2026-10-01T00:01:00Z',
        updatedAt: '2026-10-01T00:01:00Z',
        assignment: null
      }
    ],
    ...overrides
  };
}

function observeBody(id, statement) {
  const workspace = rosterBody().workspaces.find(item => item.id === id);
  return {
    class: rosterBody().class,
    workspace: {
      id,
      kind: workspace.kind,
      label: workspace.label,
      teamName: workspace.label,
      revision: statement === 'First' ? 1 : 2,
      expiresAt: '2099-01-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z'
    },
    participants: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Alex', activityState: 'editing' }],
    snapshot: { pre: { oneLine: statement } }
  };
}

function setup(fetchImpl, {
  onObservation = () => {},
  onObservationEnd = () => {},
  onClassConnected = () => {},
  onClassDisconnected = () => {},
  mobile = false,
  savedSession = true,
  confirmImpl = undefined,
  onRoster = () => {}
} = {}) {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  if (mobile) {
    dom.window.matchMedia = query => ({
      matches: query === '(max-width: 700px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    });
  }
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.INSTRUCTOR, dom.window.localStorage);
  if (savedSession) {
    persistInstructorSession(dom.window.localStorage, {
      version: INSTRUCTOR_SESSION_VERSION,
      instructorToken: TOKEN,
      joinCode: 'K7FM-P4Q2',
      class: {
        id: 'class-1',
        title: 'Problem Solving 101',
        expiresAt: '2099-01-01T00:00:00Z'
      },
      selectedWorkspaceId: W1,
      openedAt: '2026-10-01T00:00:00Z'
    });
  }
  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });
  applyExperienceRole(EXPERIENCE_ROLE_IDS.INSTRUCTOR, { persist: false, announce: false });

  dom.window.document.getElementById('oneLine').value = 'Local before observation';
  dom.window.localStorage.setItem('sentinel', 'keep-me');

  const calls = { apply: [], leave: [], timers: [], toasts: [] };
  const collaborationState = { token: null };
  const collaboration = {
    getState: () => collaborationState,
    leave: options => {
      calls.leave.push(options);
      collaborationState.token = null;
    }
  };
  const apply = snapshot => {
    calls.apply.push(snapshot);
    dom.window.document.getElementById('oneLine').value = snapshot?.pre?.oneLine || '';
    dom.window.localStorage.setItem('sentinel', 'mutated-by-apply');
  };
  const controller = createInstructorClassroomController({
    collaboration,
    collect: () => ({ pre: { oneLine: 'Local before observation' } }),
    apply,
    fetchImpl,
    storage: dom.window.localStorage,
    documentRef: dom.window.document,
    windowRef: dom.window,
    now: () => Date.parse('2026-10-01T00:00:00Z'),
    toast: message => calls.toasts.push(message),
    onObservation,
    onObservationEnd,
    onClassConnected,
    onClassDisconnected,
    onRoster,
    ...(confirmImpl ? { confirmImpl } : {}),
    setTimeoutImpl: fn => {
      calls.timers.push(fn);
      return calls.timers.length;
    },
    clearTimeoutImpl: () => {}
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

test('Instructor class rail defaults collapsed on mobile and remains explicitly expandable', async () => {
  const env = setup(async (url) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, { mobile: true });

  await settle();

  const dashboard = dom.window.document.getElementById('instructorClassDashboard');
  const toggle = dom.window.document.getElementById('instructorClassPanelToggle');
  assert.equal(env.controller.getState().railExpanded, false);
  assert.equal(dashboard.classList.contains('is-collapsed'), true);
  assert.equal(dom.window.document.body.classList.contains('instructor-rail-collapsed'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.textContent, 'Open class panel');

  toggle.click();
  assert.equal(env.controller.getState().railExpanded, true);
  assert.equal(dashboard.classList.contains('is-collapsed'), false);
  assert.equal(dom.window.document.body.classList.contains('instructor-rail-collapsed'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, 'Collapse class panel');

  toggle.click();
  assert.equal(env.controller.getState().railExpanded, false);
  assert.equal(dashboard.classList.contains('is-collapsed'), true);
  env.controller.destroy();
});

test('Instructor Share class copies a fragment-only join URL without forwarding query authority', async () => {
  const env = setup(async (url) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  const copied = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async value => copied.push(value) }
  });

  await settle();
  dom.window.history.replaceState(null, '', '/?workspace=must-not-leak');

  assert.equal(await env.controller.shareClass(), true);
  assert.deepEqual(copied, ['https://intake.test/#join=K7FMP4Q2']);
  assert.equal(copied[0].includes(TOKEN), false);
  assert.equal(copied[0].includes('workspace='), false);
  assert.equal(env.calls.toasts.at(-1), 'Class join link copied.');
  assert.equal(dom.window.document.getElementById('instructorShareClassBtn').disabled, false);

  env.controller.destroy();
});

test('Instructor Share class prefers native Web Share with the same safe human-code URL', async () => {
  const env = setup(async (url) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  const shares = [];
  const copied = [];
  Object.defineProperty(dom.window.navigator, 'share', {
    configurable: true,
    value: async payload => shares.push(payload)
  });
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async value => copied.push(value) }
  });

  await settle();
  dom.window.history.replaceState(null, '', '/?workspace=must-not-leak');

  assert.equal(await env.controller.shareClass(), true);
  assert.equal(shares.length, 1);
  assert.equal(shares[0].title, 'Join Problem Solving 101');
  assert.equal(shares[0].text, 'Join this KT Intake class with code K7FM-P4Q2.');
  assert.equal(shares[0].url, 'https://intake.test/#join=K7FMP4Q2');
  assert.equal(shares[0].url.includes(TOKEN), false);
  assert.equal(shares[0].url.includes('workspace='), false);
  assert.deepEqual(copied, []);
  assert.equal(env.calls.toasts.at(-1), 'Class join link shared.');

  env.controller.destroy();
});

test('Instructor QR panel renders the safe join URL locally without exposing it in DOM attributes', async () => {
  const env = setup(async (url) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });

  await settle();
  dom.window.history.replaceState(null, '', '/?workspace=must-not-leak');

  assert.equal(env.controller.toggleJoinQr(), true);
  const panel = dom.window.document.getElementById('instructorJoinQrPanel');
  const svg = dom.window.document.getElementById('instructorJoinQrSvg');
  const toggle = dom.window.document.getElementById('instructorShowJoinQrBtn');

  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, 'Hide QR');
  assert.equal(dom.window.document.getElementById('instructorJoinQrCode').textContent, 'K7FM-P4Q2');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.match(svg.getAttribute('aria-label'), /K7FM-P4Q2/u);
  assert.equal(svg.querySelectorAll('rect').length, 1);
  assert.equal(svg.querySelectorAll('path').length, 1);
  assert.equal(svg.outerHTML.includes('https://'), false);
  assert.equal(svg.outerHTML.includes('workspace='), false);
  assert.equal(svg.outerHTML.includes(TOKEN), false);

  assert.equal(env.controller.toggleJoinQr(), false);
  assert.equal(panel.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.textContent, 'Show QR');

  env.controller.destroy();
});

test('Instructor resumes one saved class, renders roster, and observes through the GET-only class endpoint', async () => {
  const requests = [];
  const env = setup(async (url, options) => {
    requests.push([url, options]);
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });

  await settle();

  const stored = JSON.parse(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY));
  assert.equal(stored.instructorToken, TOKEN);
  assert.equal(stored.class.title, 'Problem Solving 101');
  assert.equal(stored.selectedWorkspaceId, W1);
  assert.equal(dom.window.document.body.classList.contains('instructor-class-connected'), true);
  assert.equal(dom.window.document.querySelectorAll('.instructor-workspace-item').length, 2);
  assert.equal(dom.window.document.querySelectorAll('.instructor-participant-row').length, 2);
  assert.equal(dom.window.document.getElementById('instructorParticipantSummary').textContent, '2 students · 1 waiting');
  assert.equal(dom.window.document.getElementById('instructorJoinCode').textContent, 'K7FM-P4Q2');
  assert.equal(dom.window.document.getElementById('oneLine').value, 'First');
  assert.equal(dom.window.document.getElementById('oneLine').readOnly, true);
  assert.equal(dom.window.document.querySelector('.wrap').hasAttribute('aria-readonly'), false);
  assert.equal(dom.window.document.getElementById('addCauseBtn').disabled, true);
  assert.equal(dom.window.localStorage.getItem('sentinel'), 'keep-me');
  assert.equal(requests.some(([url]) => String(url).includes('/api/workspaces/session')), false);
  assert.equal(requests.some(([url]) => String(url).includes('/api/workspaces/presence')), false);
  assert.equal(dom.window.document.getElementById('instructorObservedWorkspace').textContent, 'Alex');
});

test('Instructor starts a live class, creates a team, and assigns a waiting Student without exposing assignment secrets', async () => {
  const workspaces = [];
  const participants = [{
    id: P2,
    displayName: 'Blair',
    assignmentRevision: 0,
    joinedAt: '2026-10-01T00:01:00Z',
    updatedAt: '2026-10-01T00:01:00Z',
    assignment: null
  }];
  const requests = [];

  const env = setup(async (url, options = {}) => {
    requests.push([url, options]);
    if (url === '/api/classes' && options.method === 'POST') {
      return response(201, {
        class: {
          id: 'class-1',
          title: 'Live PSDM Class',
          expiresAt: '2099-01-01T00:00:00Z'
        },
        instructorToken: TOKEN,
        joinCode: 'K7FM-P4Q2'
      });
    }
    if (url === '/api/classes/workspaces' && options.method === 'GET') {
      return response(200, {
        class: {
          id: 'class-1',
          title: 'Live PSDM Class',
          joinCode: 'K7FMP4Q2',
          expiresAt: '2099-01-01T00:00:00Z'
        },
        workspaces
      });
    }
    if (url === '/api/classes/participants' && options.method === 'GET') {
      return response(200, {
        class: { id: 'class-1', title: 'Live PSDM Class', expiresAt: '2099-01-01T00:00:00Z' },
        participants
      });
    }
    if (url === '/api/classes/workspaces' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      const workspace = {
        id: W1,
        kind: body.kind,
        label: body.label,
        participantCount: 0,
        activeParticipantCount: 0,
        editingParticipantCount: 0
      };
      workspaces.push(workspace);
      return response(201, { workspace });
    }
    if (url === '/api/classes/participants' && options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      participants[0] = {
        ...participants[0],
        assignmentRevision: 1,
        assignment: { id: W1, kind: 'group', label: 'Team Alpha' }
      };
      return response(200, {
        class: { id: 'class-1', title: 'Live PSDM Class', expiresAt: '2099-01-01T00:00:00Z' },
        participant: participants[0],
        assignment: participants[0].assignment,
        changed: true
      });
    }
    if (String(url).includes('/api/classes/observe')) {
      return response(200, {
        class: { id: 'class-1', title: 'Live PSDM Class', expiresAt: '2099-01-01T00:00:00Z' },
        workspace: {
          id: W1,
          kind: 'group',
          label: 'Team Alpha',
          revision: 1,
          expiresAt: '2099-01-01T00:00:00Z'
        },
        participants: [],
        snapshot: {}
      });
    }
    return response(404, {});
  }, { savedSession: false });

  assert.equal(await env.controller.startClass('Live PSDM Class', ' kepnertregoe '), true);
  const classCreateRequest = requests.find(([url, options]) => url === '/api/classes' && options.method === 'POST');
  assert.deepEqual(JSON.parse(classCreateRequest[1].body), { title: 'Live PSDM Class', classPassword: 'kepnertregoe' });
  assert.equal(dom.window.document.getElementById('instructorClassTitle').textContent, 'Live PSDM Class');
  assert.equal(dom.window.document.getElementById('instructorJoinCode').textContent, 'K7FM-P4Q2');
  assert.equal(dom.window.document.getElementById('instructorParticipantSummary').textContent, '1 student · 1 waiting');

  const stored = JSON.parse(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY));
  assert.equal(stored.instructorToken, TOKEN);
  assert.equal(stored.joinCode, 'K7FM-P4Q2');
  assert.equal(JSON.stringify(stored).includes('studentJoinToken'), false);
  assert.equal(JSON.stringify(stored).toLowerCase().includes('kepnertregoe'), false, 'class password is never persisted');

  assert.equal(await env.controller.createWorkspace('group', 'Team Alpha'), true);
  assert.equal(dom.window.document.querySelectorAll('.instructor-workspace-item').length, 1);
  assert.equal(dom.window.document.getElementById('instructorWorkspaceLabel').value, '');

  assert.equal(await env.controller.assignParticipant(P2, W1), true);
  const assignmentSelect = dom.window.document.querySelector('[data-participant-id="' + P2 + '"] select');
  assert.equal(assignmentSelect.value, W1);
  assert.equal(dom.window.document.getElementById('instructorParticipantSummary').textContent, '1 student · 0 waiting');

  const createRequest = requests.find(([url, options]) => (
    url === '/api/classes/workspaces' && options.method === 'POST'
  ));
  assert.deepEqual(JSON.parse(createRequest[1].body), {
    kind: 'group',
    label: 'Team Alpha',
    snapshot: {}
  });

  const assignRequest = requests.find(([url, options]) => (
    url === '/api/classes/participants' && options.method === 'PATCH'
  ));
  assert.deepEqual(JSON.parse(assignRequest[1].body), {
    participantId: P2,
    workspaceId: W1
  });

  assert.equal(
    JSON.stringify(requests).includes('assignmentToken'),
    false,
    'Instructor client never persists or reuses the legacy assignment secret'
  );
});

test('rapid Instructor workspace switching aborts/stales the previous observer and keeps the newest snapshot', async () => {
  let resolveFirst;
  let firstSignal = null;
  const env = setup(async (url, options) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) {
      firstSignal = options.signal;
      return new Promise(resolve => { resolveFirst = resolve; });
    }
    if (url.includes(W2)) return response(200, observeBody(W2, 'Second'));
    return response(404, {});
  });

  await settle();
  await env.controller.selectWorkspace(W2);

  assert.equal(firstSignal?.aborted, true);
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Second');
  assert.equal(env.controller.getState().selectedWorkspaceId, W2);

  resolveFirst(response(200, observeBody(W1, 'First')));
  await settle();
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Second');
});

test('Instructor search and kind filter narrow the roster without changing authorization', async () => {
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  await settle();

  const search = dom.window.document.getElementById('instructorWorkspaceSearch');
  search.value = 'beta';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(dom.window.document.querySelectorAll('.instructor-workspace-item').length, 1);
  assert.equal(dom.window.document.querySelector('.instructor-workspace-item strong').textContent, 'Team Beta');

  search.value = '';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const filter = dom.window.document.getElementById('instructorWorkspaceFilter');
  filter.value = 'individual';
  filter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(dom.window.document.querySelectorAll('.instructor-workspace-item').length, 1);
  assert.equal(dom.window.document.querySelector('.instructor-workspace-item strong').textContent, 'Alex');
});

test('switching away from Instructor restores local Intake and keeps same-device class resume', async () => {
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  await settle();

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();

  assert.equal(dom.window.document.getElementById('oneLine').value, 'Local before observation');
  assert.equal(dom.window.document.getElementById('oneLine').readOnly, false);
  assert.ok(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY));
  assert.equal(dom.window.document.body.classList.contains('instructor-class-connected'), false);
});

test('Leave class clears Instructor resume and restores local Intake', async () => {
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  await settle();

  assert.equal(env.controller.leaveClass(), true);
  assert.equal(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Local before observation');
  assert.equal(dom.window.document.getElementById('oneLine').readOnly, false);
  assert.equal(dom.window.document.querySelector('.wrap').hidden, true);
});

test('revoked Instructor access clears saved resume instead of falling back to editable workspace access', async () => {
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(404, { error: 'Class not found.' });
    return response(500, {});
  });

  await settle();
  assert.equal(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
  assert.match(dom.window.document.getElementById('instructorClassError').textContent, /not accepted|expired/i);
});


test('Instructor observer lifecycle emits coaching integration hooks without granting edit access', async () => {
  const observed = [];
  let ended = 0;
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, {
    onObservation: context => observed.push(context),
    onObservationEnd: () => { ended += 1; }
  });

  await settle();

  assert.deepEqual(observed.at(-1), {
    instructorToken: TOKEN,
    workspaceId: W1,
    workspaceRevision: 1
  });

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();
  assert.ok(ended >= 1, 'leaving Instructor ends the coaching observation context');
});


test('Instructor class lifecycle exposes protected-resource capability hooks', async () => {
  const connected = [];
  let disconnected = 0;
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, {
    onClassConnected: token => connected.push(token),
    onClassDisconnected: () => { disconnected += 1; }
  });

  await settle();
  assert.deepEqual(connected, [TOKEN]);

  applyExperienceRole(EXPERIENCE_ROLE_IDS.STANDALONE);
  await settle();
  assert.ok(disconnected >= 2, 'activation reset and role pause both clear protected-resource context');
});


test('Instructor checkpoint view pauses live observation and returns explicitly to current live Intake', async () => {
  let observeReads = 0;
  const observed = [];
  let ended = 0;
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) {
      observeReads += 1;
      return response(200, observeReads === 1
        ? observeBody(W1, 'First')
        : {
            ...observeBody(W1, 'Second'),
            workspace: {
              ...observeBody(W1, 'Second').workspace,
              revision: 2
            }
          });
    }
    return response(404, {});
  }, {
    onObservation: context => observed.push(context),
    onObservationEnd: () => { ended += 1; }
  });

  await settle();
  assert.equal(dom.window.document.getElementById('oneLine').value, 'First');
  assert.equal(dom.window.document.getElementById('instructorObservationLiveBtn').hidden, true);

  const endedBeforeCheckpoint = ended;
  assert.equal(await env.controller.inspectCheckpoint({
    workspace: { id: W1, kind: 'individual', label: 'Alex' },
    checkpoint: {
      stageId: 'stage-1',
      workspaceRevision: 1,
      capturedAt: '2026-10-01T00:05:00Z',
      snapshot: { pre: { oneLine: 'Checkpoint before debrief' } }
    }
  }), true);

  assert.equal(dom.window.document.getElementById('oneLine').value, 'Checkpoint before debrief');
  assert.equal(dom.window.document.getElementById('oneLine').readOnly, true);
  assert.equal(dom.window.document.body.dataset.instructorClassStatus, 'observing-checkpoint');
  assert.equal(
    dom.window.document.getElementById('instructorObservedRevision').textContent,
    'Checkpoint at debrief start · Revision 1'
  );
  assert.equal(
    dom.window.document.getElementById('instructorObserverStatus').textContent,
    'Immutable checkpoint · live updates paused'
  );
  assert.equal(dom.window.document.getElementById('instructorObservationLiveBtn').hidden, false);
  assert.equal(dom.window.document.getElementById('instructorObservationLiveBtn').textContent, 'View current live Intake');
  assert.equal(ended, endedBeforeCheckpoint + 1, 'checkpoint inspection suspends live coaching context');
  assert.deepEqual(env.controller.getState().checkpointView, {
    workspaceId: W1,
    workspaceLabel: 'Alex',
    stageId: 'stage-1',
    workspaceRevision: 1,
    capturedAt: '2026-10-01T00:05:00Z'
  });
  assert.equal(JSON.stringify(env.controller.getState()).includes('Checkpoint before debrief'), false);
  assert.equal(dom.window.localStorage.getItem('sentinel'), 'keep-me');

  assert.equal(await env.controller.returnToLiveObservation(), true);
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Second');
  assert.equal(dom.window.document.body.dataset.instructorClassStatus, 'observing');
  assert.equal(dom.window.document.getElementById('instructorObservedRevision').textContent, 'Revision 2');
  assert.equal(dom.window.document.getElementById('instructorObserverStatus').textContent, 'Live read-only view');
  assert.equal(dom.window.document.getElementById('instructorObservationLiveBtn').hidden, true);
  assert.equal(env.controller.getState().checkpointView, null);
  assert.equal(observed.at(-1).workspaceRevision, 2);

  env.controller.destroy();
});


test('Instructor observer keeps debrief comparison controls interactive while Intake remains read-only', async () => {
  const env = setup(async (url) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });

  await settle();

  const oneLine = dom.window.document.getElementById('oneLine');
  const target = dom.window.document.getElementById('instructorDebriefTargetSelect');
  const refresh = dom.window.document.getElementById('instructorDebriefRefreshBtn');

  assert.equal(oneLine.readOnly, true);
  assert.equal(oneLine.hasAttribute('data-instructor-readonly-control'), true);
  assert.equal(target.disabled, false);
  assert.equal(target.hasAttribute('data-instructor-readonly-control'), false);
  assert.equal(refresh.disabled, false);
  assert.equal(refresh.hasAttribute('data-instructor-readonly-control'), false);

  env.controller.destroy();
});

test('Start class requires the class password and explains a rejected one', async () => {
  const requests = [];
  const env = setup(async (url, options = {}) => {
    requests.push([url, options]);
    if (url === '/api/classes' && options.method === 'POST') {
      return response(403, { error: 'The class password is incorrect.', code: 'class-password-invalid' });
    }
    return response(404, {});
  }, { savedSession: false });

  assert.equal(await env.controller.startClass('Live PSDM Class', ''), false);
  assert.equal(requests.length, 0, 'no request without a password');
  assert.match(dom.window.document.getElementById('instructorClassError').textContent, /class password/i);

  assert.equal(await env.controller.startClass('Live PSDM Class', 'guess'), false);
  assert.match(dom.window.document.getElementById('instructorClassError').textContent, /not correct/);
  assert.equal(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
});

test('Leave class asks first, explains the class keeps running, and keeps the session when cancelled', async () => {
  const prompts = [];
  let answer = false;
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, { confirmImpl: message => { prompts.push(message); return answer; } });
  await settle();

  assert.equal(env.controller.requestLeaveClass(), false);
  assert.notEqual(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null, 'cancel keeps the Instructor credential');
  assert.match(prompts[0], /keeps running/);
  assert.match(prompts[0], /administrator/);
  assert.match(prompts[0], /End class/);

  answer = true;
  dom.window.document.getElementById('instructorClassLeaveBtn').click();
  assert.equal(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
  assert.equal(prompts.length, 2);
});

test('End class revokes the class on the server for everyone before clearing this device', async () => {
  const requests = [];
  let answer = false;
  let deleteStatus = 500;
  const env = setup(async (url, options = {}) => {
    requests.push([url, options]);
    if (url === '/api/classes' && options.method === 'DELETE') {
      return response(deleteStatus, deleteStatus === 200 ? { revoked: true, classId: 'class-1' } : { error: 'Unable to access class.' });
    }
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, { confirmImpl: message => { assert.match(message, /for everyone/); return answer; } });
  await settle();

  assert.equal(await env.controller.endClass(), false);
  assert.equal(requests.some(([url, options]) => url === '/api/classes' && options.method === 'DELETE'), false, 'no request without confirmation');

  answer = true;
  assert.equal(await env.controller.endClass(), false, 'server failure keeps the class and the credential');
  assert.notEqual(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
  assert.match(dom.window.document.getElementById('instructorClassError').textContent, /Unable to access class|Could not end/);

  deleteStatus = 200;
  assert.equal(await env.controller.endClass(), true);
  const deleteRequest = requests.filter(([url, options]) => url === '/api/classes' && options.method === 'DELETE').at(-1);
  assert.equal(deleteRequest[1].headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Local before observation');
  assert.match(env.calls.toasts.at(-1), /Ended/);
});

const W3 = '33333333-3333-4333-8333-333333333333';
const W4 = '44444444-4444-4444-8444-444444444444';
const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * Builds a stateful fake Instructor API for the #342 class controls.
 * @param {object} state - Mutable roster/participants/joins state.
 * @param {Array} requests - Request log.
 * @returns {Function} fetch double.
 */
function controlsApi(state, requests) {
  return async (url, options = {}) => {
    requests.push([url, options]);
    const body = options.body ? JSON.parse(options.body) : null;
    const classMeta = { id: 'class-1', title: 'Problem Solving 101', joinCode: 'K7FMP4Q2', expiresAt: '2099-01-01T00:00:00Z', joinsEnabled: state.joins };
    if (url === '/api/classes' && options.method === 'PATCH' && body.action === 'set-joins') {
      state.joins = body.enabled;
      return response(200, { class: { ...classMeta, joinsEnabled: state.joins } });
    }
    if (url === '/api/classes' && options.method === 'PATCH' && body.action === 'create-transfer') {
      return response(200, { transferCode: 'ABCD-EFGH-JKMN', expiresAt: '2099-01-01T00:10:00Z' });
    }
    if (url === '/api/classes/workspaces' && options.method === 'GET') return response(200, { class: classMeta, workspaces: state.workspaces });
    if (url === '/api/classes/workspaces' && options.method === 'POST') {
      const workspace = { id: state.nextIds.shift(), kind: body.kind, label: body.label, participantCount: 0, activeParticipantCount: 0, editingParticipantCount: 0 };
      state.workspaces.push(workspace);
      return response(201, { workspace });
    }
    if (url === '/api/classes/workspaces' && options.method === 'PATCH') {
      const workspace = state.workspaces.find(item => item.id === body.workspaceId);
      workspace.label = body.label;
      return response(200, { workspace: { id: workspace.id, kind: workspace.kind, label: workspace.label } });
    }
    if (url === '/api/classes/workspaces' && options.method === 'DELETE') {
      state.workspaces = state.workspaces.filter(item => item.id !== body.workspaceId);
      return response(200, { removed: true, workspace: { id: body.workspaceId } });
    }
    if (url === '/api/classes/participants' && options.method === 'GET') return response(200, { class: classMeta, participants: state.participants });
    if (url === '/api/classes/participants' && options.method === 'PATCH') {
      const participant = state.participants.find(item => item.id === body.participantId);
      const workspace = state.workspaces.find(item => item.id === body.workspaceId);
      participant.assignment = { id: workspace.id, kind: workspace.kind, label: workspace.label };
      participant.assignmentRevision += 1;
      workspace.participantCount = (workspace.participantCount || 0) + 1;
      return response(200, { class: classMeta, participant, assignment: participant.assignment, changed: true });
    }
    if (String(url).startsWith('/api/classes/observe')) {
      const id = new URL(url, 'https://intake.test').searchParams.get('workspaceId');
      const workspace = state.workspaces.find(item => item.id === id);
      if (!workspace) return response(404, {});
      return response(200, {
        class: classMeta,
        workspace: { id, kind: workspace.kind, label: workspace.label, teamName: workspace.label, revision: 1, expiresAt: '2099-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
        participants: [],
        snapshot: { pre: { oneLine: workspace.label } }
      });
    }
    return response(404, {});
  };
}

test('Instructor pauses and resumes new joins from the class panel', async () => {
  const state = { joins: true, workspaces: rosterBody().workspaces, participants: participantBody().participants, nextIds: [] };
  const requests = [];
  const env = setup(controlsApi(state, requests));
  await settle();
  const button = dom.window.document.getElementById('instructorJoinsToggleBtn');
  assert.equal(button.textContent, 'Pause new joins');

  button.click();
  await settle();
  const patch = requests.find(([url, options]) => url === '/api/classes' && options.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch[1].body), { action: 'set-joins', enabled: false });
  assert.equal(button.textContent, 'Allow new joins');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.match(dom.window.document.getElementById('instructorJoinsStatus').textContent, /paused/);

  await env.controller.refreshRoster();
  assert.equal(env.controller.getState().joinsEnabled, false, 'roster polling keeps the server joins state');
});

test('Instructor renames the selected workspace and can only remove an empty one', async () => {
  const workspaces = rosterBody().workspaces;
  workspaces.push({ id: W3, kind: 'group', label: 'Spare team', participantCount: 0, activeParticipantCount: 0, editingParticipantCount: 0 });
  const state = { joins: true, workspaces, participants: participantBody().participants, nextIds: [] };
  const requests = [];
  const prompts = [];
  const env = setup(controlsApi(state, requests), { confirmImpl: message => { prompts.push(message); return true; } });
  await settle();

  await env.controller.selectWorkspace(W2);
  await settle();
  const doc = dom.window.document;
  assert.equal(doc.getElementById('instructorWorkspaceManage').hidden, false);
  doc.getElementById('instructorWorkspaceRenameBtn').click();
  assert.equal(doc.getElementById('instructorWorkspaceRenameForm').hidden, false);
  assert.equal(doc.getElementById('instructorWorkspaceRenameInput').value, 'Team Beta');
  doc.getElementById('instructorWorkspaceRenameInput').value = 'Team Gamma';
  doc.getElementById('instructorWorkspaceRenameForm').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await settle();
  const rename = requests.find(([url, options]) => url === '/api/classes/workspaces' && options.method === 'PATCH');
  assert.deepEqual(JSON.parse(rename[1].body), { workspaceId: W2, label: 'Team Gamma' });
  assert.equal(doc.getElementById('instructorObservedWorkspace').textContent, 'Team Gamma');
  assert.equal(doc.getElementById('instructorWorkspaceRenameForm').hidden, true);

  assert.equal(await env.controller.removeWorkspace(W2), false, 'a team with Students cannot be removed');
  assert.equal(requests.some(([url, options]) => url === '/api/classes/workspaces' && options.method === 'DELETE'), false);
  assert.match(doc.getElementById('instructorClassError').textContent, /Move or unassign/);
  assert.equal(prompts.length, 0, 'no confirmation is shown for a blocked removal');

  assert.equal(await env.controller.removeWorkspace(W3), true);
  const removal = requests.find(([url, options]) => url === '/api/classes/workspaces' && options.method === 'DELETE');
  assert.deepEqual(JSON.parse(removal[1].body), { workspaceId: W3 });
  assert.match(prompts[0], /cannot be undone/);
  assert.equal(env.controller.getState().workspaces.some(item => item.id === W3), false);
});

test('one workspace per Student assigns every Waiting Student and is safe to run again', async () => {
  const participants = participantBody().participants;
  participants.push({ id: P3, displayName: 'Casey', assignmentRevision: 0, joinedAt: '2026-10-01T00:02:00Z', updatedAt: '2026-10-01T00:02:00Z', assignment: null });
  const workspaces = rosterBody().workspaces;
  workspaces.push({ id: W4, kind: 'individual', label: 'Blair', participantCount: 0, activeParticipantCount: 0, editingParticipantCount: 0 });
  const state = { joins: true, workspaces, participants, nextIds: [W3] };
  const requests = [];
  const env = setup(controlsApi(state, requests));
  await settle();
  requests.length = 0;

  const result = await env.controller.createIndividualWorkspacesForWaiting();
  assert.deepEqual(result, { assigned: 2, total: 2 });
  const creates = requests.filter(([url, options]) => url === '/api/classes/workspaces' && options.method === 'POST');
  assert.equal(creates.length, 1, 'the existing empty "Blair" workspace is reused');
  assert.deepEqual(JSON.parse(creates[0][1].body), { kind: 'individual', label: 'Casey', snapshot: {} });
  const assignments = requests
    .filter(([url, options]) => url === '/api/classes/participants' && options.method === 'PATCH')
    .map(([, options]) => JSON.parse(options.body));
  assert.deepEqual(assignments, [
    { participantId: P2, workspaceId: W4 },
    { participantId: P3, workspaceId: W3 }
  ]);
  assert.match(dom.window.document.getElementById('instructorIndividualWorkspacesStatus').textContent, /2 Students now have their own workspace/);
  assert.equal(dom.window.document.getElementById('instructorIndividualWorkspacesBtn').disabled, true, 'nothing left to do');

  requests.length = 0;
  assert.deepEqual(await env.controller.createIndividualWorkspacesForWaiting(), { assigned: 0, total: 0 });
  assert.equal(requests.length, 0);
});

test('Move to another device shows a one-time code, and another device continues the class with it', async () => {
  const state = { joins: true, workspaces: rosterBody().workspaces, participants: participantBody().participants, nextIds: [] };
  const requests = [];
  const deviceA = setup(controlsApi(state, requests));
  await settle();
  dom.window.document.getElementById('instructorMoveDeviceBtn').click();
  await settle();
  const doc = dom.window.document;
  assert.equal(doc.getElementById('instructorTransferPanel').hidden, false);
  assert.equal(doc.getElementById('instructorTransferCode').textContent, 'ABCD-EFGH-JKMN');
  assert.equal(doc.getElementById('instructorMoveDeviceBtn').getAttribute('aria-expanded'), 'true');
  assert.equal(JSON.stringify(dom.window.localStorage).includes('ABCD'), false, 'the code is never stored');
  doc.getElementById('instructorTransferCloseBtn').click();
  assert.equal(doc.getElementById('instructorTransferPanel').hidden, true);
  deviceA.controller.destroy();

  const NEW_TOKEN = 'n'.repeat(43);
  const deviceRequests = [];
  const deviceB = setup(async (url, options = {}) => {
    deviceRequests.push([url, options]);
    if (url === '/api/classes/transfer') {
      const code = JSON.parse(options.body).transferCode;
      return code === 'ABCDEFGHJKMN'
        ? response(200, { class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z', joinsEnabled: true }, instructorToken: NEW_TOKEN, joinCode: 'K7FM-P4Q2' })
        : response(404, { error: 'That transfer code is not valid. Codes work once and expire after 10 minutes.', code: 'transfer-invalid' });
    }
    return controlsApi(state, requests)(url, options);
  }, { savedSession: false });

  assert.equal(await deviceB.controller.redeemTransferCode('short'), false);
  assert.equal(deviceRequests.length, 0, 'malformed codes are not sent');
  assert.equal(await deviceB.controller.redeemTransferCode('ZZZZ-ZZZZ-ZZZZ'), false);
  assert.match(dom.window.document.getElementById('instructorClassError').textContent, /not valid/);

  assert.equal(await deviceB.controller.redeemTransferCode(' abcd-efgh-jkmn '), true);
  const stored = JSON.parse(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY));
  assert.equal(stored.instructorToken, NEW_TOKEN);
  assert.equal(stored.class.id, 'class-1');
  assert.equal(dom.window.document.getElementById('instructorClassDashboard').hidden, false);
});

test('roster shows the Case Study loaded into each workspace and feeds the assignment panel (#343)', async () => {
  const rosters = [];
  setup(async url => {
    if (url === '/api/classes/workspaces') {
      const body = rosterBody();
      body.workspaces[1] = {
        ...body.workspaces[1],
        revision: 3,
        hasWork: true,
        caseStudy: { id: 'paytrix', name: 'Paytrix', mode: 'is-is-not', assignedAt: '2026-10-01T00:00:00Z' }
      };
      return response(200, body);
    }
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  }, { onRoster: list => rosters.push(list) });

  await settle();

  const items = [...dom.window.document.querySelectorAll('.instructor-workspace-item')];
  assert.equal(items[0].querySelector('.instructor-workspace-item__case'), null, 'nothing loaded yet');
  assert.equal(items[1].querySelector('.instructor-workspace-item__case').textContent, 'Case Study: Paytrix · IS / IS NOT');
  assert.ok(rosters.length >= 1);
  assert.deepEqual(rosters.at(-1).map(item => [item.id, item.label, item.kind]), [[W1, 'Alex', 'individual'], [W2, 'Team Beta', 'group']]);
});
