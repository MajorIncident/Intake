import { CAUSE_FINDING_MODES, CAUSE_FINDING_MODE_VALUES } from './constants.js';
import { APP_STATE_VERSION } from './appStateVersion.js';

export const STORAGE_KEY = 'kt-intake-full-v2';

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

function generateCauseId() {
  return 'cause-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36);
}

function isValidFindingMode(mode) {
  return typeof mode === 'string' && CAUSE_FINDING_MODE_VALUES.includes(mode);
}

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

function findingMode(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const mode = typeof entry.mode === 'string' ? entry.mode : '';
  return isValidFindingMode(mode) ? mode : '';
}

function findingNote(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return typeof entry.note === 'string' ? entry.note : '';
}

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

function toString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

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

function normalizeContainmentStatus(value) {
  if (typeof value !== 'string') return '';
  if (CONTAINMENT_STATUS_VALUES.has(value)) {
    return value;
  }
  const legacy = LEGACY_CONTAINMENT_STATUS_MAP[value];
  return typeof legacy === 'string' ? legacy : '';
}

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

const MIGRATIONS = new Map([
  [0, migrateLegacyState]
]);

export const MIGRATION_REGISTRY = new Map(MIGRATIONS);

function normalizeAppStateStructure(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const preSource = incoming.pre && typeof incoming.pre === 'object' ? incoming.pre : {};
  const impactSource = incoming.impact && typeof incoming.impact === 'object' ? incoming.impact : {};
  const opsSource = incoming.ops && typeof incoming.ops === 'object' ? incoming.ops : {};

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

  const savedAt = typeof incoming?.meta?.savedAt === 'string'
    ? incoming.meta.savedAt
    : (typeof incoming.savedAt === 'string' ? incoming.savedAt : null);

  return {
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
    steps
  };
}

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
    return {
      id: typeof record.id === 'string' && record.id ? record.id : generateCauseId(),
      suspect: typeof record.suspect === 'string' ? record.suspect : '',
      accusation: typeof record.accusation === 'string' ? record.accusation : '',
      impact: typeof record.impact === 'string' ? record.impact : '',
      findings,
      editing: !!record.editing,
      testingOpen: !!record.testingOpen
    };
  });
}

export function deserializeCauses(serialized) {
  if (!Array.isArray(serialized)) return [];
  return serialized.map(raw => {
    const cause = {
      id: typeof raw?.id === 'string' ? raw.id : generateCauseId(),
      suspect: typeof raw?.suspect === 'string' ? raw.suspect : '',
      accusation: typeof raw?.accusation === 'string' ? raw.accusation : '',
      impact: typeof raw?.impact === 'string' ? raw.impact : '',
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

export function saveToStorage(state) {
  const payload = state && typeof state === 'object' ? state : {};
  const json = JSON.stringify(payload);
  localStorage.setItem(STORAGE_KEY, json);
}

export function restoreFromStorage() {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  const parsed = safeParse(json, null);
  if (!parsed || typeof parsed !== 'object') return null;
  return migrateAppState(parsed);
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
