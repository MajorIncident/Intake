/**
 * @module templateKinds
 * @summary Enumerates the supported template categories used to control drawer authentication.
 * @description
 *   Template metadata declares whether a template is a "case study" (password
 *   protected, multi-mode) or "standard" (no password, always full mode).
 *   Both the runtime drawer and build tooling share this constant so template
 *   JSON files stay in sync with the app behaviour.
 */

/** @type {{ CASE_STUDY: 'case-study', STANDARD: 'standard' }} */
export const TEMPLATE_KINDS = Object.freeze({
  CASE_STUDY: 'case-study',
  STANDARD: 'standard'
});

/**
 * Normalise arbitrary template kind strings to a supported category.
 *
 * @param {unknown} value - Raw template kind supplied by JSON or user input.
 * @returns {keyof typeof TEMPLATE_KINDS} Canonical template kind identifier.
 */
export function normalizeTemplateKind(value) {
  if (value === TEMPLATE_KINDS.STANDARD) {
    return TEMPLATE_KINDS.STANDARD;
  }
  return TEMPLATE_KINDS.CASE_STUDY;
}
