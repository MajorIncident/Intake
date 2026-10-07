/**
 * @module intakeTargets
 * @summary Universal semantic Intake target registry, snapshot projection, live resolution, and fingerprints.
 * @description
 * Target identity is domain-based and independent from Templates, Classroom workspaces, and DOM placement.
 * Static fields and KT rows can be projected directly from serialized Intake snapshots for debrief comparison,
 * while optional live DOM hooks let coaching render against the same semantic targets.
 */

import { ROWS } from './constants.js';

export const INTAKE_TARGET_FINGERPRINT_VERSION = 'v1';

const STATIC_TARGETS = Object.freeze([
  { id: 'problem.one-line', label: 'Problem statement', section: 'Problem', domId: 'oneLine', snapshotPaths: [['pre', 'oneLine']] },
  { id: 'evidence.proof', label: 'Proof / evidence summary', section: 'Evidence', domId: 'proof', snapshotPaths: [['pre', 'proof']] },
  { id: 'problem.object', label: 'Specific object', section: 'Problem', domId: 'objectPrefill', snapshotPaths: [['pre', 'objectPrefill']] },
  { id: 'problem.desired-state', label: 'Desired / healthy state', section: 'Problem', domId: 'healthy', snapshotPaths: [['pre', 'healthy']] },
  { id: 'problem.actual-state', label: 'Actual / current state', section: 'Problem', domId: 'now', snapshotPaths: [['pre', 'now']] },
  { id: 'impact.current', label: 'Current impact', section: 'Impact', domId: 'impactNow', snapshotPaths: [['impact', 'now']] },
  { id: 'impact.future', label: 'Future impact', section: 'Impact', domId: 'impactFuture', snapshotPaths: [['impact', 'future']] },
  { id: 'impact.timing', label: 'Impact timing', section: 'Impact', domId: 'impactTime', snapshotPaths: [['impact', 'time']] },
  { id: 'containment.action', label: 'Containment action', section: 'Containment', domId: 'containDesc', snapshotPaths: [['ops', 'containDesc']] },
  { id: 'decision.question', label: 'Decision to make', section: 'Decision', domId: 'decisionToMake', snapshotPaths: [['decisionAnalysis', 'decision']] },
  { id: 'decision.options', label: 'Decision options', section: 'Decision', domId: 'decisionOptions', snapshotPaths: [['decisionAnalysis', 'options']] },
  { id: 'decision.selected-option', label: 'Selected option', section: 'Decision', domId: 'decisionSelectedOption', snapshotPaths: [['decisionAnalysis', 'selectedOption']] },
  { id: 'decision.owner-role', label: 'Decision owner role', section: 'Decision', domId: 'decisionOwnerRole', snapshotPaths: [['decisionAnalysis', 'ownerRole']] },
  { id: 'decision.delegated-owner', label: 'Delegated decision owner', section: 'Decision', domId: 'decisionDelegatedOwner', snapshotPaths: [['decisionAnalysis', 'delegatedOwner']] },
  { id: 'decision.rationale', label: 'Decision rationale', section: 'Decision', domId: 'decisionRationale', snapshotPaths: [['decisionAnalysis', 'rationale']] },
  { id: 'decision.timestamp', label: 'Decision timestamp', section: 'Decision', domId: 'decisionTimestamp', snapshotPaths: [['decisionAnalysis', 'timestamp']] },
  { id: 'risk.owner', label: 'Risk owner', section: 'Risk', domId: 'riskOwner', snapshotPaths: [['potentialProblemAnalysis', 'owner', 'name']] },
  { id: 'risk.level', label: 'Risk level', section: 'Risk', domId: 'potentialRiskLevel', snapshotPaths: [['potentialProblemAnalysis', 'risk', 'level']] },
  { id: 'risk.failure', label: 'Potential failure', section: 'Risk', domId: 'potentialFailure', snapshotPaths: [['potentialProblemAnalysis', 'risk', 'impactIfFails']] },
  { id: 'risk.preventive-control', label: 'Preventive control', section: 'Risk', domId: 'preventiveControl', snapshotPaths: [['potentialProblemAnalysis', 'risk', 'prevent']] },
  {
    id: 'risk.rollback-contingency',
    label: 'Rollback / contingency',
    section: 'Risk',
    domId: 'rollbackContingency',
    snapshotPaths: [
      ['potentialProblemAnalysis', 'changeControl', 'rollbackPlan'],
      ['potentialProblemAnalysis', 'risk', 'ifHappens']
    ]
  },
  {
    id: 'risk.verification-condition',
    label: 'Verification condition',
    section: 'Risk',
    domId: 'verificationCondition',
    snapshotPaths: [['potentialProblemAnalysis', 'verification', 'result']]
  }
]);

const KT_TARGETS = Object.freeze(
  ROWS.filter(row => row?.id).map(row => Object.freeze({
    id: `kt.${row.id}`,
    label: row.q || row.id,
    section: 'KT analysis',
    questionId: row.id,
    kind: 'kt-row'
  }))
);

export const INTAKE_TARGET_DEFINITIONS = Object.freeze([
  ...STATIC_TARGETS.map(target => Object.freeze({
    ...target,
    snapshotPaths: Object.freeze(target.snapshotPaths.map(path => Object.freeze([...path]))),
    kind: 'field'
  })),
  ...KT_TARGETS
]);

const DEFINITION_BY_ID = new Map(INTAKE_TARGET_DEFINITIONS.map(target => [target.id, target]));

/**
 * Return the immutable universal Intake target definitions.
 *
 * @returns {ReadonlyArray<object>} Stable semantic target metadata.
 */
export function listIntakeTargetDefinitions() {
  return INTAKE_TARGET_DEFINITIONS;
}

/**
 * Look up one stable Intake target definition.
 *
 * @param {string} targetId Stable semantic target ID.
 * @returns {object|null} Definition or null.
 */
export function getIntakeTargetDefinition(targetId) {
  return typeof targetId === 'string' ? (DEFINITION_BY_ID.get(targetId) || null) : null;
}

/**
 * Normalize target evidence before fingerprinting or comparison.
 *
 * Formatting-only whitespace differences should not create false changes.
 *
 * @param {unknown} value Candidate evidence.
 * @returns {string} Canonical evidence string.
 */
export function normalizeIntakeTargetEvidence(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/**
 * Build a compact deterministic FNV-1a 64-bit target-evidence fingerprint.
 *
 * This is change-detection evidence, not a security primitive.
 *
 * @param {string} targetId Stable target ID.
 * @param {unknown} value Current target evidence.
 * @returns {string} Versioned fingerprint.
 */
export function fingerprintIntakeTargetEvidence(targetId, value) {
  const canonical = `${targetId}\u0000${normalizeIntakeTargetEvidence(value)}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(canonical);
  bytes.forEach(byte => {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  });
  return `${INTAKE_TARGET_FINGERPRINT_VERSION}-${hash.toString(16).padStart(16, '0')}`;
}

function readPath(source, path) {
  let cursor = source;
  for (const segment of path) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function extractStaticSnapshotEvidence(definition, snapshot) {
  let firstDefined = '';
  for (const path of definition.snapshotPaths || []) {
    const value = readPath(snapshot, path);
    if (value === undefined || value === null) continue;
    if (firstDefined === '') firstDefined = value;
    if (normalizeIntakeTargetEvidence(value)) return value;
  }
  return firstDefined;
}

function findKtSnapshotRow(snapshot, questionId) {
  const rows = Array.isArray(snapshot?.table) ? snapshot.table : [];
  return rows.find(row => (
    row
    && typeof row === 'object'
    && !row.band
    && typeof row.questionId === 'string'
    && row.questionId === questionId
  )) || null;
}

function ktEvidenceFromValues(isValue, notValue, distinctionsValue, changesValue) {
  return [
    `is:${isValue ?? ''}`,
    `is-not:${notValue ?? ''}`,
    `distinctions:${distinctionsValue ?? ''}`,
    `changes:${changesValue ?? ''}`
  ].join('\n');
}

function extractKtSnapshotEvidence(definition, snapshot) {
  const row = findKtSnapshotRow(snapshot, definition.questionId);
  if (!row) return '';
  return ktEvidenceFromValues(row.is, row.no, row.di, row.ch);
}

function snapshotEvidence(definition, snapshot) {
  return definition.kind === 'kt-row'
    ? extractKtSnapshotEvidence(definition, snapshot)
    : extractStaticSnapshotEvidence(definition, snapshot);
}

/**
 * Project one target from a serialized Intake snapshot without mounting the DOM.
 *
 * @param {string} targetId Stable target ID.
 * @param {object} [snapshot={}] Serialized Intake/checkpoint snapshot.
 * @returns {object|null} Comparison-safe projection or null for an unknown target.
 */
export function projectIntakeTarget(targetId, snapshot = {}) {
  const definition = getIntakeTargetDefinition(targetId);
  if (!definition) return null;
  const evidence = normalizeIntakeTargetEvidence(snapshotEvidence(definition, snapshot));
  return {
    id: definition.id,
    label: definition.label,
    section: definition.section,
    kind: definition.kind,
    evidence,
    comparisonText: evidence,
    empty: evidence.length === 0,
    fingerprint: fingerprintIntakeTargetEvidence(definition.id, evidence)
  };
}

/**
 * Project every registered static/KT target from a serialized Intake snapshot.
 *
 * @param {object} [snapshot={}] Serialized Intake/checkpoint snapshot.
 * @returns {object[]} Stable projections in registry order.
 */
export function projectIntakeTargets(snapshot = {}) {
  return INTAKE_TARGET_DEFINITIONS.map(definition => projectIntakeTarget(definition.id, snapshot));
}

function resolveStatic(definition, documentRef) {
  const control = documentRef?.getElementById?.(definition.domId) || null;
  if (!control) return null;
  const mount = control.closest?.('.field') || control.closest?.('.card') || control.parentElement || control;
  return {
    ...definition,
    control,
    mount,
    value: control.value ?? ''
  };
}

function resolveKt(definition, rows) {
  const row = Array.isArray(rows)
    ? rows.find(candidate => (candidate?.questionId || candidate?.def?.id) === definition.questionId)
    : null;
  if (!row?.tr) return null;
  const value = ktEvidenceFromValues(
    row.isTA?.value || '',
    row.notTA?.value || '',
    row.distTA?.value || '',
    row.chgTA?.value || ''
  );
  return {
    ...definition,
    control: row.isTA || row.tr,
    mount: row.th || row.tr,
    row,
    value
  };
}

/**
 * Resolve a stable Intake target into its current DOM placement and evidence.
 *
 * DOM selectors are presentation hooks only; target ID remains semantic identity.
 *
 * @param {string} targetId Stable target ID.
 * @param {object} [options] Resolution options.
 * @param {Document} [options.documentRef=globalThis.document] Document containing static controls.
 * @param {Array<object>} [options.rows=[]] Current KT row bindings.
 * @returns {object|null} Resolved target or null when not mounted.
 */
export function resolveIntakeTarget(targetId, {
  documentRef = globalThis.document,
  rows = []
} = {}) {
  const definition = getIntakeTargetDefinition(targetId);
  if (!definition) return null;
  const resolved = definition.kind === 'kt-row'
    ? resolveKt(definition, rows)
    : resolveStatic(definition, documentRef);
  if (!resolved) return null;
  return {
    ...resolved,
    fingerprint: fingerprintIntakeTargetEvidence(definition.id, resolved.value)
  };
}

/**
 * Resolve every currently mounted static/KT target.
 *
 * @param {object} [options] Resolution options passed to resolveIntakeTarget.
 * @returns {object[]} Mounted targets in registry order.
 */
export function listResolvedIntakeTargets(options = {}) {
  return INTAKE_TARGET_DEFINITIONS
    .map(definition => resolveIntakeTarget(definition.id, options))
    .filter(Boolean);
}
