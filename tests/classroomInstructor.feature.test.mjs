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

let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function rosterBody() {
  return {
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    workspaces: [
      { id: W1, kind: 'individual', label: 'Alex', participantCount: 1, activeParticipantCount: 1, editingParticipantCount: 0 },
      { id: W2, kind: 'group', label: 'Team Beta', participantCount: 3, activeParticipantCount: 2, editingParticipantCount: 1 }
    ]
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

function setup(fetchImpl) {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  persistExperienceRolePreference(EXPERIENCE_ROLE_IDS.INSTRUCTOR, dom.window.localStorage);
  initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location
  });

  dom.window.document.getElementById('oneLine').value = 'Local before observation';
  dom.window.localStorage.setItem('sentinel', 'keep-me');

  const calls = { apply: [], leave: [], timers: [] };
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
    toast: () => {},
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

test('Instructor opens one class, renders roster, and observes through the GET-only class endpoint', async () => {
  const requests = [];
  const env = setup(async (url, options) => {
    requests.push([url, options]);
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
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
  assert.equal(dom.window.document.getElementById('oneLine').value, 'First');
  assert.equal(dom.window.document.getElementById('oneLine').readOnly, true);
  assert.equal(dom.window.document.getElementById('addCauseBtn').disabled, true);
  assert.equal(dom.window.localStorage.getItem('sentinel'), 'keep-me');
  assert.equal(requests.some(([url]) => String(url).includes('/api/workspaces/session')), false);
  assert.equal(requests.some(([url]) => String(url).includes('/api/workspaces/presence')), false);
  assert.equal(dom.window.document.getElementById('instructorObservedWorkspace').textContent, 'Alex');
});

test('rapid Instructor workspace switching aborts/stales the previous observer and keeps the newest snapshot', async () => {
  let resolveFirst;
  let firstSignal = null;
  const env = setup(async (url, options) => {
    if (url === '/api/classes/workspaces') return response(200, rosterBody());
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
