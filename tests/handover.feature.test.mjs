/**
 * Handover card integration tests.
 *
 * Validates that the card renders all required sections and captures free-form
 * notes without mirroring them into bullet lists.
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

test('handover card renders all sections and collects free-form notes', () => {
  const { document } = dom.window;
  const host = document.querySelector('#host');

  mountHandoverCard(host);

  const sections = host.querySelectorAll('.handover-section');
  assert.equal(sections.length, 5, 'renders five labeled sections');
  assert.equal(host.querySelector('#handover-card h3')?.textContent, 'Handover');
  assert.equal(host.querySelector('.handover-input__label')?.textContent?.trim(), 'Notes (free-form)');

  sections.forEach(section => {
    const textarea = section.querySelector('.handover-input');
    assert.ok(textarea, `textarea exists for ${section.dataset.sectionBlock}`);
  });

  const textarea = host.querySelector('[data-section="current-state"]');
  assert.ok(textarea, 'current state input exists');
  textarea.value = 'First line\nSecond line\n\nThird line';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(textarea.value, 'First line\nSecond line\n\nThird line');
});

test('handover state roundtrips through collect/apply helpers', () => {
  const { document } = dom.window;
  const host = document.querySelector('#host');

  mountHandoverCard(host);

  const textarea = host.querySelector('[data-section="what-changed"]');
  textarea.value = 'First delta\nSecond delta';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  const snapshot = collectHandoverState(document);
  assert.deepEqual(snapshot['what-changed'], ['First delta', 'Second delta']);

  applyHandoverState({ 'what-changed': ['New note'] }, document);
  assert.equal(textarea.value, 'New note');

  applyHandoverState({}, document);
  assert.equal(textarea.value, '');
});

test('migrateAppState seeds empty handover sections when absent', () => {
  const migrated = migrateAppState({ meta: { version: 1 } });

  assert.ok(migrated.handover, 'handover bucket exists');
  assert.deepEqual(migrated.handover['current-state'], []);
  assert.deepEqual(migrated.handover['whats-next'], []);
});
