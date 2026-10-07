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
export const POSSIBLE_CAUSE_TARGET_FAMILY_ID = 'possible-cause';

const TARGET_ID_MAX_LENGTH = 160;
const POSSIBLE_CAUSE_TARGET_PREFIX = `${POSSIBLE_CAUSE_TARGET_FAMILY_ID}.`;

export const INTAKE_TARGET_FAMILY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: POSSIBLE_CAUSE_TARGET_FAMILY_ID,
    label: 'Possible Causes',
    section: 'Possible Causes',
    kind: 'dynamic-card'
  })
]);

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
const FAMILY_BY_ID = new Map(INTAKE_TARGET_FAMILY_DEFINITIONS.map(family => [family.id, family]));

const TARGET_BEARING_OBJECT_PATHS = Object.freeze([
  Object.freeze(['pre']),
  Object.freeze(['impact']),
  Object.freeze(['ops']),
  Object.freeze(['decisionAnalysis']),
  Object.freeze(['potentialProblemAnalysis', 'owner']),
  Object.freeze(['potentialProblemAnalysis', 'risk']),
  Object.freeze(['potentialProblemAnalysis', 'changeControl']),
  Object.freeze(['potentialProblemAnalysis', 'verification'])
]);

const REVIEWED_TARGET_COVERAGE_EXCLUSIONS = new Set([
  'ops.bridgeOpenedUtc',
  'ops.icName',
  'ops.bcName',
  'ops.semOpsName',
  'ops.severity',
  'ops.detectMonitoring',
  'ops.detectUserReport',
  'ops.detectAutomation',
  'ops.detectOther',
  'ops.evScreenshot',
  'ops.evLogs',
  'ops.evMetrics',
  'ops.evRepro',
  'ops.evOther',
  'ops.containStatus',
  'ops.commCadence',
  'ops.commLog',
  'ops.commNextDueIso',
  'ops.commNextUpdateTime',
  'ops.tableFocusMode',
  'potentialProblemAnalysis.owner.category',
  'potentialProblemAnalysis.owner.subOwner',
  'potentialProblemAnalysis.owner.notes',
  'potentialProblemAnalysis.owner.lastAssignedBy',
  'potentialProblemAnalysis.owner.lastAssignedAt',
  'potentialProblemAnalysis.owner.source',
  'potentialProblemAnalysis.changeControl.required',
  'potentialProblemAnalysis.verification.required'
]);

const REGISTERED_SNAPSHOT_PATHS = new Set(
  INTAKE_TARGET_DEFINITIONS.flatMap(definition => (
    Array.isArray(definition.snapshotPaths)
      ? definition.snapshotPaths.map(path => path.join('.'))
      : []
  ))
);

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
 * Return the immutable dynamic target-family definitions.
 *
 * @returns {ReadonlyArray<object>} Stable family metadata.
 */
export function listIntakeTargetFamilyDefinitions() {
  return INTAKE_TARGET_FAMILY_DEFINITIONS;
}

/**
 * Look up one dynamic target-family definition.
 *
 * @param {string} familyId Stable family ID.
 * @returns {object|null} Family definition or null.
 */
export function getIntakeTargetFamilyDefinition(familyId) {
  return typeof familyId === 'string' ? (FAMILY_BY_ID.get(familyId) || null) : null;
}

/**
 * Return whether an authored guidance target is part of the shared semantic namespace.
 *
 * Static/KT target IDs and family IDs are authorable. Runtime dynamic instance IDs
 * such as possible-cause.<cause.id> are learner/workspace-specific and therefore
 * cannot be authored into staged definitions.
 *
 * @param {unknown} value Candidate authored target ID.
 * @returns {boolean} Whether the ID is safe for authored guidance.
 */
export function isAuthorableIntakeTargetId(value) {
  if (typeof value !== 'string') return false;
  const targetId = value.trim();
  return DEFINITION_BY_ID.has(targetId) || FAMILY_BY_ID.has(targetId);
}

/**
 * Validate target-bearing serialized Intake areas against the universal registry.
 *
 * Fields inside designated reasoning areas must either map to a registered
 * snapshot target path or be an explicit reviewed workflow/infrastructure
 * exclusion. KT rows and Possible Cause identities are checked separately.
 *
 * @param {object} [snapshot={}] Serialized/current/checkpoint Intake state.
 * @returns {string[]} Actionable coverage errors; empty when covered.
 */
export function validateIntakeTargetCoverage(snapshot = {}) {
  const errors = [];
  const state = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot
    : {};

  TARGET_BEARING_OBJECT_PATHS.forEach(path => {
    const area = readPath(state, path);
    if (area === undefined || area === null) return;
    if (typeof area !== 'object' || Array.isArray(area)) {
      errors.push(`${path.join('.')} must be an object for Intake target coverage`);
      return;
    }

    Object.keys(area).forEach(field => {
      const fullPath = [...path, field].join('.');
      if (REGISTERED_SNAPSHOT_PATHS.has(fullPath) || REVIEWED_TARGET_COVERAGE_EXCLUSIONS.has(fullPath)) {
        return;
      }
      errors.push(
        `${fullPath} is inside a target-bearing Intake area but has no stable target definition or reviewed exclusion`
      );
    });
  });

  const rows = Array.isArray(state.table) ? state.table : [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || row.band) return;
    const questionId = typeof row.questionId === 'string' ? row.questionId.trim() : '';
    if (!questionId || !DEFINITION_BY_ID.has(`kt.${questionId}`)) {
      errors.push(
        `table[${index}].questionId must resolve to a registered KT Intake target`
      );
    }
  });

  const dynamicIds = new Set();
  const causes = Array.isArray(state.causes) ? state.causes : [];
  causes.forEach((cause, index) => {
    const targetId = possibleCauseTargetId(cause?.id);
    if (!targetId) {
      errors.push(
        `causes[${index}].id must be a supported persisted Possible Cause lifecycle ID`
      );
      return;
    }
    if (dynamicIds.has(targetId)) {
      errors.push(`causes[${index}].id duplicates dynamic Intake target ${targetId}`);
      return;
    }
    dynamicIds.add(targetId);
  });

  return errors;
}

function isLowerAlphaNumeric(character) {
  return Boolean(character) && (
    (character >= 'a' && character <= 'z')
    || (character >= '0' && character <= '9')
  );
}

function isTargetSegment(segment) {
  if (!segment || !isLowerAlphaNumeric(segment[0]) || !isLowerAlphaNumeric(segment.at(-1))) {
    return false;
  }
  for (let index = 1; index < segment.length - 1; index += 1) {
    const character = segment[index];
    if (character !== '-' && !isLowerAlphaNumeric(character)) return false;
  }
  return true;
}

/**
 * Validate a persisted Possible Cause lifecycle ID for use as a coaching target segment.
 *
 * Invalid/legacy IDs are not silently rewritten because target identity must not collide
 * or sever other persisted references to the same cause.
 *
 * @param {unknown} value Persisted cause ID.
 * @returns {string} Grammar-safe lowercase instance ID or an empty string.
 */
export function normalizePossibleCauseInstanceId(value) {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (!candidate || candidate !== candidate.toLowerCase() || !isTargetSegment(candidate)) return '';
  return (POSSIBLE_CAUSE_TARGET_PREFIX.length + candidate.length) <= TARGET_ID_MAX_LENGTH
    ? candidate
    : '';
}

/**
 * Derive the stable coaching/debrief target ID for one persisted Possible Cause.
 *
 * @param {unknown} causeId Persisted cause lifecycle ID.
 * @returns {string} Target ID or an empty string when the instance ID is unsupported.
 */
export function possibleCauseTargetId(causeId) {
  const instanceId = normalizePossibleCauseInstanceId(causeId);
  return instanceId ? `${POSSIBLE_CAUSE_TARGET_PREFIX}${instanceId}` : '';
}

function parsePossibleCauseTargetId(targetId) {
  if (typeof targetId !== 'string' || !targetId.startsWith(POSSIBLE_CAUSE_TARGET_PREFIX)) return '';
  const instanceId = targetId.slice(POSSIBLE_CAUSE_TARGET_PREFIX.length);
  return possibleCauseTargetId(instanceId) === targetId ? instanceId : '';
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


function normalizedCauseField(value) {
  return normalizeIntakeTargetEvidence(value);
}

function normalizedCauseFindings(findings) {
  if (!findings || typeof findings !== 'object' || Array.isArray(findings)) return [];
  return Object.entries(findings)
    .map(([key, entry]) => ({
      key: String(key),
      mode: normalizedCauseField(entry?.mode),
      note: normalizedCauseField(entry?.note)
    }))
    .filter(entry => entry.mode || entry.note)
    .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * Build deterministic persisted reasoning evidence for one Possible Cause.
 *
 * Presentation-only fields such as editing/testingOpen are intentionally excluded.
 *
 * @param {unknown} cause Persisted/in-memory cause record.
 * @returns {string} Canonical JSON evidence or an empty string when no reasoning exists.
 */
export function buildPossibleCauseEvidence(cause) {
  if (!cause || typeof cause !== 'object' || Array.isArray(cause)) return '';
  const record = {
    suspect: normalizedCauseField(cause.suspect),
    accusation: normalizedCauseField(cause.accusation),
    impact: normalizedCauseField(cause.impact),
    summaryText: normalizedCauseField(cause.summaryText),
    confidence: normalizedCauseField(cause.confidence),
    evidence: normalizedCauseField(cause.evidence),
    findings: normalizedCauseFindings(cause.findings)
  };
  const hasEvidence = record.suspect
    || record.accusation
    || record.impact
    || record.summaryText
    || record.confidence
    || record.evidence
    || record.findings.length > 0;
  return hasEvidence ? JSON.stringify(record) : '';
}

function possibleCauseComparisonText(cause) {
  const summary = normalizedCauseField(cause?.summaryText);
  if (summary) return summary;
  return [
    normalizedCauseField(cause?.suspect),
    normalizedCauseField(cause?.accusation),
    normalizedCauseField(cause?.impact)
  ].filter(Boolean).join(' · ');
}

function possibleCauseLabel(cause, instanceId) {
  const concise = normalizedCauseField(cause?.suspect)
    || normalizedCauseField(cause?.summaryText)
    || instanceId;
  return concise ? `Possible Cause · ${concise}` : 'Possible Cause';
}

function uniquePossibleCauseEntries(causes) {
  const records = new Map();
  const duplicates = new Set();
  (Array.isArray(causes) ? causes : []).forEach(cause => {
    const targetId = possibleCauseTargetId(cause?.id);
    if (!targetId) return;
    if (records.has(targetId)) {
      duplicates.add(targetId);
      return;
    }
    records.set(targetId, cause);
  });
  duplicates.forEach(targetId => records.delete(targetId));
  return [...records.entries()];
}

function projectPossibleCauseRecord(targetId, cause) {
  const instanceId = parsePossibleCauseTargetId(targetId);
  if (!instanceId || !cause) return null;
  const evidence = buildPossibleCauseEvidence(cause);
  return {
    id: targetId,
    familyId: POSSIBLE_CAUSE_TARGET_FAMILY_ID,
    instanceId,
    label: possibleCauseLabel(cause, instanceId),
    section: 'Possible Causes',
    kind: 'dynamic-card',
    evidence,
    comparisonText: possibleCauseComparisonText(cause),
    empty: evidence.length === 0,
    fingerprint: fingerprintIntakeTargetEvidence(targetId, evidence)
  };
}

/**
 * Project every unambiguous Possible Cause instance from a serialized Intake snapshot.
 *
 * @param {object} [snapshot={}] Serialized Intake/checkpoint snapshot.
 * @returns {object[]} Dynamic per-workspace target projections in cause order.
 */
export function projectPossibleCauseTargets(snapshot = {}) {
  return uniquePossibleCauseEntries(snapshot?.causes)
    .map(([targetId, cause]) => projectPossibleCauseRecord(targetId, cause))
    .filter(Boolean);
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
  if (definition) {
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

  const dynamic = uniquePossibleCauseEntries(snapshot?.causes)
    .find(([candidateTargetId]) => candidateTargetId === targetId);
  return dynamic ? projectPossibleCauseRecord(dynamic[0], dynamic[1]) : null;
}

/**
 * Project every registered static/KT target from a serialized Intake snapshot.
 *
 * @param {object} [snapshot={}] Serialized Intake/checkpoint snapshot.
 * @returns {object[]} Stable projections in registry order.
 */
export function projectIntakeTargets(snapshot = {}) {
  return [
    ...INTAKE_TARGET_DEFINITIONS.map(definition => projectIntakeTarget(definition.id, snapshot)),
    ...projectPossibleCauseTargets(snapshot)
  ];
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


function findPossibleCauseCard(documentRef, instanceId) {
  const cards = documentRef?.querySelectorAll?.('.cause-card[data-cause-id]') || [];
  return [...cards].find(card => card.dataset?.causeId === instanceId) || null;
}

function resolvePossibleCause(targetId, { documentRef, causes } = {}) {
  const instanceId = parsePossibleCauseTargetId(targetId);
  if (!instanceId) return null;
  const dynamic = uniquePossibleCauseEntries(causes)
    .find(([candidateTargetId]) => candidateTargetId === targetId);
  if (!dynamic) return null;
  const cause = dynamic[1];
  const mount = findPossibleCauseCard(documentRef, instanceId);
  if (!mount) return null;
  const value = buildPossibleCauseEvidence(cause);
  return {
    id: targetId,
    familyId: POSSIBLE_CAUSE_TARGET_FAMILY_ID,
    instanceId,
    label: possibleCauseLabel(cause, instanceId),
    section: 'Possible Causes',
    kind: 'dynamic-card',
    control: mount.querySelector?.('textarea, button') || mount,
    mount,
    cause,
    value,
    fingerprint: fingerprintIntakeTargetEvidence(targetId, value)
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
  rows = [],
  causes = []
} = {}) {
  const definition = getIntakeTargetDefinition(targetId);
  if (!definition) {
    return resolvePossibleCause(targetId, { documentRef, causes });
  }
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
  const staticTargets = INTAKE_TARGET_DEFINITIONS
    .map(definition => resolveIntakeTarget(definition.id, options))
    .filter(Boolean);
  const dynamicTargets = uniquePossibleCauseEntries(options?.causes)
    .map(([targetId]) => resolveIntakeTarget(targetId, options))
    .filter(Boolean);
  return [...staticTargets, ...dynamicTargets];
}
