/**
 * Startup experience hub detection and routing coverage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_STATE_VERSION } from '../src/appStateVersion.js';
import {
  detectStartupContext,
  isSubstantiveSavedIntake,
  readSubstantiveSavedIntake
} from '../src/startupExperienceHub.js';
import { STORAGE_KEY } from '../src/storage.js';
import { STUDENT_SESSION_STORAGE_KEY, STUDENT_SESSION_VERSION } from '../src/classroomStudent.js';
import { INSTRUCTOR_SESSION_STORAGE_KEY, INSTRUCTOR_SESSION_VERSION } from '../src/classroomInstructor.js';

const STUDENT_TOKEN = 's'.repeat(43);
const INSTRUCTOR_TOKEN = 'i'.repeat(43);

function storageWith(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); }
  };
}

function studentSession(overrides = {}) {
  return {
    version: STUDENT_SESSION_VERSION,
    mode: 'live',
    class: {
      id: 'class-a',
      title: 'PSDM Browser Class',
      expiresAt: '2099-12-31T23:59:59.000Z'
    },
    participant: {
      id: 'participant-a',
      displayName: 'Alex'
    },
    studentSessionToken: STUDENT_TOKEN,
    assignmentRevision: 2,
    assignment: {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'group',
      label: 'Team Alpha'
    },
    ...overrides
  };
}

function instructorSession(overrides = {}) {
  return {
    version: INSTRUCTOR_SESSION_VERSION,
    instructorToken: INSTRUCTOR_TOKEN,
    joinCode: 'K7FM-P4Q2',
    class: {
      id: 'class-b',
      title: 'Instructor Browser Class',
      expiresAt: '2099-12-31T23:59:59.000Z'
    },
    selectedWorkspaceId: '22222222-2222-4222-8222-222222222222',
    ...overrides
  };
}

test('empty/default persistence noise is not a substantive saved Intake', () => {
  const empty = {
    meta: {
      version: APP_STATE_VERSION,
      savedAt: '2026-10-08T20:00:00.000Z'
    },
    ops: {
      bridgeOpenedUtc: '2026-10-08T20:00:00.000Z',
      commNextDueIso: '2026-10-08T20:15:00.000Z',
      commNextUpdateTime: '20:15',
      tableFocusMode: 'full'
    },
    appearance: { theme: 'dark' },
    notesWorkspace: { notes: [], open: false },
    steps: {
      items: [{ id: 'one', label: 'Default step label', checked: false }],
      drawerOpen: true
    },
    table: [
      { band: 'What' },
      { questionId: 'what-object', q: 'What object?', is: '', no: '', di: '', ch: '' }
    ],
    actions: {
      analysisId: 'generated-analysis-id',
      items: []
    }
  };

  assert.equal(isSubstantiveSavedIntake(empty), false);
});

test('meaningful user-authored Intake fields create a Continue candidate', () => {
  assert.equal(isSubstantiveSavedIntake({
    meta: { version: APP_STATE_VERSION },
    pre: { oneLine: 'Checkout latency increased after a routing change.' }
  }), true);

  assert.equal(isSubstantiveSavedIntake({
    meta: { version: APP_STATE_VERSION },
    table: [{ q: 'Where?', is: 'Toronto traffic', no: '', di: '', ch: '', questionId: 'where' }]
  }), true);

  assert.equal(isSubstantiveSavedIntake({
    meta: { version: APP_STATE_VERSION },
    notesWorkspace: { notes: [{ id: 'note-1', text: 'Check gateway logs' }], open: false }
  }), true);

  assert.equal(isSubstantiveSavedIntake({
    meta: { version: APP_STATE_VERSION, intakeMode: 'it' }
  }), true);
});

test('readSubstantiveSavedIntake accepts only current valid meaningful snapshots', () => {
  const storage = storageWith({
    [STORAGE_KEY]: JSON.stringify({
      meta: { version: APP_STATE_VERSION, savedAt: '2026-10-08T20:00:00.000Z' },
      pre: { oneLine: 'Saved browser Intake' }
    })
  });

  assert.equal(readSubstantiveSavedIntake(storage)?.pre?.oneLine, 'Saved browser Intake');

  storage.setItem(STORAGE_KEY, JSON.stringify({
    meta: { version: APP_STATE_VERSION - 1 },
    pre: { oneLine: 'Old snapshot' }
  }));
  assert.equal(readSubstantiveSavedIntake(storage), null);
});

test('startup detection keeps saved Intake, Student, and Instructor resumptions independent', () => {
  const storage = storageWith({
    [STORAGE_KEY]: JSON.stringify({
      meta: { version: APP_STATE_VERSION, savedAt: '2026-10-08T20:00:00.000Z' },
      pre: { oneLine: 'Independent saved Intake' }
    }),
    [STUDENT_SESSION_STORAGE_KEY]: JSON.stringify(studentSession()),
    [INSTRUCTOR_SESSION_STORAGE_KEY]: JSON.stringify(instructorSession())
  });

  const context = detectStartupContext({
    storage,
    location: { hash: '', search: '' },
    nowMs: Date.parse('2026-10-08T20:00:00.000Z')
  });

  assert.equal(context.savedIntake.pre.oneLine, 'Independent saved Intake');
  assert.equal(context.student.participant.displayName, 'Alex');
  assert.equal(context.student.class.title, 'PSDM Browser Class');
  assert.equal(context.instructor.class.title, 'Instructor Browser Class');
  assert.equal(context.hasStoredStudentSession, true);
  assert.equal(context.hasStoredInstructorSession, true);
});

test('expired classroom envelopes are not offered as Continue cards but remain detectable for explicit replacement', () => {
  const storage = storageWith({
    [STUDENT_SESSION_STORAGE_KEY]: JSON.stringify(studentSession({
      class: { id: 'class-a', title: 'Expired Student Class', expiresAt: '2026-10-01T00:00:00.000Z' }
    })),
    [INSTRUCTOR_SESSION_STORAGE_KEY]: JSON.stringify(instructorSession({
      class: { id: 'class-b', title: 'Expired Instructor Class', expiresAt: '2026-10-01T00:00:00.000Z' }
    }))
  });

  const context = detectStartupContext({
    storage,
    location: { hash: '#join=K7FMP4Q2', search: '' },
    nowMs: Date.parse('2026-10-08T20:00:00.000Z')
  });

  assert.equal(context.student, null);
  assert.equal(context.instructor, null);
  assert.equal(context.hasStoredStudentSession, true);
  assert.equal(context.hasStoredInstructorSession, true);
  assert.equal(context.studentSessionExpired, true);
  assert.equal(context.instructorSessionExpired, true);
  assert.equal(context.joinIntent, 'K7FMP4Q2');
});
