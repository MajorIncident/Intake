/**
 * Templates drawer layout regression coverage.
 *
 * Verifies that the drawer header preserves a full-width introduction above
 * its wrapping action row, regardless of the viewport outside the drawer.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('templates drawer: header actions cannot squeeze the introduction column', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(
    styles,
    /\.templates-drawer__header\s*\{[^}]*flex-direction:column;[^}]*align-items:stretch;/u,
    'the introduction and controls should occupy separate rows'
  );
  assert.match(
    styles,
    /\.templates-drawer__controls\s*\{[^}]*flex-wrap:wrap;[^}]*justify-content:space-between;/u,
    'drawer actions should wrap instead of overflowing or compressing nearby copy'
  );
  assert.match(
    styles,
    /\.templates-drawer__controls \.btn-secondary\s*\{[^}]*flex:1 1 220px;[^}]*min-width:0;/u,
    'the long save action should shrink and wrap safely within the drawer'
  );
});
