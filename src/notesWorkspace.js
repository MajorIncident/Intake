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

/** Renders notes and the workspace visibility affordances. @returns {void} */
function render() {
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
    const text = document.createElement('span'); text.className = 'notes-workspace__text'; text.textContent = note.text;
    const place = document.createElement('button'); place.type = 'button'; place.className = 'notes-workspace__place'; place.dataset.noteId = note.id; place.textContent = 'Place in focused field';
    item.append(text, place); list.append(item);
  });
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
  document.addEventListener('dragstart', event => { const item = event.target.closest?.('[data-note-id]'); if (!item) return; event.dataTransfer?.setData('text/x-intake-note-id', item.dataset.noteId); event.dataTransfer?.setData('text/plain', item.querySelector('.notes-workspace__text')?.textContent || ''); event.dataTransfer.effectAllowed = 'copy'; });
  document.addEventListener('dragover', event => { if (isEditableIntakeField(event.target)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', event => { if (!isEditableIntakeField(event.target)) return; const id = event.dataTransfer?.getData('text/x-intake-note-id'); if (id) { event.preventDefault(); placeNote(id, event.target); } });
  document.querySelector('#notesWorkspaceList')?.addEventListener('click', event => { const button = event.target.closest?.('.notes-workspace__place'); if (button) placeNote(button.dataset.noteId, lastFocusedField || document.activeElement); });
  document.querySelector('#notesWorkspaceList')?.addEventListener('keydown', event => { const item = event.target.closest?.('[data-note-id]'); if (item && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); placeNote(item.dataset.noteId, lastFocusedField); } });
  render(); return workspace;
}

/** Toggles the dock's collapsed state and restores focus to its launcher when closing. @returns {void} */
export function toggleNotesWorkspace() { isOpen = !isOpen; render(); onSave(); if (isOpen) document.querySelector('#notesWorkspaceInput')?.focus(); else document.querySelector('#notesWorkspaceToggle')?.focus(); }
/** Returns a serializable notes workspace snapshot. @returns {{notes:Array<{id:string,text:string}>,open:boolean}} Notes and dock preference. */
export function getNotesWorkspaceState() { return { notes: notes.map(note => ({ ...note })), open: isOpen }; }
/** Applies a serialized notes workspace snapshot. @param {unknown} state - State to hydrate. @returns {void} */
export function applyNotesWorkspaceState(state) { const normalized = normalizeState(state); notes = normalized.notes; isOpen = normalized.open; render(); }
