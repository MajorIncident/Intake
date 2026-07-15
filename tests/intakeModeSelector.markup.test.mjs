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

test('intake mode selector stays within the menu bar and preserves required anchors', () => {
  const document = buildIndexDocument();
  const header = document.querySelector('header');
  const menuBar = document.querySelector('.menu-bar');
  const headerTitle = document.querySelector('.header-title');
  const selector = document.getElementById('intakeModeSelect');

  assert.ok(header?.contains(selector), 'selector should stay in the header');
  assert.ok(menuBar?.contains(selector), 'selector should render inside the primary menu bar');
  assert.equal(headerTitle?.contains(selector), false, 'selector should no longer render inside the header title stack');
  assert.match(INDEX_HTML, /<!-- \[header\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[header\] end -->/);
  assert.match(INDEX_HTML, /<!-- \[section:preface\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[styles\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[feature:intake-mode-selector\] start -->/);
  assert.match(INDEX_HTML, /<!-- \[feature:intake-mode-selector\] end -->/);
});

test('mode-controlled Major Incident-only UI regions are marked for hiding', () => {
  const document = buildIndexDocument();

  assert.ok(document.querySelector('.menu-group[data-mode-section="collaboration"]'), 'collaboration menu group should be mode controlled');
  assert.ok(document.querySelector('[data-mode-section="detectionSource"]'), 'detection source controls should be mode controlled');
  assert.ok(document.querySelector('[data-mode-section="evidenceCollected"]'), 'evidence collected controls should be mode controlled');
  assert.ok(document.querySelector('[data-mode-section="incidentProof"]'), 'incident proof field should be mode controlled');
  assert.ok(document.querySelector('[data-mode-section="containment"]'), 'containment controls should be mode controlled');
});
