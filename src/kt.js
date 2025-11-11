/**
 * @file Coordinates the Kepner-Tregoe table lifecycle and related UI helpers.
 * @module kt
 * @description Manages the KT (Kepner-Tregoe) analysis table lifecycle, including
 * bootstrapping DOM anchors, rendering the Possible Causes card, and syncing
 * shared events such as `intake:actions-updated`. The module wires focus-mode
 * toggles, evidence entry textareas, and the cause-testing UI so that the
 * intake experience stays coordinated across modules.
 */
import { ROWS } from './constants.js';
import { buildCauseActionCounts } from './causeActionCounts.js';
import { createAction } from './actionsStore.js';
import { getAnalysisId } from './appState.js';

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

let autoResize = defaultAutoResize;
let saveHandler = defaultSaveHandler;
let showToastHandler = defaultShowToast;
let tokensChangeHandler = defaultTokensChangeHandler;
let getObjectFullFn = defaultGetObjectFull;
let getDeviationFullFn = defaultGetDeviationFull;

/**
 * @typedef {object} PossibleCause
 * @property {string} id - Stable identifier generated for DOM bindings and persistence.
 * @property {string} suspect - Working hypothesis of the suspected cause.
 * @property {string} accusation - Description of the behavior the cause would produce.
 * @property {string} impact - Statement describing the customer or system impact.
 * @property {string} summaryText - Cached hypothesis summary rendered in the card view.
 * @property {('low'|'medium'|'high'|'')} confidence - Optional confidence signal persisted with the hypothesis.
 * @property {string} evidence - Optional supporting evidence statement persisted with the hypothesis.
 * @property {('explains'|'conditional'|'does_not_explain'|'')} decision - Stored decision outcome for the hypothesis.
 * @property {string} explanation_is - Reason this cause explains the observed pattern.
 * @property {string} explanation_is_not - Reason the cause does not appear in unaffected cases.
 * @property {string} assumptions - Assumptions required for the cause to hold true.
 * @property {{text: string, owner: string, eta: string}} next_test - Planned validation step metadata.
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
    || 'the object';
  const dev = firstSnippet(deviationIS?.value)
    || firstSnippet(getDeviationFullFn())
    || 'the deviation';
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
 * Normalizes a stored decision value into the supported vocabulary.
 * @param {unknown} value - Raw decision input.
 * @returns {('explains'|'conditional'|'does_not_explain'|'')} Normalized decision token.
 */
function normalizeDecision(value){
  if(typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if(trimmed === 'explains' || trimmed === 'conditional' || trimmed === 'does_not_explain'){
    return trimmed;
  }
  return '';
}

/**
 * Ensures the `next_test` payload exists on a cause record and contains trimmed values.
 * @param {PossibleCause} cause - Cause record being normalized.
 * @returns {{text: string, owner: string, eta: string}} Normalized next test object.
 */
function ensureNextTest(cause){
  if(!cause || typeof cause !== 'object'){
    return { text: '', owner: '', eta: '' };
  }
  let record = cause.next_test;
  if(!record || typeof record !== 'object'){
    record = { text: '', owner: '', eta: '' };
  }
  if(typeof record.text !== 'string'){
    record.text = '';
  }
  if(typeof record.owner !== 'string'){
    record.owner = '';
  }
  if(typeof record.eta !== 'string'){
    record.eta = '';
  }
  cause.next_test = record;
  return record;
}

/**
 * Checks whether a string contains non-whitespace characters.
 * @param {unknown} value - Candidate string value.
 * @returns {boolean} True when the value is a non-empty string after trimming.
 */
function hasMeaningfulText(value){
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Derives the current decision metadata for a cause including readiness state.
 * @param {PossibleCause} cause - Cause record being inspected.
 * @returns {{
 *   decision: ('explains'|'conditional'|'does_not_explain'|''),
 *   explanationIs: string,
 *   explanationNot: string,
 *   assumptions: string,
 *   nextTest: { text: string, owner: string, eta: string },
 *   status: ('pending'|'explained'|'conditional'|'conditional-pending'|'failed'),
 *   label: string
 * }} Structured decision metadata.
 */
function computeDecisionState(cause){
  const decision = normalizeDecision(cause?.decision);
  const explanationIs = typeof cause?.explanation_is === 'string'
    ? cause.explanation_is.trim()
    : '';
  const explanationNot = typeof cause?.explanation_is_not === 'string'
    ? cause.explanation_is_not.trim()
    : '';
  const assumptions = typeof cause?.assumptions === 'string'
    ? cause.assumptions.trim()
    : '';
  const nextTest = ensureNextTest(cause);
  const nextTestText = nextTest.text.trim();
  const nextTestOwner = nextTest.owner.trim();
  const nextTestEta = nextTest.eta.trim();

  if(!decision){
    return {
      decision: '',
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'pending',
      label: 'Decision pending'
    };
  }

  if(decision === 'does_not_explain'){
    return {
      decision,
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'failed',
      label: 'Does not explain'
    };
  }

  if(decision === 'explains'){
    if(explanationIs && explanationNot){
      return {
        decision,
        explanationIs,
        explanationNot,
        assumptions,
        nextTest,
        status: 'explained',
        label: 'Explains the pattern'
      };
    }
    return {
      decision,
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'pending',
      label: 'Add reasoning details'
    };
  }

  const hasAssumption = Boolean(assumptions);
  const hasTestPlan = Boolean(nextTestText);
  const testComplete = Boolean(nextTestText && nextTestOwner && nextTestEta);

  if(hasAssumption && testComplete){
    return {
      decision,
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'conditional',
      label: 'Explains only if assumption holds'
    };
  }

  if(hasAssumption && hasTestPlan){
    return {
      decision,
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'conditional-pending',
      label: 'Add owner and ETA to test it'
    };
  }

  if(hasAssumption){
    return {
      decision,
      explanationIs,
      explanationNot,
      assumptions,
      nextTest,
      status: 'conditional-pending',
      label: 'Add a test plan to verify'
    };
  }

  return {
    decision,
    explanationIs,
    explanationNot,
    assumptions,
    nextTest,
    status: 'pending',
    label: 'Describe the required assumption'
  };
}

/**
 * Checks whether the selected cause decision rules out the hypothesis.
 * @param {PossibleCause} cause - Cause being evaluated.
 * @returns {boolean} `true` when the decision is `does_not_explain`.
 */
export function causeHasFailure(cause){
  return computeDecisionState(cause).status === 'failed';
}

/**
 * Counts how many assumptions are tracked for a conditional hypothesis.
 * @param {PossibleCause} cause - Cause being evaluated.
 * @returns {number} Number of active assumptions (0 or 1).
 */
export function countCauseAssumptions(cause){
  const state = computeDecisionState(cause);
  if(state.decision !== 'conditional') return 0;
  return state.assumptions ? 1 : 0;
}

/**
 * Formats an ETA string into a friendly label.
 * @param {string} eta - ISO timestamp or free-form ETA value.
 * @returns {string} Human-readable ETA label.
 */
function formatEtaLabel(eta){
  const trimmed = typeof eta === 'string' ? eta.trim() : '';
  if(!trimmed) return 'Add ETA';
  const parsed = new Date(trimmed);
  if(Number.isNaN(parsed.valueOf())){
    return trimmed;
  }
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Converts a local datetime input value into an ISO string.
 * @param {string} value - Raw value from a `datetime-local` input.
 * @returns {string} ISO timestamp or an empty string when invalid.
 */
function normalizeEtaInput(value){
  if(typeof value !== 'string' || !value.trim()) return '';
  const parsed = new Date(value);
  if(Number.isNaN(parsed.valueOf())) return '';
  return parsed.toISOString();
}

/**
 * Builds a conversational preview of the current decision state including
 * placeholders for incomplete reasoning.
 * @param {PossibleCause} cause - Cause backing the preview.
 * @returns {string} Natural language preview sentence.
 */
function buildDecisionPreviewText(cause){
  const decision = normalizeDecision(cause?.decision);
  const explanationIsRaw = typeof cause?.explanation_is === 'string' ? cause.explanation_is : '';
  const explanationNotRaw = typeof cause?.explanation_is_not === 'string' ? cause.explanation_is_not : '';
  const assumptionsRaw = typeof cause?.assumptions === 'string' ? cause.assumptions : '';
  const nextTest = ensureNextTest(cause);
  const ellipsis = '…';

  if(decision === 'explains'){
    const because = explanationIsRaw.trim() || ellipsis;
    const unaffected = explanationNotRaw.trim() || ellipsis;
    return `This cause explains the pattern because ${because}, and it does not appear in the unaffected cases because ${unaffected}.`;
  }

  if(decision === 'conditional'){
    const assumption = assumptionsRaw.trim() || ellipsis;
    const test = nextTest.text.trim() || ellipsis;
    const owner = nextTest.owner.trim();
    const eta = nextTest.eta.trim();
    const meta = [];
    if(owner){ meta.push(owner); }
    if(eta){ meta.push(formatEtaLabel(eta)); }
    const metaText = meta.length ? ` (${meta.join(', ')})` : '';
    return `This cause explains the data only if ${assumption}. Test: ${test}${metaText}.`;
  }

  if(decision === 'does_not_explain'){
    const reason = explanationIsRaw.trim() || ellipsis;
    return `This cause fails because ${reason}.`;
  }

  return 'Choose a decision to start building the reasoning.';
}

/**
 * Produces the canonical summary sentence for the decision outcome, omitting
 * empty fragments as required by the auto-summary templates.
 * @param {PossibleCause} cause - Cause record being summarised.
 * @returns {string} Completed decision summary sentence.
 */
export function buildCauseDecisionSummary(cause){
  const decision = normalizeDecision(cause?.decision);
  const explanationIs = typeof cause?.explanation_is === 'string' ? cause.explanation_is.trim() : '';
  const explanationNot = typeof cause?.explanation_is_not === 'string' ? cause.explanation_is_not.trim() : '';
  const assumptions = typeof cause?.assumptions === 'string' ? cause.assumptions.trim() : '';
  const nextTest = ensureNextTest(cause);
  const testText = nextTest.text.trim();
  const owner = nextTest.owner.trim();
  const eta = nextTest.eta.trim();

  if(decision === 'explains'){
    const parts = ['Explains.'];
    if(explanationIs){
      parts.push(`This cause explains the pattern because ${explanationIs}.`);
    }
    if(explanationNot){
      parts.push(`It is not present in unaffected cases because ${explanationNot}.`);
    }
    return parts.join(' ').trim();
  }

  if(decision === 'conditional'){
    const parts = ['Explains only if.'];
    if(assumptions){
      parts.push(`This cause explains the data only if ${assumptions}.`);
    }
    if(testText){
      const meta = [];
      if(owner){ meta.push(owner); }
      if(eta){ meta.push(formatEtaLabel(eta)); }
      const metaText = meta.length ? ` (${meta.join(', ')})` : '';
      parts.push(`Test: ${testText}${metaText}.`);
    }
    return parts.join(' ').trim();
  }

  if(decision === 'does_not_explain'){
    const reason = explanationIs || explanationNot;
    if(reason){
      return `Does not explain. This cause fails because ${reason.trim()}.`;
    }
    return 'Does not explain.';
  }

  return '';
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
    decision: '',
    explanation_is: '',
    explanation_is_not: '',
    assumptions: '',
    next_test: { text: '', owner: '', eta: '' },
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
function composeHypothesisSummary(cause, { preview = false } = {}){
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
  const accusationText = preview ? truncateForPreview(accusationClean) : accusationClean;
  const impactText = preview ? truncateForPreview(impactClean) : impactClean;

  const sentences = [`We suspect ${suspectText} because ${accusationText}.`];
  if(hasImpact){
    sentences.push(`This could lead to ${impactText}.`);
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
  return composeHypothesisSummary(cause, { preview: false });
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
/**
 * Derives an internal status token for a cause based on hypothesis completeness
 * and recorded decision state.
 * @param {PossibleCause} cause - Cause to evaluate.
 * @returns {string} Status token used for styling.
 */
function causeStatusState(cause){
  if(!hasCompleteHypothesis(cause)) return 'draft';
  const state = computeDecisionState(cause);
  switch(state.status){
    case 'failed':
      return 'failed';
    case 'explained':
      return 'explained';
    case 'conditional':
      return 'conditional';
    case 'conditional-pending':
      return 'conditional-pending';
    default:
      return 'pending';
  }
}

/**
 * Derives a friendly label for the cause card that reflects hypothesis and
 * decision progress.
 * @param {PossibleCause} cause - Cause being summarized.
 * @returns {string} Status label for UI display.
 */
export function causeStatusLabel(cause){
  if(cause?.editing) return 'Editing hypothesis';
  if(!hasCompleteHypothesis(cause)) return 'Draft hypothesis';
  const state = computeDecisionState(cause);
  return state.label || 'Decision pending';
}

/**
 * Updates the progress chip to reflect the current decision status.
 * @param {HTMLElement} chip - Chip element displaying progress.
 * @param {PossibleCause} cause - Cause whose progress is being represented.
 * @returns {void}
 */
function updateCauseProgressChip(chip, cause){
  if(!chip || !cause) return;
  const state = computeDecisionState(cause);
  chip.textContent = state.label;
  chip.dataset.status = causeStatusState(cause);
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
 * Collects IS / IS NOT evidence summaries for display in the cause test panel.
 * @returns {Array<{question: string, isLines: string[], notLines: string[]}>} Evidence entries.
 */
function collectEvidenceSummaries(){
  const entries = [];
  rowsBuilt.forEach(row => {
    if(!rowHasEvidencePair(row)) return;
    const question = row?.th?.textContent?.trim() || fillTokens(row?.def?.q || '');
    const isLines = splitLines(row?.isTA?.value || '');
    const notLines = splitLines(row?.notTA?.value || '');
    if(isLines.length || notLines.length){
      entries.push({ question, isLines, notLines });
    }
  });
  return entries;
}

/**
 * Renders the evidence summary content into the provided container element.
 * @param {HTMLElement} container - Evidence container element.
 * @returns {void}
 */
function renderEvidenceContent(container){
  if(!container) return;
  container.innerHTML = '';
  const entries = collectEvidenceSummaries();
  if(!entries.length){
    const empty = document.createElement('p');
    empty.className = 'cause-test__evidence-empty';
    empty.textContent = 'Add IS / IS NOT pairs to compare this cause against the data.';
    container.append(empty);
    return;
  }

  const isSection = document.createElement('section');
  isSection.className = 'cause-test__evidence-section';
  const isHeading = document.createElement('h5');
  isHeading.textContent = 'IS evidence';
  const isList = document.createElement('ul');
  isList.className = 'cause-test__evidence-list';
  entries.forEach(entry => {
    entry.isLines.forEach(line => {
      const item = document.createElement('li');
      item.innerHTML = `<span class="cause-test__evidence-term">${entry.question}</span><span class="cause-test__evidence-detail">${line}</span>`;
      isList.append(item);
    });
  });
  if(!isList.children.length){
    const placeholder = document.createElement('li');
    placeholder.className = 'cause-test__evidence-placeholder';
    placeholder.textContent = 'No IS statements recorded yet.';
    isList.append(placeholder);
  }
  isSection.append(isHeading, isList);

  const notSection = document.createElement('section');
  notSection.className = 'cause-test__evidence-section';
  const notHeading = document.createElement('h5');
  notHeading.textContent = 'IS NOT evidence';
  const notList = document.createElement('ul');
  notList.className = 'cause-test__evidence-list';
  entries.forEach(entry => {
    entry.notLines.forEach(line => {
      const item = document.createElement('li');
      item.innerHTML = `<span class="cause-test__evidence-term">${entry.question}</span><span class="cause-test__evidence-detail">${line}</span>`;
      notList.append(item);
    });
  });
  if(!notList.children.length){
    const placeholder = document.createElement('li');
    placeholder.className = 'cause-test__evidence-placeholder';
    placeholder.textContent = 'No IS NOT statements recorded yet.';
    notList.append(placeholder);
  }
  notSection.append(notHeading, notList);

  container.append(isSection, notSection);
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
          placeholder: 'e.g., New employees, Wash tank settings, Supplier batch 42',
          helper: 'Name the component, material, process, team, or condition you think is causing the deviation. Be specific.',
          required: true
        },
        {
          key: 'accusation',
          label: 'Accusation (Deviation — what’s wrong with the suspect?)',
          placeholder: 'e.g., Using unapproved hand cream; Temperature changed from 180°F to 160°F',
          helper: 'Describe the behavior, change, or condition that is different or defective. Use observable facts, not opinions.',
          required: true
        },
        {
          key: 'impact',
          label: 'Impact (How could this cause the problem?)',
          placeholder: 'e.g., Leaves a film that prevents paint adhesion; Causes moisture entrapment leading to blistering',
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
        textarea.placeholder = config.placeholder;
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
  panel.className = 'cause-test cause-test--redesign';
  const actionBadge = card?.querySelector('[data-role="action-count"]');
  const nextTest = ensureNextTest(cause);

  const header = document.createElement('header');
  header.className = 'cause-test__header';
  const title = document.createElement('h4');
  title.textContent = 'Would this cause explain the pattern we see?';
  const subtitle = document.createElement('p');
  subtitle.className = 'cause-test__subtitle';
  subtitle.textContent = 'Look at the IS / IS NOT evidence. Trust the data.';
  const pill = document.createElement('span');
  pill.className = 'cause-test__tag';
  pill.textContent = `Possible Cause: ${causeDisplayLabel(cause)}`;
  header.append(title, subtitle, pill);
  panel.append(header);

  const layout = document.createElement('div');
  layout.className = 'cause-test__layout';

  const evidenceColumn = document.createElement('aside');
  evidenceColumn.className = 'cause-test__column cause-test__column--evidence';
  const evidenceCard = document.createElement('div');
  evidenceCard.className = 'cause-test__evidence-card';
  const evidenceContent = document.createElement('div');
  evidenceContent.className = 'cause-test__evidence-content';
  evidenceContent.dataset.role = 'cause-test-evidence';
  renderEvidenceContent(evidenceContent);
  evidenceCard.append(evidenceContent);
  evidenceColumn.append(evidenceCard);

  const decisionColumn = document.createElement('section');
  decisionColumn.className = 'cause-test__column cause-test__column--decision';

  const segments = document.createElement('div');
  segments.className = 'cause-test__segments';
  const decisionButtons = [];
  const options = [
    { value: 'explains', label: 'Explains' },
    { value: 'conditional', label: 'Explains only if' },
    { value: 'does_not_explain', label: 'Does not explain' }
  ];
  options.forEach(option => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cause-test__segment';
    btn.dataset.value = option.value;
    btn.textContent = option.label;
    btn.addEventListener('click', () => {
      setActiveDecision(option.value);
    });
    decisionButtons.push(btn);
    segments.append(btn);
  });
  decisionColumn.append(segments);

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 'cause-test__fields';

  const explainsGroup = document.createElement('div');
  explainsGroup.className = 'cause-test__group';
  const explainDo = createPromptField(
    'How does this cause explain what we DO see (IS evidence)?',
    'It creates/introduces/causes…',
    cause.explanation_is,
    value => {
      cause.explanation_is = value;
      persist();
      updatePreview();
    }
  );
  const explainNot = createPromptField(
    'Why would it NOT appear in the IS NOT evidence?',
    'Because those cases don’t involve/have…',
    cause.explanation_is_not,
    value => {
      cause.explanation_is_not = value;
      persist();
      updatePreview();
    }
  );
  explainsGroup.append(explainDo.field, explainNot.field);

  const conditionalGroup = document.createElement('div');
  conditionalGroup.className = 'cause-test__group';
  const assumptionField = createPromptField(
    'What assumption must be true for this cause to explain the data?',
    'Assumes that only Line 1 uses…',
    cause.assumptions,
    value => {
      cause.assumptions = value;
      persist();
      updatePreview();
      updateConvertVisibility();
    }
  );
  const testField = createPromptField(
    'What should we check to verify that assumption?',
    'Outline the validation or measurement that will prove it.',
    nextTest.text,
    value => {
      nextTest.text = value;
      persist();
      updatePreview();
      updateConvertVisibility();
    }
  );
  conditionalGroup.append(assumptionField.field, testField.field);

  const testControls = document.createElement('div');
  testControls.className = 'cause-test__test-controls';
  const ownerBtn = document.createElement('button');
  ownerBtn.type = 'button';
  ownerBtn.className = 'chip chip--pill cause-test__owner';
  const etaBtn = document.createElement('button');
  etaBtn.type = 'button';
  etaBtn.className = 'chip chip--pill cause-test__eta';
  const convertBtn = document.createElement('button');
  convertBtn.type = 'button';
  convertBtn.className = 'cause-test__convert';
  convertBtn.textContent = 'Convert to Action';
  convertBtn.hidden = true;
  convertBtn.addEventListener('click', handleConvertToAction);

  ownerBtn.addEventListener('click', () => {
    openOwnerDialog(nextTest.owner, value => {
      nextTest.owner = value;
      updateOwnerButton();
      persist();
      updatePreview();
      updateConvertVisibility();
    });
  });

  etaBtn.addEventListener('click', () => {
    openEtaDialog(nextTest.eta, value => {
      nextTest.eta = value;
      updateEtaButton();
      persist();
      updatePreview();
      updateConvertVisibility();
    });
  });

  testControls.append(ownerBtn, etaBtn);
  conditionalGroup.append(testControls, convertBtn);

  const failGroup = document.createElement('div');
  failGroup.className = 'cause-test__group';
  const failField = createPromptField(
    'What evidence contradicts this cause?',
    'It cannot explain because…',
    cause.explanation_is,
    value => {
      cause.explanation_is = value;
      persist();
      updatePreview();
    }
  );
  failGroup.append(failField.field);

  fieldsWrap.append(explainsGroup, conditionalGroup, failGroup);
  decisionColumn.append(fieldsWrap);

  layout.append(evidenceColumn, decisionColumn);
  panel.append(layout);

  const preview = document.createElement('div');
  preview.className = 'cause-test__preview';
  preview.textContent = buildDecisionPreviewText(cause);
  panel.append(preview);

  setActiveDecision(normalizeDecision(cause.decision) || '');
  updateOwnerButton();
  updateEtaButton();
  updateConvertVisibility();

  return panel;

  function createPromptField(labelText, placeholder, value, onInput){
    const field = document.createElement('label');
    field.className = 'cause-test__prompt';
    const label = document.createElement('span');
    label.className = 'cause-test__prompt-label';
    label.textContent = labelText;
    const textarea = document.createElement('textarea');
    textarea.className = 'cause-test__textarea';
    textarea.placeholder = placeholder;
    textarea.value = typeof value === 'string' ? value : '';
    textarea.addEventListener('input', event => {
      onInput(event.target.value);
      autoResize(textarea);
    });
    autoResize(textarea);
    field.append(label, textarea);
    return { field, textarea };
  }

  function setActiveDecision(nextValue){
    const normalized = normalizeDecision(nextValue);
    cause.decision = normalized;
    decisionButtons.forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.value === normalized);
    });
    explainsGroup.hidden = normalized !== 'explains';
    conditionalGroup.hidden = normalized !== 'conditional';
    failGroup.hidden = normalized !== 'does_not_explain';
    persist();
    updatePreview();
    updateConvertVisibility();
  }

  function updatePreview(){
    preview.textContent = buildDecisionPreviewText(cause);
  }

  function persist(){
    const countText = updateCauseActionBadge(actionBadge, cause);
    updateCauseProgressChip(progressChip, cause);
    updateCauseStatusLabel(statusEl, cause, countText);
    updateCauseCardIndicators(card, cause);
    saveHandler();
  }

  function updateOwnerButton(){
    const owner = nextTest.owner && nextTest.owner.trim();
    if(owner){
      ownerBtn.textContent = owner;
      ownerBtn.dataset.empty = '0';
    }else{
      ownerBtn.textContent = 'Assign owner';
      ownerBtn.dataset.empty = '1';
    }
  }

  function updateEtaButton(){
    const eta = nextTest.eta && nextTest.eta.trim();
    etaBtn.textContent = eta ? formatEtaLabel(eta) : 'Add ETA';
    etaBtn.dataset.empty = eta ? '0' : '1';
  }

  function updateConvertVisibility(){
    const state = computeDecisionState(cause);
    const ready = state.decision === 'conditional'
      && state.nextTest.text.trim()
      && state.nextTest.owner.trim()
      && state.nextTest.eta.trim();
    convertBtn.hidden = !ready;
  }

  function handleConvertToAction(){
    const analysisId = getAnalysisId();
    const summary = nextTest.text.trim();
    if(!summary){
      callShowToast('Add a short test summary before converting this to an action.');
      return;
    }
    const detailParts = [];
    const hypothesis = buildHypothesisSentence(cause);
    if(hypothesis){ detailParts.push(`Hypothesis: ${hypothesis}`); }
    const decisionSummary = buildCauseDecisionSummary(cause);
    if(decisionSummary){ detailParts.push(decisionSummary); }
    const detail = detailParts.join('\n\n');
    const ownerName = nextTest.owner.trim();
    const dueAt = nextTest.eta.trim();
    const payload = {
      summary,
      detail,
      dueAt,
      owner: ownerName ? { name: ownerName } : '',
      links: { hypothesisId: cause.id }
    };
    let created = null;
    try{
      created = createAction(analysisId, payload);
    }catch(_){
      created = null;
    }
    if(created){
      callShowToast('Test converted into an action item.');
      try{
        window.dispatchEvent(new CustomEvent(ACTIONS_UPDATED_EVENT, { detail: { source: 'cause-test', causeId: cause.id } }));
      }catch(_){ /* no-op */ }
      refreshCauseActionCounts();
      const countText = updateCauseActionBadge(actionBadge, cause);
      updateCauseStatusLabel(statusEl, cause, countText);
      updateConvertVisibility();
    }else{
      callShowToast('Unable to create the action. Try again after adding more detail.');
    }
  }

  function openOwnerDialog(initialValue, onSave){
    let overlay = document.querySelector('.owner-picker-overlay[data-role="cause-test-owner"]');
    if(overlay){ overlay.remove(); }
    overlay = document.createElement('div');
    overlay.className = 'owner-picker-overlay';
    overlay.dataset.role = 'cause-test-owner';
    overlay.innerHTML = `
      <div class="owner-picker" role="dialog" aria-modal="true" aria-labelledby="causeTestOwnerTitle" aria-describedby="causeTestOwnerDesc">
        <header class="owner-picker__header">
          <div class="owner-picker__heading">
            <h4 id="causeTestOwnerTitle">Assign Owner</h4>
            <p id="causeTestOwnerDesc" class="owner-picker__subtitle">Choose who will run this test.</p>
          </div>
          <button type="button" class="owner-picker__close" aria-label="Close">×</button>
        </header>
        <form class="owner-picker__form">
          <label class="owner-picker__field">
            <span class="owner-picker__label">Owner Name</span>
            <input type="text" name="ownerName" autocomplete="off" placeholder="e.g., Jane Doe" value="${initialValue ? initialValue.replace(/"/g, '&quot;') : ''}" />
          </label>
          <footer class="owner-picker__actions">
            <button type="button" class="owner-picker__button owner-picker__button--ghost" data-action="clear">Clear</button>
            <span class="owner-picker__spacer"></span>
            <button type="button" class="owner-picker__button owner-picker__button--ghost" data-action="cancel">Cancel</button>
            <button type="submit" class="owner-picker__button owner-picker__button--primary" data-action="assign">Assign Owner</button>
          </footer>
        </form>
      </div>
    `;
    const close = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    };
    const onKeyDown = event => {
      if(event.key === 'Escape'){ event.preventDefault(); close(); }
    };
    const form = overlay.querySelector('form');
    const nameInput = form.querySelector('input[name="ownerName"]');
    const closeBtn = overlay.querySelector('.owner-picker__close');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = nameInput.value.trim();
      onSave(value);
      close();
    });
    form.querySelector('[data-action="cancel"]').addEventListener('click', close);
    form.querySelector('[data-action="clear"]').addEventListener('click', () => {
      nameInput.value = '';
      onSave('');
      close();
    });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if(event.target === overlay){ close(); }
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
    nameInput.focus();
  }

  function openEtaDialog(initialValue, onSave){
    let overlay = document.querySelector('.eta-picker-overlay[data-role="cause-test-eta"]');
    if(overlay){ overlay.remove(); }
    overlay = document.createElement('div');
    overlay.className = 'eta-picker-overlay';
    overlay.dataset.role = 'cause-test-eta';
    const initialLocal = initialValue ? new Date(initialValue) : null;
    const initialLocalValue = initialLocal && !Number.isNaN(initialLocal.valueOf())
      ? new Date(initialLocal.getTime() - initialLocal.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '';
    overlay.innerHTML = `
      <div class="eta-picker" role="dialog" aria-modal="true" aria-labelledby="causeTestEtaTitle">
        <header class="eta-picker__header">
          <h4 id="causeTestEtaTitle">Set ETA</h4>
          <button type="button" class="eta-picker__close" aria-label="Close">×</button>
        </header>
        <div class="eta-picker__body">
          <label class="eta-picker__field">
            <span>Due date</span>
            <input type="datetime-local" value="${initialLocalValue}" />
          </label>
        </div>
        <footer class="eta-picker__actions">
          <button type="button" class="eta-picker__button eta-picker__button--ghost" data-action="clear">Clear</button>
          <span class="eta-picker__spacer"></span>
          <button type="button" class="eta-picker__button eta-picker__button--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="eta-picker__button eta-picker__button--primary" data-action="save">Save ETA</button>
        </footer>
      </div>
    `;
    const close = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
    };
    const onKeyDown = event => {
      if(event.key === 'Escape'){ event.preventDefault(); close(); }
    };
    const input = overlay.querySelector('input');
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-action="clear"]').addEventListener('click', () => {
      onSave('');
      close();
    });
    overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
      const iso = normalizeEtaInput(input.value);
      if(!iso){
        onSave('');
      }else{
        onSave(iso);
      }
      close();
    });
    overlay.querySelector('.eta-picker__close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if(event.target === overlay){ close(); }
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
    input.focus();
  }
}

/**
 * Synchronizes the cause-testing panels with the latest KT table evidence and
 * action counts.
 * @returns {void}
 */
export function updateCauseEvidencePreviews(){
  if(!causeList) return;
  refreshCauseActionCounts();
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
    const evidenceContainer = card.querySelector('.cause-test__evidence-content');
    if(evidenceContainer){ renderEvidenceContent(evidenceContainer); }
    const previewEl = card.querySelector('.cause-test__preview');
    if(previewEl){ previewEl.textContent = buildDecisionPreviewText(cause); }
    const ownerBtn = card.querySelector('.cause-test__owner');
    const etaBtn = card.querySelector('.cause-test__eta');
    const convertBtn = card.querySelector('.cause-test__convert');
    const nextTest = ensureNextTest(cause);
    if(ownerBtn){
      const owner = nextTest.owner.trim();
      ownerBtn.textContent = owner || 'Assign owner';
      ownerBtn.dataset.empty = owner ? '0' : '1';
    }
    if(etaBtn){
      const eta = nextTest.eta.trim();
      etaBtn.textContent = eta ? formatEtaLabel(eta) : 'Add ETA';
      etaBtn.dataset.empty = eta ? '0' : '1';
    }
    if(convertBtn){
      const state = computeDecisionState(cause);
      const ready = state.decision === 'conditional'
        && state.nextTest.text.trim()
        && state.nextTest.owner.trim()
        && state.nextTest.eta.trim();
      convertBtn.hidden = !ready;
    }
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
