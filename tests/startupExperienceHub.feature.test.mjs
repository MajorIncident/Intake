/**
 * Feature coverage for the startup experience hub against production markup.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { APP_STATE_VERSION } from '../src/appStateVersion.js';
import {
  EXPERIENCE_ROLE_STORAGE_KEY,
  getActiveExperienceRole,
  initExperienceRoleController
} from '../src/experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from '../src/experienceRoles.js';
import {
  INSTRUCTOR_SESSION_STORAGE_KEY,
  INSTRUCTOR_SESSION_VERSION
} from '../src/classroomInstructor.js';
import {
  STUDENT_SESSION_STORAGE_KEY,
  STUDENT_SESSION_VERSION
} from '../src/classroomStudent.js';
import { initStartupExperienceHub } from '../src/startupExperienceHub.js';
import { STORAGE_KEY } from '../src/storage.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const STUDENT_TOKEN = 's'.repeat(43);
const INSTRUCTOR_TOKEN = 'i'.repeat(43);

let dom = null;

function mount(url = 'https://intake.test/') {
  dom = new JSDOM(INDEX_HTML, { url, pretendToBeVisual: true });
  dom.window.localStorage.clear();
  dom.window.sessionStorage.clear();
  dom.window.confirm = () => true;
  return dom.window.document;
}

function studentSession() {
  return {
    version: STUDENT_SESSION_VERSION,
    mode: 'live',
    class: {
      id: 'class-student',
      title: 'PSDM Student Class',
      expiresAt: '2099-12-31T23:59:59.000Z'
    },
    participant: {
      id: 'student-1',
      displayName: 'Alex Learner'
    },
    studentSessionToken: STUDENT_TOKEN,
    assignmentRevision: 1,
    assignment: {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'group',
      label: 'Team Alpha'
    }
  };
}

function instructorSession() {
  return {
    version: INSTRUCTOR_SESSION_VERSION,
    instructorToken: INSTRUCTOR_TOKEN,
    joinCode: 'K7FM-P4Q2',
    class: {
      id: 'class-instructor',
      title: 'PSDM Instructor Class',
      expiresAt: '2099-12-31T23:59:59.000Z'
    },
    selectedWorkspaceId: '22222222-2222-4222-8222-222222222222'
  };
}

function initialize({ startFresh = () => {} } = {}) {
  const hub = initStartupExperienceHub({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location,
    startFresh
  });
  const role = initExperienceRoleController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    storage: dom.window.localStorage,
    location: dom.window.location,
    onRoleIntent: hub.handleRoleIntent,
    onChooserOpen: hub.refresh
  });
  return { hub, role };
}

beforeEach(() => {
  mount();
});

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('startup hub presents saved Intake, Student, and Instructor resumes as separate choices', () => {
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    meta: { version: APP_STATE_VERSION, savedAt: '2026-10-08T20:00:00.000Z' },
    pre: { oneLine: 'Checkout latency increased.' }
  }));
  dom.window.localStorage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(studentSession()));
  dom.window.localStorage.setItem(INSTRUCTOR_SESSION_STORAGE_KEY, JSON.stringify(instructorSession()));

  const { role } = initialize();

  assert.equal(role, null);
  assert.equal(getActiveExperienceRole(), null);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, false);
  assert.equal(dom.window.document.getElementById('startupContinueSection').hidden, false);

  const cards = [...dom.window.document.querySelectorAll('[data-startup-resume]')];
  assert.deepEqual(cards.map(card => card.dataset.startupResume), ['intake', 'student', 'instructor']);
  assert.match(cards[0].textContent, /Checkout latency increased/);
  assert.match(cards[1].textContent, /PSDM Student Class/);
  assert.match(cards[1].textContent, /Alex Learner/);
  assert.match(cards[2].textContent, /PSDM Instructor Class/);

  cards[1].click();

  assert.equal(getActiveExperienceRole(), EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(JSON.parse(dom.window.localStorage.getItem(EXPERIENCE_ROLE_STORAGE_KEY)).role, EXPERIENCE_ROLE_IDS.STUDENT);
});

test('join link highlights normal admission without silently replacing a saved Student resume', () => {
  dom.window.close();
  mount('https://intake.test/#join=K7FMP4Q2');
  dom.window.localStorage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(studentSession()));

  let confirmations = 0;
  dom.window.confirm = () => {
    confirmations += 1;
    return false;
  };

  initialize();

  const notice = dom.window.document.getElementById('startupJoinIntentNotice');
  const join = dom.window.document.querySelector('[data-experience-role-choice="student"]');
  assert.equal(getActiveExperienceRole(), null);
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /K7FM-P4Q2/);
  assert.equal(join.classList.contains('is-recommended'), true);

  join.click();

  assert.equal(confirmations, 1);
  assert.equal(getActiveExperienceRole(), null);
  assert.ok(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY));
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, false);

  dom.window.confirm = () => true;
  join.click();

  assert.equal(getActiveExperienceRole(), EXPERIENCE_ROLE_IDS.STUDENT);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY), null);
  assert.equal(dom.window.location.hash, '#join=K7FMP4Q2', 'Student controller consumes the safe fragment only after routing');
});

test('fresh independent work requires confirmation before clearing substantive saved Intake', () => {
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    meta: { version: APP_STATE_VERSION },
    pre: { oneLine: 'Preserve this Intake until I explicitly replace it.' }
  }));

  let startFreshCalls = 0;
  const { hub } = initialize({
    startFresh: () => {
      startFreshCalls += 1;
      dom.window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  dom.window.confirm = () => false;
  dom.window.document.querySelector('[data-experience-role-choice="standalone"]').click();

  assert.equal(startFreshCalls, 0);
  assert.equal(getActiveExperienceRole(), null);
  assert.ok(dom.window.localStorage.getItem(STORAGE_KEY));

  dom.window.confirm = () => true;
  dom.window.document.querySelector('[data-experience-role-choice="standalone"]').click();

  assert.equal(startFreshCalls, 1);
  assert.equal(getActiveExperienceRole(), EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.localStorage.getItem(STORAGE_KEY), null);
  assert.equal(hub.getContext().savedIntake?.pre?.oneLine, 'Preserve this Intake until I explicitly replace it.');
});

test('empty/default Intake storage does not render a misleading Continue card', () => {
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    meta: { version: APP_STATE_VERSION, savedAt: '2026-10-08T20:00:00.000Z' },
    ops: { bridgeOpenedUtc: '2026-10-08T20:00:00.000Z' },
    appearance: { theme: 'dark' }
  }));

  initialize();

  assert.equal(dom.window.document.getElementById('startupContinueSection').hidden, true);
  assert.equal(dom.window.document.querySelectorAll('[data-startup-resume]').length, 0);
});

test('explicit Standalone workspace link bypasses startup while ordinary saved preferences do not', () => {
  dom.window.localStorage.setItem(EXPERIENCE_ROLE_STORAGE_KEY, JSON.stringify({
    version: 1,
    role: EXPERIENCE_ROLE_IDS.INSTRUCTOR
  }));
  initialize();

  assert.equal(getActiveExperienceRole(), null);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, false);

  dom.window.close();
  mount('https://intake.test/?workspace=explicit-secret');
  initialize();

  assert.equal(getActiveExperienceRole(), EXPERIENCE_ROLE_IDS.STANDALONE);
  assert.equal(dom.window.document.getElementById('experienceRoleGate').hidden, true);
});
