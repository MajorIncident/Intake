/**
 * Unit coverage for the Classroom join-link fragment contract.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClassroomJoinUrl,
  consumeClassroomJoinIntent,
  formatClassroomJoinLinkCode,
  normalizeClassroomJoinLinkCode,
  readClassroomJoinIntent
} from '../src/classroomJoinLink.js';

test('human Classroom join codes normalize and format without accepting bearer-shaped values', () => {
  assert.equal(normalizeClassroomJoinLinkCode('k7fm-p4q2'), 'K7FMP4Q2');
  assert.equal(formatClassroomJoinLinkCode('K7FMP4Q2'), 'K7FM-P4Q2');
  assert.equal(normalizeClassroomJoinLinkCode('a'.repeat(43)), '');
  assert.equal(normalizeClassroomJoinLinkCode('K7FM-P4Q1'), '');
});

test('join URL uses only origin/path plus a client fragment and drops existing query authority', () => {
  const locationRef = {
    href: 'https://intake.test/workbook?workspace=secret-capability#old-fragment',
    origin: 'https://intake.test',
    pathname: '/workbook'
  };
  const url = buildClassroomJoinUrl('K7FM-P4Q2', locationRef);

  assert.equal(url, 'https://intake.test/workbook#join=K7FMP4Q2');
  assert.equal(url.includes('workspace='), false);
  assert.equal(url.includes('secret-capability'), false);
});

test('join intent reads exactly one valid human code from the fragment', () => {
  assert.equal(
    readClassroomJoinIntent({ hash: '#join=K7FM-P4Q2' }),
    'K7FMP4Q2'
  );
  assert.equal(
    readClassroomJoinIntent({ hash: '#join=K7FMP4Q2&join=ABCDEFGH' }),
    ''
  );
  assert.equal(
    readClassroomJoinIntent({ hash: `#join=${'x'.repeat(43)}` }),
    ''
  );
  assert.equal(
    readClassroomJoinIntent({ hash: '#other=K7FMP4Q2' }),
    ''
  );
});

test('consuming join intent removes only the fragment without reloading', () => {
  const calls = [];
  const locationRef = {
    hash: '#join=K7FM-P4Q2',
    pathname: '/workbook',
    search: '?theme=dark'
  };
  const historyRef = {
    state: { keep: true },
    replaceState: (...args) => calls.push(args)
  };

  assert.equal(
    consumeClassroomJoinIntent({ locationRef, historyRef }),
    'K7FMP4Q2'
  );
  assert.deepEqual(calls, [[{ keep: true }, '', '/workbook?theme=dark']]);
});
