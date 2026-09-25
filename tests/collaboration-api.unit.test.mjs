/** Collaboration API unit coverage with an injected repository (no live Neon dependency). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISPLAY_NAME_MAX_LENGTH, MAX_SNAPSHOT_BYTES, TEAM_NAME_MAX_LENGTH, createWorkspaceHandler, generateWorkspaceToken,
  hashWorkspaceToken, normalizeActivityState, normalizeCollaborationName, normalizeEditingField, parseAuthorizationToken, presenceHandler, validateParticipantId,
  validateSnapshot, validateToken, workspaceHandler
} from '../api/_workspace.js';

/** Builds a minimal Vercel response double. @returns {object} Response double. */
function response() {
  return { headers: {}, statusCode: 0, body: null, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
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
  const participantId = '11111111-1111-4111-8111-111111111111';
  const repository = {
    create: async (hash, snapshot, days, teamName) => ({ revision: 1, expires_at: 'future', hash, snapshot, days, teamName }),
    upsertPresence: async (_hash, id, displayName) => ({ teamName: 'Response team', self: { id, displayName }, participants: [{ id, displayName }] })
  };
  const res = response(); await createWorkspaceHandler({ getRepository: async () => repository })({ method: 'POST', body: { snapshot: { pre: {} }, teamName: '  Response   team ', participant: { id: participantId, displayName: ' Sam ' } } }, res);
  assert.equal(res.statusCode, 201); assert.equal(res.body.revision, 1); assert.equal(validateToken(res.body.token), true);
  assert.equal(res.body.teamName, 'Response team'); assert.equal(res.body.self.displayName, 'Sam');
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('collaboration labels and participant IDs are validated and normalized', () => {
  assert.equal(normalizeCollaborationName('  Incident   Team ', TEAM_NAME_MAX_LENGTH), 'Incident Team');
  assert.equal(normalizeCollaborationName('', DISPLAY_NAME_MAX_LENGTH), '');
  assert.equal(normalizeCollaborationName('x'.repeat(TEAM_NAME_MAX_LENGTH + 1), TEAM_NAME_MAX_LENGTH), null);
  assert.equal(normalizeCollaborationName('unsafe\nname', DISPLAY_NAME_MAX_LENGTH), null);
  assert.equal(validateParticipantId('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(validateParticipantId('not-a-uuid'), false);
  assert.equal(normalizeEditingField('problemSummary'), 'problemSummary');
  assert.equal(normalizeEditingField('bad field'), null);
  assert.equal(normalizeActivityState('editing'), 'editing');
  assert.equal(normalizeActivityState('locked'), null);
});

test('create rejects malformed profiles before repository access', async () => {
  let accessed = false; const handler = createWorkspaceHandler({ getRepository: async () => { accessed = true; return {}; } });
  const res = response(); await handler({ method: 'POST', body: { snapshot: {}, participant: { id: 'bad', displayName: 'Sam' } } }, res);
  assert.equal(res.statusCode, 400); assert.equal(accessed, false);
});

test('presence registers, lists, renames people and teams, and removes participants without snapshot revisions', async () => {
  const participantId = '11111111-1111-4111-8111-111111111111'; const calls = [];
  const repository = {
    upsertPresence: async (_hash, id, name, activity) => { calls.push(['put', id, name, activity]); return { teamName: 'Ops', self: { id, displayName: name || 'Teammate 1' }, participants: [] }; },
    listPresence: async () => { calls.push(['get']); return { teamName: 'Ops', participants: [] }; },
    renameWorkspace: async (_hash, name) => { calls.push(['patch', name]); return { teamName: name, participants: [] }; },
    removePresence: async (_hash, id) => { calls.push(['delete', id]); return true; }
  };
  const handler = presenceHandler({ getRepository: async () => repository }); const authorization = `Bearer ${generateWorkspaceToken()}`;
  const put = response(); await handler({ method: 'PUT', headers: { authorization }, body: { participantId, displayName: '  Alex  ', editingField: 'problemSummary', editingRevision: 3, activityState: 'editing', activitySequence: 7 } }, put);
  const get = response(); await handler({ method: 'GET', headers: { authorization } }, get);
  const patch = response(); await handler({ method: 'PATCH', headers: { authorization }, body: { teamName: '  Recovery   team ' } }, patch);
  const remove = response(); await handler({ method: 'DELETE', headers: { authorization }, body: { participantId } }, remove);
  assert.deepEqual(calls, [['put', participantId, 'Alex', { editingField: 'problemSummary', editingRevision: 3, activityState: 'editing', activitySequence: 7 }], ['get'], ['patch', 'Recovery team'], ['delete', participantId]]);
  assert.equal(put.body.self.displayName, 'Alex'); assert.equal(get.body.teamName, 'Ops'); assert.equal(patch.body.teamName, 'Recovery team'); assert.deepEqual(remove.body, { removed: true });
  assert.equal('revision' in put.body, false);
});

test('presence validates authorization, identity, names, and missing workspaces', async () => {
  let accessed = 0; const handler = presenceHandler({ getRepository: async () => { accessed += 1; return { upsertPresence: async () => null }; } });
  const missingAuth = response(); await handler({ method: 'GET', headers: {} }, missingAuth); assert.equal(missingAuth.statusCode, 401);
  const invalidId = response(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${generateWorkspaceToken()}` }, body: { participantId: 'bad' } }, invalidId); assert.equal(invalidId.statusCode, 400);
  const missing = response(); await handler({ method: 'PUT', headers: { authorization: `Bearer ${generateWorkspaceToken()}` }, body: { participantId: '11111111-1111-4111-8111-111111111111', displayName: '' } }, missing); assert.equal(missing.statusCode, 404);
  assert.equal(accessed, 1);
});

test('load returns a workspace snapshot', async () => {
  const repository = { load: async () => ({ snapshot: { pre: { oneLine: 'safe' } }, revision: 3 }) };
  const res = response(); await workspaceHandler({ getRepository: async () => repository })({ method: 'GET', headers: { authorization: `Bearer ${generateWorkspaceToken()}` } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.revision, 3);
});

test('revision-aware load returns 204 when unchanged and a snapshot when newer', async () => {
  const repository = { load: async () => ({ snapshot: { marker: 'newest' }, revision: 42 }) };
  const handler = workspaceHandler({ getRepository: async () => repository }); const authorization = `Bearer ${generateWorkspaceToken()}`;
  const unchanged = response(); await handler({ method: 'GET', headers: { authorization }, query: { afterRevision: '42' } }, unchanged);
  assert.equal(unchanged.statusCode, 204); assert.equal(unchanged.body, null);
  const newer = response(); await handler({ method: 'GET', headers: { authorization }, query: { afterRevision: '41' } }, newer);
  assert.equal(newer.statusCode, 200); assert.equal(newer.body.snapshot.marker, 'newest');
});

test('invalid revision queries are rejected before loading a workspace', async () => {
  let loads = 0; const repository = { load: async () => { loads += 1; return null; } };
  const handler = workspaceHandler({ getRepository: async () => repository });
  for (const afterRevision of ['0', '-1', '1.5', 'nope']) {
    const res = response(); await handler({ method: 'GET', headers: { authorization: `Bearer ${generateWorkspaceToken()}` }, query: { afterRevision } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(loads, 0);
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
