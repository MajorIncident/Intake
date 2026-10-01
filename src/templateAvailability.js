/**
 * @module templateAvailability
 * @summary Defines role-aware availability and presentation semantics for Templates and Case Studies.
 * @description
 *   Resource kind remains independent from experience role. This module is the
 *   policy bridge that decides which existing template kinds appear in each
 *   experience without duplicating the template registry or projection logic.
 *
 *   This is a visibility/usability policy only. Case Study payloads remain in
 *   the public client bundle until #295 moves protected content server-side.
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
    resourceHelp: 'These are teaching resources. Class assignment controls arrive with the classroom workspace layer.',
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
export function getTemplateResourcePolicy(role) {
  const normalized = normalizeExperienceRole(role);
  return POLICIES[normalized] || POLICIES[EXPERIENCE_ROLE_IDS.STANDALONE];
}

/**
 * Test whether a template kind is visible in an experience.
 *
 * @param {unknown} role - Candidate experience role.
 * @param {unknown} templateKind - Candidate template kind.
 * @returns {boolean} Whether normal UI may expose the kind.
 */
export function isTemplateKindAvailableForExperience(role, templateKind) {
  const policy = getTemplateResourcePolicy(role);
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
 * @returns {T[]} Templates available through normal UI for the role.
 */
export function filterTemplatesForExperience(role, templates) {
  if (!Array.isArray(templates)) {
    return [];
  }
  return templates.filter(template => (
    template
    && typeof template === 'object'
    && isTemplateKindAvailableForExperience(role, template.templateKind)
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
 * @returns {boolean} Whether the drawer may apply the resource.
 */
export function canApplyTemplateForExperience(role, templateKind) {
  const policy = getTemplateResourcePolicy(role);
  return policy.canApply && isTemplateKindAvailableForExperience(role, templateKind);
}
