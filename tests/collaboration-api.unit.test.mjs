/** Collaboration API unit coverage with an injected repository (no live Neon dependency). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_SNAPSHOT_BYTES, createWorkspaceHandler, generateWorkspaceToken,
  hashWorkspaceToken, parseAuthorizationToken, validateSnapshot, validateToken, workspaceHandler
} from '../api/_workspace.js';

/** Builds a minimal Vercel response double. @returns {object} Response double. */
function response() {
  return { headers: {}, statusCode: 0, body: null, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('workspace tokens are secure URL-safe values and hash deterministically', () => {
  const first = generateWorkspaceToken(); const second = generateWorkspaceToken();
  assert.equal(validateToken(first), true); assert.notEqual(first, second);
  assert.equal(hashWorkspaceToken(first).length, 64); assert.equal(hashWorkspaceToken(first), hashWorkspaceToken(first));
  assert.equal(validateToken('short'), false);
  assert.equal(parseAuthorizationToken(`Bearer ${first}`), first);
  assert.equal(parseAuthorizationToken(`Basic ${first}`), null);
});

test('snapshot validation rejects invalid and oversized JSON', () => {
  assert.deepEqual(validateSnapshot(null), { ok: false, status: 400 });
  assert.deepEqual(validateSnapshot({ valid: true }), { ok: true });
  assert.equal(validateSnapshot({ value: 'x'.repeat(MAX_SNAPSHOT_BYTES) }).status, 413);
});

test('create returns 201 and security headers', async () => {
  const repository = { create: async (hash, snapshot, days) => ({ revision: 1, expires_at: 'future', hash, snapshot, days }) };
  const res = response(); await createWorkspaceHandler({ getRepository: async () => repository })({ method: 'POST', body: { snapshot: { pre: {} } } }, res);
  assert.equal(res.statusCode, 201); assert.equal(res.body.revision, 1); assert.equal(validateToken(res.body.token), true);
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('load returns a workspace snapshot', async () => {
  const repository = { load: async () => ({ snapshot: { pre: { oneLine: 'safe' } }, revision: 3 }) };
  const res = response(); await workspaceHandler({ getRepository: async () => repository })({ method: 'GET', headers: { authorization: `Bearer ${generateWorkspaceToken()}` } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.revision, 3);
});

test('update succeeds with an expected revision', async () => {
  const repository = { update: async () => ({ status: 'updated', workspace: { revision: 4 } }) };
  const res = response(); await workspaceHandler({ getRepository: async () => repository })({ method: 'PUT', headers: { authorization: `Bearer ${generateWorkspaceToken()}` }, body: { snapshot: { pre: {} }, revision: 3 } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.revision, 4);
});

test('stale update returns 409 and does not overwrite', async () => {
  let calls = 0; const repository = { update: async () => { calls += 1; return { status: 'conflict', revision: 8 }; } };
  const res = response(); await workspaceHandler({ getRepository: async () => repository })({ method: 'PUT', headers: { authorization: `Bearer ${generateWorkspaceToken()}` }, body: { snapshot: { pre: {} }, revision: 7 } }, res);
  assert.equal(res.statusCode, 409); assert.equal(res.body.revision, 8); assert.equal(calls, 1);
});

test('missing or expired workspaces return 404', async () => {
  const repository = { load: async () => null };
  const res = response(); await workspaceHandler({ getRepository: async () => repository })({ method: 'GET', headers: { authorization: `Bearer ${generateWorkspaceToken()}` } }, res);
  assert.equal(res.statusCode, 404);
});

test('missing or malformed authorization is rejected without repository access', async () => {
  let accessed = false;
  const handler = workspaceHandler({ getRepository: async () => { accessed = true; return {}; } });
  const missing = response(); await handler({ method: 'GET', headers: {} }, missing);
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.body, { error: 'Authorization required.' });
  const malformed = response(); await handler({ method: 'GET', headers: { authorization: 'Bearer secret' } }, malformed);
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.body, { error: 'Invalid authorization.' });
  assert.equal(accessed, false);
});
