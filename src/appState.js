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
  serializeCauses,
  deserializeCauses
} from './storage.js';
import { showToast } from './toast.js';

export function collectAppState() {
  const { pre, impact, ops } = getPrefaceState();
  const commState = getCommunicationsState();
  const table = exportKTTableState();
  const tableFocusMode = getTableFocusMode();
  const causes = serializeCauses(getPossibleCauses());
  const steps = exportStepsState();
  return {
    pre,
    impact,
    ops: { ...ops, ...commState, tableFocusMode },
    table,
    causes,
    steps
  };
}

export function applyAppState(data = {}) {
  if (!data || typeof data !== 'object') return;
  const { pre = {}, impact = {}, ops = {}, table = [], causes = [], steps = null } = data;
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
}

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
    getObjectFull,
    getDeviationFull,
    showToast
  };
}
