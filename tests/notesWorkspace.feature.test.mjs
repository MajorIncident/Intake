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
  return getNotesWorkspaceState().notes.at(-1).id;
}

function press(target, key) {
  target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const settleFocus = () => new Promise(resolve => queueMicrotask(resolve));

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

test('note cards omit the redundant placement button and support keyboard placement', () => {
  const id = addNote('accessible');
  assert.equal(document.querySelector('.notes-workspace__place'), null);
  const invalid = document.querySelector('#invalid');
  invalid.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { getData: () => id } }));
  assert.ok(document.querySelector(`[data-note-id="${id}"]`));
  const target = document.querySelector('#target'); target.focus();
  press(document.querySelector('.notes-workspace__item'), 'Enter');
  assert.equal(target.value, 'accessible');
  assert.equal(document.querySelector('[data-note-id]'), null);
});

test('Edit opens a focused, accessible inline editor with the current text', async () => {
  addNote('Call the service owner');
  const edit = document.querySelector('.notes-workspace__edit');
  assert.match(edit.getAttribute('aria-label'), /Edit note: Call the service owner/u);
  assert.match(document.querySelector('.notes-workspace__delete').getAttribute('aria-label'), /Delete note: Call the service owner/u);
  edit.click(); await settleFocus();
  const editor = document.querySelector('.notes-workspace__edit-input');
  assert.equal(editor.value, 'Call the service owner');
  assert.equal(document.activeElement, editor);
  assert.match(editor.getAttribute('aria-label'), /Call the service owner/u);
});

test('Save and Enter trim updates, preserve IDs, persist once, and restore focus', async () => {
  let saves = 0; const toasts = [];
  initNotesWorkspace({ onSave: () => { saves += 1; }, showToast: message => toasts.push(message) });
  const firstId = addNote('First draft'); saves = 0; toasts.length = 0;
  document.querySelector('.notes-workspace__edit').click(); await settleFocus();
  document.querySelector('.notes-workspace__edit-input').value = '  Saved draft  ';
  document.querySelector('.notes-workspace__save').click(); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id: firstId, text: 'Saved draft' }]);
  assert.equal(saves, 1); assert.deepEqual(toasts, ['Note updated.']);
  assert.equal(document.activeElement, document.querySelector('.notes-workspace__edit'));

  document.querySelector('.notes-workspace__edit').click(); await settleFocus();
  document.querySelector('.notes-workspace__edit-input').value = 'Saved with Enter';
  press(document.querySelector('.notes-workspace__edit-input'), 'Enter'); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id: firstId, text: 'Saved with Enter' }]);
  assert.equal(saves, 2);
});

test('Cancel and Escape retain text, do not persist, and restore Edit focus', async () => {
  let saves = 0;
  initNotesWorkspace({ onSave: () => { saves += 1; } });
  const id = addNote('Keep this'); saves = 0;
  document.querySelector('.notes-workspace__edit').click(); await settleFocus();
  document.querySelector('.notes-workspace__edit-input').value = 'Discard this';
  document.querySelector('.notes-workspace__cancel').click(); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id, text: 'Keep this' }]);
  assert.equal(saves, 0); assert.equal(document.activeElement, document.querySelector('.notes-workspace__edit'));

  document.querySelector('.notes-workspace__edit').click(); await settleFocus();
  document.querySelector('.notes-workspace__edit-input').value = 'Also discard';
  press(document.querySelector('.notes-workspace__edit-input'), 'Escape'); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id, text: 'Keep this' }]);
  assert.equal(saves, 0); assert.equal(document.activeElement, document.querySelector('.notes-workspace__edit'));
});

test('blank edits cannot replace a note or trigger persistence', async () => {
  let saves = 0; const toasts = [];
  initNotesWorkspace({ onSave: () => { saves += 1; }, showToast: message => toasts.push(message) });
  const id = addNote('Never blank'); saves = 0; toasts.length = 0;
  document.querySelector('.notes-workspace__edit').click(); await settleFocus();
  const editor = document.querySelector('.notes-workspace__edit-input'); editor.value = '   ';
  press(editor, 'Enter');
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id, text: 'Never blank' }]);
  assert.equal(saves, 0); assert.match(toasts[0], /text before saving/u); assert.equal(document.activeElement, editor);
});

test('Delete removes only its note, persists once, toasts, and focuses the next note', async () => {
  let saves = 0; const toasts = [];
  initNotesWorkspace({ onSave: () => { saves += 1; }, showToast: message => toasts.push(message) });
  const firstId = addNote('First'); const secondId = addNote('Second'); saves = 0; toasts.length = 0;
  document.querySelector(`[data-note-id="${firstId}"] .notes-workspace__delete`).click(); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, [{ id: secondId, text: 'Second' }]);
  assert.equal(saves, 1); assert.deepEqual(toasts, ['Note deleted.']);
  assert.equal(document.activeElement.dataset.noteId, secondId);

  document.querySelector('.notes-workspace__delete').click(); await settleFocus();
  assert.deepEqual(getNotesWorkspaceState().notes, []);
  assert.equal(document.activeElement, document.querySelector('#notesWorkspaceInput'));
});
