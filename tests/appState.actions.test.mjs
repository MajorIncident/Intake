import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveActionsImport } from '../src/appStateActions.js';

test('resolveActionsImport returns sanitized snapshot details when actions exist', () => {
  const items = [{ id: 'a-1' }, { id: 'a-2' }];
  const result = resolveActionsImport(true, { analysisId: ' saved-id ', items }, 'analysis-current');
  assert.deepEqual(result, {
    shouldImport: true,
    analysisId: 'saved-id',
    items
  });
});

test('resolveActionsImport falls back to the current analysis when snapshot is absent', () => {
  const result = resolveActionsImport(false, undefined, 'analysis-current');
  assert.deepEqual(result, {
    shouldImport: false,
    analysisId: 'analysis-current',
    items: []
  });
});

test('resolveActionsImport tolerates malformed payloads and trims identifiers', () => {
  const result = resolveActionsImport(true, { analysisId: '   ', items: 'invalid' }, 'analysis-current');
  assert.deepEqual(result, {
    shouldImport: true,
    analysisId: 'analysis-current',
    items: []
  });
});
