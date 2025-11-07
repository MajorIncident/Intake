import { CAUSE_FINDING_MODES, CAUSE_FINDING_MODE_VALUES } from './constants.js';

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
  return parsed;
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
