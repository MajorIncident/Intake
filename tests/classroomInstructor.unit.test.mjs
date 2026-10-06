/**
 * Unit coverage for Instructor classroom resume/session validation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_SESSION_STORAGE_KEY,
  INSTRUCTOR_SESSION_VERSION,
  clearInstructorSession,
  formatInstructorJoinCode,
  isInstructorSessionExpired,
  normalizeInstructorJoinCode,
  persistInstructorSession,
  readInstructorSession,
  validateInstructorCapability
} from '../src/classroomInstructor.js';

const TOKEN = 'i'.repeat(43);
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

function session(overrides = {}) {
  return {
    version: INSTRUCTOR_SESSION_VERSION,
    instructorToken: TOKEN,
    joinCode: 'K7FM-P4Q2',
    class: { id: 'class-1', title: 'Problem Solving 101', expiresAt: '2099-01-01T00:00:00Z' },
    selectedWorkspaceId: WORKSPACE_ID,
    openedAt: '2026-10-01T00:00:00Z',
    ...overrides
  };
}

test('Instructor capability validation accepts only the expected opaque token shape', () => {
  assert.equal(validateInstructorCapability(TOKEN), true);
  assert.equal(validateInstructorCapability('short'), false);
  assert.equal(validateInstructorCapability(null), false);
});

test('Instructor join-code helpers accept only the unambiguous human code contract', () => {
  assert.equal(normalizeInstructorJoinCode(' k7fm-p4q2 '), 'K7FMP4Q2');
  assert.equal(formatInstructorJoinCode('k7fmp4q2'), 'K7FM-P4Q2');
  assert.equal(normalizeInstructorJoinCode('K7F0-P4Q2'), '');
  assert.equal(normalizeInstructorJoinCode('short'), '');
});

test('Instructor same-device resume envelope round-trips outside Intake state', () => {
  const dom = new JSDOM('', { url: 'https://intake.test/' });
  assert.equal(persistInstructorSession(dom.window.localStorage, session()), true);
  assert.deepEqual(readInstructorSession(dom.window.localStorage), session());
  assert.ok(dom.window.localStorage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY).includes(TOKEN));
  clearInstructorSession(dom.window.localStorage);
  assert.equal(readInstructorSession(dom.window.localStorage), null);
  dom.window.close();
});

test('Instructor resume rejects malformed sessions and detects server expiry', () => {
  const dom = new JSDOM('', { url: 'https://intake.test/' });
  dom.window.localStorage.setItem(INSTRUCTOR_SESSION_STORAGE_KEY, JSON.stringify(session({ instructorToken: 'bad' })));
  assert.equal(readInstructorSession(dom.window.localStorage), null);
  dom.window.localStorage.setItem(INSTRUCTOR_SESSION_STORAGE_KEY, JSON.stringify(session({ joinCode: 'BAD-CODE' })));
  assert.equal(readInstructorSession(dom.window.localStorage), null);

  assert.equal(isInstructorSessionExpired(session(), Date.parse('2026-10-01T00:00:00Z')), false);
  assert.equal(isInstructorSessionExpired(session({
    class: { id: 'class-1', title: 'Expired', expiresAt: '2026-09-30T00:00:00Z' }
  }), Date.parse('2026-10-01T00:00:00Z')), true);
  dom.window.close();
});
