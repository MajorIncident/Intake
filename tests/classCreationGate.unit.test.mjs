/**
 * Class-creation password and unauthenticated-endpoint rate limits
 * (api/_rateLimit.js wired into class create, class admission, and
 * Standalone collaboration workspace creation).
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  DEFAULT_CLASS_CREATION_PASSWORD,
  RATE_LIMIT_POLICIES,
  checkRateLimit,
  classCreationPasswordMatches,
  clientAddress
} from '../api/_rateLimit.js';
import { classAdmitHandler, classHandler } from '../api/_classroom.js';
import { createWorkspaceHandler } from '../api/_workspace.js';
import {
  createClassroomRepository,
  createWorkspaceRepository,
  response,
  tokenFactory
} from './helpers/classroom-test-repositories.mjs';

const originalPassword = process.env.INTAKE_CLASS_CREATION_PASSWORD;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.INTAKE_CLASS_CREATION_PASSWORD;
  else process.env.INTAKE_CLASS_CREATION_PASSWORD = originalPassword;
});

/**
 * Builds a limiter double that allows the first `allowed` calls.
 * @param {number} allowed - Calls permitted before limiting.
 * @returns {Function & {calls: Array<object>}} Limiter.
 */
function limiterAllowing(allowed) {
  const calls = [];
  const limiter = async options => {
    calls.push(options);
    return { allowed: calls.length <= allowed };
  };
  limiter.calls = calls;
  return limiter;
}

test('default class password is kepnertregoe, case-insensitive and trimmed', () => {
  delete process.env.INTAKE_CLASS_CREATION_PASSWORD;
  assert.equal(DEFAULT_CLASS_CREATION_PASSWORD, 'kepnertregoe');
  assert.equal(classCreationPasswordMatches('kepnertregoe'), true);
  assert.equal(classCreationPasswordMatches('  KepnerTregoe '), true);
  assert.equal(classCreationPasswordMatches('kepner'), false);
  assert.equal(classCreationPasswordMatches(''), false);
  assert.equal(classCreationPasswordMatches(undefined), false);
});

test('server environment can override the class password', () => {
  process.env.INTAKE_CLASS_CREATION_PASSWORD = 'Spring-Cohort';
  assert.equal(classCreationPasswordMatches('spring-cohort'), true);
  assert.equal(classCreationPasswordMatches('kepnertregoe'), false);
});

test('class creation rejects a missing or wrong password before creating anything', async () => {
  delete process.env.INTAKE_CLASS_CREATION_PASSWORD;
  const classrooms = createClassroomRepository();
  const handler = classHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['I', 'J']),
    joinCodeFactory: () => 'K7FMP4Q2',
    rateLimiter: limiterAllowing(10)
  });
  for (const body of [{ title: 'Class' }, { title: 'Class', classPassword: 'guess' }]) {
    const res = response();
    await handler({ method: 'POST', body, headers: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'class-password-invalid');
    assert.equal(res.body.instructorToken, undefined);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  assert.equal(classrooms.classes.length, 0);
});

test('class creation is rate-limited per client address, including wrong-password attempts', async () => {
  const limiter = limiterAllowing(1);
  const classrooms = createClassroomRepository();
  const handler = classHandler({
    getRepository: async () => classrooms,
    tokenFactory: tokenFactory(['I']),
    joinCodeFactory: () => 'K7FMP4Q2',
    rateLimiter: limiter
  });
  const req = { method: 'POST', body: { title: 'Class', classPassword: 'wrong' }, headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } };
  const first = response();
  await handler(req, first);
  assert.equal(first.statusCode, 403);
  const second = response();
  await handler({ ...req, body: { title: 'Class', classPassword: 'kepnertregoe' } }, second);
  assert.equal(second.statusCode, 429);
  assert.equal(second.body.code, 'rate-limited');
  assert.equal(second.headers['Retry-After'], String(RATE_LIMIT_POLICIES['class-create'].windowSeconds));
  assert.equal(limiter.calls[0].limit, RATE_LIMIT_POLICIES['class-create'].limit);
  assert.match(limiter.calls[0].bucket, /^[0-9a-f]{64}$/);
  assert.equal(limiter.calls[0].bucket.includes('203.0.113.9'), false, 'raw addresses are never stored');
  assert.equal(classrooms.classes.length, 0);
});

test('admission allows a whole class behind one school address but stops brute force', async () => {
  assert.ok(RATE_LIMIT_POLICIES['class-admit'].limit >= 100, 'about 22 Students plus re-joins share one address');
  const limiter = limiterAllowing(0);
  const res = response();
  await classAdmitHandler({ getRepository: async () => createClassroomRepository(), rateLimiter: limiter })({
    method: 'POST',
    body: { joinCode: 'K7FM-P4Q2', participantId: '11111111-1111-4111-8111-111111111111', displayName: 'Ana' },
    headers: {}
  }, res);
  assert.equal(res.statusCode, 429);
});

test('Standalone collaboration workspace creation is rate-limited', async () => {
  const res = response();
  await createWorkspaceHandler({ getRepository: async () => createWorkspaceRepository(), rateLimiter: limiterAllowing(0) })({
    method: 'POST',
    body: { snapshot: {}, teamName: '', participant: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Ana' } },
    headers: {}
  }, res);
  assert.equal(res.statusCode, 429);
});

test('a limiter infrastructure failure does not block the request', async () => {
  const decision = await checkRateLimit({ headers: {} }, 'class-admit', async () => { throw new Error('db down'); });
  assert.equal(decision.allowed, true);
});

test('client address prefers the first forwarded hop', () => {
  assert.equal(clientAddress({ headers: { 'x-forwarded-for': '198.51.100.2, 10.1.1.1' } }), '198.51.100.2');
  assert.equal(clientAddress({ headers: { 'x-real-ip': '198.51.100.3' } }), '198.51.100.3');
  assert.equal(clientAddress({ headers: {} }), 'unknown');
});
