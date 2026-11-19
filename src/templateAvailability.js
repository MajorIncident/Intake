/**
 * @module templateAvailability
 * @summary Defines role-aware availability and presentation semantics for Templates and Case Studies.
 * @description
 *   Resource kind remains independent from experience role. This module is the
 *   policy bridge that decides which existing template kinds appear in each
 *   experience without duplicating the template registry or projection logic.
 *
 *   This is a visibility/usability policy only. Since #295 Case Study payloads
 *   are server-gated for Student/Instructor. TEMPORARY transition: when the
 *   generated public manifest contains Case Studies (allowlisted in
 *   scripts/standalone-public-case-studies.mjs), callers pass
 *   `{ standaloneCaseStudies: true }` and Standalone may list and apply them
 *   behind the pedagogical mode password, as it could before #299.
 */

import { EXPERIENCE_ROLE_IDS, normalizeExperienceRole } from './experienceRoles.js';
import { TEMPLATE_KINDS, normalizeTemplateKind } from './templateKinds.js';

const POLICIES = Object.freeze({
  [EXPERIENCE_ROLE_IDS.STANDALONE]: Object.freeze({
    role: EXPERIENCE_ROLE_IDS.STANDALONE,
    allowedKinds: Object.freeze([TEMPLATE_KINDS.STANDARD]),
    launcherLabel: 'Templates',
    drawerTitle: 'Templates',
    drawerSubtitle: 'Start from reusable prefills, then tailor the Intake to the situation.',
    resourceHeading: 'Quick start templates',
    resourceHelp: 'Choose a reusable prefill to start the Intake.',
    standardSubtitle: 'Reusable prefills that apply instantly.',
    caseStudySubtitle: '',
    canApply: true,
    canSaveCurrent: true,
    teachingOnly: false
  }),
  // TEMPORARY Standalone transition policy (see module docblock).
  standaloneWithCaseStudies: Object.freeze({
    role: EXPERIENCE_ROLE_IDS.STANDALONE,
    allowedKinds: Object.freeze([TEMPLATE_KINDS.STANDARD, TEMPLATE_KINDS.CASE_STUDY]),
    launcherLabel: 'Templates & Case Studies',
    drawerTitle: 'Templates & Case Studies',
    drawerSubtitle: 'Start from a reusable Template, or practise a Case Study on your own.',
    resourceHeading: 'Templates and Case Studies',
    resourceHelp: 'Templates apply immediately. Case Studies need the mode password your instructor provides.',
    standardSubtitle: 'Reusable prefills that apply instantly.',
    caseStudySubtitle: 'Practice cases with guided unlocks.',
    canApply: true,
    canSaveCurrent: true,
    teachingOnly: false
  }),
  [EXPERIENCE_ROLE_IDS.STUDENT]: Object.freeze({
    role: EXPERIENCE_ROLE_IDS.STUDENT,
    allowedKinds: Object.freeze([TEMPLATE_KINDS.STANDARD, TEMPLATE_KINDS.CASE_STUDY]),
    launcherLabel: 'Templates & Case Studies',
    drawerTitle: 'Learning Resources',
    drawerSubtitle: 'Use reusable Templates or instructor-led Case Studies for guided practice.',
    resourceHeading: 'Templates and Case Studies',
    resourceHelp: 'Templates apply immediately. Case Studies retain their instructor-provided mode password.',
    standardSubtitle: 'Reusable prefills that apply instantly.',
    caseStudySubtitle: 'Instructor-led practice cases with guided unlocks.',
    canApply: true,
    canSaveCurrent: true,
    teachingOnly: false
  }),
  [EXPERIENCE_ROLE_IDS.INSTRUCTOR]: Object.freeze({
    role: EXPERIENCE_ROLE_IDS.INSTRUCTOR,
    allowedKinds: Object.freeze([TEMPLATE_KINDS.CASE_STUDY]),
    launcherLabel: 'Teaching Case Studies',
    drawerTitle: 'Teaching Case Studies',
    drawerSubtitle: 'Review the Case Studies available for classroom assignment.',
    resourceHeading: 'Case Studies',
    resourceHelp: 'These are teaching resources. To give one to Students, use Case Study for workspaces in Live class management.',
    standardSubtitle: '',
    caseStudySubtitle: 'Teaching cases prepared for guided classroom work.',
    canApply: false,
    canSaveCurrent: false,
    teachingOnly: true
  })
});

/**
 * Resolve the resource policy for an experience role.
 *
 * Unknown/unselected contexts fall back to Standalone's least-privileged
 * visibility so Case Studies never appear merely because role state is absent.
 *
 * @param {unknown} role - Candidate experience role.
 * @param {{standaloneCaseStudies?: boolean}} [options] - `standaloneCaseStudies` is true while the public manifest carries the temporary Standalone Case Studies.
 * @returns {Readonly<{
 *   role:string,
 *   allowedKinds:ReadonlyArray<string>,
 *   launcherLabel:string,
 *   drawerTitle:string,
 *   drawerSubtitle:string,
 *   resourceHeading:string,
 *   resourceHelp:string,
 *   standardSubtitle:string,
 *   caseStudySubtitle:string,
 *   canApply:boolean,
 *   canSaveCurrent:boolean,
 *   teachingOnly:boolean
 * }>} Resource policy.
 */
export function getTemplateResourcePolicy(role, { standaloneCaseStudies = false } = {}) {
  const normalized = normalizeExperienceRole(role);
  const policy = POLICIES[normalized] || POLICIES[EXPERIENCE_ROLE_IDS.STANDALONE];
  if (standaloneCaseStudies && policy.role === EXPERIENCE_ROLE_IDS.STANDALONE) {
    return POLICIES.standaloneWithCaseStudies;
  }
  return policy;
}

/**
 * Test whether a template kind is visible in an experience.
 *
 * @param {unknown} role - Candidate experience role.
 * @param {unknown} templateKind - Candidate template kind.
 * @param {{standaloneCaseStudies?: boolean}} [options] - See {@link getTemplateResourcePolicy}.
 * @returns {boolean} Whether normal UI may expose the kind.
 */
export function isTemplateKindAvailableForExperience(role, templateKind, options = {}) {
  const policy = getTemplateResourcePolicy(role, options);
  const normalizedKind = normalizeTemplateKind(templateKind);
  return policy.allowedKinds.includes(normalizedKind);
}

/**
 * Filter existing template metadata through the role policy without cloning or
 * maintaining a second registry.
 *
 * @template T
 * @param {unknown} role - Candidate experience role.
 * @param {T[]} templates - Existing template metadata list.
 * @param {{standaloneCaseStudies?: boolean}} [options] - See {@link getTemplateResourcePolicy}.
 * @returns {T[]} Templates available through normal UI for the role.
 */
export function filterTemplatesForExperience(role, templates, options = {}) {
  if (!Array.isArray(templates)) {
    return [];
  }
  return templates.filter(template => (
    template
    && typeof template === 'object'
    && isTemplateKindAvailableForExperience(role, template.templateKind, options)
  ));
}

/**
 * Determine whether a resource may be applied into the user's working Intake.
 *
 * Instructor resources are deliberately teaching-only in this slice even
 * though their Case Study payloads still exist client-side.
 *
 * @param {unknown} role - Candidate experience role.
 * @param {unknown} templateKind - Candidate template kind.
 * @param {{standaloneCaseStudies?: boolean}} [options] - See {@link getTemplateResourcePolicy}.
 * @returns {boolean} Whether the drawer may apply the resource.
 */
export function canApplyTemplateForExperience(role, templateKind, options = {}) {
  const policy = getTemplateResourcePolicy(role, options);
  return policy.canApply && isTemplateKindAvailableForExperience(role, templateKind, options);
}
