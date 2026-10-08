/**
 * @module classroomDebriefModel
 * @summary Builds the read-only, template-independent class debrief comparison model.
 * @description
 * Pure helpers only. This module consumes already-authorized class/workspace metadata,
 * live/checkpoint Intake snapshots, readiness, and coaching rows, then projects evidence
 * through the universal Intake target registry. It owns no DOM, network, capability,
 * persistence, grading, or mutation behavior.
 */

import {
  getIntakeTargetFamilyDefinition,
  isAuthorableIntakeTargetId,
  projectIntakeTargets
} from './intakeTargets.js';

export const DEBRIEF_EVIDENCE_MODES = Object.freeze({
  CURRENT: 'current',
  CHECKPOINT: 'checkpoint'
});

const COACHING_STATUSES = new Set(['meets-standard', 'needs-improvement']);

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function safeTimestamp(value) {
  return typeof value === 'string' && value ? value : null;
}

function workspaceMap(records = []) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    const workspaceId = safeText(record?.workspaceId || record?.id);
    if (workspaceId && !map.has(workspaceId)) map.set(workspaceId, record);
  });
  return map;
}

function feedbackMap(records = []) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    const workspaceId = safeText(record?.workspaceId);
    if (!workspaceId) return;
    if (!map.has(workspaceId)) map.set(workspaceId, []);
    map.get(workspaceId).push(record);
  });
  return map;
}

function sanitizeWorkspace(workspace = {}) {
  return {
    id: safeText(workspace.id),
    kind: workspace.kind === 'individual' ? 'individual' : 'group',
    label: safeText(workspace.label) || 'Workspace',
    participantCount: Math.max(0, Number(workspace.participantCount) || 0),
    activeParticipantCount: Math.max(0, Number(workspace.activeParticipantCount) || 0),
    editingParticipantCount: Math.max(0, Number(workspace.editingParticipantCount) || 0),
    lastSeenAt: safeTimestamp(workspace.lastSeenAt)
  };
}

function projectSnapshotRecord(record, { checkpoint = false } = {}) {
  const snapshot = record?.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const projection = {
    workspaceRevision: positiveInteger(record.workspaceRevision ?? record.revision),
    targets: projectIntakeTargets(snapshot)
  };
  if (checkpoint) {
    projection.stageId = safeText(record.stageId) || null;
    projection.capturedAt = safeTimestamp(record.capturedAt);
  } else {
    projection.updatedAt = safeTimestamp(record.updatedAt);
  }
  return projection;
}

function projectionIndex(targets = []) {
  return new Map(
    (Array.isArray(targets) ? targets : [])
      .filter(target => typeof target?.id === 'string')
      .map(target => [target.id, target])
  );
}

function deriveCoaching(records, currentTargets) {
  const currentById = projectionIndex(currentTargets);
  const rows = [];
  (Array.isArray(records) ? records : []).forEach(record => {
    const targetId = safeText(record?.targetId);
    const status = safeText(record?.status);
    if (!targetId || !COACHING_STATUSES.has(status)) return;
    const reviewedFieldFingerprint = safeText(record?.reviewedFieldFingerprint);
    const current = currentById.get(targetId) || null;
    rows.push({
      targetId,
      status,
      reviewedWorkspaceRevision: positiveInteger(record?.reviewedWorkspaceRevision),
      feedbackRevision: positiveInteger(record?.feedbackRevision),
      changedSinceReview: Boolean(
        reviewedFieldFingerprint
        && (!current || current.fingerprint !== reviewedFieldFingerprint)
      )
    });
  });
  rows.sort((left, right) => left.targetId.localeCompare(right.targetId));
  return {
    reviewedTargetCount: rows.length,
    meetsStandardCount: rows.filter(row => row.status === 'meets-standard').length,
    needsImprovementCount: rows.filter(row => row.status === 'needs-improvement').length,
    changedSinceReviewCount: rows.filter(row => row.changedSinceReview).length,
    targets: rows
  };
}

function sanitizeReadiness(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.readyForDebrief !== 'boolean') return null;
  return {
    readyForDebrief: record.readyForDebrief,
    workspaceRevision: positiveInteger(
      record.workspaceRevision
      ?? record.readyWorkspaceRevision
      ?? record.readyRevision
    ),
    readyAt: safeTimestamp(record.readyAt)
  };
}

function sanitizeExercise(exercise, recommendedTargetIds) {
  if (!exercise || typeof exercise !== 'object') return null;
  return {
    id: safeText(exercise.id) || null,
    status: safeText(exercise.status) || null,
    currentStageId: safeText(exercise.currentStageId) || null,
    stagePhase: safeText(exercise.stagePhase) || null,
    recommendedTargetIds
  };
}

function sanitizeRecommendedTargetIds(values = []) {
  const seen = new Set();
  const output = [];
  (Array.isArray(values) ? values : []).forEach(value => {
    const targetId = typeof value === 'string' ? value.trim() : '';
    if (!targetId || seen.has(targetId) || !isAuthorableIntakeTargetId(targetId)) return;
    seen.add(targetId);
    output.push(targetId);
  });
  return output;
}

/**
 * Build the pure Instructor debrief comparison model from existing source-of-truth records.
 *
 * @param {object} input Authorized source data.
 * @param {object} [input.classroom] Represented Classroom metadata.
 * @param {object|null} [input.exercise=null] Optional staged exercise metadata.
 * @param {string[]} [input.recommendedTargetIds=[]] Optional staged target recommendations.
 * @param {object[]} [input.workspaces=[]] Class-scoped workspace metadata.
 * @param {object[]} [input.currentSnapshots=[]] Current live snapshots keyed by workspaceId.
 * @param {object[]} [input.checkpoints=[]] Immutable checkpoint snapshots keyed by workspaceId.
 * @param {object[]} [input.readiness=[]] Workspace-scoped Ready/Working records.
 * @param {object[]} [input.feedback=[]] Instructor coaching rows with workspaceId.
 * @returns {object} Comparison-safe, mutation-free class debrief model.
 */
export function buildClassroomDebriefModel({
  classroom = {},
  exercise = null,
  recommendedTargetIds = [],
  workspaces = [],
  currentSnapshots = [],
  checkpoints = [],
  readiness = [],
  feedback = []
} = {}) {
  const currentByWorkspace = workspaceMap(currentSnapshots);
  const checkpointByWorkspace = workspaceMap(checkpoints);
  const readinessByWorkspace = workspaceMap(readiness);
  const feedbackByWorkspace = feedbackMap(feedback);
  const recommendations = sanitizeRecommendedTargetIds(recommendedTargetIds);

  const representedWorkspaces = (Array.isArray(workspaces) ? workspaces : [])
    .map(sanitizeWorkspace)
    .filter(workspace => workspace.id)
    .map(workspace => {
      const current = projectSnapshotRecord(currentByWorkspace.get(workspace.id));
      const checkpoint = projectSnapshotRecord(
        checkpointByWorkspace.get(workspace.id),
        { checkpoint: true }
      );
      const coaching = deriveCoaching(
        feedbackByWorkspace.get(workspace.id) || [],
        current?.targets || []
      );
      return {
        ...workspace,
        readiness: sanitizeReadiness(readinessByWorkspace.get(workspace.id)),
        current,
        checkpoint,
        coaching
      };
    });

  return {
    class: {
      id: safeText(classroom?.id) || null,
      title: safeText(classroom?.title) || 'Class',
      expiresAt: safeTimestamp(classroom?.expiresAt)
    },
    exercise: sanitizeExercise(exercise, recommendations),
    recommendedTargetIds: recommendations,
    workspaces: representedWorkspaces
  };
}

/**
 * Select one semantic target across represented workspaces without aligning dynamic instances.
 *
 * Static/KT targets return at most one projection per workspace. Dynamic family IDs
 * return that workspace's independent collection.
 *
 * @param {object} model Result from buildClassroomDebriefModel.
 * @param {string} targetId Authorable static/KT/family semantic target ID.
 * @param {object} [options] Selection options.
 * @param {'current'|'checkpoint'} [options.mode='current'] Evidence source.
 * @returns {object[]} One cell model per represented workspace.
 */
export function selectDebriefTargetAcrossWorkspaces(
  model,
  targetId,
  { mode = DEBRIEF_EVIDENCE_MODES.CURRENT } = {}
) {
  const semanticTargetId = typeof targetId === 'string' ? targetId.trim() : '';
  if (!isAuthorableIntakeTargetId(semanticTargetId)) return [];
  const evidenceMode = mode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT
    ? DEBRIEF_EVIDENCE_MODES.CHECKPOINT
    : DEBRIEF_EVIDENCE_MODES.CURRENT;
  const family = getIntakeTargetFamilyDefinition(semanticTargetId);

  return (Array.isArray(model?.workspaces) ? model.workspaces : []).map(workspace => {
    const source = workspace?.[evidenceMode] || null;
    const targets = Array.isArray(source?.targets) ? source.targets : [];
    const projections = family
      ? targets.filter(target => target?.familyId === semanticTargetId)
      : targets.filter(target => target?.id === semanticTargetId);

    return {
      workspace: {
        id: workspace.id,
        kind: workspace.kind,
        label: workspace.label
      },
      mode: evidenceMode,
      sourceAvailable: Boolean(source),
      workspaceRevision: source?.workspaceRevision ?? null,
      projections
    };
  });
}
