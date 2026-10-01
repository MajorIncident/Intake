/**
 * @module experienceRoles
 * @summary Defines the product-level experience roles independently from Intake workflow modes.
 * @description
 *   Experience roles describe how a person is using Intake (Standalone, Student,
 *   or Instructor). They are deliberately separate from `intakeMode`, template
 *   kinds, and serialized Intake state.
 */

/** @type {Readonly<{STANDALONE:'standalone',STUDENT:'student',INSTRUCTOR:'instructor'}>} */
export const EXPERIENCE_ROLE_IDS = Object.freeze({
  STANDALONE: 'standalone',
  STUDENT: 'student',
  INSTRUCTOR: 'instructor'
});

/** Default role used only when migrating an existing Intake or collaboration link. */
export const LEGACY_DEFAULT_EXPERIENCE_ROLE = EXPERIENCE_ROLE_IDS.STANDALONE;

/**
 * Human-facing metadata for the role chooser.
 * @type {ReadonlyArray<Readonly<{id:string,label:string,actionLabel:string,description:string}>>}
 */
export const EXPERIENCE_ROLES = Object.freeze([
  Object.freeze({
    id: EXPERIENCE_ROLE_IDS.STANDALONE,
    label: 'Standalone',
    actionLabel: 'Work independently',
    description: 'Use Intake on your own, with local saves and optional shared collaboration.'
  }),
  Object.freeze({
    id: EXPERIENCE_ROLE_IDS.STUDENT,
    label: 'Student',
    actionLabel: 'Join a class',
    description: 'Use Intake for guided class work, individually or with a team.'
  }),
  Object.freeze({
    id: EXPERIENCE_ROLE_IDS.INSTRUCTOR,
    label: 'Instructor',
    actionLabel: 'Teach a class',
    description: 'Open the instructor workspace for class supervision and coaching.'
  })
]);

/**
 * Declarative product-surface visibility by experience role.
 *
 * These are intentionally broad product surfaces rather than workflow sections.
 * Intake-mode visibility remains owned by `src/intakeModes.js`.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, boolean>>>>}
 */
export const EXPERIENCE_ROLE_SURFACES = Object.freeze({
  [EXPERIENCE_ROLE_IDS.STANDALONE]: Object.freeze({
    intake: true,
    'intake-control': true,
    'student-notice': false,
    'instructor-shell': false
  }),
  [EXPERIENCE_ROLE_IDS.STUDENT]: Object.freeze({
    intake: true,
    'intake-control': true,
    'student-notice': true,
    'instructor-shell': false
  }),
  [EXPERIENCE_ROLE_IDS.INSTRUCTOR]: Object.freeze({
    intake: false,
    'intake-control': false,
    'student-notice': false,
    'instructor-shell': true
  })
});

const VALID_ROLE_IDS = new Set(Object.values(EXPERIENCE_ROLE_IDS));
const ROLE_INDEX = new Map(EXPERIENCE_ROLES.map((role) => [role.id, role]));

/**
 * Normalize a candidate role without inventing a fallback for unknown values.
 *
 * @param {unknown} value - Candidate experience-role token.
 * @returns {string|null} Canonical role ID or null when unsupported.
 */
export function normalizeExperienceRole(value) {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_ROLE_IDS.has(candidate) ? candidate : null;
}

/**
 * Retrieve display metadata for a supported experience role.
 *
 * @param {unknown} role - Candidate role token.
 * @returns {{id:string,label:string,actionLabel:string,description:string}|null} Role metadata or null.
 */
export function getExperienceRoleDefinition(role) {
  const normalized = normalizeExperienceRole(role);
  return normalized ? ROLE_INDEX.get(normalized) || null : null;
}

/**
 * Determine whether a named product surface should be visible for a role.
 *
 * @param {unknown} role - Candidate role token.
 * @param {string} surface - Stable `data-experience-surface` key.
 * @returns {boolean} Whether the surface is enabled for the role.
 */
export function isExperienceSurfaceVisible(role, surface) {
  const normalized = normalizeExperienceRole(role);
  if (!normalized || typeof surface !== 'string' || !surface) {
    return false;
  }
  return EXPERIENCE_ROLE_SURFACES[normalized]?.[surface] === true;
}
