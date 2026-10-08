import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_STATE_VERSION } from '../src/appStateVersion.js';
import { ROWS } from '../src/constants.js';

const { normalizeActionSnapshot } = await import('../src/actionsStore.js?actions-tests');

globalThis.__actionsStoreMocks = {
  normalizeActionSnapshot,
  listActions: () => [],
  createAction: () => {},
  patchAction: () => {},
  removeAction: () => {},
  sortActions: () => [],
  exportActionsState: () => [],
  importActionsState: () => []
};

const { migrateAppState } = await import('../src/storage.js?actions-tests');

test('migrateAppState rejects missing and obsolete pre-production schema versions', () => {
  const candidates = [
    {},
    { meta: {} },
    { meta: { version: APP_STATE_VERSION - 1 } },
    { meta: { version: 1 } }
  ];

  candidates.forEach(candidate => {
    assert.equal(migrateAppState(candidate), null);
  });
});

test('migrateAppState sanitizes the current canonical snapshot shape', () => {
  const row = ROWS.find(candidate => candidate.id);
  const savedAt = '2026-10-08T12:00:00.000Z';
  const current = {
    meta: { version: APP_STATE_VERSION, savedAt, intakeMode: 'it' },
    pre: {
      oneLine: 'Current problem',
      proof: 'Evidence',
      objectPrefill: 42,
      healthy: 'Normal',
      now: 'Abnormal'
    },
    impact: { now: 'Now', future: 'Later', time: 'Soon' },
    ops: {
      containStatus: 'stabilized',
      detectMonitoring: true,
      detectUserReport: 'true',
      commCadence: 'hourly',
      commLog: [{ channel: 'internal', message: 'ping' }],
      tableFocusMode: 'differences'
    },
    table: [{ id: row.id, is: 'A', isNot: 'B' }],
    causes: [{
      id: 'cause-current',
      suspect: 'Cache layer',
      confidence: 'HIGH',
      findings: {
        [row.id]: { mode: 'yes', note: 'Stable current key' }
      }
    }],
    likelyCauseId: 5,
    steps: {
      items: [{ id: 'kickoff', label: 'Kickoff investigation', checked: true }],
      drawerOpen: true
    }
  };

  const normalized = migrateAppState(current);

  assert.ok(normalized);
  assert.equal(normalized.meta.version, APP_STATE_VERSION);
  assert.equal(normalized.meta.savedAt, savedAt);
  assert.equal(normalized.meta.intakeMode, 'it');
  assert.equal(normalized.pre.oneLine, 'Current problem');
  assert.equal(normalized.pre.objectPrefill, '42');
  assert.equal(normalized.ops.containStatus, 'stabilized');
  assert.equal(normalized.ops.detectMonitoring, true);
  assert.equal(normalized.ops.detectUserReport, false, 'non-boolean values are not legacy-coerced');
  assert.equal(normalized.ops.commCadence, 'hourly');
  assert.equal(normalized.ops.commLog.length, 1);
  assert.equal(normalized.ops.tableFocusMode, 'differences');
  assert.equal(normalized.causes[0].confidence, 'high');
  assert.deepEqual(normalized.causes[0].findings[row.id], {
    mode: 'yes',
    note: 'Stable current key'
  });
  assert.equal(normalized.likelyCauseId, '5');
  assert.deepEqual(normalized.steps, {
    items: [{ id: 'kickoff', label: 'Kickoff investigation', checked: true }],
    drawerOpen: true
  });
});

test('migrateAppState does not remap historical finding prompt text', () => {
  const row = ROWS.find(candidate => candidate.id && candidate.q);
  const normalized = migrateAppState({
    meta: { version: APP_STATE_VERSION, savedAt: null },
    causes: [{
      id: 'cause-current',
      findings: {
        [row.id]: { mode: 'yes', note: 'Stable value' },
        [row.q]: { mode: 'fail', note: 'Unmapped historical prompt text' }
      }
    }]
  });

  assert.ok(normalized);
  assert.deepEqual(normalized.causes[0].findings[row.id], {
    mode: 'yes',
    note: 'Stable value'
  });
  assert.deepEqual(normalized.causes[0].findings[row.q], {
    mode: 'fail',
    note: 'Unmapped historical prompt text'
  });
});

test('migrateAppState retains sanitized actions snapshots when present', () => {
  const normalized = migrateAppState({
    meta: { version: APP_STATE_VERSION, savedAt: null },
    pre: {},
    ops: {},
    steps: { items: [], drawerOpen: false },
    actions: {
      analysisId: '  analysis-from-snapshot  ',
      items: [{
        id: 'action-123',
        analysisId: 'outdated-id',
        summary: 'Restore service',
        owner: { name: '  Lead Owner  ' },
        status: 'In-Progress'
      }]
    }
  });

  assert.ok(normalized);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'actions'), true);
  assert.equal(normalized.actions.analysisId, 'analysis-from-snapshot');
  assert.equal(normalized.actions.items.length, 1);
  const [action] = normalized.actions.items;
  assert.equal(action.analysisId, 'analysis-from-snapshot');
  assert.equal(action.summary, 'Restore service');
  assert.equal(action.owner.name, 'Lead Owner');
  assert.equal(action.status, 'In-Progress');
  assert.deepEqual(action.changeControl, { required: false });
  assert.deepEqual(action.verification, { required: false });
});

test('migrateAppState keeps actions optional in a current-version snapshot', () => {
  const normalized = migrateAppState({
    meta: { version: APP_STATE_VERSION, savedAt: null },
    pre: {},
    ops: {},
    steps: { items: [], drawerOpen: false }
  });

  assert.ok(normalized);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'actions'), false);
});

test('migrateAppState normalizes persisted intake modes for current snapshots', () => {
  const modes = [
    ['General', 'general'],
    ['IT', 'it'],
    ['Pharma', 'pharma'],
    ['Major Incident', 'majorIncident']
  ];

  modes.forEach(([label, intakeMode]) => {
    const normalized = migrateAppState({
      meta: { version: APP_STATE_VERSION, savedAt: null, intakeMode },
      pre: {},
      ops: {},
      steps: { items: [], drawerOpen: false }
    });

    assert.ok(normalized, `${label} state should normalize`);
    assert.equal(normalized.meta.intakeMode, intakeMode, `${label} state should restore its active mode`);
  });
});

test('migrateAppState defaults missing or unknown intake modes to General', () => {
  [undefined, '', 'unknown-mode'].forEach(intakeMode => {
    const normalized = migrateAppState({
      meta: { version: APP_STATE_VERSION, savedAt: null, intakeMode },
      pre: {},
      ops: {},
      steps: { items: [], drawerOpen: false }
    });

    assert.ok(normalized);
    assert.equal(normalized.meta.intakeMode, 'general');
  });
});
