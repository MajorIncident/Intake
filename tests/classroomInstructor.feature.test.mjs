/**
 * Feature coverage for Instructor class entry, roster navigation, read-only projection, and lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_SESSION_STORAGE_KEY,
  createInstructorClassroomController
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
  mobile = false
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
  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });

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

  await env.controller.openClass(TOKEN);

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

  await env.controller.openClass(TOKEN);
  dom.window.history.replaceState(null, '', '/?workspace=must-not-leak');

  assert.equal(await env.controller.shareClass(), true);
  assert.deepEqual(copied, ['https://intake.test/#join=K7FMP4Q2']);
  assert.equal(copied[0].includes(TOKEN), false);
  assert.equal(copied[0].includes('workspace='), false);
  assert.equal(env.calls.toasts.at(-1), 'Class join link copied.');
  assert.equal(dom.window.document.getElementById('instructorShareClassBtn').disabled, false);

  env.controller.destroy();
});

test('Instructor opens one class, renders roster, and observes through the GET-only class endpoint', async () => {
  const requests = [];
  const env = setup(async (url, options) => {
    requests.push([url, options]);
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });

  await env.controller.openClass(TOKEN);

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
        studentJoinToken: 'j'.repeat(43),
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
      return response(201, { workspace, assignmentToken: 'x'.repeat(43) });
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
  });

  assert.equal(await env.controller.startClass('Live PSDM Class'), true);
  assert.equal(dom.window.document.getElementById('instructorClassTitle').textContent, 'Live PSDM Class');
  assert.equal(dom.window.document.getElementById('instructorJoinCode').textContent, 'K7FM-P4Q2');
  assert.equal(dom.window.document.getElementById('instructorParticipantSummary').textContent, '1 student · 1 waiting');

  const stored = JSON.parse(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY));
  assert.equal(stored.instructorToken, TOKEN);
  assert.equal(stored.joinCode, 'K7FM-P4Q2');
  assert.equal(JSON.stringify(stored).includes('studentJoinToken'), false);

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

  const opening = env.controller.openClass(TOKEN);
  await settle();
  await env.controller.selectWorkspace(W2);

  assert.equal(firstSignal?.aborted, true);
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Second');
  assert.equal(env.controller.getState().selectedWorkspaceId, W2);

  resolveFirst(response(200, observeBody(W1, 'First')));
  await opening;
  assert.equal(dom.window.document.getElementById('oneLine').value, 'Second');
});

test('Instructor search and kind filter narrow the roster without changing authorization', async () => {
  const env = setup(async url => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
    if (url === '/api/classes/participants') return response(200, participantBody());
    if (url.includes(W1)) return response(200, observeBody(W1, 'First'));
    return response(404, {});
  });
  await env.controller.openClass(TOKEN);

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
  await env.controller.openClass(TOKEN);

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
  await env.controller.openClass(TOKEN);

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

  assert.equal(await env.controller.openClass(TOKEN), false);
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

  await env.controller.openClass(TOKEN);

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

  await env.controller.openClass(TOKEN);
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

  await env.controller.openClass(TOKEN);
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
