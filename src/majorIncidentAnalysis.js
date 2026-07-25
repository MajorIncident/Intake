/**
 * @module majorIncidentAnalysis
 * @summary Owns the progressively disclosed Decision Analysis and Potential Problem Analysis cards.
 * @description Collects and applies the user-authored fields under the
 *   `decisionAnalysis` and `potentialProblemAnalysis` anchors. Potential-problem
 *   data deliberately reuses the canonical action owner, risk, change-control,
 *   and verification shapes normalized by `src/actionsStore.js`.
 */

import { normalizeActionSnapshot } from './actionsStore.js';

const DECISION_DEFAULTS = Object.freeze({
  decision: '',
  options: '',
  selectedOption: '',
  ownerRole: 'Application Owner',
  delegatedOwner: '',
  rationale: '',
  timestamp: ''
});

const FIELD_IDS = Object.freeze({
  decision: 'decisionToMake', options: 'decisionOptions', selectedOption: 'decisionSelectedOption',
  ownerRole: 'decisionOwnerRole', delegatedOwner: 'decisionDelegatedOwner',
  rationale: 'decisionRationale', timestamp: 'decisionTimestamp'
});

let saveCallback = null;

/** Return an input value without assuming the cards are mounted. @param {string} id - DOM id. @returns {string} Current value. */
function value(id) { return document.getElementById(id)?.value || ''; }

/** Set an input value when its card is mounted. @param {string} id - DOM id. @param {unknown} next - Candidate value. @returns {void} */
function setValue(id, next) {
  const element = document.getElementById(id);
  if (element) element.value = typeof next === 'string' ? next : '';
}

/** Normalize Potential Problem Analysis through the action store's canonical data contract. @param {unknown} source - Candidate state. @returns {object} Canonical risk state. */
export function normalizePotentialProblemAnalysis(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const fallback = {
    owner: { name: typeof raw?.owner?.name === 'string' ? raw.owner.name.trim() : '', category: '', subOwner: '', notes: '', lastAssignedBy: '', lastAssignedAt: '', source: 'Manual' },
    risk: {
      level: ['None', 'Low', 'Medium', 'High'].includes(raw?.risk?.level) ? raw.risk.level : 'None',
      impactIfFails: typeof raw?.risk?.impactIfFails === 'string' ? raw.risk.impactIfFails : '',
      prevent: typeof raw?.risk?.prevent === 'string' ? raw.risk.prevent : '',
      ifHappens: typeof raw?.risk?.ifHappens === 'string' ? raw.risk.ifHappens : ''
    },
    changeControl: { required: false, ...(raw.changeControl || {}) },
    verification: { required: false, ...(raw.verification || {}) }
  };
  let normalized = fallback;
  try {
    normalized = normalizeActionSnapshot({ owner: raw.owner, risk: raw.risk, changeControl: raw.changeControl, verification: raw.verification }) || fallback;
  } catch (error) {
    // Test harnesses may intentionally leave the shared store uninitialised; retain its documented shape.
    console.debug('[majorIncidentAnalysis:normalize]', error);
  }
  return {
    owner: normalized.owner || fallback.owner,
    risk: normalized.risk || fallback.risk,
    changeControl: normalized.changeControl || fallback.changeControl,
    verification: normalized.verification || fallback.verification
  };
}

/** Collect both Major Incident analysis cards. @returns {{decisionAnalysis: object, potentialProblemAnalysis: object}} Serializable workflow state. */
export function collectMajorIncidentAnalysisState() {
  const decisionAnalysis = Object.fromEntries(Object.entries(FIELD_IDS).map(([key, id]) => [key, value(id)]));
  if (!decisionAnalysis.ownerRole) decisionAnalysis.ownerRole = DECISION_DEFAULTS.ownerRole;
  return {
    decisionAnalysis,
    potentialProblemAnalysis: normalizePotentialProblemAnalysis({
      owner: { name: value('riskOwner') },
      risk: {
        level: value('potentialRiskLevel'),
        impactIfFails: value('potentialFailure'),
        prevent: value('preventiveControl'),
        ifHappens: value('rollbackContingency')
      },
      changeControl: { required: Boolean(value('rollbackContingency')), rollbackPlan: value('rollbackContingency') },
      verification: { required: Boolean(value('verificationCondition')), result: value('verificationCondition') }
    })
  };
}

/** Apply persisted card data to the mounted controls. @param {object} [state={}] - Saved workflow state. @returns {void} */
export function applyMajorIncidentAnalysisState(state = {}) {
  const decision = state?.decisionAnalysis && typeof state.decisionAnalysis === 'object' ? state.decisionAnalysis : {};
  Object.entries(FIELD_IDS).forEach(([key, id]) => setValue(id, decision[key] ?? DECISION_DEFAULTS[key]));
  const potential = normalizePotentialProblemAnalysis(state?.potentialProblemAnalysis);
  setValue('riskOwner', potential.owner.name);
  setValue('potentialRiskLevel', potential.risk.level);
  setValue('potentialFailure', potential.risk.impactIfFails);
  setValue('preventiveControl', potential.risk.prevent);
  setValue('rollbackContingency', potential.changeControl.rollbackPlan || potential.risk.ifHappens);
  setValue('verificationCondition', potential.verification.result);
}

/** Initialize autosave listeners for the two workflow cards. @param {{onSave?: Function}} [options={}] - Lifecycle callbacks. @returns {void} */
export function initMajorIncidentAnalysis({ onSave = null } = {}) {
  saveCallback = typeof onSave === 'function' ? onSave : null;
  document.querySelectorAll('#decisionAnalysisCard input, #decisionAnalysisCard textarea, #potentialProblemAnalysisCard input, #potentialProblemAnalysisCard textarea, #potentialProblemAnalysisCard select')
    .forEach(element => element.addEventListener('change', () => saveCallback?.()));
}
