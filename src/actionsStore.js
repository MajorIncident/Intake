const KEY = 'kt-actions-by-analysis-v1';
const STATUS_ORDER = {
  Blocked: 0,
  'In-Progress': 1,
  Planned: 2,
  Deferred: 3,
  Done: 4,
  Cancelled: 5,
};

const PRIORITY_ORDER = {
  Blocked: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  Deferred: 4,
  Cancelled: 5,
};

const OWNER_SOURCES = new Set(['Manual', 'DirectoryLookup', 'API']);

const OWNER_TEMPLATE = Object.freeze({
  name: '',
  category: '',
  subOwner: '',
  notes: '',
  lastAssignedBy: '',
  lastAssignedAt: '',
  source: 'Manual'
});

function normalizeOwner(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const owner = { ...OWNER_TEMPLATE };
    if (typeof raw.name === 'string') {
      owner.name = raw.name.trim();
    }
    if (typeof raw.category === 'string') {
      owner.category = raw.category.trim();
    }
    if (typeof raw.subOwner === 'string') {
      owner.subOwner = raw.subOwner.trim();
    }
    if (typeof raw.notes === 'string') {
      owner.notes = raw.notes.slice(0, 280);
    }
    if (typeof raw.lastAssignedBy === 'string') {
      owner.lastAssignedBy = raw.lastAssignedBy.trim();
    }
    if (typeof raw.lastAssignedAt === 'string') {
      const trimmed = raw.lastAssignedAt.trim();
      if (trimmed && !Number.isNaN(new Date(trimmed).getTime())) {
        owner.lastAssignedAt = trimmed;
      }
    }
    if (typeof raw.source === 'string') {
      const src = raw.source.trim();
      owner.source = OWNER_SOURCES.has(src) ? src : 'Manual';
    }
    return owner;
  }
  if (typeof raw === 'string') {
    return { ...OWNER_TEMPLATE, name: raw.trim() };
  }
  return { ...OWNER_TEMPLATE };
}

function cloneOwner(owner) {
  return normalizeOwner(owner);
}

function ownerEquals(a, b) {
  const left = normalizeOwner(a);
  const right = normalizeOwner(b);
  return left.name === right.name
    && left.category === right.category
    && left.subOwner === right.subOwner
    && left.notes === right.notes
    && left.lastAssignedBy === right.lastAssignedBy
    && left.lastAssignedAt === right.lastAssignedAt
    && left.source === right.source;
}

function normalizeActionRecord(action) {
  if (!action || typeof action !== 'object') {
    return { owner: normalizeOwner(null), auditTrail: [] };
  }
  const base = { ...action };
  base.owner = normalizeOwner(action.owner);
  base.auditTrail = Array.isArray(action.auditTrail)
    ? action.auditTrail.map(entry => ({ ...entry }))
    : [];
  return base;
}

function migrateAll(map) {
  if (!map || typeof map !== 'object') return {};
  const migrated = {};
  Object.keys(map).forEach(key => {
    const list = Array.isArray(map[key]) ? map[key] : [];
    migrated[key] = list.map(item => normalizeActionRecord(item));
  });
  return migrated;
}

function getStatusRank(status) {
  const rank = STATUS_ORDER[status];
  return typeof rank === 'number' ? rank : Number.POSITIVE_INFINITY;
}

function getPriorityRank(priority) {
  const rank = PRIORITY_ORDER[priority];
  return typeof rank === 'number' ? rank : Number.POSITIVE_INFINITY;
}

function getDueTime(dueAt) {
  if (!dueAt) return Number.POSITIVE_INFINITY;
  const parsed = new Date(dueAt).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function loadAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    return migrateAll(raw);
  }
  catch {
    return {};
  }
}

function saveAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

/**
 * Snapshot persisted via the app state helpers.
 * @typedef {{ analysisId: string, items: object[] }} PersistedActionsState
 */

export function exportActionsState(analysisId) {
  if (typeof analysisId !== 'string' || !analysisId.trim()) {
    return [];
  }
  const id = analysisId.trim();
  const all = loadAll();
  const list = Array.isArray(all[id]) ? all[id] : [];
  return list.map(item => ({ ...normalizeActionRecord(item), analysisId: id }));
}

export function importActionsState(analysisId, actions) {
  if (typeof analysisId !== 'string' || !analysisId.trim()) {
    return [];
  }
  const id = analysisId.trim();
  const all = loadAll();
  const nextList = Array.isArray(actions)
    ? actions.map(item => ({ ...normalizeActionRecord(item), analysisId: id }))
    : [];
  all[id] = nextList;
  saveAll(all);
  return nextList;
}

export function listActions(analysisId) {
  const all = loadAll();
  return all[analysisId] || [];
}

export function createAction(analysisId, patch) {
  const all = loadAll();
  const now = new Date().toISOString();
  const generatedId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const item = {
    id: generatedId,
    analysisId,
    createdAt: now,
    createdBy: 'local',
    summary: (patch.summary || '').trim(),
    detail: patch.detail || '',
    owner: normalizeOwner(patch.owner),
    role: patch.role || '',
    status: 'Planned',
    priority: patch.priority || 'P2',
    dueAt: patch.dueAt || '',
    startedAt: '',
    completedAt: '',
    dependencies: [],
    risk: patch.risk || 'None',
    changeControl: { required: false, ...(patch.changeControl || {}) },
    verification: { required: false, ...(patch.verification || {}) },
    links: patch.links || {},
    notes: '',
    auditTrail: []
  };
  if (!item.summary) return null;
  const list = all[analysisId] ? [item, ...all[analysisId]] : [item];
  all[analysisId] = list;
  saveAll(all);
  return item;
}

export function patchAction(analysisId, actionId, delta) {
  const all = loadAll();
  const list = all[analysisId] || [];
  const i = list.findIndex(a => a.id === actionId);
  if (i < 0) return null;
  const curr = list[i];
  const sanitizedDelta = { ...(delta || {}) };
  delete sanitizedDelta.owner;
  delete sanitizedDelta.auditTrail;

  const baseOwner = normalizeOwner(curr.owner);
  const baseAuditTrail = Array.isArray(curr.auditTrail) ? [...curr.auditTrail] : [];

  const next = { ...curr, ...sanitizedDelta };
  next.owner = baseOwner;
  next.auditTrail = baseAuditTrail;

  if (Object.prototype.hasOwnProperty.call(delta || {}, 'owner')) {
    const deltaOwnerRaw = delta.owner;
    const mergedSource = (deltaOwnerRaw && typeof deltaOwnerRaw === 'object' && !Array.isArray(deltaOwnerRaw))
      ? { ...baseOwner, ...deltaOwnerRaw }
      : deltaOwnerRaw;
    const incomingOwner = normalizeOwner(mergedSource);
    const changed = !ownerEquals(baseOwner, incomingOwner);
    if (changed) {
      const auditEntry = {
        type: 'ownerChanged',
        at: incomingOwner.lastAssignedAt || new Date().toISOString(),
        by: incomingOwner.lastAssignedBy || 'local',
        before: cloneOwner(baseOwner),
        after: cloneOwner(incomingOwner)
      };
      next.owner = incomingOwner;
      next.auditTrail = [...baseAuditTrail, auditEntry];
    }
  }

  // Guardrails mirroring your M3 rules
  if (delta.status === 'In-Progress') {
    const needRollback = next.risk === 'High' || next.changeControl?.required;
    if (needRollback && !next.changeControl?.rollbackPlan) {
      return { __error: 'Rollback plan required before starting.' };
    }
    if (!next.startedAt) next.startedAt = new Date().toISOString();
  }
  if (delta.status === 'Done') {
    if (next.verification?.required && !next.verification?.result) {
      return { __error: 'Record verification result before marking Done.' };
    }
    if (!next.completedAt) next.completedAt = new Date().toISOString();
  }

  list[i] = next;
  all[analysisId] = list;
  saveAll(all);
  return next;
}

export function removeAction(analysisId, actionId) {
  const all = loadAll();
  const list = all[analysisId] || [];
  all[analysisId] = list.filter(a => a.id !== actionId);
  saveAll(all);
}

export function sortActions(analysisId) {
  const all = loadAll();
  const list = all[analysisId] || [];
  if (list.length <= 1) return list;

  const sorted = [...list].sort((a, b) => {
    const statusDiff = getStatusRank(a.status) - getStatusRank(b.status);
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const etaDiff = getDueTime(a.dueAt) - getDueTime(b.dueAt);
    if (etaDiff !== 0) return etaDiff;

    const aCreated = a.createdAt || '';
    const bCreated = b.createdAt || '';
    if (aCreated === bCreated) return 0;
    return aCreated < bCreated ? -1 : 1;
  });

  const hasChanged = sorted.some((item, index) => item.id !== list[index]?.id);
  if (!hasChanged) return list;

  all[analysisId] = sorted;
  saveAll(all);
  return sorted;
}
