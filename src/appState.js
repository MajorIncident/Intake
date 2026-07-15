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
import { applyThemePreference, getThemePreference, normalizeTheme } from './theme.js';
import { collectHandoverState, applyHandoverState } from './handover.js';
import { applyIntakeMode, getActiveIntakeMode } from './intakeModeController.js';
import { INTAKE_MODE_IDS } from './intakeModes.js';

const ANALYSIS_ID_KEY = 'kt-analysis-id';
let cachedAnalysisId = '';
const ACTIONS_UPDATED_EVENT = 'intake:actions-updated';

/**
 * Check whether a nested object owns a specific direct property path.
 *
 * @param {object} source - Object to inspect.
 * @param {string[]} path - Ordered property path to check.
 * @returns {boolean} Whether every path segment exists as an own property.
 */
function hasOwnPath(source, path) {
  let cursor = source;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

/**
 * Preserve Major Incident-only data when applying a partial non-MIM mode change.
 *
 * @param {Partial<import('./storage.js').SerializedAppState>} incoming - Incoming state payload.
 * @param {string} appliedMode - Normalized mode already applied to the UI.
 * @param {object} current - Current hidden field snapshots captured before hydration.
 * @param {object} current.ops - Current preface operations state.
 * @param {object} current.comms - Current communications state.
 * @param {object|null} current.steps - Current steps checklist state.
 * @param {object} current.handover - Current handover state.
 * @param {object} ops - Mutable operations payload being applied.
 * @param {object|null} steps - Candidate steps payload.
 * @param {object|null} handover - Candidate handover payload.
 * @returns {{ ops: object, steps: object|null, handover: object|null }} Payload with hidden fields preserved when absent.
 */
function preserveHiddenMajorIncidentState(incoming, appliedMode, current, ops, steps, handover) {
  const hasExplicitModeChange = hasOwnPath(incoming, ['meta', 'intakeMode']) || hasOwnPath(incoming, ['intakeMode']);
  if (appliedMode === INTAKE_MODE_IDS.MAJOR_INCIDENT && !hasExplicitModeChange) {
    return { ops, steps, handover };
  }

  const nextOps = { ...(ops || {}) };
  const opsDefaults = current?.ops || {};
  const commDefaults = current?.comms || {};
  [
    ['containStatus', opsDefaults.containStatus],
    ['containDesc', opsDefaults.containDesc],
    ['commCadence', commDefaults.commCadence],
    ['commLog', commDefaults.commLog],
    ['commNextDueIso', commDefaults.commNextDueIso],
    ['commNextUpdateTime', commDefaults.commNextUpdateTime]
  ].forEach(([key, value]) => {
    if (!hasOwnPath(incoming, ['ops', key]) && !hasOwnPath(incoming, [key])) {
      nextOps[key] = Array.isArray(value) ? value.map(entry => ({ ...entry })) : value;
    }
  });

  const nextSteps = hasOwnPath(incoming, ['steps']) || hasOwnPath(incoming, ['stepsState'])
    ? steps
    : current.steps;
  const nextHandover = hasOwnPath(incoming, ['handover'])
    ? handover
    : current.handover;

  return { ops: nextOps, steps: nextSteps, handover: nextHandover };
}

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
  const handover = collectHandoverState();
  return {
    meta: {
      version: APP_STATE_VERSION,
      savedAt: new Date().toISOString(),
      intakeMode: getActiveIntakeMode()
    },
    appearance: {
      theme: getThemePreference()
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
    },
    handover
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
    actions: savedActionsState = null,
    appearance: appearanceState = null,
    handover: savedHandoverState = null
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
  const currentHiddenState = {
    ops: getPrefaceState().ops,
    comms: getCommunicationsState(),
    steps: exportStepsState(),
    handover: collectHandoverState()
  };

  const appliedTheme = appearanceState && typeof appearanceState.theme === 'string'
    ? normalizeTheme(appearanceState.theme)
    : getThemePreference();
  applyThemePreference(appliedTheme);
  const appliedMode = applyIntakeMode(data?.meta?.intakeMode ?? data?.intakeMode, { silent: true });

  const preserved = preserveHiddenMajorIncidentState(
    data,
    appliedMode,
    currentHiddenState,
    ops,
    steps,
    savedHandoverState
  );
  const {
    commCadence = '',
    commLog = [],
    commNextDueIso = '',
    commNextUpdateTime = '',
    tableFocusMode: savedFocusMode = '',
    ...opsWithoutComms
  } = preserved.ops || {};

  applyPrefaceState({ pre, impact, ops: opsWithoutComms });
  applyCommunicationsState({ commCadence, commLog, commNextDueIso, commNextUpdateTime });

  const normalizedTable = Array.isArray(table) ? table : [];
  importKTTableState(normalizedTable);

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

  if (preserved.steps) {
    importStepsState(preserved.steps);
  }

  applyHandoverState(preserved.handover || {});

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
  const analysisId = getAnalysisId();
  const actions = listActions(analysisId);
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
    showToast,
    actions: Array.isArray(actions) ? actions : [],
    handover: collectHandoverState()
  };
}

/**
 * Clears the memoized analysis identifier so a subsequent lookup generates a new value.
 * @returns {void}
 */
export function resetAnalysisId() {
  cachedAnalysisId = '';
}

export { getLikelyCauseId };
export { APP_STATE_VERSION };
export { resolveActionsImport };
