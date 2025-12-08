/* eslint-disable jsdoc/require-jsdoc -- module metadata provided below */
/**
 * @module storage
 */

/**
 * Persistence helpers for the intake app state. This module owns the
 * serialization contract for `localStorage`, including versioned migrations via
 * {@link migrateAppState}. Key exports cover cause list serialization,
 * app-state migrations, and storage lifecycle helpers (`saveToStorage`,
 * `restoreFromStorage`, `clearStorage`).
 */

import { CAUSE_FINDING_MODES, CAUSE_FINDING_MODE_VALUES } from './constants.js';
import { APP_STATE_VERSION } from './appStateVersion.js';
import { normalizeActionSnapshot, ACTIONS_STORAGE_KEY } from './actionsStore.js';
import { STEPS_ITEMS_KEY, STEPS_DRAWER_KEY } from './steps.js';
import { COMMS_DRAWER_STORAGE_KEY } from './commsDrawer.js';
import { normalizeTheme } from './theme.js';
/* eslint-enable jsdoc/require-jsdoc */

/**
 * @typedef {object} CauseFinding
 * @property {string} mode - Normalized finding classification.
 * @property {string} note - Supporting note captured for the finding.
 */

/**
 * @typedef {object} CauseRecord
 * @property {string} id - Stable identifier used for UI reconciliation.
 * @property {string} suspect - Primary suspect description.
 * @property {string} accusation - Hypothesis about the cause mechanics.
 * @property {string} impact - Summary of the incident impact.
 * @property {Record<string, CauseFinding>} findings - Evidence grouped by finding key.
 * @property {string} summaryText - Cached hypothesis summary sentence.
 * @property {('low'|'medium'|'high'|'')} confidence - Optional confidence metadata.
 * @property {string} evidence - Optional supporting evidence snippet.
 * @property {boolean} editing - Whether the UI currently edits the record.
 * @property {boolean} testingOpen - Whether the testing drawer is expanded.
*/

/**
 * @typedef {object} SerializedAppState
 * @property {{version: number, savedAt: (string|null)}} meta - Persistence metadata.
 * @property {{theme: string}|undefined} [appearance] - Optional appearance preference.
 * @property {{oneLine: string, proof: string, objectPrefill: string, healthy: string, now: string}} pre
 *   - Preface inputs describing the incident summary.
 * @property {{now: string, future: string, time: string}} impact - Impact statements.
 * @property {{
 *   bridgeOpenedUtc: string,
 *   icName: string,
 *   bcName: string,
 *   semOpsName: string,
 *   severity: string,
 *   detectMonitoring: boolean,
 *   detectUserReport: boolean,
 *   detectAutomation: boolean,
 *   detectOther: boolean,
 *   evScreenshot: boolean,
 *   evLogs: boolean,
 *   evMetrics: boolean,
 *   evRepro: boolean,
 *   evOther: boolean,
 *   containStatus: string,
 *   containDesc: string,
 *   commCadence: string,
 *   commLog: Array<string|object>,
 *   commNextDueIso: string,
 *   commNextUpdateTime: string,
 *   tableFocusMode: string
 * }} ops - Operations and communication related details.
 * @property {Array<object>} table - Serialized KT table rows.
 * @property {Array<CauseRecord>} causes - Serialized causes list compatible with {@link serializeCauses}.
 * @property {(string|null)} likelyCauseId - Identifier for the selected likely cause.
 * @property {{items: Array<{id: string, label: string, checked: boolean}>, drawerOpen: boolean}} steps - Steps drawer state.
 * @property {{analysisId: string, items: import('./actionsStore.js').ActionRecord[]}|undefined} actions - Optional actions snapshot.
 * @property {Record<string, string>|undefined} handover - Optional handover notes keyed by section identifier.
 */

/**
 * Namespaced storage key that encapsulates the entire intake snapshot in
 * `localStorage`.
 * @type {string}
 */
export const STORAGE_KEY = 'kt-intake-full-v2';

const ANALYSIS_ID_STORAGE_KEY = 'kt-analysis-id';
const HANDOVER_SECTION_IDS = [
  'current-state',
  'what-changed',
  'remaining-risks',
  'must-watch-metrics',
  'whats-next'
];

/**
 * Safely parses JSON content while tolerating invalid inputs.
 * @param {string|number|boolean|null|undefined} json - Potential JSON string to parse.
 * @param {unknown} [fallback] - Value returned when parsing fails or input is empty.
 * @returns {unknown} Parsed JSON structure or the provided fallback.
 */
function safeParse(json, fallback = null) {
  if (typeof json !== 'string' || !json.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(json);
  } catch (_err) {
    return fallback;
  }
}

/**
 * Generates a semi-random identifier for persisted cause records.
 * @returns {string} Unique identifier suitable for use as a DOM key.
 */
function generateCauseId() {
  return 'cause-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

/**
 * Checks whether a finding mode matches a known enum value.
 * @param {unknown} mode - Candidate mode value to validate.
 * @returns {boolean} `true` when the mode is recognized.
 */
function isValidFindingMode(mode) {
  return typeof mode === 'string' && CAUSE_FINDING_MODE_VALUES.includes(mode);
}

/**
 * Coerces persisted finding entries into the `{mode, note}` format.
 * @param {unknown} entry - Raw finding entry possibly stored in legacy shapes.
 * @returns {CauseFinding} Normalized finding record.
 */
function normalizeFindingEntry(entry) {
  const normalized = { mode: '', note: '' };
  if (entry && typeof entry === 'object') {
    if (typeof entry.mode === 'string') {
      const mode = entry.mode.trim().toLowerCase();
      if (isValidFindingMode(mode)) {
        normalized.mode = mode;
      }
    }
    if (typeof entry.note === 'string') {
      normalized.note = entry.note;
    } else if (typeof entry.note === 'number') {
      normalized.note = String(entry.note);
    }
    const explainIs = typeof entry.explainIs === 'string' ? entry.explainIs.trim() : '';
    const explainNot = typeof entry.explainNot === 'string' ? entry.explainNot.trim() : '';
    if (!normalized.mode && (explainIs || explainNot)) {
      normalized.mode = CAUSE_FINDING_MODES.YES;
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    } else if (normalized.mode && !normalized.note && (explainIs || explainNot)) {
      normalized.note = [explainIs, explainNot].filter(Boolean).join('\n');
    }
  } else if (typeof entry === 'string') {
    normalized.mode = CAUSE_FINDING_MODES.YES;
    normalized.note = entry;
  }
  return normalized;
}

/**
 * Extracts a normalized finding mode from an entry.
 * @param {unknown} entry - Finding entry to inspect.
 * @returns {string} Valid finding mode or an empty string.
 */
function findingMode(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const mode = typeof entry.mode === 'string' ? entry.mode : '';
  return isValidFindingMode(mode) ? mode : '';
}

/**
 * Extracts the note associated with a finding entry.
 * @param {unknown} entry - Finding entry to inspect.
 * @returns {string} Finding note or an empty string.
 */
function findingNote(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return typeof entry.note === 'string' ? entry.note : '';
}

/**
 * Produces a deep-ish clone of persisted state objects, tolerating
 * environments without `structuredClone`.
 * @param {unknown} value - Arbitrary value to clone.
 * @returns {unknown} Cloned value suitable for mutation during migration.
 */
function cloneState(value) {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch (_error) {
      // fall back to JSON path
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    if (!value || typeof value !== 'object') {
      return value;
    }
    return { ...value };
  }
}

/**
 * Converts a persisted value to a string, trimming unsupported types.
 * @param {unknown} value - Value requiring normalization.
 * @returns {string} Normalized string representation.
 */
function toString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/**
 * Normalizes a persisted actions snapshot into the canonical structure.
 * @param {unknown} raw - Raw actions payload read from storage.
 * @param {boolean} hasField - Whether the original snapshot declared the field.
 * @returns {{analysisId: string, items: import('./actionsStore.js').ActionRecord[]}|null} Normalized actions state or null.
 */
function normalizeActionsState(raw, hasField) {
  if (!hasField) {
    return null;
  }
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : {};
  const candidateId = typeof source.analysisId === 'string' ? source.analysisId.trim() : '';
  const itemsSource = Array.isArray(source.items) ? source.items : [];
  const normalizedItems = itemsSource.map(item => {
    const normalized = normalizeActionSnapshot(item);
    const actionAnalysisId = typeof normalized.analysisId === 'string' ? normalized.analysisId.trim() : '';
    return {
      ...normalized,
      analysisId: actionAnalysisId
    };
  });
  const resolvedAnalysisId = [candidateId, ...normalizedItems.map(item => item.analysisId).filter(Boolean)][0] || '';
  const items = normalizedItems.map(item => ({
    ...item,
    analysisId: resolvedAnalysisId
  }));
  return {
    analysisId: resolvedAnalysisId,
    items
  };
}

/**
 * Normalizes persisted truthy flags into booleans.
 * @param {unknown} value - Value requiring boolean coercion.
 * @returns {boolean} Coerced boolean value.
 */
function toBoolean(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return !!value;
}

const LEGACY_CONTAINMENT_STATUS_MAP = {
  none: 'assessing',
  mitigation: 'stabilized',
  restore: 'restoring'
};

const CONTAINMENT_STATUS_VALUES = new Set([
  'assessing',
  'stoppingImpact',
  'stabilized',
  'fixInProgress',
  'restoring',
  'monitoring',
  'closed'
]);

/**
 * Harmonizes containment status strings against current enums.
 * @param {unknown} value - Candidate containment status value.
 * @returns {string} Recognized containment status or an empty string.
 */
function normalizeContainmentStatus(value) {
  if (typeof value !== 'string') return '';
  if (CONTAINMENT_STATUS_VALUES.has(value)) {
    return value;
  }
  const legacy = LEGACY_CONTAINMENT_STATUS_MAP[value];
  return typeof legacy === 'string' ? legacy : '';
}

/**
 * Normalizes communication log entries into strings or cloned objects.
 * @param {unknown} entries - Persisted communications list.
 * @returns {Array<string|object>} Sanitized communication log entries.
 */
function normalizeCommLog(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(entry => {
      if (typeof entry === 'string' || typeof entry === 'number') {
        return String(entry);
      }
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      return { ...entry };
    })
    .filter(entry => entry !== null);
}

/**
 * Normalizes raw step drawer persistence into the expected shape consumed by the
 * steps module. Handles legacy array formats and coerces booleans.
 * @param {unknown} rawSteps - Serialized steps payload coming from storage or legacy formats.
 * @returns {{items: Array<{id: string, label: string, checked: boolean}>, drawerOpen: boolean}}
 * Normalized steps state compatible with current UI expectations.
 */
function normalizeStepsState(rawSteps) {
  if (!rawSteps) {
    return { items: [], drawerOpen: false };
  }
  let source = rawSteps;
  if (Array.isArray(source)) {
    source = { items: source };
  }
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const itemsCandidate = Array.isArray(source.items)
      ? source.items
      : (Array.isArray(source.steps) ? source.steps : []);
    const items = itemsCandidate
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const rawId = item.id !== undefined ? item.id : (item.stepId !== undefined ? item.stepId : null);
        const id = rawId !== null && rawId !== undefined ? String(rawId) : '';
        if (!id) {
          return null;
        }
        const label = typeof item.label === 'string'
          ? item.label
          : (typeof item.title === 'string' ? item.title : '');
        const checked = toBoolean(item.checked);
        return { id, label, checked };
      })
      .filter(Boolean);
    const drawerOpen = typeof source.drawerOpen === 'boolean'
      ? source.drawerOpen
      : (typeof source.open === 'boolean' ? source.open : toBoolean(source.drawer));
    return {
      items,
      drawerOpen: !!drawerOpen
    };
  }
  return { items: [], drawerOpen: false };
}

/**
 * Extracts the persisted schema version from a raw state object.
 * @param {unknown} raw - Candidate state object with optional metadata.
 * @returns {number} Discovered version number, defaulting to `0`.
 */
function resolveVersion(raw) {
  const version = raw?.meta?.version;
  if (typeof version === 'number' && Number.isFinite(version)) {
    return version;
  }
  if (typeof version === 'string') {
    const parsed = parseInt(version, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Migration routine for the pre-v1 schema where communication fields lived at
 * the root level and containment values used legacy naming. Upgrades the shape
 * to match version 1 expectations so later migrations can build on it.
 * @param {unknown} raw - Legacy state object.
 * @returns {object} Cloned state upgraded to version 1.
 */
function migrateLegacyState(raw) {
  const state = cloneState(raw) || {};
  const ops = state && typeof state.ops === 'object' ? { ...state.ops } : {};

  if (state && typeof state === 'object') {
    ['commCadence', 'commNextDueIso', 'commNextUpdateTime', 'tableFocusMode'].forEach(key => {
      if (state[key] !== undefined && ops[key] === undefined) {
        ops[key] = state[key];
      }
      if (state[key] !== undefined) {
        delete state[key];
      }
    });
    if (Array.isArray(state.commLog) && !Array.isArray(ops.commLog)) {
      ops.commLog = state.commLog;
    }
    delete state.commLog;

    if (Array.isArray(state.possibleCauses) && !Array.isArray(state.causes)) {
      state.causes = state.possibleCauses;
    }

    if (typeof ops.containmentStatus === 'string' && !ops.containStatus) {
      ops.containStatus = ops.containmentStatus;
    }
    if (typeof ops.containment === 'string' && !ops.containStatus) {
      ops.containStatus = ops.containment;
    }
    delete ops.containmentStatus;
    delete ops.containment;

    state.ops = ops;
    state.meta = { ...(state.meta || {}), version: 1 };
  }

  return state;
}

/**
 * Ordered map of migration handlers. Keys represent the version found in
 * persisted payloads, and values are invoked until {@link APP_STATE_VERSION}
 * is reached. Additional migrations should be appended with incrementing keys
 * to preserve replay order.
 */
const MIGRATIONS = new Map([
  [0, migrateLegacyState]
]);

/**
 * Registry of state migrations keyed by their originating version. The registry
 * intentionally mirrors the stored `meta.version` values so that
 * {@link migrateAppState} can iterate them sequentially until it reaches the
 * latest {@link APP_STATE_VERSION}.
 */
export const MIGRATION_REGISTRY = new Map(MIGRATIONS);

/**
 * Coerces partially populated or legacy state objects into the canonical
 * {@link SerializedAppState} structure used across the application.
 * @param {unknown} raw - Candidate state object after running migrations.
 * @returns {SerializedAppState} Normalized application state structure.
 */
function normalizeAppStateStructure(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const preSource = incoming.pre && typeof incoming.pre === 'object' ? incoming.pre : {};
  const impactSource = incoming.impact && typeof incoming.impact === 'object' ? incoming.impact : {};
  const opsSource = incoming.ops && typeof incoming.ops === 'object' ? incoming.ops : {};
  const hasActionsField = Object.prototype.hasOwnProperty.call(incoming, 'actions');

  const pre = {
    oneLine: toString(preSource.oneLine ?? incoming.oneLine),
    proof: toString(preSource.proof ?? incoming.proof),
    objectPrefill: toString(preSource.objectPrefill ?? incoming.objectPrefill),
    healthy: toString(preSource.healthy ?? incoming.healthy),
    now: toString(preSource.now ?? incoming.now)
  };

  const impact = {
    now: toString(impactSource.now ?? incoming.impactNow),
    future: toString(impactSource.future ?? incoming.impactFuture),
    time: toString(impactSource.time ?? incoming.impactTime)
  };

  const containStatusCandidate = opsSource.containStatus
    ?? opsSource.containmentStatus
    ?? incoming.containStatus
    ?? incoming.containmentStatus;

  const containDescCandidate = opsSource.containDesc
    ?? incoming.containDesc;

  const ops = {
    bridgeOpenedUtc: toString(opsSource.bridgeOpenedUtc ?? incoming.bridgeOpenedUtc),
    icName: toString(opsSource.icName ?? incoming.icName),
    bcName: toString(opsSource.bcName ?? incoming.bcName),
    semOpsName: toString(opsSource.semOpsName ?? incoming.semOpsName),
    severity: toString(opsSource.severity ?? incoming.severity),
    detectMonitoring: toBoolean(opsSource.detectMonitoring ?? incoming.detectMonitoring),
    detectUserReport: toBoolean(opsSource.detectUserReport ?? incoming.detectUserReport),
    detectAutomation: toBoolean(opsSource.detectAutomation ?? incoming.detectAutomation),
    detectOther: toBoolean(opsSource.detectOther ?? incoming.detectOther),
    evScreenshot: toBoolean(opsSource.evScreenshot ?? incoming.evScreenshot),
    evLogs: toBoolean(opsSource.evLogs ?? incoming.evLogs),
    evMetrics: toBoolean(opsSource.evMetrics ?? incoming.evMetrics),
    evRepro: toBoolean(opsSource.evRepro ?? incoming.evRepro),
    evOther: toBoolean(opsSource.evOther ?? incoming.evOther),
    containStatus: normalizeContainmentStatus(containStatusCandidate),
    containDesc: toString(containDescCandidate),
    commCadence: toString(opsSource.commCadence ?? incoming.commCadence),
    commLog: normalizeCommLog(opsSource.commLog ?? incoming.commLog),
    commNextDueIso: toString(opsSource.commNextDueIso ?? incoming.commNextDueIso),
    commNextUpdateTime: toString(opsSource.commNextUpdateTime ?? incoming.commNextUpdateTime),
    tableFocusMode: toString(opsSource.tableFocusMode ?? incoming.tableFocusMode)
  };

  const table = Array.isArray(incoming.table)
    ? incoming.table
    : (Array.isArray(incoming.ktTable) ? incoming.ktTable : []);

  const causesSource = Array.isArray(incoming.causes)
    ? incoming.causes
    : (Array.isArray(incoming.possibleCauses) ? incoming.possibleCauses : []);
  const causes = serializeCauses(deserializeCauses(causesSource));

  const likelyCauseIdRaw = incoming.likelyCauseId ?? incoming.likelyCause ?? null;
  const likelyCauseId = typeof likelyCauseIdRaw === 'string'
    ? likelyCauseIdRaw
    : (likelyCauseIdRaw && typeof likelyCauseIdRaw === 'number' ? String(likelyCauseIdRaw) : null);

  const steps = normalizeStepsState(incoming.steps ?? incoming.stepsState);

  const appearanceTheme = typeof incoming?.appearance?.theme === 'string'
    ? normalizeTheme(incoming.appearance.theme)
    : 'light';

  const savedAt = typeof incoming?.meta?.savedAt === 'string'
    ? incoming.meta.savedAt
    : (typeof incoming.savedAt === 'string' ? incoming.savedAt : null);

  const normalized = {
    meta: {
      version: APP_STATE_VERSION,
      savedAt
    },
    pre,
    impact,
    ops,
    table,
    causes,
    likelyCauseId,
    steps,
    appearance: { theme: appearanceTheme }
  };

  const handoverSource = incoming && typeof incoming.handover === 'object' && !Array.isArray(incoming.handover)
    ? incoming.handover
    : {};
  const handoverBase = HANDOVER_SECTION_IDS.reduce((acc, sectionId) => {
    acc[sectionId] = '';
    return acc;
  }, {});
  const handover = Object.entries(handoverSource).reduce((acc, [key, value]) => {
    if (typeof key !== 'string') {
      return acc;
    }
    acc[key] = typeof value === 'string' ? value : '';
    return acc;
  }, handoverBase);
  normalized.handover = handover;

  const actions = normalizeActionsState(incoming.actions, hasActionsField);
  if (actions) {
    normalized.actions = actions;
  }

  return normalized;
}

/**
 * Migrates a persisted app state object to the latest schema and enforces the
 * normalized shape expected by the UI.
 * @param {unknown} raw - Raw state object read from storage.
 * @returns {SerializedAppState|null} Normalized state when migration succeeds,
 * otherwise `null` for unprocessable data.
 */
export function migrateAppState(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  let state = cloneState(raw);
  if (!state || typeof state !== 'object') {
    return null;
  }
  let version = resolveVersion(state);
  const visited = new Set();
  while (version < APP_STATE_VERSION) {
    if (visited.has(version)) {
      break;
    }
    visited.add(version);
    const migrate = MIGRATIONS.get(version);
    if (typeof migrate !== 'function') {
      break;
    }
    state = migrate(state);
    version = resolveVersion(state);
  }
  return normalizeAppStateStructure(state);
}

/**
 * Serializes a list of cause records before persisting them. Ensures IDs are
 * present, normalizes finding entries, and strips empty findings to keep the
 * payload compact.
 * @param {Array<CauseRecord>} causes - In-memory cause records collected from the UI.
 * @returns {Array<CauseRecord>} Serialized cause payload suitable for storage.
 */
export function serializeCauses(causes) {
  if (!Array.isArray(causes)) return [];
  return causes.map(cause => {
    const record = cause && typeof cause === 'object' ? cause : {};
    const findings = {};
    if (record.findings && typeof record.findings === 'object') {
      Object.keys(record.findings).forEach(key => {
        const normalized = normalizeFindingEntry(record.findings[key]);
        const mode = findingMode(normalized);
        const note = findingNote(normalized);
        if (mode || note.trim()) {
          findings[key] = { mode, note };
          record.findings[key] = normalized;
        } else {
          delete record.findings[key];
        }
      });
    }
    const confidenceRaw = typeof record.confidence === 'string' ? record.confidence.trim().toLowerCase() : '';
    const normalizedConfidence = ['low', 'medium', 'high'].includes(confidenceRaw) ? confidenceRaw : '';
    return {
      id: typeof record.id === 'string' && record.id ? record.id : generateCauseId(),
      suspect: typeof record.suspect === 'string' ? record.suspect : '',
      accusation: typeof record.accusation === 'string' ? record.accusation : '',
      impact: typeof record.impact === 'string' ? record.impact : '',
      summaryText: typeof record.summaryText === 'string' ? record.summaryText : '',
      confidence: normalizedConfidence,
      evidence: typeof record.evidence === 'string' ? record.evidence : '',
      findings,
      editing: !!record.editing,
      testingOpen: !!record.testingOpen
    };
  });
}

/**
 * Hydrates serialized cause payloads into editable records for the UI. Missing
 * identifiers are regenerated for safety, while findings are normalized for
 * downstream form rendering.
 * @param {Array<CauseRecord>} serialized - Causes retrieved from storage.
 * @returns {Array<CauseRecord>} Normalized cause records for application use.
 */
export function deserializeCauses(serialized) {
  if (!Array.isArray(serialized)) return [];
  return serialized.map(raw => {
    const confidenceRaw = typeof raw?.confidence === 'string' ? raw.confidence.trim().toLowerCase() : '';
    const normalizedConfidence = ['low', 'medium', 'high'].includes(confidenceRaw) ? confidenceRaw : '';
    const cause = {
      id: typeof raw?.id === 'string' ? raw.id : generateCauseId(),
      suspect: typeof raw?.suspect === 'string' ? raw.suspect : '',
      accusation: typeof raw?.accusation === 'string' ? raw.accusation : '',
      impact: typeof raw?.impact === 'string' ? raw.impact : '',
      summaryText: typeof raw?.summaryText === 'string' ? raw.summaryText : '',
      confidence: normalizedConfidence,
      evidence: typeof raw?.evidence === 'string' ? raw.evidence : '',
      findings: {},
      editing: !!raw?.editing,
      testingOpen: !!raw?.testingOpen
    };
    if (raw && raw.findings && typeof raw.findings === 'object') {
      Object.keys(raw.findings).forEach(key => {
        const normalized = normalizeFindingEntry(raw.findings[key]);
        const mode = findingMode(normalized);
        const note = findingNote(normalized);
        if (mode || note.trim()) {
          cause.findings[key] = normalized;
        }
      });
    }
    return cause;
  });
}

/**
 * Writes the provided app state payload to `localStorage` under
 * {@link STORAGE_KEY}. The payload is assumed to already be normalized.
 * @param {SerializedAppState} state - Normalized application state to persist.
 * @returns {void}
 */
export function saveToStorage(state) {
  const payload = state && typeof state === 'object' ? state : {};
  const json = JSON.stringify(payload);
  localStorage.setItem(STORAGE_KEY, json);
}

/**
 * Reads the persisted app state from `localStorage`, applying migrations and
 * normalization as needed.
 * @returns {SerializedAppState|null} Normalized state when found, otherwise
 * `null` when storage is empty or invalid.
 */
export function restoreFromStorage() {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  const parsed = safeParse(json, null);
  if (!parsed || typeof parsed !== 'object') return null;
  return migrateAppState(parsed);
}

/**
 * Removes the persisted app state entry from `localStorage`, effectively
 * resetting the intake experience for the next session.
 * @returns {void}
 */
export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Removes all persisted intake storage segments, including feature-specific caches.
 * @returns {void}
 */
export function clearAllIntakeStorage() {
  clearStorage();
  const keys = [
    STEPS_ITEMS_KEY,
    STEPS_DRAWER_KEY,
    COMMS_DRAWER_STORAGE_KEY,
    ANALYSIS_ID_STORAGE_KEY,
    ACTIONS_STORAGE_KEY
  ];
  keys.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.debug('[storage:clear]', key, error);
    }
  });
}
