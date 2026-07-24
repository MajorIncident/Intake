import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('desktop header and intake content reserve the same notes workspace gutter', () => {
  const desktopLayoutRule = STYLES.match(
    /@media\s*\(min-width:921px\)\s*\{\s*header\s*,\s*\.wrap\s*\{\s*margin-right\s*:\s*340px\s*;?\s*\}/
  );

  assert.ok(
    desktopLayoutRule,
    'header and .wrap should share the notes workspace gutter to remain horizontally aligned'
  );
});
