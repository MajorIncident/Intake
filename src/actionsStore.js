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
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}
function saveAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
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
    owner: patch.owner || '',
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
    notes: ''
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
  const next = { ...curr, ...delta };

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
