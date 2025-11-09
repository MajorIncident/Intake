/**
 * @module appState
 * @summary Coordinates collection, serialization, and rehydration of the intake application's state.
 * @description
 *   This module aggregates state from feature modules into a persisted snapshot and re-applies that
 *   snapshot to the DOM and supporting stores. It also exposes summary state for reporting and
 *   orchestrates the actions list refresh cycle.
 */

import {
  getPrefaceState,
  applyPrefaceState,
  getSummaryElements,
  getContainmentStatus,
  getObjectFull,
  getDeviationFull
} from './preface.js';
import {
  getCommunicationsState,
  applyCommunicationsState,
  getCommunicationElements
} from './comms.js';
import {
  getPossibleCauses,
  setPossibleCauses,
  ensurePossibleCausesUI,
  renderCauses,
  focusFirstEditableCause,
  updateCauseEvidencePreviews,
  exportKTTableState,
  importKTTableState,
  getRowsBuilt,
  buildHypothesisSentence,
  causeStatusLabel,
  causeHasFailure,
  getLikelyCauseId,
  setLikelyCauseId,
  countCauseAssumptions,
  evidencePairIndexes,
  countCompletedEvidence,
  getRowKeyByIndex,
  peekCauseFinding,
  findingMode,
  findingNote,
  fillTokens,
  getTableElement,
  getTableFocusMode,
  setTableFocusMode
} from './kt.js';
import {
  exportStepsState,
  importStepsState,
  getStepsItems,
  getStepsCounts
} from './steps.js';
import {
  listActions,
  exportActionsState,
  importActionsState
} from './actionsStore.js';
import { resolveActionsImport } from './appStateActions.js';
import {
  serializeCauses,
  deserializeCauses
} from './storage.js';
import { APP_STATE_VERSION } from './appStateVersion.js';
import { showToast } from './toast.js';
import { refreshActionList } from '../components/actions/ActionListCard.js';

const ANALYSIS_ID_KEY = 'kt-analysis-id';
let cachedAnalysisId = '';
const ACTIONS_UPDATED_EVENT = 'intake:actions-updated';

function ensureAnalysisId() {
  if (cachedAnalysisId) {
    return cachedAnalysisId;
  }
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(ANALYSIS_ID_KEY) : null;
  if (stored && typeof stored === 'string' && stored.trim()) {
    cachedAnalysisId = stored;
    return cachedAnalysisId;
  }
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `analysis-${crypto.randomUUID()}`
    : `analysis-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ANALYSIS_ID_KEY, generated);
  }
  cachedAnalysisId = generated;
  return cachedAnalysisId;
}

/**
 * Retrieve the cached analysis identifier, creating and persisting one if necessary.
 *
 * @returns {string} Stable identifier used for namespacing persisted intake data.
 */
export function getAnalysisId() {
  return ensureAnalysisId();
}

/**
 * Gather a snapshot of the current intake state across modules.
 *
 * @returns {import('./storage.js').SerializedAppState} Structured state payload including
 *   metadata and feature-specific values for persistence.
 */
export function collectAppState() {
  const { pre, impact, ops } = getPrefaceState();
  const commState = getCommunicationsState();
  const table = exportKTTableState();
  const tableFocusMode = getTableFocusMode();
  const causes = serializeCauses(getPossibleCauses());
  const likelyCauseId = getLikelyCauseId();
  const steps = exportStepsState();
  const analysisId = getAnalysisId();
  const rawActions = listActions(analysisId);
  const actionsList = Array.isArray(rawActions) ? rawActions : [];
  const actionsSnapshot = exportActionsState(analysisId);
  const serializedActions = actionsSnapshot.length
    ? actionsSnapshot
    : (actionsList.length ? actionsList.map(action => ({ ...action })) : []);
  return {
    meta: {
      version: APP_STATE_VERSION,
      savedAt: new Date().toISOString()
    },
    pre,
    impact,
    ops: { ...ops, ...commState, tableFocusMode },
    table,
    causes,
    likelyCauseId,
    steps,
    actions: {
      analysisId,
      items: serializedActions
    }
  };
}

/**
 * Rehydrate the intake experience using a previously serialized app state snapshot.
 *
 * @param {Partial<import('./storage.js').SerializedAppState>} [data={}] Persisted state payload to apply.
 * @returns {void}
 * @fires window#intake:actions-updated when actions state is reloaded.
 * @sideEffects Updates multiple DOM regions through feature modules, mutates local storage, and
 *   triggers toast refreshes via {@link refreshActionList}.
 */
export function applyAppState(data = {}) {
  if (!data || typeof data !== 'object') return;
  const {
    pre = {},
    impact = {},
    ops = {},
    table = [],
    causes = [],
    steps = null,
    likelyCauseId: savedLikelyCauseId = null,
    actions: savedActionsState = null
  } = data;
  const currentAnalysisId = getAnalysisId();
  const hasActionsSnapshot = Object.prototype.hasOwnProperty.call(data, 'actions');
  const actionsResolution = resolveActionsImport(hasActionsSnapshot, savedActionsState, currentAnalysisId);
  let targetAnalysisId = actionsResolution.analysisId || currentAnalysisId;
  if (targetAnalysisId && targetAnalysisId !== currentAnalysisId) {
    cachedAnalysisId = targetAnalysisId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ANALYSIS_ID_KEY, targetAnalysisId);
    }
  }
  const importedActions = actionsResolution.shouldImport
    ? importActionsState(targetAnalysisId, actionsResolution.items)
    : listActions(targetAnalysisId);
  const {
    commCadence = '',
    commLog = [],
    commNextDueIso = '',
    commNextUpdateTime = '',
    tableFocusMode: savedFocusMode = '',
    ...opsWithoutComms
  } = ops || {};

  applyPrefaceState({ pre, impact, ops: opsWithoutComms });
  applyCommunicationsState({ commCadence, commLog, commNextDueIso, commNextUpdateTime });

  if (Array.isArray(table) && table.length) {
    importKTTableState(table);
  }

  setTableFocusMode(savedFocusMode, { silent: true });

  if (Array.isArray(causes)) {
    setPossibleCauses(deserializeCauses(causes));
  } else {
    setPossibleCauses([]);
  }
  setLikelyCauseId(savedLikelyCauseId, { silent: true, skipRender: true });
  ensurePossibleCausesUI();
  renderCauses();
  const list = getPossibleCauses();
  if (list.some(cause => cause && cause.editing)) {
    focusFirstEditableCause();
  }
  updateCauseEvidencePreviews();

  if (steps) {
    importStepsState(steps);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(ACTIONS_UPDATED_EVENT, {
        detail: {
          analysisId: targetAnalysisId,
          total: Array.isArray(importedActions) ? importedActions.length : 0
        }
      }));
    } catch (error) {
      console.debug('[appState:actions-event]', error);
    }
  }
  try {
    refreshActionList();
  } catch (error) {
    console.debug('[appState:actions-refresh]', error);
  }
}

/**
 * Create a readonly bundle of helper references and values for summary generation.
 *
 * @returns {import('./summary.js').SummaryState} Collection of DOM references, formatter helpers,
 *   and data required by summary builders.
 */
export function getSummaryState() {
  const summaryElements = getSummaryElements();
  const commElements = getCommunicationElements();
  const commState = getCommunicationsState();
  return {
    ...summaryElements,
    getContainmentStatus,
    bridgeOpenedUtc: summaryElements.bridgeOpenedUtc,
    icName: summaryElements.icName,
    bcName: summaryElements.bcName,
    semOpsName: summaryElements.semOpsName,
    severity: summaryElements.severity,
    commNextUpdateTime: commElements.nextUpdateInput,
    commLog: commState.commLog,
    commNextDueIso: commState.commNextDueIso,
    stepsItems: getStepsItems(),
    getStepsCounts,
    possibleCauses: getPossibleCauses(),
    buildHypothesisSentence,
    causeStatusLabel,
    causeHasFailure,
    countCauseAssumptions,
    evidencePairIndexes,
    countCompletedEvidence,
    getRowKeyByIndex,
    rowsBuilt: getRowsBuilt(),
    peekCauseFinding,
    findingMode,
    findingNote,
    fillTokens,
    tbody: getTableElement(),
    likelyCauseId: getLikelyCauseId(),
    getObjectFull,
    getDeviationFull,
    showToast
  };
}

export { getLikelyCauseId };
export { APP_STATE_VERSION };
export { resolveActionsImport };
