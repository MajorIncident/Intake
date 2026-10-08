/**
 * @module api/classroomSimulation
 * @description
 * Shared server-only helpers for stable staged Classroom simulation identity.
 * Keeps exercise orchestration and derived debrief guidance on the same
 * definition-fingerprint contract without introducing a second source of truth.
 */

import { createHash } from 'node:crypto';

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value)
      .sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
      .join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Return a stable SHA-256 identity for one normalized staged definition.
 *
 * @param {object} simulation Normalized server-only simulation definition.
 * @returns {string} Lowercase SHA-256 hex digest.
 */
export function fingerprintStagedSimulation(simulation) {
  return createHash('sha256').update(canonicalJson(simulation)).digest('hex');
}

/**
 * Resolve the authored Intake target recommendations for an exercise's current
 * stage, but only when the stored exercise definition still matches the
 * governed server manifest exactly.
 *
 * Definition drift fails closed to no recommendations. The downstream
 * universal target model still validates target IDs before exposing them.
 *
 * @param {object|null} exercise Persisted Classroom exercise metadata.
 * @param {object[]} manifest Server-only protected Case Study manifest.
 * @returns {string[]} Authored current-stage target IDs or an empty array.
 */
export function stagedExerciseRecommendedTargetIds(exercise, manifest = []) {
  if (
    !exercise
    || typeof exercise.caseStudyId !== 'string'
    || typeof exercise.currentStageId !== 'string'
    || !exercise.currentStageId
  ) return [];

  const caseStudy = (Array.isArray(manifest) ? manifest : []).find(candidate => (
    candidate?.id === exercise.caseStudyId
    && candidate?.templateKind === 'case-study'
    && candidate?.simulation
  )) || null;
  if (!caseStudy) return [];

  if (
    exercise.simulationVersion !== caseStudy.simulation.version
    || exercise.simulationFingerprint !== fingerprintStagedSimulation(caseStudy.simulation)
  ) return [];

  const stage = Array.isArray(caseStudy.simulation.stages)
    ? caseStudy.simulation.stages.find(candidate => candidate?.id === exercise.currentStageId)
    : null;
  return Array.isArray(stage?.intakeTargetIds) ? [...stage.intakeTargetIds] : [];
}
