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
    description: 'Extends the KT table with causes and a partially completed steps list.'
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
    includeActions: false,
    tableFields: Object.freeze({ is: false, no: false, di: false, ch: false })
  }),
  [TEMPLATE_MODE_IDS.IS_IS_NOT]: Object.freeze({
    includeTable: true,
    includeCauses: false,
    includeSteps: false,
    includeActions: false,
    tableFields: Object.freeze({ is: true, no: true, di: false, ch: false })
  }),
  [TEMPLATE_MODE_IDS.DC]: Object.freeze({
    includeTable: true,
    includeCauses: true,
    includeSteps: true,
    includeActions: false,
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
