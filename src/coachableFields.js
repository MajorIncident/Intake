/**
 * @module coachableFields
 * @summary Stable classroom coaching target registry and deterministic field fingerprints.
 * @description
 * Coaching identity is domain-based and independent from CSS selectors. Static Intake targets
 * map a stable target ID to today's DOM control only as a rendering hook. KT targets reuse the
 * durable question IDs from constants and fingerprint the whole reasoning row together.
 */

import { ROWS } from './constants.js';

export const COACHING_FINGERPRINT_VERSION = 'v1';

const STATIC_TARGETS = Object.freeze([
  { id: 'problem.one-line', label: 'Problem statement', section: 'Problem', domId: 'oneLine' },
  { id: 'evidence.proof', label: 'Proof / evidence summary', section: 'Evidence', domId: 'proof' },
  { id: 'problem.object', label: 'Specific object', section: 'Problem', domId: 'objectPrefill' },
  { id: 'problem.desired-state', label: 'Desired / healthy state', section: 'Problem', domId: 'healthy' },
  { id: 'problem.actual-state', label: 'Actual / current state', section: 'Problem', domId: 'now' },
  { id: 'impact.current', label: 'Current impact', section: 'Impact', domId: 'impactNow' },
  { id: 'impact.future', label: 'Future impact', section: 'Impact', domId: 'impactFuture' },
  { id: 'impact.timing', label: 'Impact timing', section: 'Impact', domId: 'impactTime' },
  { id: 'containment.action', label: 'Containment action', section: 'Containment', domId: 'containDesc' },
  { id: 'decision.question', label: 'Decision to make', section: 'Decision', domId: 'decisionToMake' },
  { id: 'decision.options', label: 'Decision options', section: 'Decision', domId: 'decisionOptions' },
  { id: 'decision.selected-option', label: 'Selected option', section: 'Decision', domId: 'decisionSelectedOption' },
  { id: 'decision.owner-role', label: 'Decision owner role', section: 'Decision', domId: 'decisionOwnerRole' },
  { id: 'decision.delegated-owner', label: 'Delegated decision owner', section: 'Decision', domId: 'decisionDelegatedOwner' },
  { id: 'decision.rationale', label: 'Decision rationale', section: 'Decision', domId: 'decisionRationale' },
  { id: 'decision.timestamp', label: 'Decision timestamp', section: 'Decision', domId: 'decisionTimestamp' },
  { id: 'risk.owner', label: 'Risk owner', section: 'Risk', domId: 'riskOwner' },
  { id: 'risk.level', label: 'Risk level', section: 'Risk', domId: 'potentialRiskLevel' },
  { id: 'risk.failure', label: 'Potential failure', section: 'Risk', domId: 'potentialFailure' },
  { id: 'risk.preventive-control', label: 'Preventive control', section: 'Risk', domId: 'preventiveControl' },
  { id: 'risk.rollback-contingency', label: 'Rollback / contingency', section: 'Risk', domId: 'rollbackContingency' },
  { id: 'risk.verification-condition', label: 'Verification condition', section: 'Risk', domId: 'verificationCondition' }
]);

const KT_TARGETS = Object.freeze(
  ROWS.filter(row => row?.id).map(row => Object.freeze({
    id: `kt.${row.id}`,
    label: row.q || row.id,
    section: 'KT analysis',
    questionId: row.id
  }))
);

export const COACHABLE_TARGET_DEFINITIONS = Object.freeze([
  ...STATIC_TARGETS.map(target => Object.freeze({ ...target, kind: 'field' })),
  ...KT_TARGETS.map(target => Object.freeze({ ...target, kind: 'kt-row' }))
]);

const DEFINITION_BY_ID = new Map(COACHABLE_TARGET_DEFINITIONS.map(target => [target.id, target]));

/**
 * Return the immutable coaching target definitions.
 *
 * @returns {ReadonlyArray<object>} Stable coaching target metadata.
 */
export function listCoachableTargetDefinitions() {
  return COACHABLE_TARGET_DEFINITIONS;
}

/**
 * Look up one stable coaching target definition.
 *
 * @param {string} targetId Stable coaching target ID.
 * @returns {object|null} Definition or null.
 */
export function getCoachableTargetDefinition(targetId) {
  return typeof targetId === 'string' ? (DEFINITION_BY_ID.get(targetId) || null) : null;
}

/**
 * Normalize field evidence before fingerprinting.
 *
 * Formatting-only whitespace differences should not mark feedback stale.
 *
 * @param {unknown} value Candidate field evidence.
 * @returns {string} Canonical evidence string.
 */
export function normalizeCoachingEvidence(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/**
 * Build a compact deterministic FNV-1a 64-bit fingerprint.
 *
 * This is change-detection evidence, not a security primitive.
 *
 * @param {string} targetId Stable coaching target ID.
 * @param {unknown} value Current target evidence.
 * @returns {string} Versioned fingerprint.
 */
export function fingerprintCoachingEvidence(targetId, value) {
  const canonical = `${targetId}\u0000${normalizeCoachingEvidence(value)}`;
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(canonical);
  bytes.forEach(byte => {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  });
  return `${COACHING_FINGERPRINT_VERSION}-${hash.toString(16).padStart(16, '0')}`;
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
  const value = [
    `is:${row.isTA?.value || ''}`,
    `is-not:${row.notTA?.value || ''}`,
    `distinctions:${row.distTA?.value || ''}`,
    `changes:${row.chgTA?.value || ''}`
  ].join('\n');
  return {
    ...definition,
    control: row.isTA || row.tr,
    mount: row.th || row.tr,
    row,
    value
  };
}

/**
 * Resolve a stable coaching target into its current DOM placement and evidence.
 *
 * DOM selectors are presentation hooks only; targetId remains the persistence identity.
 *
 * @param {string} targetId Stable coaching target ID.
 * @param {object} [options] Resolution options.
 * @param {Document} [options.documentRef=globalThis.document] Document containing static controls.
 * @param {Array<object>} [options.rows=[]] Current KT row bindings.
 * @returns {object|null} Resolved target or null when not mounted.
 */
export function resolveCoachableTarget(targetId, {
  documentRef = globalThis.document,
  rows = []
} = {}) {
  const definition = getCoachableTargetDefinition(targetId);
  if (!definition) return null;
  const resolved = definition.kind === 'kt-row'
    ? resolveKt(definition, rows)
    : resolveStatic(definition, documentRef);
  if (!resolved) return null;
  return {
    ...resolved,
    fingerprint: fingerprintCoachingEvidence(definition.id, resolved.value)
  };
}

/**
 * Resolve every currently mounted coaching target.
 *
 * @param {object} [options] Resolution options passed to resolveCoachableTarget.
 * @returns {object[]} Mounted coaching targets in registry order.
 */
export function listResolvedCoachableTargets(options = {}) {
  return COACHABLE_TARGET_DEFINITIONS
    .map(definition => resolveCoachableTarget(definition.id, options))
    .filter(Boolean);
}
