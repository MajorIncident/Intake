/**
 * @module notesWorkspace
 * @description Owns the persistent Notes Workspace at `[feature:notes-workspace]`, including note state, drag-and-drop, keyboard placement, and snapshot hydration.
 * @exports initNotesWorkspace, toggleNotesWorkspace, getNotesWorkspaceState, applyNotesWorkspaceState
 */

let notes = [];
let isOpen = true;
let onSave = () => {};
let showToast = () => {};
let lastFocusedField = null;
let editingNoteId = null;

/** Normalizes a candidate notes-workspace snapshot. @param {unknown} value - Raw snapshot. @returns {{notes: Array<{id:string,text:string}>, open:boolean}} Safe state. */
function normalizeState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const normalized = Array.isArray(source.notes) ? source.notes.reduce((items, item) => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (id && text && !seen.has(id)) { seen.add(id); items.push({ id, text }); }
    return items;
  }, []) : [];
  return { notes: normalized, open: source.open !== false };
}

/** Creates a stable note ID. @returns {string} New note identifier. */
function createId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `note-${crypto.randomUUID()}`
    : `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Returns whether an element is an editable text field in the primary intake form. @param {Element|null} element - Candidate element. @returns {element is HTMLInputElement|HTMLTextAreaElement} Whether it can accept a note. */
function isEditableIntakeField(element) {
  if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)) return false;
  if (!element.closest('.wrap') || element.readOnly || element.disabled || element.type === 'hidden') return false;
  if (element instanceof HTMLTextAreaElement) return true;
  return ['text', 'search', 'url', 'tel', 'email', 'password'].includes((element.type || 'text').toLowerCase());
}

/** Creates a notes-workspace control with shared note metadata. @param {'button'|'input'} tag - Control element type. @param {string} className - Control class. @param {string} noteId - Associated note ID. @returns {HTMLButtonElement|HTMLInputElement} Configured control. */
function createWorkspaceControl(tag, className, noteId) {
  const control = document.createElement(tag); control.className = className; control.dataset.noteId = noteId;
  if (tag === 'button') control.type = 'button';
  return control;
}

/** Renders notes and the workspace visibility affordances. @returns {void} */
function render({ focusNoteId = null, focusEdit = false } = {}) {
  const workspace = document.querySelector('#notesWorkspace');
  const list = document.querySelector('#notesWorkspaceList');
  const toggle = document.querySelector('#notesWorkspaceToggle');
  const addControls = document.querySelector('#notesWorkspaceControls');
  if (!workspace || !list) return;
  workspace.classList.toggle('is-collapsed', !isOpen);
  // The dock remains mounted so its collapse control stays discoverable.
  workspace.setAttribute('aria-hidden', 'false');
  if (toggle) { toggle.setAttribute('aria-expanded', String(isOpen)); toggle.textContent = isOpen ? 'Collapse notes' : 'Open notes'; }
  document.querySelector('#notesWorkspaceMenuBtn')?.setAttribute('aria-expanded', String(isOpen));
  if (addControls) addControls.hidden = !isOpen;
  list.hidden = !isOpen;
  list.replaceChildren();
  if (!notes.length) {
    const empty = document.createElement('li'); empty.className = 'notes-workspace__empty'; empty.textContent = 'No captured notes yet.'; list.append(empty); return;
  }
  notes.forEach(note => {
    const item = document.createElement('li'); item.className = 'notes-workspace__item'; item.draggable = true; item.tabIndex = 0; item.dataset.noteId = note.id;
    item.setAttribute('aria-label', `Note: ${note.text}. Drag to a text field or select then place in focused field.`);
    if (editingNoteId === note.id) {
      item.classList.add('is-editing'); item.draggable = false; item.tabIndex = -1;
      const input = createWorkspaceControl('input', 'notes-workspace__edit-input', note.id); input.value = note.text; input.setAttribute('aria-label', `Edit note: ${note.text}`);
      const actions = document.createElement('div'); actions.className = 'notes-workspace__actions';
      const save = createWorkspaceControl('button', 'notes-workspace__save', note.id); save.textContent = 'Save'; save.setAttribute('aria-label', `Save changes to note: ${note.text}`);
      const cancel = createWorkspaceControl('button', 'notes-workspace__cancel', note.id); cancel.textContent = 'Cancel'; cancel.setAttribute('aria-label', `Cancel editing note: ${note.text}`);
      actions.append(save, cancel); item.append(input, actions); list.append(item);
      queueMicrotask(() => { input.focus(); input.select(); });
      return;
    }
    const text = document.createElement('span'); text.className = 'notes-workspace__text'; text.textContent = note.text;
    const actions = document.createElement('div'); actions.className = 'notes-workspace__actions';
    const place = createWorkspaceControl('button', 'notes-workspace__place', note.id); place.textContent = 'Place in focused field'; place.setAttribute('aria-label', `Place note in focused field: ${note.text}`);
    const edit = createWorkspaceControl('button', 'notes-workspace__edit', note.id); edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit note: ${note.text}`);
    const remove = createWorkspaceControl('button', 'notes-workspace__delete', note.id); remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete note: ${note.text}`);
    actions.append(place, edit, remove); item.append(text, actions); list.append(item);
  });
  if (focusNoteId) queueMicrotask(() => {
    const item = [...document.querySelectorAll('.notes-workspace__item[data-note-id]')].find(entry => entry.dataset.noteId === focusNoteId);
    (focusEdit ? item?.querySelector('.notes-workspace__edit') : item)?.focus();
  });
}

/** Starts inline editing for one note without changing persisted state. @param {string} id - Note ID. @returns {void} */
function editNote(id) { if (!notes.some(note => note.id === id)) return; editingNoteId = id; render(); }

/** Finishes inline editing and restores focus without persisting. @param {string} id - Note ID. @returns {void} */
function cancelEdit(id) { editingNoteId = null; render({ focusNoteId: id, focusEdit: true }); }

/** Trims and saves an inline edit while retaining its stable ID. @param {string} id - Note ID. @param {string} value - Candidate text. @returns {void} */
function saveEdit(id, value) {
  const text = value.trim();
  if (!text) { showToast('Add some text before saving this note.'); document.querySelector('.notes-workspace__edit-input')?.focus(); return; }
  const note = notes.find(entry => entry.id === id);
  if (!note) return;
  note.text = text; editingNoteId = null; render({ focusNoteId: id, focusEdit: true }); onSave(); showToast('Note updated.');
}

/** Deletes one note, persists once, and restores focus to the nearest useful control. @param {string} id - Note ID. @returns {void} */
function deleteNote(id) {
  const index = notes.findIndex(note => note.id === id);
  if (index < 0) return;
  notes.splice(index, 1); editingNoteId = null;
  const focusId = notes[index]?.id || notes[index - 1]?.id || null;
  render({ focusNoteId: focusId }); onSave(); showToast('Note deleted.');
  if (!focusId) queueMicrotask(() => document.querySelector('#notesWorkspaceInput')?.focus());
}

/** Removes a note after a successful insertion and persists the result. @param {string} id - Note ID. @returns {void} */
function removeNote(id) { notes = notes.filter(note => note.id !== id); render(); onSave(); }

/** Inserts a note at a control's selection or appends it with a separator. @param {string} id - Note ID. @param {Element|null} target - Target control. @returns {boolean} Success. */
function placeNote(id, target) {
  const note = notes.find(entry => entry.id === id);
  if (!note || !isEditableIntakeField(target)) return false;
  try {
    const value = target.value || '';
    const start = Number.isInteger(target.selectionStart) ? target.selectionStart : value.length;
    const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : value.length;
    const insert = start === value.length && value && !/\s$/u.test(value) ? ` ${note.text}` : note.text;
    target.value = `${value.slice(0, start)}${insert}${value.slice(end)}`;
    const cursor = start + insert.length;
    target.setSelectionRange?.(cursor, cursor);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    lastFocusedField = target;
    removeNote(id);
    showToast('Note placed in the focused field.');
    return true;
  } catch (_error) { return false; }
}

/** Initializes the workspace DOM listeners and persistence callbacks. @param {{onSave?: () => void, showToast?: (message:string) => void}} [options={}] - Callback configuration. @returns {HTMLElement|null} Workspace root when mounted. */
export function initNotesWorkspace({ onSave: save = () => {}, showToast: toast = () => {} } = {}) {
  onSave = typeof save === 'function' ? save : () => {};
  showToast = typeof toast === 'function' ? toast : () => {};
  const workspace = document.querySelector('#notesWorkspace');
  if (!workspace || workspace.dataset.initialized === 'true') return workspace;
  workspace.dataset.initialized = 'true';
  document.querySelector('#notesWorkspaceAddBtn')?.addEventListener('click', () => {
    const input = document.querySelector('#notesWorkspaceInput'); const text = input?.value.trim();
    if (!text) return;
    notes.push({ id: createId(), text }); input.value = ''; render(); onSave(); showToast('Note captured.');
  });
  document.querySelector('#notesWorkspaceInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); document.querySelector('#notesWorkspaceAddBtn')?.click(); } });
  document.querySelector('#notesWorkspaceToggle')?.addEventListener('click', () => toggleNotesWorkspace());
  document.addEventListener('focusin', event => { if (isEditableIntakeField(event.target)) lastFocusedField = event.target; });
  document.addEventListener('dragstart', event => { if (event.target.closest?.('button,input')) { event.preventDefault(); return; } const item = event.target.closest?.('.notes-workspace__item[data-note-id]'); if (!item) return; event.dataTransfer?.setData('text/x-intake-note-id', item.dataset.noteId); event.dataTransfer?.setData('text/plain', item.querySelector('.notes-workspace__text')?.textContent || ''); event.dataTransfer.effectAllowed = 'copy'; });
  document.addEventListener('dragover', event => { if (isEditableIntakeField(event.target)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', event => { if (!isEditableIntakeField(event.target)) return; const id = event.dataTransfer?.getData('text/x-intake-note-id'); if (id) { event.preventDefault(); placeNote(id, event.target); } });
  document.querySelector('#notesWorkspaceList')?.addEventListener('click', event => {
    const control = event.target.closest?.('button[data-note-id]'); if (!control) return;
    if (control.matches('.notes-workspace__place')) placeNote(control.dataset.noteId, lastFocusedField || document.activeElement);
    else if (control.matches('.notes-workspace__edit')) editNote(control.dataset.noteId);
    else if (control.matches('.notes-workspace__save')) saveEdit(control.dataset.noteId, document.querySelector('.notes-workspace__edit-input')?.value || '');
    else if (control.matches('.notes-workspace__cancel')) cancelEdit(control.dataset.noteId);
    else if (control.matches('.notes-workspace__delete')) deleteNote(control.dataset.noteId);
  });
  document.querySelector('#notesWorkspaceList')?.addEventListener('keydown', event => {
    const editor = event.target.closest?.('.notes-workspace__edit-input');
    if (editor && event.key === 'Enter') { event.preventDefault(); saveEdit(editor.dataset.noteId, editor.value); return; }
    if (editor && event.key === 'Escape') { event.preventDefault(); cancelEdit(editor.dataset.noteId); return; }
    if (event.target.closest?.('button,input')) return;
    const item = event.target.closest?.('[data-note-id]'); if (item && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); placeNote(item.dataset.noteId, lastFocusedField); }
  });
  render(); return workspace;
}

/** Toggles the dock's collapsed state and restores focus to its launcher when closing. @returns {void} */
export function toggleNotesWorkspace() { isOpen = !isOpen; render(); onSave(); if (isOpen) document.querySelector('#notesWorkspaceInput')?.focus(); else document.querySelector('#notesWorkspaceToggle')?.focus(); }
/** Returns a serializable notes workspace snapshot. @returns {{notes:Array<{id:string,text:string}>,open:boolean}} Notes and dock preference. */
export function getNotesWorkspaceState() { return { notes: notes.map(note => ({ ...note })), open: isOpen }; }
/** Applies a serialized notes workspace snapshot. @param {unknown} state - State to hydrate. @returns {void} */
export function applyNotesWorkspaceState(state) { const normalized = normalizeState(state); notes = normalized.notes; isOpen = normalized.open; editingNoteId = null; render(); }
