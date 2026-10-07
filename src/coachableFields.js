/**
 * @module coachableFields
 * @summary Backward-compatible Classroom coaching facade over the universal Intake target registry.
 * @description
 * #318 moves semantic target ownership into intakeTargets.js so coaching, snapshot comparison,
 * and future staged guidance consume one identity layer. Existing coaching exports and target IDs
 * remain stable for stored feedback and callers while this module delegates all resolution/fingerprinting.
 */

export {
  INTAKE_TARGET_FINGERPRINT_VERSION as COACHING_FINGERPRINT_VERSION,
  INTAKE_TARGET_DEFINITIONS as COACHABLE_TARGET_DEFINITIONS,
  fingerprintIntakeTargetEvidence as fingerprintCoachingEvidence,
  getIntakeTargetDefinition as getCoachableTargetDefinition,
  listIntakeTargetDefinitions as listCoachableTargetDefinitions,
  listResolvedIntakeTargets as listResolvedCoachableTargets,
  normalizeIntakeTargetEvidence as normalizeCoachingEvidence,
  resolveIntakeTarget as resolveCoachableTarget
} from './intakeTargets.js';
