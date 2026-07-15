import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/**
 * Builds a static DOM from index.html without executing module scripts.
 * @returns {Document} Parsed index document for markup assertions.
 */
function buildIndexDocument() {
  return new JSDOM(INDEX_HTML).window.document;
}

test('header exposes an accessible intake mode selector with supported modes', () => {
  const document = buildIndexDocument();
  const selector = document.getElementById('intakeModeSelect');

  assert.ok(selector, 'expected stable #intakeModeSelect control');
  assert.equal(selector.tagName, 'SELECT');
  assert.equal(document.querySelector('label[for="intakeModeSelect"]')?.textContent.trim(), 'Intake mode');
  assert.equal(selector.getAttribute('aria-describedby'), 'intakeModeHelp');
  assert.ok(document.getElementById('intakeModeHelp')?.textContent.trim());

  const optionPairs = [...selector.querySelectorAll('option')].map((option) => [
    option.value,
    option.textContent.trim()
  ]);

  assert.deepEqual(optionPairs, [
    ['general', 'General'],
    ['it', 'IT'],
    ['pharma', 'Pharma'],
    ['majorIncident', 'Major Incident Management']
  ]);
});

test('intake mode selector stays within the header and preserves required anchors', () => {
  const document = buildIndexDocument();
  const header = document.querySelector('header');
  const selector = document.getElementById('intakeModeSelect');

  assert.ok(header?.contains(selector), 'selector should render near the header title region');
  assert.match(INDEX_HTML, /<!-- \[header\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[header\] end -->/);
  assert.match(INDEX_HTML, /<!-- \[section:preface\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[styles\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[feature:intake-mode-selector\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[feature:intake-mode-selector\] end -->/);
});
