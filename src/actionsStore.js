/* eslint-disable jsdoc/require-jsdoc -- Module overview documented below. */
/**
 * Handles persistence of remediation actions in localStorage under the
 * `kt-actions-by-analysis-v1` key. This module normalizes owner metadata,
 * enforces audit trail constraints, and exposes CRUD helpers consumed by the
 * intake workflow and storage export/import routines.
 */

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

/**
 * @typedef {'Manual' | 'DirectoryLookup' | 'API'} ActionOwnerSource
 */

/**
 * @typedef {object} ActionOwner
 * @property {string} name - Display name of the owner.
 * @property {string} category - Owner classification used for filtering.
 * @property {string} subOwner - Optional secondary owner label.
 * @property {string} notes - Free-form notes about the owner.
 * @property {string} lastAssignedBy - Actor who most recently reassigned the owner.
 * @property {string} lastAssignedAt - ISO timestamp of the latest assignment.
 * @property {ActionOwnerSource} source - Provenance of the owner information.
 */

/**
 * @typedef {object} ActionAuditEntry
 * @property {'ownerChanged'} type - Audit entry discriminator.
 * @property {string} at - ISO timestamp when the entry was recorded.
 * @property {string} by - Actor responsible for the change.
 * @property {ActionOwner} before - Snapshot of the previous owner.
 * @property {ActionOwner} after - Snapshot of the new owner.
 */

/**
 * @typedef {object} ActionRecord
 * @property {string} id - Unique identifier for the action.
 * @property {string} analysisId - Identifier of the associated analysis.
 * @property {string} createdAt - ISO timestamp when the action was created.
 * @property {string} createdBy - Actor that created the action.
 * @property {string} summary - Short description of the remediation work.
 * @property {string} detail - Long-form details about the remediation work.
 * @property {ActionOwner} owner - Current owner metadata.
 * @property {string} role - Role of the assigned owner.
 * @property {string} status - Lifecycle status (e.g., Planned, Done).
 * @property {string} priority - Priority bucket (e.g., P1, P2).
 * @property {string} dueAt - ISO timestamp representing the due date.
 * @property {string} startedAt - ISO timestamp when work began.
 * @property {string} completedAt - ISO timestamp when work completed.
 * @property {string[]} dependencies - Related action identifiers.
 * @property {string} risk - Risk rating tied to the action.
 * @property {{ required: boolean, rollbackPlan?: string }} changeControl - Change control metadata.
 * @property {{ required: boolean, result?: string }} verification - Verification metadata.
 * @property {Record<string, string>} links - External references keyed by label.
 * @property {string} notes - Internal implementation notes.
 * @property {ActionAuditEntry[]} auditTrail - Change log for owner transitions.
 */

/**
 * @typedef {Partial<Omit<ActionRecord, 'analysisId' | 'id' | 'createdAt' | 'createdBy' | 'auditTrail'>> & {
 *   owner?: Partial<ActionOwner> | string,
 *   auditTrail?: ActionAuditEntry[],
 *   changeControl?: Partial<ActionRecord['changeControl']>,
 *   verification?: Partial<ActionRecord['verification']>
 * }} ActionPatch
 */

/**
 * @typedef {Record<string, ActionRecord[]>} ActionsMap
 */

const OWNER_TEMPLATE = Object.freeze({
  name: '',
  category: '',
  subOwner: '',
  notes: '',
  lastAssignedBy: '',
  lastAssignedAt: '',
  source: 'Manual'
});

const ACTION_TEMPLATE = Object.freeze({
  id: '',
  analysisId: '',
  createdAt: '',
  createdBy: '',
  summary: '',
  detail: '',
  owner: OWNER_TEMPLATE,
  role: '',
  status: 'Planned',
  priority: 'P2',
  dueAt: '',
  startedAt: '',
  completedAt: '',
  dependencies: [],
  risk: 'None',
  changeControl: { required: false },
  verification: { required: false },
  links: {},
  notes: '',
  auditTrail: []
});

/**
 * Normalizes arbitrary owner data into the canonical owner shape.
 * @param {unknown} raw - Raw owner input captured from the UI or persisted data.
 * @returns {ActionOwner} - Normalized owner payload ready for persistence.
 */
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

/**
 * Creates a normalized clone of an owner reference.
 * @param {unknown} owner - Owner candidate to normalize.
 * @returns {ActionOwner} - Normalized owner copy.
 */
function cloneOwner(owner) {
  return normalizeOwner(owner);
}

/**
 * Determines whether two owner references are equivalent after normalization.
 * @param {unknown} a - First owner candidate.
 * @param {unknown} b - Second owner candidate.
 * @returns {boolean} - True when the normalized owners match.
 */
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

/**
 * Coerces unknown action data into a normalized action record.
 * @param {unknown} action - Persisted or incoming action payload.
 * @returns {ActionRecord} - Normalized action record with safe defaults.
 */
function normalizeActionRecord(action) {
  const source = (action && typeof action === 'object' && !Array.isArray(action)) ? action : {};
  const base = { ...ACTION_TEMPLATE, ...source };
  base.owner = normalizeOwner(source.owner);
  base.auditTrail = Array.isArray(source.auditTrail)
    ? source.auditTrail.map(entry => ({ ...entry }))
    : [];
  base.dependencies = Array.isArray(source.dependencies) ? [...source.dependencies] : [];
  base.links = (source.links && typeof source.links === 'object' && !Array.isArray(source.links))
    ? { ...source.links }
    : {};
  const changeControlSource = (source.changeControl && typeof source.changeControl === 'object' && !Array.isArray(source.changeControl))
    ? source.changeControl
    : {};
  base.changeControl = { required: false, ...changeControlSource };
  const verificationSource = (source.verification && typeof source.verification === 'object' && !Array.isArray(source.verification))
    ? source.verification
    : {};
  base.verification = { required: false, ...verificationSource };
  return base;
}

/**
 * Normalizes an arbitrary action snapshot into the canonical record shape.
 * @param {unknown} action - Persisted or imported action payload.
 * @returns {ActionRecord} - Normalized action record compatible with storage exports.
 */
export function normalizeActionSnapshot(action) {
  return normalizeActionRecord(action);
}

/**
 * Normalizes a persisted actions map into runtime-ready records.
 * @param {unknown} map - Potentially stale persisted map.
 * @returns {ActionsMap} - Map keyed by analysis identifier with normalized records.
 */
function migrateAll(map) {
  if (!map || typeof map !== 'object') return {};
  const migrated = {};
  Object.keys(map).forEach(key => {
    const list = Array.isArray(map[key]) ? map[key] : [];
    migrated[key] = list.map(item => normalizeActionRecord(item));
  });
  return migrated;
}

/**
 * Maps an action status to a numeric sorting rank.
 * @param {string} status - Status label from an action record.
 * @returns {number} - Sorting rank where lower values bubble to the top.
 */
function getStatusRank(status) {
  const rank = STATUS_ORDER[status];
  return typeof rank === 'number' ? rank : Number.POSITIVE_INFINITY;
}

/**
 * Maps an action priority to a numeric sorting rank.
 * @param {string} priority - Priority label from an action record.
 * @returns {number} - Sorting rank mirroring the risk hierarchy.
 */
function getPriorityRank(priority) {
  const rank = PRIORITY_ORDER[priority];
  return typeof rank === 'number' ? rank : Number.POSITIVE_INFINITY;
}

/**
 * Converts a due date into a sortable numeric value.
 * @param {string} dueAt - ISO timestamp or empty string.
 * @returns {number} - Millisecond timestamp or `Infinity` when unset.
 */
function getDueTime(dueAt) {
  if (!dueAt) return Number.POSITIVE_INFINITY;
  const parsed = new Date(dueAt).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Reads and normalizes all persisted actions from storage.
 * @returns {ActionsMap} - Normalized actions keyed by analysis ID.
 */
function loadAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) || {};
    return migrateAll(raw);
  }
  catch {
    return {};
  }
}

/**
 * Persists the provided actions map to storage.
 * @param {ActionsMap} map - Map of actions keyed by analysis ID.
 * @returns {void} - Nothing.
 */
function saveAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

/**
 * Produces a normalized snapshot of actions for the given analysis.
 * @param {string} analysisId - Identifier of the analysis to export.
 * @returns {ActionRecord[]} - Snapshot ready for persistence.
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

/**
 * Replaces the stored actions for an analysis with a provided snapshot.
 * @param {string} analysisId - Identifier of the analysis to update.
 * @param {unknown} actions - Snapshot exported from another session.
 * @returns {ActionRecord[]} - Imported and normalized actions.
 */
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

/**
 * Lists the normalized actions for an analysis from storage.
 * @param {string} analysisId - Identifier of the analysis to read.
 * @returns {ActionRecord[]} - Stored actions or an empty list.
 */
export function listActions(analysisId) {
  const all = loadAll();
  return all[analysisId] || [];
}

/**
 * Creates a new action for an analysis and persists it to storage.
 * @param {string} analysisId - Identifier of the analysis receiving the action.
 * @param {ActionPatch} patch - Partial fields used to seed the new record.
 * @returns {ActionRecord | null} - Newly created action, or null when validation fails.
 */
export function createAction(analysisId, patch = {}) {
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

/**
 * Applies a partial update to an action while enforcing audit trail rules.
 * @param {string} analysisId - Identifier of the action's analysis.
 * @param {string} actionId - Identifier of the action to mutate.
 * @param {ActionPatch} delta - Partial fields representing requested changes.
 * @returns {ActionRecord | null | { __error: string }} - Updated action, null when not found, or a validation error payload.
 */
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

/**
 * Removes an action from storage.
 * @param {string} analysisId - Identifier of the action's analysis.
 * @param {string} actionId - Identifier of the action to delete.
 * @returns {void} - Nothing.
 */
export function removeAction(analysisId, actionId) {
  const all = loadAll();
  const list = all[analysisId] || [];
  all[analysisId] = list.filter(a => a.id !== actionId);
  saveAll(all);
}

/**
 * Sorts and persists actions in their canonical ordering.
 * @param {string} analysisId - Identifier of the analysis to sort.
 * @returns {ActionRecord[]} - Sorted actions list.
 */
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
