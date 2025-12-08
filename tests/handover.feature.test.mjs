/**
 * Handover card integration tests.
 *
 * Validates that the card renders all required sections and converts newline-
 * delimited input into bullet lists for rapid scanning.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { mountHandoverCard } from '../components/handover/HandoverCard.js';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

let dom = null;
let snapshot = null;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
  snapshot = installJsdomGlobals(dom.window);
});

afterEach(() => {
  restoreJsdomGlobals(snapshot);
  snapshot = null;
  dom = null;
});

test('handover card renders all sections and bulletizes entries', () => {
  const { document } = dom.window;
  const host = document.querySelector('#host');

  mountHandoverCard(host);

  const sections = host.querySelectorAll('.handover-section');
  assert.equal(sections.length, 5, 'renders five labeled sections');
  assert.equal(host.querySelector('#handover-card h3')?.textContent, 'Handover');

  const textarea = host.querySelector('[data-section="current-state"]');
  assert.ok(textarea, 'current state input exists');
  textarea.value = 'First line\nSecond line\n\nThird line';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  const bulletItems = host.querySelectorAll('[data-section-list="current-state"] li');
  assert.equal(bulletItems.length, 3, 'empty lines are ignored when rendering bullets');
  assert.deepEqual(
    Array.from(bulletItems).map(item => item.textContent),
    ['First line', 'Second line', 'Third line']
  );
});
