/**
 * @file Intake-mode caption application for visible non-KT fields.
 * @module captionLayer
 * Applies labels, helper text, subtitles, and placeholders for preface and impact fields using stable DOM IDs.
 * Manages the `#oneLine`, `#proof`, `#objectPrefill`, `#healthy`, `#now`, `#impactNow`, `#impactFuture`, and `#impactTime` anchors without changing KT Problem Analysis prompts.
 */
import { DEFAULT_INTAKE_MODE, INTAKE_MODE_FIELD_CAPTIONS } from './intakeModes.js';

const CAPTION_FIELD_IDS = ['oneLine', 'proof', 'objectPrefill', 'healthy', 'now', 'impactNow', 'impactFuture', 'impactTime'];
const SECTION_TITLE_SELECTORS = {
  oneLine: '#problem-summary > h3',
  proof: '#evidence-objects > h3',
  objectPrefill: '#evidence-objects > h3',
  healthy: '#baseline-current > h3',
  now: '#baseline-current > h3',
  impactNow: '#impactNowHeading',
  impactFuture: '#impactFutureHeading',
  impactTime: '#impactTimeHeading'
};

let activeCaptionMode = DEFAULT_INTAKE_MODE;
let activeObjectText = '';

/**
 * Replaces supported caption tokens with the latest field-aware context.
 * @param {string} value - Caption text that may include `{object}`.
 * @param {{ objectText?: string }} [context] - Current caption context.
 * @returns {string} Caption text ready for DOM insertion.
 */
function interpolateCaption(value, { objectText = '' } = {}) {
  const object = objectText || 'this object';
  return String(value || '').replaceAll('{object}', object);
}

/**
 * Finds the visible or accessibility label associated with a stable field ID.
 * @param {string} fieldId - Stable textarea ID.
 * @returns {HTMLLabelElement | null} Matching label element, if mounted.
 */
function findFieldLabel(fieldId) {
  if (fieldId === 'healthy') return document.getElementById('labelHealthy');
  if (fieldId === 'now') return document.getElementById('labelNow');
  return document.querySelector(`label[for="${fieldId}"]`);
}

/**
 * Finds helper text immediately associated with a stable field ID.
 * @param {string} fieldId - Stable textarea ID.
 * @returns {HTMLElement | null} Helper element, if present.
 */
function findFieldHelper(fieldId) {
  const field = document.getElementById(fieldId);
  return field?.closest('.field')?.querySelector('small') || null;
}

/**
 * Applies caption copy for a single field to labels, helper text, subtitle, and placeholder surfaces.
 * @param {string} fieldId - Stable textarea ID.
 * @param {Readonly<{ label?: string, helper?: string, subtitle?: string, placeholder?: string }>} captions - Field caption bundle.
 * @param {{ objectText?: string }} context - Current caption context.
 * @returns {void}
 */
function applyFieldCaption(fieldId, captions, context) {
  const field = document.getElementById(fieldId);
  const label = findFieldLabel(fieldId);
  const helper = findFieldHelper(fieldId);
  const subtitle = document.querySelector(SECTION_TITLE_SELECTORS[fieldId] || '');

  if (label && captions.label) label.textContent = interpolateCaption(captions.label, context);
  if (helper && captions.helper) helper.textContent = interpolateCaption(captions.helper, context);
  if (subtitle && captions.subtitle) subtitle.textContent = interpolateCaption(captions.subtitle, context);
  if (field && typeof captions.placeholder === 'string') {
    field.setAttribute('placeholder', interpolateCaption(captions.placeholder, context));
  }
}

/**
 * Retrieves caption metadata for the currently active intake mode and field.
 * @param {string} fieldId - Stable textarea ID.
 * @returns {Readonly<{ label?: string, helper?: string, subtitle?: string, placeholder?: string }>} Caption bundle for the field.
 */
export function getActiveFieldCaptions(fieldId) {
  return INTAKE_MODE_FIELD_CAPTIONS[activeCaptionMode]?.[fieldId]
    || INTAKE_MODE_FIELD_CAPTIONS[DEFAULT_INTAKE_MODE]?.[fieldId]
    || {};
}

/**
 * Applies the visible non-KT caption layer for the requested intake mode.
 * @param {string} [mode=DEFAULT_INTAKE_MODE] - Intake mode whose captions should be applied.
 * @param {{ objectText?: string }} [context] - Dynamic field context for tokenized captions.
 * @returns {void}
 */
export function applyCaptionLayer(mode = activeCaptionMode, { objectText = activeObjectText } = {}) {
  activeCaptionMode = INTAKE_MODE_FIELD_CAPTIONS[mode] ? mode : DEFAULT_INTAKE_MODE;
  activeObjectText = objectText || '';
  const modeCaptions = INTAKE_MODE_FIELD_CAPTIONS[activeCaptionMode] || INTAKE_MODE_FIELD_CAPTIONS[DEFAULT_INTAKE_MODE];

  CAPTION_FIELD_IDS.forEach((fieldId) => {
    applyFieldCaption(fieldId, modeCaptions[fieldId] || {}, { objectText: activeObjectText });
  });
}
