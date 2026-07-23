/**
 * @fileoverview CSS regression coverage for the Impact prompt heading casing.
 *
 * Loads the intake markup and shared stylesheet into jsdom so the test can
 * verify that the Impact-specific heading rules override `.card h3`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const IMPACT_PROMPT_IDS = [
  'impactNowHeading',
  'impactFutureHeading',
  'impactTimeHeading'
];

/**
 * Builds the intake document with the production stylesheet available to CSSOM.
 *
 * @returns {Document} The static, styled intake document.
 */
function buildStyledIndexDocument() {
  const dom = new JSDOM(INDEX_HTML);
  const style = dom.window.document.createElement('style');

  style.textContent = STYLES;
  dom.window.document.head.append(style);

  return dom.window.document;
}

test('Impact prompt headings preserve sentence case instead of card heading uppercase styling', () => {
  const document = buildStyledIndexDocument();
  const impactTitle = document.querySelector('.impact > h3');

  assert.ok(impactTitle, 'expected the Impact card title to remain a direct heading child');
  assert.equal(
    document.defaultView.getComputedStyle(impactTitle).textTransform,
    'none',
    'expected the .impact > h3 rule to override the shared .card h3 uppercase treatment'
  );

  for (const headingId of IMPACT_PROMPT_IDS) {
    const heading = document.getElementById(headingId);

    assert.ok(heading, `expected #${headingId} to remain in the Impact card`);
    assert.equal(
      document.defaultView.getComputedStyle(heading).textTransform,
      'none',
      `expected #${headingId} to override the shared .card h3 uppercase treatment`
    );
  }
});
