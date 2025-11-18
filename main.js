/**
 * Application entry point responsible for bootstrapping shared modules, wiring
 * global events, and exposing utility callbacks for manual triggering.
 * @module main
 */

import { saveToStorage, restoreFromStorage, clearAllIntakeStorage } from './src/storage.js';
import { initStepsFeature, resetStepsState } from './src/steps.js';
import { initCommsDrawer, toggleCommsDrawer, closeCommsDrawer } from './src/commsDrawer.js';
import {
  initTemplatesDrawer,
  toggleTemplatesDrawer,
  closeTemplatesDrawer
} from './src/templatesDrawer.js';
import {
  configureKT,
  initTable,
  ensurePossibleCausesUI,
  renderCauses
} from './src/kt.js';
import { generateSummary, setSummaryStateProvider } from './src/summary.js';
import { mountActionListCard, refreshActionList } from './components/actions/ActionListCard.js';
import {
  initPreface,
  autoResize,
  updatePrefaceTitles,
  startMirrorSync,
  setBridgeOpenedNow,
  getPrefaceState,
  getObjectFull,
  getDeviationFull
} from './src/preface.js';
import {
  initializeCommunications,
  logCommunication,
  toggleLogVisibility,
  setCadence,
  setManualNextUpdate,
  getCommunicationElements
} from './src/comms.js';
import {
  collectAppState,
  applyAppState,
  getSummaryState,
  resetAnalysisId
} from './src/appState.js';
import { showToast } from './src/toast.js';
import { exportAppStateToFile, importAppStateFromFile } from './src/fileTransfer.js';

/**
 * Query the document for the first element that matches the provided CSS selector.
 * @param {string} selector - The CSS selector identifying the desired element.
 * @returns {Element|null} The matching element, or <code>null</code> if none is found.
 */
function $(selector) {
  return document.querySelector(selector);
}

/**
 * Attach a DOM event listener to an element if it exists.
 * @param {Element|Document|null} element - The target element to receive the listener.
 * @param {string} event - The event type to listen for (e.g., <code>'click'</code>).
 * @param {(event: Event) => void} handler - Callback invoked with the event object.
 * @returns {void}
 */
function on(element, event, handler) {
  if (element) {
    element.addEventListener(event, handler);
  }
}

/**
 * Collect and persist the current intake application state to localStorage.
 * @returns {void}
 */
function saveAppState() {
  try {
    const state = collectAppState();
    saveToStorage(state);
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Restore a previously saved intake snapshot from storage if available.
 * @param {Object} [options] - Optional dependency overrides used primarily for testing.
 * @param {() => any} [options.restore=restoreFromStorage] - Function that retrieves the stored snapshot.
 * @param {(state: any) => void} [options.apply=applyAppState] - Function that applies the stored snapshot to the app.
 * @param {(message: string) => void} [options.toast=showToast] - Function that announces the restore event.
 * @returns {boolean} <code>true</code> when a snapshot is restored, otherwise <code>false</code>.
 */
function restoreSavedIntake({
  restore = restoreFromStorage,
  apply = applyAppState,
  toast = showToast
} = {}) {
  const snapshot = restore();
  if (!snapshot) {
    return false;
  }

  apply(snapshot);
  if (typeof toast === 'function') {
    toast('Saved intake reloaded ✨');
  }
  return true;
}

/**
 * Clear all intake storage segments and rebuild the UI to a pristine state.
 * @returns {void}
 */
function startFresh() {
  clearAllIntakeStorage();
  resetAnalysisId();
  resetStepsState();
  applyAppState({});
  closeCommsDrawer();
  closeTemplatesDrawer();
  setBridgeOpenedNow();
  updatePrefaceTitles();
  try {
    refreshActionList();
  } catch (error) {
    console.debug('[main:start-fresh]', error);
  }
  clearAllIntakeStorage();
  resetAnalysisId();
  showToast('Intake reset. Ready for a new incident ✨');
}

/**
 * Initialize the intake experience by configuring modules, restoring state,
 * and wiring shared lifecycle events.
 * @returns {void}
 */
function boot() {
  window.showToast = showToast;

  configureKT({
    autoResize,
    onSave: saveAppState,
    showToast,
    onTokensChange: updatePrefaceTitles,
    getObjectFull,
    getDeviationFull
  });

  initTable();
  ensurePossibleCausesUI();
  renderCauses();

  initPreface({ onSave: saveAppState });
  initCommsDrawer();
  initTemplatesDrawer();
  initializeCommunications({ onSave: saveAppState, showToast });
  initStepsFeature({ onSave: saveAppState, onLog: logCommunication });

  setSummaryStateProvider(getSummaryState);

  restoreSavedIntake();

  const { ops } = getPrefaceState();
  if (!ops.bridgeOpenedUtc) {
    setBridgeOpenedNow();
  }

  updatePrefaceTitles();
  startMirrorSync();

  wireSummaryEvents();
  wireCommsEvents();
  wireTemplatesEvents();
  wireStartFreshButton();
  wireBridgeNowButton();
  wireFileTransferControls();
  wireKeyboardShortcuts();
}

/**
 * Test-only export to run the restore helper in isolation.
 * @param {Parameters<typeof restoreSavedIntake>[0]} options - Dependency overrides for the restore helper.
 * @returns {boolean} Reflects whether a snapshot was restored.
 */
export function __testRestoreSavedIntake(options) {
  return restoreSavedIntake(options);
}

/**
 * Register click handlers that trigger summary generation for manual and AI flows.
 * @returns {void}
 */
function wireSummaryEvents() {
  const summaryBtn = $('#genSummaryBtn');
  on(summaryBtn, 'click', () => generateSummary('summary', ''));

  const aiSummaryBtn = $('#generateAiSummaryBtn');
  on(aiSummaryBtn, 'click', () => generateSummary('summary', 'ai summary'));
}

/**
 * Wire communication drawer controls including logging buttons and cadence inputs.
 * @returns {void}
 */
function wireCommsEvents() {
  const commsBtn = $('#commsBtn');
  const commsCloseBtn = $('#commsCloseBtn');
  const commsBackdrop = $('#commsBackdrop');
  on(commsBtn, 'click', toggleCommsDrawer);
  on(commsCloseBtn, 'click', closeCommsDrawer);
  on(commsBackdrop, 'click', closeCommsDrawer);

  const { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios } = getCommunicationElements();
  on(internalBtn, 'click', () => {
    logCommunication('internal');
    closeCommsDrawer();
  });
  on(externalBtn, 'click', () => {
    logCommunication('external');
    closeCommsDrawer();
  });
  on(logToggleBtn, 'click', toggleLogVisibility);
  if (nextUpdateInput) {
    on(nextUpdateInput, 'change', event => setManualNextUpdate(event.target.value));
  }
  if (Array.isArray(cadenceRadios)) {
    cadenceRadios.forEach(radio => {
      on(radio, 'change', () => {
        if (radio.checked) {
          setCadence(radio.value);
        }
      });
    });
  }
}

/**
 * Wire the templates drawer launcher, close button, and backdrop controls.
 * @returns {void}
 */
function wireTemplatesEvents() {
  const templatesBtn = $('#templatesBtn');
  const templatesCloseBtn = $('#templatesCloseBtn');
  const templatesBackdrop = $('#templatesBackdrop');
  on(templatesBtn, 'click', toggleTemplatesDrawer);
  on(templatesCloseBtn, 'click', closeTemplatesDrawer);
  on(templatesBackdrop, 'click', closeTemplatesDrawer);
}

/**
 * Attach the Start Fresh button to the reset workflow.
 * @returns {void}
 */
function wireStartFreshButton() {
  const btn = $('#startFreshBtn');
  on(btn, 'click', () => {
    startFresh();
  });
}

/**
 * Bind the bridge "Set to Now" button to update the bridge opened timestamp.
 * @returns {void}
 */
function wireBridgeNowButton() {
  const btn = $('#bridgeSetNowBtn');
  on(btn, 'click', setBridgeOpenedNow);
}

/**
 * Connects the Save/Load buttons to the file transfer helpers.
 * @returns {void}
 */
function wireFileTransferControls() {
  const saveBtn = $('#saveToFileBtn');
  const loadBtn = $('#loadFromFileBtn');
  const fileInput = $('#importFileInput');

  on(saveBtn, 'click', () => {
    const result = exportAppStateToFile();
    if (result && typeof result === 'object') {
      if (!result.success && result.error) {
        console.error('Export failed:', result.error);
      }
      if (result.message) {
        showToast(result.message);
      }
    }
  });

  if (loadBtn && fileInput) {
    on(loadBtn, 'click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    on(fileInput, 'change', async event => {
      const input = event.target;
      const file = input && input.files && input.files.length ? input.files[0] : null;
      if (!file) {
        return;
      }

      let result;
      try {
        result = await importAppStateFromFile(file);
      } catch (error) {
        console.error('Import failed:', error);
        showToast('Import failed due to an unexpected error.');
        input.value = '';
        return;
      }

      input.value = '';

      if (result && typeof result === 'object') {
        if (!result.success && result.error) {
          console.error('Import failed:', result.error);
        }
        if (result.message) {
          showToast(result.message);
        }
      }
    });
  }
}

/**
 * Install Alt-key keyboard shortcuts for summary generation and communication logging.
 * @returns {void}
 */
function wireKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const key = (event.key || '').toLowerCase();
    switch (key) {
      case 's':
      case 'g':
        event.preventDefault();
        generateSummary('summary', '');
        break;
      case 'i':
        event.preventDefault();
        logCommunication('internal');
        closeCommsDrawer();
        break;
      case 'e':
        event.preventDefault();
        logCommunication('external');
        closeCommsDrawer();
        break;
      case 'c':
        if (event.defaultPrevented) {
          break;
        }
        event.preventDefault();
        toggleCommsDrawer();
        break;
      case 't':
        if (event.defaultPrevented) {
          break;
        }
        event.preventDefault();
        toggleTemplatesDrawer();
        break;
      case 'n':
        event.preventDefault();
        setBridgeOpenedNow();
        break;
      default:
        break;
    }
  });
}

/**
 * Mount the Action List card immediately after the possible causes anchor if present.
 * @returns {void}
 */
function mountAfterPossibleCauses() {
  const anchor = document.querySelector('#possibleCausesCard')
    || document.querySelector('#possible-causes');
  if (!anchor) return;

  const host = document.createElement('div');
  anchor.insertAdjacentElement('afterend', host);
  mountActionListCard(host);
}

/**
 * Expose summary generation helpers on the global window for legacy inline bindings.
 * @returns {void}
 */
function exposeGlobals() {
  window.onGenerateSummary = () => generateSummary('summary', '');
  window.onGenerateAIPrompt = () => generateSummary('summary', 'prompt preamble');
  window.onGenerateAISummary = () => generateSummary('summary', 'ai summary');
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    boot();
    mountAfterPossibleCauses();
    exposeGlobals();
  } catch (error) {
    console.error('Initialization failed:', error);
  }
});
