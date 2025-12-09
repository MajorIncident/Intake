/**
 * @module handover
 * @summary Coordinates state collection and hydration for the Handover card inputs.
 * @description
 *   Provides helpers that translate the Handover card's textareas into a persisted
 *   shape and reapply saved values. This keeps the card aligned with the broader
 *   app state lifecycle so restore, export, and Start Fresh flows remain in sync.
 */

import { HANDOVER_SECTIONS, mountHandoverCard } from '../components/handover/HandoverCard.js';

let registeredAutoResize = null;

/**
 * Persist a provided autoResize helper so hydration can reuse it later.
 *
 * @param {(el: HTMLTextAreaElement) => void} [callback] - Resize function passed from the host module.
 * @returns {void}
 */
function setAutoResize(callback) {
  if (typeof callback === 'function') {
    registeredAutoResize = callback;
  }
}

/**
 * Resolve the active autoResize helper from the provided override or stored reference.
 *
 * @param {(el: HTMLTextAreaElement) => void} [callback] - Optional override supplied by the caller.
 * @returns {((el: HTMLTextAreaElement) => void)|null} Active resize callback or null when unavailable.
 */
function getAutoResize(callback) {
  if (typeof callback === 'function') {
    return callback;
  }
  return registeredAutoResize;
}

/**
 * Normalize a persisted handover entry into a list of trimmed note lines.
 *
 * @param {unknown} value - Persisted representation for a handover section.
 * @returns {string[]} Clean note items with whitespace removed.
 */
function normalizeHandoverItems(value) {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  return [];
}

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
 * @returns {Record<string, string[]>} Serialized handover notes keyed by section id.
 */
export function collectHandoverState(root = document) {
  const inputs = getSectionInputs(root);
  const snapshot = {};
  inputs.forEach((textarea, id) => {
    const value = textarea && typeof textarea.value === 'string' ? textarea.value : '';
    snapshot[id] = normalizeHandoverItems(value);
  });
  return snapshot;
}

/**
 * Apply persisted Handover notes into the UI, clearing sections that lack values.
 *
 * @param {Record<string, string[]|string>} [state={}] - Persisted notes keyed by section id.
 * @param {ParentNode} [root=document] - Root node containing the Handover card.
 * @param {{ autoResize?: (el: HTMLTextAreaElement) => void }} [options] - Optional resize callback for textarea hydration.
 * @returns {void}
 */
export function applyHandoverState(state = {}, root = document, { autoResize } = {}) {
  if (!state || typeof state !== 'object') {
    return;
  }

  const inputs = getSectionInputs(root);
  const resize = getAutoResize(autoResize);

  inputs.forEach((textarea, id) => {
    if (!textarea) return;

    const items = normalizeHandoverItems(state[id]);
    textarea.value = items.join('\n');

    if (typeof resize === 'function') {
      resize(textarea);
    }
  });
}

/**
 * Mount the Handover card and wire optional persistence hooks.
 *
 * @param {HTMLElement} hostEl - Host element that will receive the rendered card.
 * @param {{ onChange?: () => void, autoResize?: (el: HTMLTextAreaElement) => void }} [options] - Optional callbacks for edit events.
 * @returns {void}
 */
export function initHandover(hostEl, { onChange, autoResize } = {}) {
  setAutoResize(autoResize);
  mountHandoverCard(hostEl, { onChange, autoResize: getAutoResize(autoResize) });
}

export { HANDOVER_SECTIONS };
