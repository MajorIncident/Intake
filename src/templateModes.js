/**
 * @module templateModes
 * @summary Enumerates the supported template presentation modes used by the drawer UI.
 * @description
 *   Exports the canonical identifiers, display metadata, and visibility rules for
 *   every curated template mode. The constants are consumed both by the runtime
 *   selector helpers and the build tooling that validates template manifests.
 */

/**
 * Immutable identifiers for the template presentation modes.
 * @type {Readonly<{ INTAKE: 'intake', IS_IS_NOT: 'is-is-not', DC: 'dc', FULL: 'full' }>}
 */
export const TEMPLATE_MODE_IDS = Object.freeze({
  INTAKE: 'intake',
  IS_IS_NOT: 'is-is-not',
  DC: 'dc',
  FULL: 'full'
});

/**
 * Human-friendly definitions for the available template modes.
 * @type {ReadonlyArray<{ id: keyof typeof TEMPLATE_MODE_IDS, name: string, description: string }>}
 */
export const TEMPLATE_MODES = Object.freeze([
  {
    id: TEMPLATE_MODE_IDS.INTAKE,
    name: 'Intake',
    description: 'Prefills the preface, impact, and comms scaffolding only.'
  },
  {
    id: TEMPLATE_MODE_IDS.IS_IS_NOT,
    name: 'IS / IS NOT',
    description: 'Adds representative KT table entries to the intake view.'
  },
  {
    id: TEMPLATE_MODE_IDS.DC,
    name: 'D&C',
    description: 'Extends the KT table with distinctions/changes plus a partially completed steps list.'
  },
  {
    id: TEMPLATE_MODE_IDS.FULL,
    name: 'Full',
    description: 'Includes actions plus every other section for an end-to-end walkthrough.'
  }
]);

/**
 * Visibility rules for each template mode that drive how payloads are projected.
 * @type {Readonly<Record<keyof typeof TEMPLATE_MODE_IDS, {
 *   includeTable: boolean,
 *   includeCauses: boolean,
 *   includeSteps: boolean,
 *   includeActions: boolean,
 *   tableFields?: Readonly<{ is: boolean, no: boolean, di: boolean, ch: boolean }>
 * }>>}
 */
export const MODE_RULES = Object.freeze({
  [TEMPLATE_MODE_IDS.INTAKE]: Object.freeze({
    includeTable: false,
    includeCauses: false,
    includeSteps: false,
    includeActions: true,
    tableFields: Object.freeze({ is: false, no: false, di: false, ch: false })
  }),
  [TEMPLATE_MODE_IDS.IS_IS_NOT]: Object.freeze({
    includeTable: true,
    includeCauses: false,
    includeSteps: false,
    includeActions: true,
    tableFields: Object.freeze({ is: true, no: true, di: false, ch: false })
  }),
  [TEMPLATE_MODE_IDS.DC]: Object.freeze({
    includeTable: true,
    includeCauses: false,
    includeSteps: true,
    includeActions: true,
    tableFields: Object.freeze({ is: true, no: true, di: true, ch: true })
  }),
  [TEMPLATE_MODE_IDS.FULL]: Object.freeze({
    includeTable: true,
    includeCauses: true,
    includeSteps: true,
    includeActions: true,
    tableFields: Object.freeze({ is: true, no: true, di: true, ch: true })
  })
});

/**
 * Builds the pedagogical Case Study mode password for a moment in time:
 * the mode key without hyphens followed by the two-digit minute (for example
 * `isisnot07`). It is a classroom pacing device, not authentication; the
 * Instructor sees it in the Case Study assignment panel (#343).
 * @param {string} modeId - Template mode identifier.
 * @param {Date} [date] - Moment to evaluate (defaults to now).
 * @returns {string} Password, or an empty string for an unknown mode.
 */
export function templateModePassword(modeId, date = new Date()) {
  if (typeof modeId !== 'string' || !Object.prototype.hasOwnProperty.call(MODE_RULES, modeId)) return '';
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${modeId.replace(/-/g, '')}${minutes}`;
}
