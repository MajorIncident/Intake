import { saveToStorage, restoreFromStorage } from './src/storage.js';
import { initStepsFeature } from './src/steps.js';
import {
  configureKT,
  initTable,
  ensurePossibleCausesUI,
  renderCauses
} from './src/kt.js';
import { generateSummary, setSummaryStateProvider } from './src/summary.js';
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

function $(selector) {
  return document.querySelector(selector);
}

function on(element, event, handler) {
  if (element) {
    element.addEventListener(event, handler);
  }
}

function saveAppState() {
  try {
    const state = collectAppState();
    saveToStorage(state);
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

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

function wireSummaryEvents() {
  const summaryBtn = $('#genSummaryBtn');
  on(summaryBtn, 'click', () => generateSummary('summary', ''));

  const aiSummaryBtn = $('#generateAiSummaryBtn');
  on(aiSummaryBtn, 'click', () => generateSummary('summary', 'ai summary'));
}

function wireCommsEvents() {
  const { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios } = getCommunicationElements();
  on(internalBtn, 'click', () => logCommunication('internal'));
  on(externalBtn, 'click', () => logCommunication('external'));
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

function wireBridgeNowButton() {
  const btn = $('#bridgeSetNowBtn');
  on(btn, 'click', setBridgeOpenedNow);
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const key = (event.key || '').toLowerCase();
    switch (key) {
      case 's':
        event.preventDefault();
        generateSummary('summary', '');
        break;
      case 'i':
        event.preventDefault();
        logCommunication('internal');
        break;
      case 'e':
        event.preventDefault();
        logCommunication('external');
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

function exposeGlobals() {
  window.onGenerateSummary = () => generateSummary('summary', '');
  window.onGenerateAIPrompt = () => generateSummary('summary', 'prompt preamble');
  window.onGenerateAISummary = () => generateSummary('summary', 'ai summary');
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    boot();
    exposeGlobals();
  } catch (error) {
    console.error('Initialization failed:', error);
  }
});
