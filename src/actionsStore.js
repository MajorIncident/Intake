const KEY = 'kt-actions-by-analysis-v1';

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
