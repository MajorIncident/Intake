/**
 * Administration / Maintenance API unit coverage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADMIN_TOKEN_ENV,
  adminHandler,
  buildAdminPurgePreview,
  isAdminAuthorized,
  normalizeAdminIdleDays,
  validateAdminPublicId
} from '../api/_admin.js';
import { hashWorkspaceToken } from '../api/_workspace.js';
import { response, tokenFactory } from './helpers/classroom-test-repositories.mjs';

const ADMIN = 'A'.repeat(43);
const CLASS_ACTIVE = '11111111-1111-4111-8111-111111111111';
const CLASS_EXPIRED = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_STALE = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_CLASS = '44444444-4444-4444-8444-444444444444';

function request(method, { token = ADMIN, body = null } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function inventoryFixture() {
  return {
    generatedAt: '2026-10-08T18:00:00.000Z',
    classes: [
      {
        id: CLASS_ACTIVE,
        title: 'Active class',
        status: 'active',
        joinsEnabled: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-11-01T00:00:00.000Z',
        revokedAt: null,
        lastActivityAt: '2026-10-08T17:59:00.000Z',
        idleDays: 0,
        participantCount: 2,
        workspaceCount: 1,
        presenceCount: 2,
        recentPresenceCount: 1,
        coachingCount: 1,
        exerciseCount: 1,
        checkpointCount: 0,
        releaseCount: 1,
        workspaces: [{ id: WORKSPACE_CLASS, label: 'Team A', kind: 'group' }],
        exercise: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'active',
          currentStageId: 'stage-1',
          stagePhase: 'work',
          updatedAt: '2026-10-08T17:58:00.000Z'
        }
      },
      {
        id: CLASS_EXPIRED,
        title: 'Expired class',
        status: 'expired',
        joinsEnabled: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
        expiresAt: '2026-09-01T00:00:00.000Z',
        revokedAt: null,
        lastActivityAt: '2026-08-20T00:00:00.000Z',
        idleDays: 49,
        participantCount: 1,
        workspaceCount: 0,
        presenceCount: 0,
        recentPresenceCount: 0,
        coachingCount: 0,
        exerciseCount: 0,
        checkpointCount: 0,
        releaseCount: 0,
        workspaces: [],
        exercise: null
      }
    ],
    workspaces: [
      {
        id: WORKSPACE_STALE,
        teamName: 'Old shared intake',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
        expiresAt: '2026-12-01T00:00:00.000Z',
        lastActivityAt: '2026-07-02T00:00:00.000Z',
        idleDays: 98,
        participantCount: 2,
        recentPresenceCount: 0,
        capabilityCount: 0,
        classOwned: false,
        classroom: null
      },
      {
        id: WORKSPACE_CLASS,
        teamName: 'Team A',
        status: 'active',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-11-01T00:00:00.000Z',
        lastActivityAt: '2026-10-08T17:59:00.000Z',
        idleDays: 0,
        participantCount: 2,
        recentPresenceCount: 1,
        capabilityCount: 2,
        classOwned: true,
        classroom: {
          id: CLASS_ACTIVE,
          title: 'Active class',
          workspaceId: WORKSPACE_CLASS,
          workspaceKind: 'group',
          workspaceLabel: 'Team A'
        }
      }
    ]
  };
}

function createRepository(initialInventory = inventoryFixture()) {
  let inventory = clone(initialInventory);
  const calls = {
    revoked: [],
    rotated: [],
    purgedClasses: [],
    purgedWorkspaces: []
  };

  return {
    calls,
    setInventory(next) {
      inventory = clone(next);
    },
    async listInventory() {
      return clone(inventory);
    },
    async revokeClassById(id) {
      calls.revoked.push(id);
      const item = inventory.classes.find(candidate => candidate.id === id);
      if (!item || item.status === 'revoked') return null;
      item.status = 'revoked';
      item.revokedAt = '2026-10-08T18:00:00.000Z';
      item.joinsEnabled = false;
      return { id };
    },
    async rotateInstructorById(id, nextHash) {
      calls.rotated.push({ id, nextHash });
      const item = inventory.classes.find(candidate => candidate.id === id);
      if (!item || item.status !== 'active') return null;
      return { id, title: item.title, joinsEnabled: item.joinsEnabled, expiresAt: item.expiresAt };
    },
    async purgeClasses(ids) {
      calls.purgedClasses.push([...ids]);
      inventory.classes = inventory.classes.filter(item => !ids.includes(item.id));
      return { ok: true, purgedIds: [...ids], workspaceCount: 0 };
    },
    async purgeStandaloneWorkspaces(ids) {
      calls.purgedWorkspaces.push([...ids]);
      inventory.workspaces = inventory.workspaces.filter(item => !ids.includes(item.id));
      return { ok: true, purgedIds: [...ids] };
    }
  };
}

test('admin identifiers, thresholds, and credentials validate conservatively', () => {
  assert.equal(validateAdminPublicId(CLASS_ACTIVE), true);
  assert.equal(validateAdminPublicId('not-a-uuid'), false);
  assert.equal(normalizeAdminIdleDays(30), 30);
  assert.equal(normalizeAdminIdleDays('90'), 90);
  assert.equal(normalizeAdminIdleDays(0), null);
  assert.equal(normalizeAdminIdleDays(3651), null);
  assert.equal(isAdminAuthorized(`Bearer ${ADMIN}`, ADMIN), true);
  assert.equal(isAdminAuthorized(`Bearer ${'B'.repeat(43)}`, ADMIN), false);
  assert.equal(isAdminAuthorized(undefined, ADMIN), false);
});

test('admin handler fails closed when the environment credential is absent or malformed', async () => {
  const missing = response();
  await adminHandler({
    getRepository: async () => createRepository(),
    getAdminToken: () => ''
  })(request('GET'), missing);

  assert.equal(missing.statusCode, 503);
  assert.deepEqual(missing.body, { error: 'Administration is not configured.' });
  assert.equal(missing.headers['Cache-Control'], 'no-store');
  assert.equal(missing.headers['Referrer-Policy'], 'no-referrer');

  const malformed = response();
  await adminHandler({
    getRepository: async () => createRepository(),
    getAdminToken: () => 'short'
  })(request('GET'), malformed);
  assert.equal(malformed.statusCode, 503);
});

test('admin handler rejects missing or incorrect authorization without exposing inventory', async () => {
  let reads = 0;
  const handler = adminHandler({
    getRepository: async () => ({
      async listInventory() {
        reads += 1;
        return inventoryFixture();
      }
    }),
    getAdminToken: () => ADMIN
  });

  const missing = response();
  await handler(request('GET', { token: null }), missing);
  assert.equal(missing.statusCode, 401);

  const incorrect = response();
  await handler(request('GET', { token: 'B'.repeat(43) }), incorrect);
  assert.equal(incorrect.statusCode, 401);
  assert.equal(reads, 0);
});

test('admin inventory returns lifecycle metadata without bearer capabilities', async () => {
  const repository = createRepository();
  const res = response();
  await adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    now: () => Date.parse('2026-10-08T18:00:00.000Z')
  })(request('GET'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.classes.length, 2);
  assert.equal(res.body.workspaces.length, 2);
  assert.equal(JSON.stringify(res.body).includes(ADMIN), false);
  assert.equal(JSON.stringify(res.body).includes('instructorToken'), false);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('purge preview protects a recently active class even when its snapshot is old', () => {
  const plan = buildAdminPurgePreview(
    inventoryFixture(),
    { scope: 'classes', mode: 'bulk', idleDays: 30 },
    Date.parse('2026-10-08T18:00:00.000Z')
  );

  assert.deepEqual(plan.items.map(item => item.id), [CLASS_EXPIRED]);
  assert.equal(plan.items.some(item => item.id === CLASS_ACTIVE), false);
});

test('purge preview never includes class-owned collaboration workspaces', () => {
  const plan = buildAdminPurgePreview(
    inventoryFixture(),
    { scope: 'workspaces', mode: 'bulk', idleDays: 30 },
    Date.parse('2026-10-08T18:00:00.000Z')
  );

  assert.deepEqual(plan.items.map(item => item.id), [WORKSPACE_STALE]);
  assert.equal(plan.items.some(item => item.id === WORKSPACE_CLASS), false);
});

test('preview then commit purges exactly the signed stale workspace plan', async () => {
  const repository = createRepository();
  const nowMs = Date.parse('2026-10-08T18:00:00.000Z');
  const handler = adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    now: () => nowMs
  });

  const preview = response();
  await handler(request('POST', {
    body: {
      action: 'preview-purge',
      scope: 'workspaces',
      mode: 'bulk',
      idleDays: 30
    }
  }), preview);

  assert.equal(preview.statusCode, 200);
  assert.equal(preview.body.plan.items.length, 1);
  assert.equal(preview.body.plan.items[0].id, WORKSPACE_STALE);
  assert.equal(typeof preview.body.previewToken, 'string');
  assert.equal('fingerprint' in preview.body.plan.items[0], false);

  const commit = response();
  await handler(request('POST', {
    body: {
      action: 'commit-purge',
      previewToken: preview.body.previewToken
    }
  }), commit);

  assert.equal(commit.statusCode, 200);
  assert.deepEqual(commit.body.ids, [WORKSPACE_STALE]);
  assert.deepEqual(repository.calls.purgedWorkspaces, [[WORKSPACE_STALE]]);
});

test('changed maintenance data invalidates a signed purge preview before deletion', async () => {
  const repository = createRepository();
  const nowMs = Date.parse('2026-10-08T18:00:00.000Z');
  const handler = adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    now: () => nowMs
  });

  const preview = response();
  await handler(request('POST', {
    body: {
      action: 'preview-purge',
      scope: 'workspaces',
      mode: 'bulk',
      idleDays: 30
    }
  }), preview);
  assert.equal(preview.statusCode, 200);

  const changed = inventoryFixture();
  changed.workspaces[0].lastActivityAt = '2026-10-08T17:59:30.000Z';
  changed.workspaces[0].idleDays = 0;
  changed.workspaces[0].recentPresenceCount = 1;
  repository.setInventory(changed);

  const commit = response();
  await handler(request('POST', {
    body: {
      action: 'commit-purge',
      previewToken: preview.body.previewToken
    }
  }), commit);

  assert.equal(commit.statusCode, 409);
  assert.deepEqual(repository.calls.purgedWorkspaces, []);
});

test('single class purge requires a terminal class', async () => {
  const repository = createRepository();
  const handler = adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    now: () => Date.parse('2026-10-08T18:00:00.000Z')
  });

  const active = response();
  await handler(request('POST', {
    body: {
      action: 'preview-purge',
      scope: 'classes',
      mode: 'single',
      id: CLASS_ACTIVE
    }
  }), active);
  assert.equal(active.statusCode, 200);
  assert.equal(active.body.plan.items.length, 0);
  assert.equal(active.body.previewToken, null);

  const expired = response();
  await handler(request('POST', {
    body: {
      action: 'preview-purge',
      scope: 'classes',
      mode: 'single',
      id: CLASS_EXPIRED
    }
  }), expired);
  assert.equal(expired.statusCode, 200);
  assert.deepEqual(expired.body.plan.items.map(item => item.id), [CLASS_EXPIRED]);
  assert.equal(typeof expired.body.previewToken, 'string');
});

test('admin can revoke a class and rotate active Instructor authority without exposing stored hashes', async () => {
  const repository = createRepository();
  const nextToken = 'R'.repeat(43);
  const handler = adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    tokenFactory: tokenFactory(['R'])
  });

  const rotate = response();
  await handler(request('POST', {
    body: { action: 'rotate-instructor', classId: CLASS_ACTIVE }
  }), rotate);

  assert.equal(rotate.statusCode, 200);
  assert.equal(rotate.body.instructorToken, nextToken);
  assert.equal(repository.calls.rotated[0].nextHash, hashWorkspaceToken(nextToken));
  assert.equal(repository.calls.rotated[0].nextHash.includes(nextToken), false);

  const revoke = response();
  await handler(request('POST', {
    body: { action: 'revoke-class', classId: CLASS_ACTIVE }
  }), revoke);

  assert.equal(revoke.statusCode, 200);
  assert.deepEqual(revoke.body, { revoked: true, classId: CLASS_ACTIVE });
  assert.deepEqual(repository.calls.revoked, [CLASS_ACTIVE]);
});

test('admin preview tokens expire and cannot be replayed indefinitely', async () => {
  const repository = createRepository();
  let nowMs = Date.parse('2026-10-08T18:00:00.000Z');
  const handler = adminHandler({
    getRepository: async () => repository,
    getAdminToken: () => ADMIN,
    now: () => nowMs
  });

  const preview = response();
  await handler(request('POST', {
    body: {
      action: 'preview-purge',
      scope: 'workspaces',
      mode: 'bulk',
      idleDays: 30
    }
  }), preview);
  assert.equal(preview.statusCode, 200);

  nowMs += 11 * 60 * 1000;
  const commit = response();
  await handler(request('POST', {
    body: {
      action: 'commit-purge',
      previewToken: preview.body.previewToken
    }
  }), commit);

  assert.equal(commit.statusCode, 400);
  assert.match(commit.body.error, /invalid or expired/i);
  assert.deepEqual(repository.calls.purgedWorkspaces, []);
});

test('admin environment variable name stays server-only and explicit', () => {
  assert.equal(ADMIN_TOKEN_ENV, 'INTAKE_ADMIN_TOKEN');
});
