/**
 * @file Coordinates the Kepner-Tregoe table lifecycle and related UI helpers.
 * @module kt
 * @description Manages the KT (Kepner-Tregoe) analysis table lifecycle, including
 * bootstrapping DOM anchors, rendering the Possible Causes card, and syncing
 * shared events such as `intake:actions-updated`. The module wires focus-mode
 * toggles, evidence entry textareas, and the cause-testing UI so that the
 * intake experience stays coordinated across modules.
 */
import {
  ROWS,
  CAUSE_FINDING_MODES,
  CAUSE_FINDING_MODE_VALUES
} from './constants.js';
import { buildCauseActionCounts } from './causeActionCounts.js';

/**
 * Default no-op auto-resize implementation used before configuration.
 * @param {HTMLTextAreaElement} element - Textarea element to resize.
 * @returns {void}
 */
function defaultAutoResize(element){
  void element;
}
/**
 * Default persistence handler that avoids errors when dependencies are unset.
 * @returns {void}
 */
function defaultSaveHandler(){ /* no-op */ }
/**
 * Default toast presenter stub that silences messages when unconfigured.
 * @param {string} message - Toast body that would have been displayed.
 * @returns {void}
 */
function defaultShowToast(message){
  void message;
}
/**
 * Default token change handler used until a consumer registers one.
 * @returns {void}
 */
function defaultTokensChangeHandler(){ /* no-op */ }
/**
 * Default supplier for the full object description.
 * @returns {string} Empty fallback description.
 */
function defaultGetObjectFull(){
  return '';
}
/**
 * Default supplier for the full deviation description.
 * @returns {string} Empty fallback description.
 */
function defaultGetDeviationFull(){
  return '';
}

/**
 * Builds a standardized cause-testing question tying the hypothesis to a KT row.
 * @param {PossibleCause} [cause] - Cause supplying suspect and accusation context.
 * @param {KTRowBinding} [row] - KT row binding containing the question prompt.
 * @returns {string} Prompt framed to explain how the hypothesis addresses the row.
 */
function buildCauseTestQuestionPrompt(cause, row){
  const suspectClean = normalizeHypothesisValue(cause?.suspect || '');
  const suspectText = suspectClean || 'this cause';
  const accusationClean = normalizeHypothesisValue(cause?.accusation || '');
  const hasAccusation = Boolean(accusationClean);
  const accusationNormalized = normalizeAccusation(accusationClean);
  const suspectIsPlural = /\b(?:and|&)\b/iu.test(suspectText)
    || /s$/iu.test((suspectText.split(/\s+/u).pop() || '').replace(/[^a-z]/giu, ''));
  const accusationClauseRaw = hasAccusation
    ? buildDirectAccusationClause(accusationNormalized, suspectIsPlural)
    : (suspectIsPlural ? 'are causing the deviation' : 'is causing the deviation');
  const accusationClause = trimValue(accusationClauseRaw) && accusationClauseRaw !== '…'
    ? accusationClauseRaw.trim()
    : (suspectIsPlural ? 'are causing the deviation' : 'is causing the deviation');
  const rowQuestion = row?.th?.textContent?.trim() || fillTokens(row?.def?.q || '') || 'this KT row';
  const questionClean = rowQuestion.replace(/[?]+$/u, '').trim() || 'this KT row';
  return `If ${suspectText} ${accusationClause}, how does it explain ${questionClean}?`;
}

let autoResize = defaultAutoResize;
let saveHandler = defaultSaveHandler;
let showToastHandler = defaultShowToast;
let tokensChangeHandler = defaultTokensChangeHandler;
let getObjectFullFn = defaultGetObjectFull;
let getDeviationFullFn = defaultGetDeviationFull;

/**
 * @typedef {object} CauseFinding
 * @property {string} mode - Normalized finding mode (`assumption`, `yes`, or `fail`).
 * @property {string} note - Supporting explanation for how the hypothesis handles
 * the IS / IS NOT evidence pair.
 */

/**
 * @typedef {object} PossibleCause
 * @property {string} id - Stable identifier generated for DOM bindings and persistence.
 * @property {string} suspect - Working hypothesis of the suspected cause.
 * @property {string} accusation - Description of the behavior the cause would produce.
 * @property {string} impact - Statement describing the customer or system impact.
 * @property {Record<string, CauseFinding>} findings - Map of KT row keys to evaluation details.
 * @property {string} summaryText - Cached hypothesis summary rendered in the card view.
 * @property {('low'|'medium'|'high'|'')} confidence - Optional confidence signal persisted with the hypothesis.
 * @property {string} evidence - Optional supporting evidence statement persisted with the hypothesis.
 * @property {boolean} editing - Whether the card is in inline edit mode.
 * @property {boolean} testingOpen - Whether the test panel is expanded.
 */

/**
 * @typedef {object} TableFocusOptions
 * @property {boolean} [silent] - When true the change avoids saving or firing toast notifications.
 * Defaults to false.
 */

/**
 * @typedef {object} CauseImportRecord
 * @property {string} q - KT question text used as a row lookup key.
 * @property {string} [questionId] - Stable question identifier when available.
 * @property {string} is - Evidence that *is* present.
 * @property {string} no - Evidence that *is not* present.
 * @property {string} di - Distinctions captured for the row.
 * @property {string} ch - Recorded changes for the row.
 */

/**
 * @typedef {object} BandImportRecord
 * @property {string} band - Title for a band row in the exported table.
 */

/**
 * @typedef {object} KTRowBinding
 * @property {HTMLTableRowElement} tr - Row element for the KT table entry.
 * @property {HTMLTableCellElement} th - Header cell containing the prompt.
 * @property {object} def - Row definition from `ROWS`.
 * @property {HTMLTextAreaElement} isTA - Textarea capturing IS evidence.
 * @property {HTMLTextAreaElement} notTA - Textarea capturing IS NOT evidence.
 * @property {HTMLTextAreaElement} distTA - Textarea capturing distinctions.
 * @property {HTMLTextAreaElement} chgTA - Textarea capturing changes.
 * @property {string} [questionId] - Stable identifier for the question row.
 * @property {string} [priority] - Optional priority label.
 * @property {string|null} [bandId] - Associated band grouping identifier.
 * @property {number} rowNumber - 1-based row number used for focus modes.
 */

const tbody = document.getElementById('tbody');
const rowsBuilt = [];
let possibleCauses = [];
let likelyCauseId = null;
let causeList = document.getElementById('causeList');
let addCauseBtn = document.getElementById('addCauseBtn');

const ACTIONS_UPDATED_EVENT = 'intake:actions-updated';
let actionUpdateListenerBound = false;
let causeActionCounts = new Map();

const TABLE_FOCUS_MODES = ['rapid', 'focused', 'comprehensive'];
const TABLE_MODE_ROWS = Object.freeze({
  rapid: Object.freeze([1, 2, 7]),
  focused: Object.freeze([1, 2, 3, 5, 7])
});
const DEFAULT_TABLE_FOCUS_MODE = 'rapid';

/**
 * Row prompts whose Distinctions/Changes fields should appear semi-disabled.
 * @type {Set<string>}
 */
const SEMI_DISABLED_DISTINCTION_ROWS = new Set([
  'WHAT — Specific Deviation does the {OBJECT} have?',
  'EXTENT — What is the population or size of {OBJECT} affected?',
  'EXTENT — What is the size of a single {DEVIATION}?',
  'EXTENT — How many {DEVIATION} are occuring on each {OBJECT}?'
]);

const ROW_THEME_ASSIGNMENTS = Object.freeze({
  1: 'blue',
  2: 'blue',
  3: 'lavender',
  5: 'lavender',
  7: 'blue'
});
let tableFocusMode = DEFAULT_TABLE_FOCUS_MODE;

const bandMap = new Map();
let bandCounter = 0;
let focusToggleButtons = [];
let focusControlsBound = false;

let objectIS = null;
let deviationIS = null;
let objectISDirty = false;
let deviationISDirty = false;

/**
 * Registers shared dependencies so the KT table can communicate with the
 * surrounding application shell.
 * @param {object} [options] - Optional dependency overrides.
 * @param {(element: HTMLTextAreaElement) => void} [options.autoResize] -
 * Callback used to auto-resize textarea fields after edits.
 * @param {() => void} [options.onSave] - Invoked whenever KT state should be
 * persisted to storage.
 * @param {(message: string) => void} [options.showToast] - Toast presenter used
 * for guidance and Likely Cause notifications.
 * @param {() => void} [options.onTokensChange] - Handler invoked when the
 * tokenized IS / IS NOT snippets change.
 * @param {() => string} [options.getObjectFull] - Supplier for the full object
 * description when placeholder tokens are expanded.
 * @param {() => string} [options.getDeviationFull] - Supplier for the full
 * deviation description when placeholder tokens are expanded.
 * @returns {void}
 */
export function configureKT({
  autoResize: autoResizeFn,
  onSave,
  showToast,
  onTokensChange,
  getObjectFull,
  getDeviationFull
} = {}){
  if(typeof autoResizeFn === 'function'){
    autoResize = autoResizeFn;
  }
  if(typeof onSave === 'function'){
    saveHandler = onSave;
  }
  if(typeof showToast === 'function'){
    showToastHandler = showToast;
  }
  if(typeof onTokensChange === 'function'){
    tokensChangeHandler = onTokensChange;
  }
  if(typeof getObjectFull === 'function'){
    getObjectFullFn = getObjectFull;
  }
  if(typeof getDeviationFull === 'function'){
    getDeviationFullFn = getDeviationFull;
  }
  bindActionUpdateListener();
}

/**
 * Subscribes to shared action update events so cause badges re-render
 * automatically.
 * @returns {void}
 */
function bindActionUpdateListener(){
  if(actionUpdateListenerBound) return;
  if(typeof window === 'undefined') return;
  window.addEventListener(ACTIONS_UPDATED_EVENT, () => {
    renderCauses();
  });
  actionUpdateListenerBound = true;
}

/**
 * Refreshes the cached action counts map so cause badges stay in sync with
 * external modules emitting `intake:actions-updated`.
 * @returns {void}
 */
function refreshCauseActionCounts(){
  try{
    const counts = buildCauseActionCounts();
    if(counts instanceof Map){
      causeActionCounts = counts;
    }else{
      const pairs = counts && typeof counts === 'object'
        ? Object.entries(counts).filter(entry => typeof entry[1] === 'number')
        : [];
      causeActionCounts = new Map(pairs);
    }
  }catch(_){
    causeActionCounts = new Map();
  }
}

/**
 * Looks up the number of actions associated with a cause identifier.
 * @param {string} id - Cause identifier used when recording actions.
 * @returns {number} Count of actions tied to the cause.
 */
function causeActionCountById(id){
  if(typeof id !== 'string') return 0;
  const key = id.trim();
  if(!key) return 0;
  return causeActionCounts.get(key) || 0;
}

/**
 * Formats a numeric action count into a friendly badge label.
 * @param {number} count - Number of actions connected to a cause.
 * @returns {string} Human-readable text describing the count.
 */
function formatCauseActionCount(count){
  if(!Number.isFinite(count) || count <= 0) return 'No actions yet';
  return count === 1 ? '1 action assigned' : `${count} actions assigned`;
}

/**
 * Updates the action-count badge for a cause card and mirrors metadata for
 * screen readers.
 * @param {HTMLElement} el - Badge element receiving the updates.
 * @param {PossibleCause} cause - Cause whose actions are being summarized.
 * @returns {string} Human-readable label describing the action count.
 */
function updateCauseActionBadge(el, cause){
  if(!el) return 'No actions yet';
  const count = causeActionCountById(cause?.id);
  const text = formatCauseActionCount(count);
  el.textContent = text;
  el.dataset.count = String(count);
  el.setAttribute('aria-label', text);
  return text;
}

/**
 * Delegates to the configured toast handler when available.
 * @param {string} message - Toast content to present.
 * @returns {void}
 */
function callShowToast(message){
  if(typeof showToastHandler === 'function'){
    showToastHandler(message);
  }
}

/**
 * Returns a trimmed snippet extracted from the start of a multi-line string.
 * @param {string} v - Raw text to summarize.
 * @returns {string} Short snippet suitable for inline substitution.
 */
function firstSnippet(v){
  const s = (v || '').trim();
  if(!s) return '';
  const first = s.split(/\n|\. /)[0];
  return first.length > 120 ? first.slice(0, 120) : first;
}

/**
 * Returns the textarea element bound to the KT "Object IS" cell.
 * @returns {HTMLTextAreaElement|null} Reference to the textarea or `null`
 * before the table is initialized.
 */
export function getObjectISField(){
  return objectIS;
}

/**
 * Returns the textarea element bound to the KT "Deviation IS" cell.
 * @returns {HTMLTextAreaElement|null} Reference to the textarea or `null`
 * before the table is initialized.
 */
export function getDeviationISField(){
  return deviationIS;
}

/**
 * Indicates whether the "Object IS" textarea has been modified since
 * `initTable()` wired listeners.
 * @returns {boolean} `true` when edits have been observed.
 */
export function isObjectISDirty(){
  return objectISDirty;
}

/**
 * Indicates whether the "Deviation IS" textarea has been modified since
 * `initTable()` wired listeners.
 * @returns {boolean} `true` when edits have been observed.
 */
export function isDeviationISDirty(){
  return deviationISDirty;
}

/**
 * Replaces `{OBJECT}` and `{DEVIATION}` tokens with the best available snippets
 * from the primary KT table inputs.
 * @param {string} text - Template string containing placeholder tokens.
 * @returns {string} Token-expanded text safe for UI presentation.
 */
export function fillTokens(text){
  const obj = firstSnippet(objectIS?.value)
    || firstSnippet(getObjectFullFn())
    || 'object';
  const dev = firstSnippet(deviationIS?.value)
    || firstSnippet(getDeviationFullFn())
    || 'deviation';
  return (text || '')
    .replace(/\{OBJECT\}/g, `“${obj}”`)
    .replace(/\{DEVIATION\}/g, `“${dev}”`);
}

/**
 * Normalizes a focus mode string to one of the supported table presets.
 * @param {string} mode - Requested focus mode.
 * @returns {string} Valid focus mode slug.
 */
function normalizeTableFocusMode(mode){
  if(typeof mode === 'string'){
    const normalized = mode.trim().toLowerCase();
    if(TABLE_FOCUS_MODES.includes(normalized)){
      return normalized;
    }
  }
  return DEFAULT_TABLE_FOCUS_MODE;
}

/**
 * Determines whether a KT row should be shown for the active focus mode.
 * @param {KTRowBinding} row - Row metadata for the KT table.
 * @param {string} mode - Active focus mode slug.
 * @returns {boolean} Whether the row is visible.
 */
function shouldDisplayRowForMode(row, mode){
  const rowNumber = Number(row?.rowNumber);
  if(!Number.isInteger(rowNumber) || rowNumber < 1){
    return true;
  }
  const allowedRows = TABLE_MODE_ROWS[mode];
  if(!Array.isArray(allowedRows)){
    return true;
  }
  return allowedRows.includes(rowNumber);
}

/**
 * Handles keyboard interactions for the focus mode toggle group.
 * @param {KeyboardEvent} event - Keyboard event from the toggle group.
 * @returns {void}
 */
function handleFocusToggleKeydown(event){
  if(!focusToggleButtons.length) return;
  const key = event.key;
  if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)){
    return;
  }
  event.preventDefault();
  if(key === 'Home'){
    const firstBtn = focusToggleButtons[0];
    if(firstBtn){
      setTableFocusMode(firstBtn.dataset.focusMode);
      firstBtn.focus();
    }
    return;
  }
  if(key === 'End'){
    const lastBtn = focusToggleButtons[focusToggleButtons.length - 1];
    if(lastBtn){
      setTableFocusMode(lastBtn.dataset.focusMode);
      lastBtn.focus();
    }
    return;
  }
  const direction = (key === 'ArrowRight' || key === 'ArrowDown') ? 1 : -1;
  const currentIndex = focusToggleButtons.findIndex(btn => normalizeTableFocusMode(btn.dataset.focusMode) === tableFocusMode);
  let nextIndex = currentIndex + direction;
  if(nextIndex < 0){
    nextIndex = focusToggleButtons.length - 1;
  }else if(nextIndex >= focusToggleButtons.length){
    nextIndex = 0;
  }
  const nextBtn = focusToggleButtons[nextIndex];
  if(nextBtn){
    setTableFocusMode(nextBtn.dataset.focusMode);
    nextBtn.focus();
  }
}

/**
 * Locates and wires the focus mode controls to support mouse and keyboard
 * interactions.
 * @returns {void}
 */
function wireFocusModeControls(){
  if(focusControlsBound) return;
  const group = document.querySelector('.kt-focus-toggle');
  if(!group) return;
  const buttons = [...group.querySelectorAll('[data-focus-mode]')];
  if(!buttons.length) return;
  focusToggleButtons = buttons;
  focusToggleButtons.forEach(btn => {
    if(btn.type !== 'button'){
      btn.type = 'button';
    }
    if(!btn.getAttribute('role')){
      btn.setAttribute('role', 'radio');
    }
    btn.addEventListener('click', () => {
      setTableFocusMode(btn.dataset.focusMode);
    });
  });
  group.addEventListener('keydown', handleFocusToggleKeydown);
  focusControlsBound = true;
}

/**
 * Returns the current KT table focus mode (rapid, focused, or comprehensive).
 * @returns {string} Active table mode slug.
 */
export function getTableFocusMode(){
  return tableFocusMode;
}

/**
 * Sets the current KT table focus mode and optionally suppresses persistence.
 * @param {string} mode - Requested focus mode slug.
 * @param {TableFocusOptions} [options] - Behavior flags for the update.
 * @returns {void}
 */
export function setTableFocusMode(mode, options = {}){
  const normalized = normalizeTableFocusMode(mode);
  const previous = tableFocusMode;
  tableFocusMode = normalized;
  const silent = Boolean(options.silent || normalized === previous);
  applyTableFocusMode({ silent });
}

/**
 * Applies the active focus mode to the DOM, toggling row visibility and
 * refreshing dependent UI such as previews and progress chips.
 * @param {TableFocusOptions} [options] - Behavior flags for the application.
 * @param {boolean} [options.silent] - When true the change will not trigger
 * persistence callbacks. Defaults to false.
 * @returns {void}
 */
export function applyTableFocusMode({ silent = false } = {}){
  wireFocusModeControls();
  const mode = tableFocusMode;
  const visibleBands = new Set();
  rowsBuilt.forEach(row => {
    const shouldShow = shouldDisplayRowForMode(row, mode);
    if(row?.tr){
      row.tr.hidden = !shouldShow;
    }
    if(shouldShow && row?.bandId){
      visibleBands.add(row.bandId);
    }
  });
  bandMap.forEach((bandTr, bandId) => {
    if(!bandTr) return;
    bandTr.hidden = !visibleBands.has(bandId);
  });
  focusToggleButtons.forEach(btn => {
    const btnMode = normalizeTableFocusMode(btn.dataset.focusMode);
    const isActive = btnMode === mode;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    btn.tabIndex = isActive ? 0 : -1;
  });
  if(!silent){
    saveHandler();
  }
  updateCauseEvidencePreviews();
}

/**
 * Generates the IS NOT placeholder using latest snippets and fallback tokens.
 * @param {string} baseCopy - Base placeholder copy from constants.
 * @param {string} isVal - Current IS textarea value for contextual prompts.
 * @returns {string} Placeholder text for the IS NOT textarea.
 */
function mkIsNotPH(baseCopy, isVal){
  const base = (baseCopy || '').trim();
  const isSnippet = firstSnippet(isVal);
  if(isSnippet){
    const prompt = fillTokens('');
    return base ? `${prompt}\n\n${base}` : prompt;
  }
  return base || fillTokens('');
}

/**
 * Generates the Distinctions placeholder combining IS and IS NOT snippets.
 * @param {string} isVal - Current IS textarea value.
 * @param {string} notVal - Current IS NOT textarea value.
 * @returns {string} Placeholder text for the Distinctions textarea.
 */
function mkDistPH(isVal, notVal){
  const base = fillTokens('');
  const isSnippet = firstSnippet(isVal);
  const notSnippet = firstSnippet(notVal);
  const parts = [];
  if(isSnippet){
    parts.push(`What is different, odd, special, or uniquely true about “${isSnippet}”?`);
  }
  if(notSnippet){
    parts.push(`Only list traits that are not shared by “${notSnippet}”`);
  }
  const lead = parts.length ? parts.join(' ') + '' : '';
  return lead ? `${lead}\n${base}` : base;
}

/**
 * Generates the Changes placeholder referencing the Distinctions snippet.
 * @param {string} distText - Current Distinctions textarea value.
 * @returns {string} Placeholder text for the Changes textarea.
 */
function mkChangePH(distText){
  const base = fillTokens('');
  const distSnippet = firstSnippet(distText);
  if(distSnippet){
    return `What changed in, on, around, or about “${distSnippet}”, Ask this question for each distinction listed.\n${base}`;
  }
  return base;
}

/**
 * Refreshes question headers and placeholders so they reflect the latest
 * `{OBJECT}` / `{DEVIATION}` tokens.
 * @returns {void}
 */
export function refreshAllTokenizedText(){
  rowsBuilt.forEach(({ th, def, isTA, notTA }) => {
    th.textContent = fillTokens(def.q);
    isTA.placeholder = fillTokens(def.isPH || '');
    notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), isTA.value);
  });
  updateCauseEvidencePreviews();
}

/**
 * Checks whether a finding mode value matches supported constants.
 * @param {string} mode - Candidate finding mode.
 * @returns {boolean} True when the mode is valid.
 */
function isValidFindingMode(mode){
  return typeof mode === 'string' && CAUSE_FINDING_MODE_VALUES.includes(mode);
}

/**
 * Normalizes persisted finding entries into the shape expected by the UI.
 * @param {CauseFinding|object|string} entry - Raw finding value.
 * @returns {CauseFinding} Normalized finding data.
 */
function normalizeFindingEntry(entry){
  const normalized = { mode: '', note: '' };
  if(entry && typeof entry === 'object'){
    if(typeof entry.mode === 'string'){
      const mode = entry.mode.trim().toLowerCase();
      if(isValidFindingMode(mode)){
        normalized.mode = mode;
      }
    }
    if(typeof entry.note === 'string'){
      normalized.note = entry.note;
    }else if(typeof entry.note === 'number'){
      normalized.note = String(entry.note);
    }
    const explainIs = typeof entry.explainIs === 'string' ? entry.explainIs.trim() : '';
    const explainNot = typeof entry.explainNot === 'string' ? entry.explainNot.trim() : '';
    if(!normalized.mode && (explainIs || explainNot)){
      normalized.mode = CAUSE_FINDING_MODES.YES;
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    }else if(normalized.mode && !normalized.note && (explainIs || explainNot)){
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    }
  }else if(typeof entry === 'string'){
    normalized.mode = CAUSE_FINDING_MODES.YES;
    normalized.note = entry;
  }
  return normalized;
}

/**
 * Returns the normalized finding mode for a stored cause evaluation entry.
 * @param {CauseFinding|object} entry - Raw finding data from persistence.
 * @returns {string} Normalized mode or an empty string when unset.
 */
export function findingMode(entry){
  if(!entry || typeof entry !== 'object') return '';
  const mode = typeof entry.mode === 'string' ? entry.mode : '';
  return isValidFindingMode(mode) ? mode : '';
}

/**
 * Returns the supporting note for a cause evaluation entry.
 * @param {CauseFinding|object} entry - Raw finding data from persistence.
 * @returns {string} Note text or an empty string when not provided.
 */
export function findingNote(entry){
  if(!entry || typeof entry !== 'object') return '';
  return typeof entry.note === 'string' ? entry.note : '';
}

/**
 * Determines whether a finding entry has both a mode and a supporting note.
 * @param {CauseFinding|object} entry - Finding to evaluate.
 * @returns {boolean} True when the entry is complete.
 */
function findingIsComplete(entry){
  const mode = findingMode(entry);
  if(!mode) return false;
  const note = findingNote(entry).trim();
  if(!note) return false;
  return true;
}

/**
 * Retrieves and normalizes a stored finding without mutating row progress.
 * @param {PossibleCause} cause - Cause containing the findings map.
 * @param {string} key - KT row key used as the lookup identifier.
 * @returns {CauseFinding|null} Normalized finding payload or `null` when none
 * is stored.
 */
function peekCauseFinding(cause, key){
  if(!cause || !cause.findings || typeof cause.findings !== 'object') return null;
  const existing = cause.findings[key];
  if(!existing) return null;
  const normalized = normalizeFindingEntry(existing);
  cause.findings[key] = normalized;
  return normalized;
}

export { peekCauseFinding };

/**
 * Checks whether any findings for a cause have been marked as failures.
 * @param {PossibleCause} cause - Cause being evaluated.
 * @returns {boolean} `true` when at least one finding is a failure.
 */
export function causeHasFailure(cause){
  if(!cause) return false;
  const indexes = evidencePairIndexes();
  if(!indexes.length) return false;
  for(let i = 0; i < indexes.length; i++){
    const entry = peekCauseFinding(cause, getRowKeyByIndex(indexes[i]));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.FAIL){
      return true;
    }
  }
  return false;
}

/**
 * Counts how many findings for a cause rely on the "Assumption" mode.
 * @param {PossibleCause} cause - Cause being evaluated.
 * @returns {number} Total assumption findings across visible evidence pairs.
 */
export function countCauseAssumptions(cause){
  if(!cause) return 0;
  const indexes = evidencePairIndexes();
  let total = 0;
  indexes.forEach(idx => {
    const entry = peekCauseFinding(cause, getRowKeyByIndex(idx));
    if(entry && findingMode(entry) === CAUSE_FINDING_MODES.ASSUMPTION){
      total++;
    }
  });
  return total;
}

/**
 * Replaces `<is>` placeholder tokens within note templates for readability.
 * @param {string} template - Template text containing placeholders.
 * @param {string} isText - IS evidence text.
 * @param {string} notText - IS NOT evidence text.
 * @returns {string} Template with placeholders substituted.
 */
function substituteEvidenceTokens(template, isText, notText){
  if(typeof template !== 'string') return '';
  const safeIs = (isText || '').trim() || 'IS column';
  const safeNot = (notText || '').trim() || 'IS NOT column';
  return template
    .replace(/<is\s+not>/gi, safeNot)
    .replace(/<is>/gi, safeIs);
}

/**
 * Generates a semi-random identifier for a new possible cause.
 * @returns {string} Unique identifier string.
 */
function generateCauseId(){
  return 'cause-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

/**
 * Creates a new editable possible-cause shell with default metadata.
 * @returns {PossibleCause} Fresh cause model ready for editing.
 */
export function createEmptyCause(){
  return {
    id: generateCauseId(),
    suspect: '',
    accusation: '',
    impact: '',
    summaryText: '',
    confidence: '',
    evidence: '',
    findings: {},
    editing: true,
    testingOpen: false
  };
}

/**
 * Builds a fallback label for a cause based on available text content.
 * @param {PossibleCause} cause - Cause to summarize.
 * @returns {string} Label used in toasts and toggles.
 */
function causeDisplayLabel(cause){
  if(!cause) return '';
  const suspect = typeof cause.suspect === 'string' ? cause.suspect.trim() : '';
  if(suspect){
    return suspect;
  }
  const accusation = typeof cause.accusation === 'string' ? cause.accusation.trim() : '';
  if(accusation){
    return accusation;
  }
  const index = possibleCauses.findIndex(item => item && item.id === cause.id);
  return index >= 0 ? `Possible Cause ${index + 1}` : 'Selected cause';
}

/**
 * Updates the Likely Cause toggle state and accessibility attributes.
 * @param {HTMLElement} card - Root cause card element.
 * @param {PossibleCause} cause - Cause associated with the card.
 * @returns {void}
 */
function updateLikelyBadge(card, cause){
  if(!card || !cause) return;
  const toggle = card.querySelector('[data-role="likely-toggle"]');
  if(!toggle) return;
  const failed = causeHasFailure(cause);
  const selected = !failed && likelyCauseId === cause.id;
  if(selected){
    card.dataset.likely = 'true';
  }else{
    delete card.dataset.likely;
  }
  if(failed){
    toggle.disabled = true;
    toggle.dataset.state = 'failed';
    toggle.textContent = 'Not a match';
    toggle.removeAttribute('aria-pressed');
    toggle.setAttribute('aria-label', "This cause was ruled out and can't be set as Likely.");
  }else{
    toggle.disabled = false;
    toggle.dataset.state = selected ? 'selected' : 'idle';
    toggle.textContent = selected ? '⭐ Likely Cause' : '☆ Set as Likely';
    toggle.setAttribute('aria-pressed', selected ? 'true' : 'false');
    toggle.setAttribute('aria-label', selected ? 'Unset Likely Cause.' : 'Set this cause as the Likely Cause.');
  }
}

/**
 * Persists the Likely Cause selection, coordinating toast messaging and
 * optional re-renders.
 * @param {string|null} nextId - Identifier for the new Likely Cause or `null`
 * to clear it.
 * @param {object} [options] - Options controlling toast and rendering.
 * @param {boolean} [options.silent] - When true suppresses toast messaging.
 * Defaults to false.
 * @param {string} [options.message] - Optional override for the toast copy.
 * Defaults to an auto-generated label.
 * @param {boolean} [options.skipRender] - When true prevents `renderCauses()`
 * from running. Defaults to false.
 * @returns {boolean} `true` when the selection changed.
 */
function commitLikelyCause(nextId, { silent = false, message = '', skipRender = false } = {}){
  const normalized = typeof nextId === 'string' && nextId.trim() ? nextId.trim() : null;
  const current = typeof likelyCauseId === 'string' && likelyCauseId.trim() ? likelyCauseId : null;
  if(current === normalized){
    return false;
  }
  likelyCauseId = normalized;
  saveHandler();
  if(!silent){
    const selectedCause = possibleCauses.find(item => item && item.id === normalized);
    const label = causeDisplayLabel(selectedCause) || 'Selected cause';
    const toastMessage = message || (normalized ? `Likely Cause set to: ${label}.` : 'Likely Cause cleared.');
    if(toastMessage){
      callShowToast(toastMessage);
    }
  }else if(message){
    callShowToast(message);
  }
  if(!skipRender){
    renderCauses();
  }
  return true;
}

/**
 * Toggles the Likely Cause selection for a given cause card.
 * @param {PossibleCause} cause - Cause whose selection should toggle.
 * @returns {void}
 */
function toggleLikelyCause(cause){
  if(!cause || causeHasFailure(cause)) return;
  const nextId = likelyCauseId === cause.id ? null : cause.id;
  const label = causeDisplayLabel(cause);
  const message = nextId ? `Likely Cause set to: ${label}.` : 'Likely Cause cleared.';
  commitLikelyCause(nextId, { silent: false, message });
}

const HYPOTHESIS_HARD_MIN = 3;
const HYPOTHESIS_SOFT_MIN = 8;
const HYPOTHESIS_PREVIEW_LIMIT = 240;
const TRAILING_PUNCTUATION_PATTERN = /[\s]*[.,;:!?]+$/u;

/**
 * Normalizes hypothesis field input by trimming whitespace, collapsing spacing,
 * and removing trailing punctuation while preserving intentional casing.
 * @param {string} value - Raw textarea value captured from the UI.
 * @returns {string} Sanitized field text ready for persistence.
 */
function normalizeHypothesisValue(value){
  if(typeof value !== 'string') return '';
  const collapsed = value.trim().replace(/\s+/g, ' ');
  if(!collapsed){
    return '';
  }
  return collapsed.replace(TRAILING_PUNCTUATION_PATTERN, '').trim();
}

const trimValue = (value) => typeof value === 'string' ? value.trim() : '';
const lowercaseFirst = (text) => text ? text[0].toLowerCase() + text.slice(1) : text;
const isGerundFirstWord = (text) => {
  const firstWord = trimValue(text).split(/\s+/u)[0] || '';
  return /ing$/iu.test(firstWord);
};
const stripLeadingConjunction = (text) => {
  if(!text) return '';
  return text.replace(/^(?:and|&)\b\s*/iu, '');
};
const startsWithCopula = (text) => /^(?:is|are|was|were)\b/iu.test(trimValue(text));
const startsWithVerbPhrase = (text) => {
  const trimmed = trimValue(text).toLowerCase();
  if(!trimmed) return false;
  const firstWord = trimmed.split(/\s+/u)[0];
  const verbStarters = new Set(['is', 'are', 'was', 'were', 'has', 'have']);
  return verbStarters.has(firstWord) || trimmed.startsWith('to ');
};
const normalizeAccusation = (text) => {
  const trimmed = trimValue(text);
  if(!trimmed){
    return '…';
  }
  if(startsWithCopula(trimmed)){
    const firstWord = trimmed.split(/\s+/u)[0].toLowerCase();
    const subject = firstWord === 'are' || firstWord === 'were' ? 'they' : 'it';
    return `${subject} ${lowercaseFirst(trimmed)}`;
  }
  if(isGerundFirstWord(trimmed)){
    return `they are ${lowercaseFirst(trimmed)}`;
  }
  if(startsWithVerbPhrase(trimmed)){
    return lowercaseFirst(trimmed);
  }
  return `it is ${lowercaseFirst(trimmed)}`;
};
const normalizeImpact = (text) => {
  const trimmed = trimValue(text);
  if(!trimmed){
    return '…';
  }
  const withoutConjunction = stripLeadingConjunction(trimmed).trim();
  if(!withoutConjunction){
    return '…';
  }
  return lowercaseFirst(withoutConjunction);
};

const selectCopulaForSubject = (copula, isPlural) => {
  const copulaLower = (copula || '').toLowerCase();
  const isPastTense = copulaLower === 'was' || copulaLower === 'were';
  return isPlural
    ? (isPastTense ? 'were' : 'are')
    : (isPastTense ? 'was' : 'is');
};

const buildDirectAccusationClause = (accusationNormalized, suspectIsPlural) => {
  const trimmed = trimValue(accusationNormalized);
  const copulaPattern = /^(?:(?:it|they)\s+)?(is|are|was|were)\b\s*(.*)$/iu;
  const copulaMatch = trimmed.match(copulaPattern);
  if(copulaMatch){
    const [, copula, remainder] = copulaMatch;
    const adjustedCopula = selectCopulaForSubject(copula, suspectIsPlural);
    const remainderText = remainder ? remainder.trim() : '';
    return remainderText ? `${adjustedCopula} ${remainderText}` : adjustedCopula;
  }
  return trimmed;
};

const stripPlaceholderSubject = (text) => {
  const trimmed = trimValue(text);
  const match = trimmed.match(/^(?:it|they)\s+(?:is|are|was|were)\b\s*(.*)$/iu);
  if(match && match[1]){
    return match[1].trim();
  }
  return trimmed;
};

/**
 * Collapses lengthy preview text to the configured character limit while
 * preserving whole-word readability where practical.
 * @param {string} value - Text to evaluate for truncation.
 * @returns {string} Possibly truncated text with an ellipsis suffix.
 */
function truncateForPreview(value){
  if(typeof value !== 'string') return '';
  if(value.length <= HYPOTHESIS_PREVIEW_LIMIT){
    return value;
  }
  const slice = value.slice(0, HYPOTHESIS_PREVIEW_LIMIT).replace(/\s+$/u, '');
  return `${slice}…`;
}

/**
 * Detects whether the supplied text includes a verb-like pattern, signalling
 * that the accusation describes an action or condition.
 * @param {string} text - Text to inspect for verb candidates.
 * @returns {boolean} True when a verb-like token is detected.
 */
function hasVerbCandidate(text){
  if(typeof text !== 'string' || !text.trim()){ return false; }
  const lowered = text.trim().toLowerCase();
  const patterns = [
    /\b(?:using|use|used|changed|change|changing|set|setting|sets|causing|cause|caused|failing|failed|not\s+following|not\s+replacing|not\s+cleaning|missing|skipping|ignoring|drifting|overheating|leaking|contaminating)\b/u,
    /\b[a-z]+ing\b/u,
    /\b[a-z]+ed\b/u,
    /\b(?:is|are|was|were)\s+[a-z]+ing\b/u,
    /\bto\s+[a-z]+\b/u
  ];
  return patterns.some(pattern => pattern.test(lowered));
}

const isMeaningfulImpact = (text) => {
  const normalized = normalizeHypothesisValue(text);
  if(!normalized){
    return false;
  }
  const discouraged = new Set(['n/a', 'na', 'none', 'unknown', 'tbd', 'tba', '?', '-']);
  return normalized.length >= HYPOTHESIS_HARD_MIN && !discouraged.has(normalized.toLowerCase());
};

/**
 * Determines whether a hypothesis field satisfies the hard minimum length
 * requirement after normalization.
 * @param {string} value - Candidate field value.
 * @returns {boolean} True when the hard minimum is met.
 */
function meetsHardMinimum(value){
  return normalizeHypothesisValue(value).length >= HYPOTHESIS_HARD_MIN;
}

/**
 * Builds a neutral hypothesis summary following the KT template, optionally
 * preparing text for preview scenarios.
 * @param {PossibleCause} cause - Cause providing suspect, accusation, and impact.
 * @param {{ preview?: boolean }} [options] - Rendering options for the summary.
 * @returns {string} Summary sentence(s) adhering to Section 6 requirements.
 */
export function composeHypothesisSummary(cause, { preview = false } = {}){
  if(!cause) return '';
  const suspectClean = normalizeHypothesisValue(cause.suspect || '');
  const accusationClean = normalizeHypothesisValue(cause.accusation || '');
  const impactClean = normalizeHypothesisValue(cause.impact || '');

  const hasSuspect = suspectClean.length > 0;
  const hasAccusation = accusationClean.length > 0;
  const hasImpact = impactClean.length > 0;

  if(!hasSuspect && !hasAccusation && !hasImpact){
    return 'Add suspect, accusation, and impact to craft a strong hypothesis.';
  }

  if(!hasSuspect || !hasAccusation){
    return 'Add suspect and accusation to generate a preview.';
  }

  const suspectText = preview ? truncateForPreview(suspectClean) : suspectClean;
  const accusationNormalized = normalizeAccusation(accusationClean);
  const accusationTrimmed = trimValue(accusationNormalized);
  const accusationNounLike = !hasVerbCandidate(accusationClean)
    && !startsWithCopula(accusationClean)
    && !startsWithVerbPhrase(accusationClean);
  const normalizedStartsCopula = /^(?:(?:it|they)\s+)?(?:is|are|was|were)\b/iu.test(accusationTrimmed);
  const normalizedStartsVerbPhrase = normalizedStartsCopula || startsWithVerbPhrase(accusationTrimmed);
  const shouldJoinDirectly = normalizedStartsVerbPhrase && !accusationNounLike;

  const suspectIsPlural = /\b(?:and|&)\b/iu.test(suspectClean)
    || /s$/iu.test((suspectClean.split(/\s+/u).pop() || '').replace(/[^a-z]/giu, ''));
  const accusationClause = shouldJoinDirectly
    ? buildDirectAccusationClause(accusationNormalized, suspectIsPlural)
    : stripPlaceholderSubject(accusationNormalized);
  const accusationText = preview ? truncateForPreview(accusationClause) : accusationClause;

  const sentences = [
    shouldJoinDirectly
      ? `We suspect ${suspectText} ${accusationText}.`
      : `We suspect ${suspectText} because of ${accusationText}.`
  ];
  if(hasImpact){
    const impactNormalized = normalizeImpact(impactClean);
    const impactStartsGerund = isGerundFirstWord(impactNormalized);
    const impactStartsVerbPhrase = startsWithVerbPhrase(impactNormalized);
    const impactText = preview ? truncateForPreview(impactNormalized) : impactNormalized;
    const impactConnector = impactStartsGerund
      ? 'This could result in '
      : impactStartsVerbPhrase
        ? 'This could lead them to '
        : 'This could lead to ';
    sentences.push(`${impactConnector}${impactText}.`);
  }
  return sentences.join(' ');
}

/**
 * Evaluates whether a cause has the required hypothesis fields populated.
 * @param {PossibleCause} cause - Cause to inspect.
 * @returns {boolean} True when suspect and accusation satisfy minimum length.
 */
function hasCompleteHypothesis(cause){
  if(!cause) return false;
  return meetsHardMinimum(cause.suspect) && meetsHardMinimum(cause.accusation);
}

/**
 * Builds a friendly summary sentence for the suspect, accusation, and impact.
 * Prefers the cached summary text when available to preserve saved phrasing.
 * @param {PossibleCause} cause - Cause whose hypothesis fields will be read.
 * @returns {string} Completed sentence guiding the customer impact story.
 */
export function buildHypothesisSentence(cause){
  if(!cause) return '';
  const stored = typeof cause.summaryText === 'string' ? cause.summaryText.trim() : '';
  if(stored){
    return stored;
  }
  const legacy = typeof cause.hypothesis === 'string' ? cause.hypothesis.trim() : '';
  if(legacy){
    return legacy;
  }
  const legacySummary = typeof cause.summary === 'string' ? cause.summary.trim() : '';
  if(legacySummary){
    return legacySummary;
  }

  const suspectClean = trimValue(cause.suspect);
  const accusationClean = trimValue(cause.accusation);
  const impactClean = trimValue(cause.impact);

  const hasSuspect = Boolean(suspectClean);
  const hasAccusation = Boolean(accusationClean);
  const hasImpact = isMeaningfulImpact(impactClean);

  if(!hasSuspect && !hasAccusation && !hasImpact){
    return 'Add suspect, accusation, and impact to craft a strong hypothesis.';
  }

  if(!hasSuspect || !hasAccusation){
    const missingFields = [];
    if(!hasSuspect){
      missingFields.push('suspect');
    }
    if(!hasAccusation){
      missingFields.push('accusation');
    }
    const missingText = missingFields.join(' and ');
    return `Add ${missingText} to complete this hypothesis.`;
  }

  const suspectText = suspectClean || 'the suspected cause';
  const accusationStartsGerund = isGerundFirstWord(accusationClean);
  const accusationStartsVerbPhrase = startsWithVerbPhrase(accusationClean);
  const accusationHasVerb = hasVerbCandidate(accusationClean);

  let accusationConnector = accusationHasVerb ? ' because ' : ' that ';
  let accusationText = 'we need an accusation to describe the behavior';
  if(accusationStartsGerund){
    accusationConnector = ' because ';
    accusationText = `they are ${lowercaseFirst(accusationClean)}`;
  }else if(accusationStartsVerbPhrase){
    accusationConnector = ' that ';
    accusationText = lowercaseFirst(accusationClean);
  }else if(accusationHasVerb){
    accusationConnector = ' because ';
    accusationText = `it ${lowercaseFirst(accusationClean)}`;
  }else if(accusationClean){
    accusationConnector = ' that ';
    accusationText = `is experiencing ${lowercaseFirst(accusationClean)}`;
  }

  const sentences = [`We suspect ${suspectText}${accusationConnector}${accusationText}.`];
  if(hasImpact){
    const impactNormalized = normalizeImpact(impactClean);
    const impactStartsGerund = isGerundFirstWord(impactNormalized);
    const impactStartsVerbPhrase = startsWithVerbPhrase(impactNormalized);
    const impactHasVerb = hasVerbCandidate(impactNormalized);

    if(impactStartsGerund){
      sentences.push(`This results in ${impactNormalized}.`);
    }else if(impactStartsVerbPhrase){
      sentences.push(`This could lead them to ${impactNormalized}.`);
    }else if(impactHasVerb){
      sentences.push(`This could lead to ${impactNormalized}.`);
    }else{
      sentences.push(`This could lead to ${impactNormalized}.`);
    }
  }else{
    sentences.push('Describe the impact to explain the customer effect.');
  }
  return sentences.join(' ').trim();
}

/**
 * Returns the canonical key for a KT row, typically the prompt text.
 * @param {number} index - Index within `rowsBuilt`.
 * @returns {string} Unique row key suitable for use in maps.
 */
export function getRowKeyByIndex(index){
  const row = rowsBuilt[index];
  if(row && row.def && row.def.q){
    return row.def.q;
  }
  return `row-${index}`;
}

/**
 * Guarantees that a cause has a findings map, creating one when missing.
 * @param {PossibleCause} cause - Cause to initialize.
 * @returns {Record<string, CauseFinding>} Findings map for the cause.
 */
function ensureCauseFindings(cause){
  if(!cause.findings || typeof cause.findings !== 'object'){
    cause.findings = {};
  }
  return cause.findings;
}

/**
 * Retrieves the normalized finding entry for a cause and KT row key.
 * @param {PossibleCause} cause - Cause containing the findings map.
 * @param {string} key - KT row key identifier.
 * @returns {CauseFinding} Normalized finding entry.
 */
function getCauseFinding(cause, key){
  const map = ensureCauseFindings(cause);
  map[key] = normalizeFindingEntry(map[key]);
  return map[key];
}

/**
 * Sets a property on a finding entry, applying validation for key fields.
 * @param {PossibleCause} cause - Cause being mutated.
 * @param {string} key - KT row key identifier.
 * @param {string} prop - Property to mutate (`mode` or `note`).
 * @param {unknown} value - Value to store.
 * @returns {void}
 */
function setCauseFindingValue(cause, key, prop, value){
  const entry = getCauseFinding(cause, key);
  if(prop === 'mode'){
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    entry.mode = isValidFindingMode(normalized) ? normalized : '';
    if(!entry.mode){ entry.note = ''; }
  }else if(prop === 'note'){
    entry.note = typeof value === 'string' ? value : '';
  }else{
    entry[prop] = value;
  }
}

/**
 * Checks whether a KT row currently contains both IS and IS NOT evidence.
 * @param {KTRowBinding} row - Row binding metadata.
 * @returns {boolean} True when both columns contain text.
 */
function rowHasEvidencePair(row){
  if(!row) return false;
  if(row?.tr?.hidden) return false;
  const isText = typeof row?.isTA?.value === 'string' ? row.isTA.value.trim() : '';
  const notText = typeof row?.notTA?.value === 'string' ? row.notTA.value.trim() : '';
  return Boolean(isText && notText);
}

/**
 * Returns the indexes of KT rows that currently contain both IS and IS NOT data.
 * @returns {number[]} Indexes for rows eligible for cause testing.
 */
export function evidencePairIndexes(){
  const indexes = [];
  rowsBuilt.forEach((row, index) => {
    if(rowHasEvidencePair(row)){
      indexes.push(index);
    }
  });
  return indexes;
}

/**
 * Counts how many eligible evidence pairs have complete findings recorded.
 * @param {PossibleCause} cause - Cause being evaluated.
 * @param {number[]} [eligibleIndexes] - Optional subset of row indexes.
 * @returns {number} Total completed findings.
 */
export function countCompletedEvidence(cause, eligibleIndexes){
  let count = 0;
  const indexes = Array.isArray(eligibleIndexes) ? eligibleIndexes : evidencePairIndexes();
  indexes.forEach(index => {
    const key = getRowKeyByIndex(index);
    const entry = peekCauseFinding(cause, key);
    if(entry && findingIsComplete(entry)){ count++; }
  });
  return count;
}

/**
 * Derives an internal status token for a cause based on hypothesis completeness
 * and testing progress.
 * @param {PossibleCause} cause - Cause to evaluate.
 * @param {number} answered - Count of completed findings.
 * @param {number} total - Total eligible evidence pairs.
 * @returns {string} Status token used for styling.
 */
function causeStatusState(cause, answered, total){
  if(!hasCompleteHypothesis(cause)) return 'draft';
  if(total === 0) return 'no-evidence';
  if(causeHasFailure(cause)) return 'failed';
  if(answered === 0) return 'not-tested';
  if(answered < total) return 'testing';
  return 'explained';
}

/**
 * Derives a friendly label for the cause card that reflects hypothesis and
 * testing state.
 * @param {PossibleCause} cause - Cause being summarized.
 * @returns {string} Status label for UI display.
 */
export function causeStatusLabel(cause){
  const eligibleIndexes = evidencePairIndexes();
  const total = eligibleIndexes.length;
  const answered = countCompletedEvidence(cause, eligibleIndexes);
  if(cause?.editing) return 'Editing hypothesis';
  if(!hasCompleteHypothesis(cause)) return 'Draft hypothesis';
  if(total === 0) return rowsBuilt.length ? 'Waiting for KT evidence pairs' : 'Ready to test';
  if(causeHasFailure(cause)) return 'Failed testing';
  if(answered === 0) return 'Not tested yet';
  if(answered < total) return 'Testing in progress';
  return 'Explains all evidence';
}

/**
 * Updates the progress chip to reflect completed evidence counts and status.
 * @param {HTMLElement} chip - Chip element displaying progress.
 * @param {PossibleCause} cause - Cause whose progress is being represented.
 * @returns {void}
 */
function updateCauseProgressChip(chip, cause){
  if(!chip || !cause) return;
  const eligibleIndexes = evidencePairIndexes();
  const total = eligibleIndexes.length;
  const answered = countCompletedEvidence(cause, eligibleIndexes);
  chip.textContent = total ? `${answered}/${total} evidence checks` : 'No KT evidence pairs yet';
  const status = causeStatusState(cause, answered, total);
  chip.dataset.status = status;
}

/**
 * Updates the textual status summary for a cause, combining progress details
 * for assistive technology.
 * @param {HTMLElement} el - Label element to update.
 * @param {PossibleCause} cause - Cause providing status context.
 * @param {string} [countText] - Optional evidence summary to append.
 * @returns {void}
 */
function updateCauseStatusLabel(el, cause, countText){
  if(!el) return;
  const status = causeStatusLabel(cause);
  el.textContent = status;
  const fullLabel = typeof countText === 'string' && countText
    ? `${status}. ${countText}`
    : status;
  el.setAttribute('aria-label', fullLabel);
}

/**
 * Syncs badges, failure states, and assumption counts for a rendered cause card.
 * @param {HTMLElement} card - Root cause card element.
 * @param {PossibleCause} cause - Cause backing the card.
 * @returns {void}
 */
function updateCauseCardIndicators(card, cause){
  if(!card || !cause) return;
  const failureEl = card.querySelector('.cause-card__failure');
  const assumptionEl = card.querySelector('.cause-card__assumptions');
  const failed = causeHasFailure(cause);
  if(failureEl){ failureEl.hidden = !failed; }
  if(failed){
    card.dataset.failed = 'true';
    if(likelyCauseId === cause.id){
      commitLikelyCause(null, { silent: true, skipRender: true });
      callShowToast('Previous Likely Cause was ruled out and has been cleared.');
    }
  }else{
    delete card.dataset.failed;
  }
  if(assumptionEl){
    const count = countCauseAssumptions(cause);
    if(count > 0){
      assumptionEl.hidden = false;
      assumptionEl.textContent = count === 1 ? '1 assumption' : `${count} assumptions`;
    }else{
      assumptionEl.hidden = true;
    }
  }
  updateLikelyBadge(card, cause);
}

/**
 * Formats textarea content into a bullet-style preview for cause testing.
 * @param {string} value - Raw textarea value.
 * @returns {string} Preview text or a dash placeholder.
 */
function previewEvidenceText(value){
  const lines = splitLines(value);
  if(!lines.length) return '—';
  return lines.map(line => `• ${line}`).join('\n');
}

/**
 * Splits a block of text into trimmed lines while omitting blanks.
 * @param {string} text - Raw text content.
 * @returns {string[]} Array of non-empty lines.
 */
function splitLines(text){
  const v = (text || '').trim();
  if(!v) return [];
  return v.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/**
 * Creates the remove button for a cause card, wiring persistence handlers.
 * @param {PossibleCause} cause - Cause associated with the button.
 * @returns {HTMLButtonElement} Configured remove button element.
 */
function makeRemoveButton(cause){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-mini btn-ghost';
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => {
    if(confirm('Remove this possible cause?')){
      possibleCauses = possibleCauses.filter(item => item.id !== cause.id);
      renderCauses();
      saveHandler();
    }
  });
  return btn;
}

/**
 * Ensures the Possible Causes card and controls exist in the DOM and wires the
 * add button listener.
 * @returns {void}
 */
export function ensurePossibleCausesUI(){
  let card = document.getElementById('possibleCausesCard');
  if(!card){
    const wrap = document.querySelector('.wrap');
    if(!wrap) return;
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'possibleCausesCard';
    const heading = document.createElement('h3');
    heading.textContent = 'Possible Causes';
    const caption = document.createElement('p');
    caption.className = 'caption';
    caption.textContent = 'Capture hypotheses and pressure test them against the KT IS / IS NOT evidence. Start with the suspect, accusation, and impact; then walk each cause through the table.';
    const list = document.createElement('div');
    list.className = 'cause-list';
    list.id = 'causeList';
    list.setAttribute('aria-live', 'polite');
    const controls = document.createElement('div');
    controls.className = 'cause-controls';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-mini';
    btn.id = 'addCauseBtn';
    btn.textContent = 'Add Possible Cause';
    controls.appendChild(btn);
    card.append(heading, caption, list, controls);
    const summaryCard = document.getElementById('summaryCard');
    if(summaryCard?.parentNode){
      summaryCard.parentNode.insertBefore(card, summaryCard);
    }else if(wrap){
      wrap.appendChild(card);
    }
  }
  causeList = document.getElementById('causeList');
  addCauseBtn = document.getElementById('addCauseBtn');
  if(addCauseBtn && !addCauseBtn.dataset.bound){
    addCauseBtn.dataset.bound = 'true';
    addCauseBtn.addEventListener('click', () => {
      const newCause = createEmptyCause();
      possibleCauses.push(newCause);
      renderCauses();
      saveHandler();
      focusFirstEditableCause();
    });
  }
}

/**
 * Re-renders the Possible Causes list, syncing status indicators, action
 * counts, and cause-testing panels.
 * @returns {void}
 */
export function renderCauses(){
  if(!causeList){
    ensurePossibleCausesUI();
  }
  if(!causeList) return;
  refreshCauseActionCounts();
  let clearedMessage = '';
  if(likelyCauseId){
    const active = possibleCauses.find(item => item && item.id === likelyCauseId);
    if(!active){
      commitLikelyCause(null, { silent: true, skipRender: true });
    }else if(causeHasFailure(active)){
      commitLikelyCause(null, { silent: true, skipRender: true });
      clearedMessage = 'Previous Likely Cause was ruled out and has been cleared.';
    }
  }
  causeList.innerHTML = '';
  if(!possibleCauses.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'No possible causes captured yet.';
    causeList.appendChild(empty);
    updateCauseEvidencePreviews();
    return;
  }
  possibleCauses.forEach((cause, index) => {
    if(!cause.id){ cause.id = generateCauseId(); }
    const card = document.createElement('article');
    card.className = 'cause-card';
    card.dataset.causeId = cause.id;
    if(cause.editing){ card.dataset.editing = 'true'; }
    const header = document.createElement('div');
    header.className = 'cause-card__header';
    const meta = document.createElement('div');
    meta.className = 'cause-card__meta';
    const titleEl = document.createElement('span');
    titleEl.className = 'cause-card__title';
    titleEl.textContent = `Possible Cause ${index + 1}`;
    const statusEl = document.createElement('span');
    statusEl.className = 'cause-card__status';
    const actionCountEl = document.createElement('span');
    actionCountEl.className = 'cause-card__actions-badge';
    actionCountEl.dataset.role = 'action-count';
    actionCountEl.setAttribute('aria-live', 'polite');
    meta.append(titleEl, statusEl, actionCountEl);
    const indicators = document.createElement('div');
    indicators.className = 'cause-card__indicators';
    const failureTag = document.createElement('span');
    failureTag.className = 'cause-card__failure';
    failureTag.textContent = 'Failed Testing';
    failureTag.hidden = true;
    const chip = document.createElement('span');
    chip.className = 'cause-card__chip';
    const assumptionTag = document.createElement('span');
    assumptionTag.className = 'cause-card__assumptions';
    assumptionTag.hidden = true;
    indicators.append(failureTag, chip, assumptionTag);
    const likelyWrap = document.createElement('div');
    likelyWrap.className = 'cause-card__likely';
    const likelyBtn = document.createElement('button');
    likelyBtn.type = 'button';
    likelyBtn.className = 'cause-card__likely-badge';
    likelyBtn.dataset.role = 'likely-toggle';
    likelyBtn.addEventListener('click', () => { toggleLikelyCause(cause); });
    likelyWrap.appendChild(likelyBtn);
    header.append(meta, likelyWrap, indicators);
    card.append(header);
    const actionCountText = updateCauseActionBadge(actionCountEl, cause);
    updateCauseStatusLabel(statusEl, cause, actionCountText);
    updateCauseProgressChip(chip, cause);
    const summaryEl = document.createElement('p');
    summaryEl.className = 'cause-card__summary';
    summaryEl.dataset.role = 'hypothesis';
    summaryEl.textContent = buildHypothesisSentence(cause);
    card.append(summaryEl);
    if(cause.editing){
      summaryEl.hidden = true;
      const helper = document.createElement('small');
      helper.className = 'cause-card__helper subtle';
      helper.textContent = 'Use the suspect, accusation, and impact prompts to capture this hypothesis.';
      card.append(helper);

      const form = document.createElement('div');
      form.className = 'cause-card__form cause-hypothesis-form';

      const fieldsWrap = document.createElement('div');
      fieldsWrap.className = 'cause-hypothesis-form__fields';
      const previewSection = document.createElement('section');
      previewSection.className = 'cause-hypothesis-form__preview';
      const previewHeading = document.createElement('h4');
      previewHeading.className = 'cause-hypothesis-form__preview-title';
      previewHeading.textContent = 'Preview';
      const previewBody = document.createElement('p');
      previewBody.className = 'cause-hypothesis-form__preview-body';
      previewBody.textContent = composeHypothesisSummary(cause, { preview: true });
      previewSection.append(previewHeading, previewBody);

      const fieldState = {};
      const fieldConfigs = [
        {
          key: 'suspect',
          label: 'Suspect (Object — the thing we are blaming)',
          helper: 'Name the component, material, process, team, or condition you think is causing the deviation. Be specific.',
          required: true
        },
        {
          key: 'accusation',
          label: 'Accusation (Deviation — what’s wrong with the suspect?)',
          helper: 'Describe the behavior, change, or condition that is different or defective. Use observable facts, not opinions.',
          required: true
        },
        {
          key: 'impact',
          label: 'Impact (How could this cause the problem?)',
          helper: 'Explain the mechanism: how this deviation could produce the customer or system impact.',
          required: false
        }
      ];

      /** @type {Array<'suspect'|'accusation'|'impact'>} */
      const editableKeys = ['suspect', 'accusation', 'impact'];

      fieldConfigs.forEach(config => {
        const field = document.createElement('div');
        field.className = 'field hypothesis-field';
        const inputId = `${cause.id}-${config.key}`;
        const helperId = `${inputId}-helper`;
        const hintId = `${inputId}-hint`;

        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.textContent = config.label;

        const textarea = document.createElement('textarea');
        textarea.id = inputId;
        textarea.value = typeof cause[config.key] === 'string' ? cause[config.key] : '';
        if(config.placeholder){
          textarea.placeholder = config.placeholder;
        }
        textarea.setAttribute('data-min-height', '120');

        const helperText = document.createElement('small');
        helperText.id = helperId;
        helperText.textContent = config.helper;

        const hint = document.createElement('p');
        hint.className = 'field-hint subtle';
        hint.id = hintId;
        hint.hidden = true;

        textarea.setAttribute('aria-describedby', `${helperId} ${hintId}`.trim());

        textarea.addEventListener('input', event => {
          cause[config.key] = event.target.value;
          fieldState[config.key].touched = true;
          autoResize(textarea);
          queuePreviewUpdate();
        });

        textarea.addEventListener('blur', event => {
          const normalized = normalizeHypothesisValue(event.target.value);
          if(event.target.value !== normalized){
            event.target.value = normalized;
            autoResize(textarea);
          }
          cause[config.key] = normalized;
          fieldState[config.key].touched = true;
          queuePreviewUpdate({ immediate: true, persist: true });
        });

        autoResize(textarea);

        field.append(label, textarea, helperText, hint);
        fieldsWrap.append(field);
        fieldState[config.key] = { textarea, hint, required: config.required, touched: false };
      });

      form.append(fieldsWrap, previewSection);

      card.append(form);

      const controls = document.createElement('div');
      controls.className = 'cause-controls';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-mini';
      saveBtn.textContent = 'Save hypothesis';
      saveBtn.addEventListener('click', () => {
        editableKeys.forEach(key => {
          const { textarea } = fieldState[key];
          const normalized = normalizeHypothesisValue(textarea.value);
          if(textarea.value !== normalized){
            textarea.value = normalized;
            autoResize(textarea);
          }
          cause[key] = normalized;
        });

        const suspectOk = meetsHardMinimum(cause.suspect);
        const accusationOk = meetsHardMinimum(cause.accusation);
        queuePreviewUpdate({ immediate: true });
        if(!suspectOk || !accusationOk){
          callShowToast('Add suspect and accusation details (at least 3 characters each) before saving.');
          return;
        }

        cause.summaryText = composeHypothesisSummary(cause, { preview: false });
        summaryEl.hidden = false;
        summaryEl.textContent = cause.summaryText;
        cause.editing = false;
        renderCauses();
        saveHandler();
      });
      controls.append(saveBtn);
      controls.append(makeRemoveButton(cause));
      card.append(controls);

      let previewTimeout = null;
      function queuePreviewUpdate({ immediate = false, persist = false } = {}){
        const runner = () => {
          const draft = {
            suspect: fieldState.suspect.textarea.value,
            accusation: fieldState.accusation.textarea.value,
            impact: fieldState.impact.textarea.value
          };

          const suspectNormalized = normalizeHypothesisValue(draft.suspect);
          const accusationNormalized = normalizeHypothesisValue(draft.accusation);
          const impactNudgeEligible = fieldState.impact.touched
            || suspectNormalized.length >= HYPOTHESIS_HARD_MIN
            || accusationNormalized.length >= HYPOTHESIS_HARD_MIN;

          editableKeys.forEach(key => {
            const { textarea, hint, required } = fieldState[key];
            cause[key] = textarea.value;
            const normalized = normalizeHypothesisValue(textarea.value);
            const hints = [];
            if(normalized.length && normalized.length < HYPOTHESIS_SOFT_MIN){
              hints.push('Add a bit more detail so others can test this.');
            }
            if(required && !normalized.length && fieldState[key].touched){
              hints.push('This field is required to frame the hypothesis.');
            }
            if(key === 'impact' && !normalized.length && impactNudgeEligible){
              hints.push('Describe the impact so others can trace the mechanism.');
            }
            if(key === 'accusation' && normalized.length >= HYPOTHESIS_HARD_MIN && !hasVerbCandidate(normalized)){
              hints.push('Try describing an action or condition (e.g., “Using…”, “Changed…”, “Not following…”).');
            }
            const message = hints.join(' ');
            if(message){
              hint.textContent = message;
              hint.hidden = false;
            }else{
              hint.hidden = true;
              hint.textContent = '';
            }
          });

          previewBody.textContent = composeHypothesisSummary(draft, { preview: true });
          const countText = updateCauseActionBadge(actionCountEl, cause);
          updateCauseStatusLabel(statusEl, cause, countText);
          updateCauseProgressChip(chip, cause);
          updateCauseCardIndicators(card, cause);

          if(persist){
            editableKeys.forEach(key => {
              const normalized = normalizeHypothesisValue(fieldState[key].textarea.value);
              cause[key] = normalized;
              if(fieldState[key].textarea.value !== normalized){
                fieldState[key].textarea.value = normalized;
                autoResize(fieldState[key].textarea);
              }
            });
            saveHandler();
          }
        };

        if(immediate){
          runner();
          return;
        }

        if(previewTimeout){
          clearTimeout(previewTimeout);
        }
        previewTimeout = setTimeout(runner, 200);
      }

      queuePreviewUpdate({ immediate: true });
    }else{
      const controls = document.createElement('div');
      controls.className = 'cause-controls';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-mini btn-ghost';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        cause.editing = true;
        renderCauses();
        saveHandler();
        focusFirstEditableCause();
      });
      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'btn-mini';
      testBtn.textContent = cause.testingOpen ? 'Hide testing' : 'Test this cause';
      testBtn.addEventListener('click', () => {
        cause.testingOpen = !cause.testingOpen;
        renderCauses();
        saveHandler();
      });
      controls.append(editBtn, testBtn, makeRemoveButton(cause));
      card.append(controls);
      if(cause.testingOpen){
        card.append(buildCauseTestPanel(cause, chip, statusEl, card));
      }
    }
    causeList.appendChild(card);
    updateCauseCardIndicators(card, cause);
  });
  const allFailed = possibleCauses.length > 0 && possibleCauses.every(item => causeHasFailure(item));
  if(allFailed){
    const hint = document.createElement('p');
    hint.className = 'cause-list__hint';
    hint.textContent = 'All current causes were ruled out. Add a new Possible Cause to continue.';
    causeList.appendChild(hint);
  }
  if(clearedMessage){
    callShowToast(clearedMessage);
  }
  updateCauseEvidencePreviews();
}

/**
 * Builds the cause testing panel containing question summaries and finding
 * controls.
 * @param {PossibleCause} cause - Cause being tested.
 * @param {HTMLElement} progressChip - Chip element showing progress counts.
 * @param {HTMLElement} statusEl - Element displaying the status label.
 * @param {HTMLElement} card - Cause card container.
 * @returns {HTMLElement} Panel element ready for rendering.
 */
function buildCauseTestPanel(cause, progressChip, statusEl, card){
  const panel = document.createElement('div');
  panel.className = 'cause-test';
  const actionBadge = card?.querySelector('[data-role="action-count"]');
  const intro = document.createElement('p');
  intro.className = 'cause-test__intro';
  intro.textContent = 'For each KT row, choose how this hypothesis handles the IS / IS NOT evidence and document your reasoning.';
  panel.appendChild(intro);
  if(!rowsBuilt.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'Add IS / IS NOT evidence first to begin testing this cause.';
    panel.appendChild(empty);
    return panel;
  }
  const eligibleIndexes = evidencePairIndexes();
  if(!eligibleIndexes.length){
    const empty = document.createElement('div');
    empty.className = 'cause-empty';
    empty.textContent = 'Add IS / IS NOT evidence pairs to begin testing this cause.';
    panel.appendChild(empty);
    return panel;
  }
  eligibleIndexes.forEach(index => {
    const row = rowsBuilt[index];
    const rowKey = getRowKeyByIndex(index);
    const finding = getCauseFinding(cause, rowKey);
    const rowEl = document.createElement('section');
    rowEl.className = 'cause-eval-row';
    rowEl.dataset.rowIndex = index;
    rowEl.dataset.rowKey = rowKey;
    rowEl.hidden = Boolean(row?.tr?.hidden);
    const qText = document.createElement('div');
    qText.className = 'cause-eval-question-text';
    qText.dataset.role = 'question';
    qText.textContent = buildCauseTestQuestionPrompt(cause, row);
    rowEl.appendChild(qText);
    const evidenceWrap = document.createElement('div');
    evidenceWrap.className = 'cause-evidence-wrap';
    const isBlock = document.createElement('div');
    isBlock.className = 'cause-evidence-block';
    isBlock.dataset.rowIndex = index;
    isBlock.dataset.type = 'is';
    const isLabel = document.createElement('span');
    isLabel.className = 'cause-evidence-label';
    isLabel.textContent = 'IS evidence';
    const isValue = document.createElement('div');
    isValue.className = 'cause-evidence-text';
    isValue.dataset.role = 'is-value';
    isValue.textContent = previewEvidenceText(row?.isTA?.value || '');
    isBlock.append(isLabel, isValue);
    const notBlock = document.createElement('div');
    notBlock.className = 'cause-evidence-block';
    notBlock.dataset.rowIndex = index;
    notBlock.dataset.type = 'not';
    const notLabel = document.createElement('span');
    notLabel.className = 'cause-evidence-label';
    notLabel.textContent = 'IS NOT evidence';
    const notValue = document.createElement('div');
    notValue.className = 'cause-evidence-text';
    notValue.dataset.role = 'not-value';
    notValue.textContent = previewEvidenceText(row?.notTA?.value || '');
    notBlock.append(notLabel, notValue);
    evidenceWrap.append(isBlock, notBlock);
    rowEl.appendChild(evidenceWrap);
    const inputsWrap = document.createElement('div');
    inputsWrap.className = 'cause-eval-inputs';
    const optionWrap = document.createElement('div');
    optionWrap.className = 'cause-eval-options';
    const noteField = document.createElement('div');
    noteField.className = 'field cause-eval-note';
    noteField.hidden = true;
    const noteLabel = document.createElement('label');
    noteLabel.dataset.role = 'note-label';
    const noteInput = document.createElement('textarea');
    noteInput.dataset.role = 'finding-note';
    noteInput.value = findingNote(finding);
    noteInput.placeholder = 'Select an option to describe this relationship.';
    noteInput.setAttribute('data-min-height', '120');
    noteInput.disabled = true;
    noteInput.addEventListener('input', e => {
      setCauseFindingValue(cause, rowKey, 'note', e.target.value);
      autoResize(noteInput);
      updateCauseProgressChip(progressChip, cause);
      const countText = updateCauseActionBadge(actionBadge, cause);
      updateCauseStatusLabel(statusEl, cause, countText);
      updateCauseCardIndicators(card, cause);
      saveHandler();
    });
    autoResize(noteInput);
    noteField.append(noteLabel, noteInput);
    inputsWrap.append(optionWrap, noteField);
    rowEl.appendChild(inputsWrap);

    const optionDefs = [
      {
        mode: CAUSE_FINDING_MODES.ASSUMPTION,
        buttonLabel: 'Explains Only if…',
        noteLabel: 'What assumptions are necessary to explain why we see it on the <is> and not the <is not>?'
      },
      {
        mode: CAUSE_FINDING_MODES.YES,
        buttonLabel: 'Yes, because…',
        noteLabel: 'How does this naturally explain that we see <is> and that we don\'t see <is not>?'
      },
      {
        mode: CAUSE_FINDING_MODES.FAIL,
        buttonLabel: 'Does not explain…',
        noteLabel: 'Why can\'t we explain the <is> being present, but not the <is not>?'
      }
    ];
    const buttons = [];
    const rawIs = row?.isTA?.value || '';
    const rawNot = row?.notTA?.value || '';

    /**
     * Updates button selection and note fields based on the chosen mode.
     * @param {string} newMode - Mode to activate.
     * @param {object} [opts] - Behavior flags for the update.
     * @param {boolean} [opts.silent] - When true prevents persistence and toast
     * updates. Defaults to false.
     * @returns {void}
     */
    function applyMode(newMode, opts = {}){
      const active = isValidFindingMode(newMode) ? newMode : '';
      buttons.forEach(btn => {
        btn.element.classList.toggle('is-selected', btn.mode === active);
      });
      if(active){
        const config = optionDefs.find(def => def.mode === active);
        const labelTemplate = config?.noteLabel || '';
        noteLabel.textContent = substituteEvidenceTokens(labelTemplate, rawIs, rawNot);
        noteLabel.dataset.template = labelTemplate;
        noteInput.placeholder = '';
        delete noteInput.dataset.placeholderTemplate;
        noteInput.disabled = false;
        noteField.hidden = false;
      }else{
        noteLabel.textContent = '';
        delete noteLabel.dataset.template;
        noteInput.placeholder = 'Select an option to describe this relationship.';
        delete noteInput.dataset.placeholderTemplate;
        noteInput.value = '';
        noteInput.disabled = true;
        noteField.hidden = true;
        setCauseFindingValue(cause, rowKey, 'note', '');
      }
      autoResize(noteInput);
      if(!opts.silent){
        updateCauseProgressChip(progressChip, cause);
        const countText = updateCauseActionBadge(actionBadge, cause);
        updateCauseStatusLabel(statusEl, cause, countText);
        updateCauseCardIndicators(card, cause);
        saveHandler();
      }
    }

    optionDefs.forEach(def => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cause-eval-option';
      btn.textContent = def.buttonLabel;
      btn.dataset.mode = def.mode;
      btn.addEventListener('click', () => {
        const entry = getCauseFinding(cause, rowKey);
        const current = findingMode(entry);
        if(current === def.mode){
          setCauseFindingValue(cause, rowKey, 'mode', '');
          applyMode('');
        }else{
          setCauseFindingValue(cause, rowKey, 'mode', def.mode);
          applyMode(def.mode);
        }
      });
      optionWrap.appendChild(btn);
      buttons.push({ element: btn, mode: def.mode });
    });

    const startingMode = findingMode(finding);
    noteInput.value = findingNote(finding);
    autoResize(noteInput);
    applyMode(startingMode, { silent: true });
    panel.appendChild(rowEl);
  });
  return panel;
}

/**
 * Synchronizes the cause-testing panels with the latest KT table evidence and
 * action counts.
 * @returns {void}
 */
export function updateCauseEvidencePreviews(){
  if(!causeList) return;
  refreshCauseActionCounts();
  causeList.querySelectorAll('.cause-eval-row').forEach(rowEl => {
    const index = parseInt(rowEl.dataset.rowIndex, 10);
    if(Number.isNaN(index) || !rowsBuilt[index]) return;
    const row = rowsBuilt[index];
    const causeId = rowEl.closest('.cause-card')?.dataset?.causeId;
    const cause = possibleCauses.find(item => item.id === causeId);
    rowEl.hidden = Boolean(row?.tr?.hidden);
    const questionEl = rowEl.querySelector('[data-role="question"]');
    if(questionEl){ questionEl.textContent = buildCauseTestQuestionPrompt(cause, row); }
    const isValue = rowEl.querySelector('[data-role="is-value"]');
    const rawIs = row?.isTA?.value || '';
    const rawNot = row?.notTA?.value || '';
    if(isValue){ isValue.textContent = previewEvidenceText(rawIs); }
    const notValue = rowEl.querySelector('[data-role="not-value"]');
    if(notValue){ notValue.textContent = previewEvidenceText(rawNot); }
    const noteLabel = rowEl.querySelector('[data-role="note-label"]');
    if(noteLabel && noteLabel.dataset.template){
      noteLabel.textContent = substituteEvidenceTokens(noteLabel.dataset.template, rawIs, rawNot);
    }
  });
  causeList.querySelectorAll('.cause-card').forEach(card => {
    const id = card?.dataset?.causeId;
    if(!id) return;
    const cause = possibleCauses.find(item => item.id === id);
    if(!cause) return;
    const chip = card.querySelector('.cause-card__chip');
    if(chip){ updateCauseProgressChip(chip, cause); }
    const statusEl = card.querySelector('.cause-card__status');
    const actionBadge = card.querySelector('[data-role="action-count"]');
    const countText = updateCauseActionBadge(actionBadge, cause);
    if(statusEl){ updateCauseStatusLabel(statusEl, cause, countText); }
    updateCauseCardIndicators(card, cause);
  });
}

/**
 * Focuses the first textarea inside an editing cause card after the DOM
 * settles.
 * @returns {void}
 */
export function focusFirstEditableCause(){
  requestAnimationFrame(() => {
    const target = causeList?.querySelector('[data-editing="true"] textarea');
    if(target){
      target.focus();
      const end = target.value.length;
      try{ target.setSelectionRange(end, end); }catch(_){ /* no-op */ }
    }
  });
}

/**
 * Returns the in-memory list of possible causes.
 * @returns {PossibleCause[]} Cause collection managed by this module.
 */
export function getPossibleCauses(){
  return possibleCauses;
}

/**
 * Replaces the internal possible-cause collection, typically during imports.
 * @param {PossibleCause[]} list - New cause records to adopt.
 * @returns {void}
 */
export function setPossibleCauses(list){
  possibleCauses = Array.isArray(list) ? list : [];
}

/**
 * Returns the active Likely Cause identifier when one is selected.
 * @returns {string|null} Likely Cause id or `null` when unset.
 */
export function getLikelyCauseId(){
  return typeof likelyCauseId === 'string' && likelyCauseId.trim() ? likelyCauseId : null;
}

/**
 * Updates the Likely Cause selection while allowing callers to control side
 * effects such as rendering and toast messaging.
 * @param {string|null} nextId - Identifier for the Likely Cause or `null` to clear it.
 * @param {object} [options] - Optional flags to control side effects.
 * @param {boolean} [options.silent] - When true suppresses toast messaging.
 * Defaults to false.
 * @param {boolean} [options.skipRender] - Skips rerendering the cause list when
 * true. Defaults to false.
 * @param {string} [options.message] - Optional toast override. Defaults to the
 * auto-generated label.
 * @returns {void}
 */
export function setLikelyCauseId(nextId, options = {}){
  const { silent = false, skipRender = false, message = '' } = options || {};
  commitLikelyCause(nextId, { silent, skipRender, message });
}

/**
 * Provides the cached references for each KT table row.
 * @returns {KTRowBinding[]} Row binding metadata collected during `initTable()`.
 */
export function getRowsBuilt(){
  return rowsBuilt;
}

/**
 * Returns the `<tbody>` element backing the KT table.
 * @returns {HTMLTableSectionElement|null} Table body element reference.
 */
export function getTableElement(){
  return tbody;
}

/**
 * Determines whether a cached row binding represents a question with textareas.
 * @param {KTRowBinding|object|null|undefined} binding - Candidate row metadata.
 * @returns {boolean} True when the binding references a question row.
 */
function isQuestionRow(binding){
  if(!binding || typeof binding !== 'object'){
    return false;
  }
  return Boolean(binding.isTA && binding.notTA && binding.distTA && binding.chgTA);
}

/**
 * Refreshes contextual placeholders for a given KT question binding.
 * @param {KTRowBinding} binding - Row binding containing textarea references.
 * @returns {void}
 */
function refreshQuestionPlaceholders(binding){
  if(!isQuestionRow(binding)){
    return;
  }
  const { def = {}, isTA, notTA, distTA, chgTA } = binding;
  if(notTA){
    notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), isTA?.value || '');
  }
  if(distTA){
    distTA.placeholder = mkDistPH(isTA?.value || '', notTA?.value || '');
  }
  if(chgTA){
    chgTA.placeholder = mkChangePH(distTA?.value || '');
  }
}

/**
 * Updates a KT question textarea using its stable identifier.
 * @param {string} questionId - Stable identifier for the question row.
 * @param {'is'|'no'|'di'|'ch'} field - Field slug representing the textarea.
 * @param {string|number} value - Value to assign to the textarea.
 * @returns {HTMLTextAreaElement|null} The textarea that received the update.
 */
export function updateQuestionField(questionId, field, value){
  if(typeof questionId !== 'string' || !questionId.trim()){
    return null;
  }
  const binding = rowsBuilt.find(row => row && row.questionId === questionId.trim());
  if(!isQuestionRow(binding)){
    return null;
  }
  const map = {
    is: binding.isTA,
    no: binding.notTA,
    di: binding.distTA,
    ch: binding.chgTA
  };
  const target = map[field];
  if(!target){
    return null;
  }
  let nextValue = '';
  if(typeof value === 'string'){
    nextValue = value;
  }else if(typeof value === 'number'){
    nextValue = String(value);
  }
  if(target.value !== nextValue){
    target.value = nextValue;
  }
  autoResize(target);
  refreshQuestionPlaceholders(binding);
  return target;
}

/**
 * Serializes the KT table DOM into an exportable array structure.
 * @returns {(CauseImportRecord|BandImportRecord)[]} Persistable snapshot of the
 * table layout.
 */
export function exportKTTableState(){
  if(!tbody) return [];
  const out = [];
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if(tr.classList.contains('band')){
      out.push({ band: tr.textContent.trim() });
      return;
    }
    const th = tr.querySelector('th');
    const textareas = tr.querySelectorAll('textarea');
    const questionId = typeof tr.dataset.questionId === 'string' ? tr.dataset.questionId.trim() : '';
    const record = {
      q: th?.textContent.trim() || '',
      is: textareas[0]?.value || '',
      no: textareas[1]?.value || '',
      di: textareas[2]?.value || '',
      ch: textareas[3]?.value || ''
    };
    if(questionId){
      record.questionId = questionId;
    }
    out.push(record);
  });
  return out;
}

/**
 * Imports KT table rows from persisted data and refreshes dependent views.
 * @param {(CauseImportRecord|BandImportRecord)[]} tableData - Serialized table rows.
 * @returns {void}
 */
export function importKTTableState(tableData){
  if(!tbody) return;
  const data = Array.isArray(tableData) ? tableData : [];
  const normalizeValue = value => {
    if(typeof value === 'string'){
      return value;
    }
    if(typeof value === 'number'){
      return String(value);
    }
    return '';
  };
  const questionEntries = [];
  data.forEach(entry => {
    if(entry && !entry.band){
      questionEntries.push(entry);
    }
  });
  const usedIndexes = new Set();
  const byId = new Map();
  const byLabel = new Map();
  questionEntries.forEach((entry, idx) => {
    const questionId = typeof entry.questionId === 'string' ? entry.questionId.trim() : '';
    if(questionId && !byId.has(questionId)){
      byId.set(questionId, { entry, index: idx });
    }
    const label = typeof entry.q === 'string' ? entry.q.trim() : '';
    if(label){
      const bucket = byLabel.get(label) || [];
      bucket.push({ entry, index: idx });
      byLabel.set(label, bucket);
    }
  });
  let sequentialIndex = 0;
  const claimSequential = () => {
    while(sequentialIndex < questionEntries.length){
      const idx = sequentialIndex++;
      if(usedIndexes.has(idx)){
        continue;
      }
      usedIndexes.add(idx);
      return questionEntries[idx];
    }
    for(let i = 0; i < questionEntries.length; i += 1){
      if(!usedIndexes.has(i)){
        usedIndexes.add(i);
        return questionEntries[i];
      }
    }
    return null;
  };
  const claimById = id => {
    if(!id) return null;
    const ref = byId.get(id);
    if(!ref) return null;
    if(usedIndexes.has(ref.index)) return null;
    usedIndexes.add(ref.index);
    return ref.entry;
  };
  const claimByLabel = label => {
    const key = (label || '').trim();
    if(!key) return null;
    const bucket = byLabel.get(key);
    if(!bucket) return null;
    for(const ref of bucket){
      if(usedIndexes.has(ref.index)){
        continue;
      }
      usedIndexes.add(ref.index);
      return ref.entry;
    }
    return null;
  };

  let bindings = rowsBuilt.filter(binding => isQuestionRow(binding));
  if(!bindings.length){
    bindings = [...tbody.querySelectorAll('tr')]
      .filter(tr => !tr.classList.contains('band'))
      .map(tr => {
        const th = tr.querySelector('th');
        const textareas = tr.querySelectorAll('textarea');
        return {
          tr,
          th,
          def: {},
          isTA: textareas[0] || null,
          notTA: textareas[1] || null,
          distTA: textareas[2] || null,
          chgTA: textareas[3] || null,
          questionId: typeof tr.dataset.questionId === 'string' ? tr.dataset.questionId.trim() : ''
        };
      })
      .filter(binding => isQuestionRow(binding));
  }
  bindings.forEach(binding => {
    const questionId = typeof binding.questionId === 'string' ? binding.questionId.trim() : '';
    const label = binding.th?.textContent.trim() || '';
    let record = questionId ? claimById(questionId) : null;
    if(!record && label){
      record = claimByLabel(label);
    }
    if(!record){
      record = claimSequential();
    }
    const resolved = record || {};
    const values = {
      is: normalizeValue(resolved.is),
      no: normalizeValue(resolved.no),
      di: normalizeValue(resolved.di),
      ch: normalizeValue(resolved.ch)
    };
    const textareaMap = {
      is: binding.isTA,
      no: binding.notTA,
      di: binding.distTA,
      ch: binding.chgTA
    };
    ['is', 'no', 'di', 'ch'].forEach(field => {
      const val = values[field];
      let updated = null;
      if(questionId){
        updated = updateQuestionField(questionId, field, val);
      }
      if(!updated){
        const fallback = textareaMap[field];
        if(fallback){
          if(fallback.value !== val){
            fallback.value = val;
          }
          autoResize(fallback);
        }
      }
    });
    refreshQuestionPlaceholders(binding);
  });
  refreshAllTokenizedText();
}

/**
 * Creates a band header row describing the next section of the KT table.
 * @param {string} title - Band title.
 * @param {string} note - Supporting description rendered beside the title.
 * @returns {HTMLTableRowElement} Rendered band table row.
 */
function mkBand(title, note){
  const tr = document.createElement('tr'); tr.className = 'band';
  const bandId = `band-${++bandCounter}`;
  tr.dataset.bandId = bandId;
  const th = document.createElement('th'); th.colSpan = 5; th.innerHTML = `${title} <span>— ${note}</span>`;
  tr.appendChild(th);
  bandMap.set(bandId, tr);
  return tr;
}

/**
 * Creates a full KT evidence row with textareas and placeholder bindings.
 * @param {object} def - Row definition from `ROWS`.
 * @param {number} i - 1-based row index for theming.
 * @param {string|null} bandId - Optional band grouping identifier.
 * @returns {HTMLTableRowElement} Populated row ready for insertion.
 */
function mkRow(def, i, bandId){
  const tr = document.createElement('tr'); tr.dataset.row = i;
  if(bandId){
    tr.dataset.bandId = bandId;
  }
  if(def.id){
    tr.dataset.questionId = def.id;
  }
  if(def.priority){
    tr.dataset.priority = def.priority;
  }
  const rowTheme = ROW_THEME_ASSIGNMENTS[i] || '';
  if(rowTheme){
    tr.dataset.rowTheme = rowTheme;
  }
  const th = document.createElement('th'); th.scope = 'row'; th.textContent = fillTokens(def.q);

  const tdIS = document.createElement('td');
  const tdNOT = document.createElement('td');
  const tdDIST = document.createElement('td');
  const tdCHG = document.createElement('td');

  const isTA = document.createElement('textarea'); isTA.className = 'tableta';
  const notTA = document.createElement('textarea'); notTA.className = 'tableta';
  const distTA = document.createElement('textarea'); distTA.className = 'tableta';
  const chgTA = document.createElement('textarea'); chgTA.className = 'tableta';

  const semiDisabled = SEMI_DISABLED_DISTINCTION_ROWS.has(def.q);
  if(semiDisabled){
    distTA.classList.add('tableta--muted');
    chgTA.classList.add('tableta--muted');
  }

  isTA.placeholder = fillTokens(def.isPH || '');
  notTA.placeholder = mkIsNotPH(fillTokens(def.notPH || ''), '');
  distTA.placeholder = mkDistPH('', '');
  chgTA.placeholder = mkChangePH('');

  const fieldLookup = new Map([
    [isTA, 'is'],
    [notTA, 'no'],
    [distTA, 'di'],
    [chgTA, 'ch']
  ]);

  const binding = {
    tr,
    th,
    def,
    isTA,
    notTA,
    distTA,
    chgTA,
    questionId: def.id || '',
    priority: def.priority || '',
    bandId: bandId || null,
    rowNumber: i
  };

  [isTA, notTA, distTA, chgTA].forEach(t => {
    autoResize(t);
    t.addEventListener('input', () => {
      autoResize(t);
      const field = fieldLookup.get(t);
      if(def.id && field){
        updateQuestionField(def.id, field, t.value);
      }else{
        refreshQuestionPlaceholders(binding);
      }
      saveHandler();
      if(t === isTA || t === notTA){
        renderCauses();
      }else{
        updateCauseEvidencePreviews();
      }
    });
  });

  tdIS.appendChild(isTA); tdNOT.appendChild(notTA); tdDIST.appendChild(distTA); tdCHG.appendChild(chgTA);
  tr.append(th, tdIS, tdNOT, tdDIST, tdCHG);

  rowsBuilt.push(binding);
  refreshQuestionPlaceholders(binding);
  return tr;
}

/**
 * Builds the KT table rows, wires listeners, and primes focus controls.
 * @returns {void}
 */
export function initTable(){
  if(!tbody) return;
  if(rowsBuilt.length){
    return;
  }
  let dataRowCount = 0;
  let currentBandId = null;
  ROWS.forEach(def => {
    if(def.band){
      const bandRow = mkBand(def.band, def.note || '');
      currentBandId = bandRow?.dataset?.bandId || null;
      tbody.appendChild(bandRow);
    }else{
      const tr = mkRow(def, ++dataRowCount, currentBandId);
      tbody.appendChild(tr);
      if(dataRowCount === 1) objectIS = rowsBuilt[rowsBuilt.length - 1].isTA;
      if(dataRowCount === 2) deviationIS = rowsBuilt[rowsBuilt.length - 1].isTA;
    }
  });

  [objectIS, deviationIS].forEach(el => {
    if(!el) return;
    el.addEventListener('input', () => {
      if(el === objectIS) objectISDirty = true;
      if(el === deviationIS) deviationISDirty = true;
      refreshAllTokenizedText();
      tokensChangeHandler();
      saveHandler();
    });
  });

  wireFocusModeControls();
  applyTableFocusMode({ silent: true });
}
