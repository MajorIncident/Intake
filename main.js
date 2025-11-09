/**
 * Application entry point responsible for bootstrapping shared modules, wiring
 * global events, and exposing utility callbacks for manual triggering.
 * @module main
 */

import { saveToStorage, restoreFromStorage } from './src/storage.js';
import { initStepsFeature } from './src/steps.js';
import { initCommsDrawer, toggleCommsDrawer, closeCommsDrawer } from './src/commsDrawer.js';
import {
  configureKT,
  initTable,
  ensurePossibleCausesUI,
  renderCauses
} from './src/kt.js';
import { generateSummary, setSummaryStateProvider } from './src/summary.js';
import { mountActionListCard } from './components/actions/ActionListCard.js';
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
  getSummaryState
} from './src/appState.js';
import { showToast } from './src/toast.js';

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
  initializeCommunications({ onSave: saveAppState, showToast });
  initStepsFeature({ onSave: saveAppState, onLog: logCommunication });

  setSummaryStateProvider(getSummaryState);

  const restored = restoreFromStorage();
  if (restored) {
    applyAppState(restored);
  }

  const { ops } = getPrefaceState();
  if (!ops.bridgeOpenedUtc) {
    setBridgeOpenedNow();
  }

  updatePrefaceTitles();
  startMirrorSync();

  wireSummaryEvents();
  wireCommsEvents();
  wireBridgeNowButton();
  wireKeyboardShortcuts();
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
 * Bind the bridge "Set to Now" button to update the bridge opened timestamp.
 * @returns {void}
 */
function wireBridgeNowButton() {
  const btn = $('#bridgeSetNowBtn');
  on(btn, 'click', setBridgeOpenedNow);
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
