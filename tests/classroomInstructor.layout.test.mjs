/**
 * Instructor rail layout regression coverage.
 *
 * The fixed desktop rail grows as Classroom orchestration controls are added.
 * Its dashboard must remain vertically scrollable so roster/workspace navigation
 * cannot be clipped below the viewport.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('connected desktop Instructor dashboard remains vertically scrollable', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(
    styles,
    /body\[data-experience-role="instructor"\]\.instructor-class-connected \.instructor-shell \.instructor-dashboard\s*\{[^}]*overflow-x:hidden;[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain;/u,
    'the fixed Instructor dashboard rail must scroll vertically as orchestration controls grow'
  );
});
