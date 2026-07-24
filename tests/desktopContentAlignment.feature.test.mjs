import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('desktop page header and intake content reserve the same notes workspace gutter', () => {
  const desktopLayoutRule = STYLES.match(
    /@media\s*\(min-width:921px\)\s*\{\s*body\s*>\s*header\s*,\s*\.wrap\s*\{\s*margin-right\s*:\s*340px\s*;?\s*\}/
  );

  assert.ok(
    desktopLayoutRule,
    'the page header and .wrap should share the notes workspace gutter to remain horizontally aligned'
  );
});

test('notes workspace header is excluded from page header layout rules', () => {
  assert.doesNotMatch(STYLES, /(?:^|\n)header\s*\{/u);
  assert.doesNotMatch(STYLES, /\{\s*header\s*,\s*\.wrap\s*\{/u);
});
