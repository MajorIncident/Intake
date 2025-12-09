/**
 * Header menu bar interactions.
 *
 * Validates that the menubar opens and closes panels in response to clicks,
 * hover-ready keyboard navigation, and Escape handling so the header drawers
 * remain reachable.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { initMenuBar } from '../src/menuBar.js';

let dom;

beforeEach(() => {
  dom = new JSDOM(
    `<!doctype html><html><body>
      <nav class="menu-bar">
        <div class="menu-group">
          <button type="button" class="menu-trigger" data-menu-target="collab" aria-haspopup="true" aria-expanded="false">Collaboration</button>
          <div class="menu-panel" id="collab" role="menu" hidden>
            <button type="button" class="menu-item" id="comms" role="menuitem">Comms</button>
            <button type="button" class="menu-item" id="steps" role="menuitem">Steps</button>
          </div>
        </div>
        <div class="menu-group">
          <button type="button" class="menu-trigger" data-menu-target="file" aria-haspopup="true" aria-expanded="false">File</button>
          <div class="menu-panel" id="file" role="menu" hidden>
            <button type="button" class="menu-item" id="save" role="menuitem">Save</button>
          </div>
        </div>
      </nav>
    </body></html>`,
    { url: 'http://localhost/' }
  );

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
});

afterEach(() => {
  if (dom) {
    dom.window.close();
  }
  delete globalThis.window;
  delete globalThis.document;
});

test('click toggles menu visibility and exclusivity', () => {
  initMenuBar();

  const collabTrigger = document.querySelector('[data-menu-target="collab"]');
  const collabPanel = document.querySelector('#collab');
  const fileTrigger = document.querySelector('[data-menu-target="file"]');
  const filePanel = document.querySelector('#file');

  collabTrigger.click();
  assert.equal(collabTrigger.getAttribute('aria-expanded'), 'true');
  assert.equal(collabPanel.hidden, false);

  fileTrigger.click();
  assert.equal(fileTrigger.getAttribute('aria-expanded'), 'true');
  assert.equal(filePanel.hidden, false);
  assert.equal(collabPanel.hidden, true);

  fileTrigger.click();
  assert.equal(fileTrigger.getAttribute('aria-expanded'), 'false');
  assert.equal(filePanel.hidden, true);
});

test('keyboard navigation roves focus between triggers and items', () => {
  initMenuBar();

  const collabTrigger = document.querySelector('[data-menu-target="collab"]');
  const fileTrigger = document.querySelector('[data-menu-target="file"]');

  collabTrigger.focus();
  collabTrigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement.id, 'comms');

  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement.id, 'steps');

  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(document.activeElement.id, 'save');
  assert.equal(fileTrigger.getAttribute('aria-expanded'), 'true');

  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.activeElement, fileTrigger);
  assert.equal(document.querySelector('#file').hidden, true);
});
