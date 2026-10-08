/**
 * Static architecture guards for the #319 comparison presentation boundary.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const controller = readFileSync(new URL('../src/classroomDebriefComparison.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('debrief comparison controller has no Intake persistence, summary, export, or snapshot-apply dependency', () => {
  const forbidden = [
    /from ['"]\.\/appState\.js['"]/u,
    /from ['"]\.\/storage\.js['"]/u,
    /from ['"]\.\/fileTransfer\.js['"]/u,
    /\bcollectAppState\b/u,
    /\bapplyAppState\b/u,
    /\bsaveToStorage\b/u,
    /\bexportAppStateToFile\b/u,
    /\bimportAppStateFromFile\b/u,
    /\.localStorage\b/u,
    /\.sessionStorage\b/u,
    /\bgetItem\s*\(/u,
    /\bsetItem\s*\(/u
  ];
  forbidden.forEach(pattern => {
    assert.doesNotMatch(controller, pattern);
  });
});

test('debrief comparison surface is explicitly local-only and summary-excluded', () => {
  const match = index.match(
    /<section class="instructor-debrief-comparison"[^>]*id="instructorDebriefComparison"[^>]*>/u
  );
  assert.ok(match, 'Instructor debrief comparison root must exist');
  assert.match(match[0], /data-persistence="local-only"/u);
  assert.match(match[0], /data-summary="exclude"/u);

  for (const id of [
    'instructorDebriefRefreshBtn',
    'instructorDebriefTargetSelect',
    'instructorDebriefCurrentBtn',
    'instructorDebriefCheckpointBtn'
  ]) {
    const control = index.match(new RegExp(`<[^>]+id="${id}"[^>]*>`, 'u'));
    assert.ok(control, `${id} must exist`);
    assert.match(control[0], /data-persistence="local-only"/u);
    assert.match(control[0], /data-summary="exclude"/u);
  }
});

test('main lifecycle gives comparison only Instructor authority and observer navigation', () => {
  const initMatch = main.match(
    /classroomDebriefComparisonController\s*=\s*initClassroomDebriefComparison\(\{([\s\S]*?)\n\s*\}\);/u
  );
  assert.ok(initMatch, 'comparison controller init wiring must exist');
  const wiring = initMatch[1];
  assert.match(wiring, /onSelectWorkspace/u);
  assert.doesNotMatch(wiring, /collect:/u);
  assert.doesNotMatch(wiring, /apply:/u);
  assert.doesNotMatch(wiring, /save/u);

  assert.match(
    main,
    /classroomDebriefComparisonController\?\.connectInstructor\?\.\(token\)/u
  );
  assert.doesNotMatch(
    main,
    /classroomDebriefComparisonController\?\.connectStudent/u
  );
});
