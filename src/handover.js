/**
 * @module handover
 * @summary Coordinates state collection and hydration for the Handover card inputs.
 * @description
 *   Provides helpers that translate the Handover card's textareas into a persisted
 *   shape and reapply saved values. This keeps the card aligned with the broader
 *   app state lifecycle so restore, export, and Start Fresh flows remain in sync.
 */

import { HANDOVER_SECTIONS, mountHandoverCard } from '../components/handover/HandoverCard.js';

/**
 * Locate the Handover textareas keyed by section identifier.
 *
 * @param {ParentNode} [root=document] - Root node to search for Handover inputs.
 * @returns {Map<string, HTMLTextAreaElement>} Lookup map keyed by section identifier.
 */
function getSectionInputs(root = document) {
  return new Map(
    HANDOVER_SECTIONS.map(section => [
      section.id,
      root.querySelector(`.handover-input[data-section="${section.id}"]`)
    ])
  );
}

/**
 * Capture the current Handover notes keyed by section identifier.
 *
 * @param {ParentNode} [root=document] - Root node containing the Handover card.
 * @returns {Record<string, string>} Serialized handover notes keyed by section id.
 */
export function collectHandoverState(root = document) {
  const inputs = getSectionInputs(root);
  const snapshot = {};
  inputs.forEach((textarea, id) => {
    snapshot[id] = textarea && typeof textarea.value === 'string' ? textarea.value : '';
  });
  return snapshot;
}

/**
 * Apply persisted Handover notes into the UI, clearing sections that lack values.
 *
 * @param {Record<string, string>} [state={}] - Persisted notes keyed by section id.
 * @param {ParentNode} [root=document] - Root node containing the Handover card.
 * @returns {void}
 */
export function applyHandoverState(state = {}, root = document) {
  if (!state || typeof state !== 'object') {
    return;
  }

  const inputs = getSectionInputs(root);

  inputs.forEach((textarea, id) => {
    if (!textarea) return;

    const nextValue = typeof state[id] === 'string' ? state[id] : '';
    textarea.value = nextValue;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Mount the Handover card and wire optional persistence hooks.
 *
 * @param {HTMLElement} hostEl - Host element that will receive the rendered card.
 * @param {{onChange?: () => void}} [options] - Optional callbacks for edit events.
 * @returns {void}
 */
export function initHandover(hostEl, { onChange } = {}) {
  mountHandoverCard(hostEl, { onChange });
}

export { HANDOVER_SECTIONS };
