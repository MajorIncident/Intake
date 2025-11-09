import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migrateAppState } from '../src/storage.js';
import { APP_STATE_VERSION } from '../src/appStateVersion.js';

function getFirstCauseFinding(state, key) {
  if (!state || !Array.isArray(state.causes) || !state.causes.length) {
    return null;
  }
  const cause = state.causes[0];
  if (!cause || typeof cause !== 'object') {
    return null;
  }
  const findings = cause.findings || {};
  return findings[key] || null;
}

test('migrateAppState normalizes legacy states without meta', () => {
  const legacyState = {
    pre: { oneLine: 'Legacy summary', proof: 'Evidence' },
    impact: { now: 'Now', future: 'Later', time: 'Soon' },
    ops: {
      containmentStatus: 'mitigation',
      detectMonitoring: 'true'
    },
    commCadence: 'hourly',
    commNextDueIso: '2024-01-01T00:00:00.000Z',
    commLog: [{ channel: 'internal', message: 'ping' }],
    possibleCauses: [
      {
        id: 'legacy-cause',
        suspect: 'Cache layer',
        findings: {
          primary: { explainIs: 'Cache misses are elevated' }
        }
      }
    ],
    steps: [
      { stepId: 'kickoff', title: 'Kickoff investigation', checked: 'true' }
    ],
    likelyCauseId: 5
  };

  const migrated = migrateAppState(legacyState);

  assert.ok(migrated, 'migration should return a state object');
  assert.equal(migrated.meta.version, APP_STATE_VERSION, 'state should be upgraded to current version');
  assert.equal(migrated.meta.savedAt, null, 'legacy states do not include savedAt metadata');

  assert.equal(migrated.pre.oneLine, 'Legacy summary');
  assert.equal(migrated.impact.future, 'Later');

  assert.equal(migrated.ops.containStatus, 'stabilized', 'legacy containment values map to new names');
  assert.equal(migrated.ops.detectMonitoring, true, 'boolean like fields are normalized');
  assert.equal(migrated.ops.commCadence, 'hourly', 'root communication cadence migrates into ops');
  assert.equal(migrated.ops.commNextDueIso, '2024-01-01T00:00:00.000Z');
  assert.equal(Array.isArray(migrated.ops.commLog), true);
  assert.equal(migrated.ops.commLog.length, 1);
  assert.equal(migrated.ops.tableFocusMode, '', 'missing focus mode defaults to an empty string');

  const finding = getFirstCauseFinding(migrated, 'primary');
  assert.ok(finding, 'cause findings should be preserved');
  assert.equal(finding.mode, 'yes', 'legacy findings convert to valid modes');
  assert.equal(finding.note, 'Cache misses are elevated');

  assert.equal(Array.isArray(migrated.table), true);
  assert.equal(migrated.likelyCauseId, '5', 'numeric likely cause ids are stringified');

  assert.deepEqual(migrated.steps, {
    items: [
      { id: 'kickoff', label: 'Kickoff investigation', checked: true }
    ],
    drawerOpen: false
  });
});

test('migrateAppState preserves savedAt for already versioned states', () => {
  const savedAt = '2024-05-01T12:00:00.000Z';
  const versioned = {
    meta: { version: 1, savedAt },
    pre: { proof: 'Updated proof' },
    ops: {},
    causes: [],
    steps: { items: [], drawerOpen: true }
  };

  const migrated = migrateAppState(versioned);

  assert.ok(migrated);
  assert.equal(migrated.meta.version, APP_STATE_VERSION);
  assert.equal(migrated.meta.savedAt, savedAt);
  assert.equal(migrated.pre.proof, 'Updated proof');
  assert.equal(migrated.ops.tableFocusMode, '');
  assert.deepEqual(migrated.ops.commLog, []);
  assert.deepEqual(migrated.steps, { items: [], drawerOpen: true });
});
