/**
 * Unit coverage for Student classroom session validation and isolation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  STUDENT_SESSION_STORAGE_KEY,
  STUDENT_SESSION_VERSION,
  clearStudentSession,
  isStudentSessionExpired,
  normalizeStudentDisplayName,
  persistStudentSession,
  readStudentSession,
  validateStudentCapability
} from '../src/classroomStudent.js';

const TOKEN = 'a'.repeat(43);

function validSession(overrides = {}) {
  return {
    version: STUDENT_SESSION_VERSION,
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    workspace: { id: 'workspace-1', kind: 'group', label: 'Team Alpha', expiresAt: '2099-01-01T00:00:00Z' },
    participant: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Alex' },
    workspaceToken: TOKEN,
    joinedAt: '2026-10-01T00:00:00Z',
    ...overrides
  };
}

test('Student capability and display-name validation reject malformed values', () => {
  assert.equal(validateStudentCapability(TOKEN), true);
  assert.equal(validateStudentCapability('short'), false);
  assert.equal(normalizeStudentDisplayName('  Alex   Chen  '), 'Alex Chen');
  assert.equal(normalizeStudentDisplayName(''), null);
  assert.equal(normalizeStudentDisplayName('x'.repeat(61)), null);
});

test('Student resume envelope round-trips only the issued workspace capability and context', () => {
  const dom = new JSDOM('', { url: 'https://intake.test/' });
  const session = validSession();

  assert.equal(persistStudentSession(dom.window.localStorage, session), true);
  const restored = readStudentSession(dom.window.localStorage);

  assert.deepEqual(restored, session);
  assert.equal('studentJoinToken' in restored, false);
  assert.equal('assignmentToken' in restored, false);
  assert.equal(dom.window.localStorage.getItem(STUDENT_SESSION_STORAGE_KEY).includes('class-1'), true);

  clearStudentSession(dom.window.localStorage);
  assert.equal(readStudentSession(dom.window.localStorage), null);
  dom.window.close();
});

test('Student resume envelope rejects invalid capabilities and detects expiry', () => {
  const dom = new JSDOM('', { url: 'https://intake.test/' });
  dom.window.localStorage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(validSession({ workspaceToken: 'bad' })));
  assert.equal(readStudentSession(dom.window.localStorage), null);

  assert.equal(isStudentSessionExpired(validSession(), Date.parse('2026-10-01T00:00:00Z')), false);
  assert.equal(isStudentSessionExpired(validSession({
    class: { id: 'class-1', title: 'Expired', expiresAt: '2026-09-30T00:00:00Z' }
  }), Date.parse('2026-10-01T00:00:00Z')), true);
  dom.window.close();
});
