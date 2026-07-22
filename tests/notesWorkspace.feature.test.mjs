/**
 * Notes workspace feature coverage.
 *
 * Exercises persistent state plus pointer and keyboard note placement in the
 * always-mounted, non-modal workspace.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  applyNotesWorkspaceState,
  getNotesWorkspaceState,
  initNotesWorkspace,
  toggleNotesWorkspace
} from '../src/notesWorkspace.js';

let dom;

function installGlobals(window) {
  for (const key of ['window', 'document', 'Event', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement']) globalThis[key] = window[key];
}

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body><main class="wrap"><textarea id="target"></textarea><input id="readonly" readonly><select id="invalid"></select></main><aside id="notesWorkspace"><button id="notesWorkspaceToggle"></button><div id="notesWorkspaceControls"><input id="notesWorkspaceInput"><button id="notesWorkspaceAddBtn"></button></div><ul id="notesWorkspaceList"></ul></aside><button id="notesWorkspaceMenuBtn"></button></body>`);
  installGlobals(dom.window);
  applyNotesWorkspaceState({ notes: [], open: true });
  initNotesWorkspace({ onSave: () => {}, showToast: () => {} });
});

afterEach(() => {
  dom.window.close();
  for (const key of ['window', 'document', 'Event', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement']) delete globalThis[key];
});

function addNote(text) {
  document.querySelector('#notesWorkspaceInput').value = text;
  document.querySelector('#notesWorkspaceAddBtn').click();
  return document.querySelector('[data-note-id]').dataset.noteId;
}

test('notes workspace is always mounted across all four intake modes', () => {
  assert.equal(document.querySelector('#notesWorkspace').dataset.modeSection, undefined);
  ['general', 'it', 'pharma', 'majorIncident'].forEach(mode => {
    document.body.dataset.intakeMode = mode;
    assert.ok(document.querySelector('#notesWorkspace'));
  });
});

test('Alt+N is reserved for toggling the notes workspace', async () => {
  const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /case 'n':[\s\S]*toggleNotesWorkspace\(\)/u);
  assert.doesNotMatch(mainSource, /case 'n':[\s\S]*setBridgeOpenedNow\(\)/u);
});

test('notes persist their stable IDs and dock preference across state round trips', () => {
  const id = addNote('Capture this');
  toggleNotesWorkspace();
  assert.deepEqual(getNotesWorkspaceState(), { notes: [{ id, text: 'Capture this' }], open: false });
  applyNotesWorkspaceState(getNotesWorkspaceState());
  assert.equal(document.querySelector('#notesWorkspace').getAttribute('aria-hidden'), 'false');
  assert.equal(document.querySelector('#notesWorkspaceList').hidden, true);
  assert.equal(document.querySelector('[data-note-id]').dataset.noteId, id);
});

test('valid drop inserts at selection, dispatches editing events, and removes the note', () => {
  const id = addNote('note');
  const target = document.querySelector('#target');
  target.value = 'hello world'; target.setSelectionRange(6, 11);
  let inputs = 0; target.addEventListener('input', () => { inputs += 1; });
  const transfer = { getData: key => key === 'text/x-intake-note-id' ? id : '' };
  target.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: transfer }));
  assert.equal(target.value, 'hello note');
  assert.equal(inputs, 1);
  assert.equal(document.querySelector('[data-note-id]'), null);
});

test('invalid drops retain the note and keyboard placement uses the focused field', () => {
  const id = addNote('accessible');
  const invalid = document.querySelector('#invalid');
  invalid.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { getData: () => id } }));
  assert.ok(document.querySelector(`[data-note-id="${id}"]`));
  const target = document.querySelector('#target'); target.focus();
  document.querySelector('.notes-workspace__place').click();
  assert.equal(target.value, 'accessible');
  assert.equal(document.querySelector('[data-note-id]'), null);
});
