/**
 * Handover card integration tests.
 *
 * Validates that the card renders all required sections and converts newline-
 * delimited input into bullet lists for rapid scanning.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { mountHandoverCard } from '../components/handover/HandoverCard.js';
import { collectHandoverState, applyHandoverState } from '../src/handover.js';
import { migrateAppState } from '../src/storage.js';
import { installJsdomGlobals, restoreJsdomGlobals } from './helpers/jsdom-globals.js';

let dom = null;
let snapshot = null;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
  snapshot = installJsdomGlobals(dom.window);
});

afterEach(() => {
  restoreJsdomGlobals(snapshot);
  mock.restoreAll();
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

test('handover state roundtrips through collect/apply helpers and clears bullets', () => {
  const { document } = dom.window;
  const host = document.querySelector('#host');

  mountHandoverCard(host);

  const textarea = host.querySelector('[data-section="what-changed"]');
  textarea.value = 'First delta\nSecond delta';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  const snapshot = collectHandoverState(document);
  assert.deepEqual(snapshot['what-changed'], 'First delta\nSecond delta');

  applyHandoverState({ 'what-changed': 'New note' }, document);
  const bullets = host.querySelectorAll('[data-section-list="what-changed"] li');
  assert.equal(bullets.length, 1);
  assert.equal(bullets[0].textContent, 'New note');

  applyHandoverState({}, document);
  const clearedBullets = host.querySelectorAll('[data-section-list="what-changed"] li');
  assert.equal(clearedBullets.length, 0);
});

test('migrateAppState seeds empty handover sections when absent', () => {
  const migrated = migrateAppState({ meta: { version: 1 } });

  assert.ok(migrated.handover, 'handover bucket exists');
  assert.equal(migrated.handover['current-state'], '');
  assert.equal(migrated.handover['whats-next'], '');
});
