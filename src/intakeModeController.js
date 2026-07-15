/**
 * @module intakeModeController
 * @summary Applies intake-mode visibility rules to mounted DOM sections.
 * @description
 *   Owns the header mode selector (`#intakeModeSelect`) and every element marked
 *   with `data-mode-section`. It keeps hidden fields mounted for storage and
 *   import compatibility while progressively hiding Major Incident-only regions
 *   such as communications, steps, bridge activation, handover, and containment.
 */

import {
  DEFAULT_INTAKE_MODE,
  INTAKE_MODE_IDS,
  INTAKE_MODE_SECTION_VISIBILITY
} from './intakeModes.js';

const MODE_CHANGE_EVENT = 'intake:mode-changed';
const VALID_MODE_IDS = new Set(Object.values(INTAKE_MODE_IDS));
let activeIntakeMode = DEFAULT_INTAKE_MODE;
let modeSelect = null;
let onModeChange = null;

/**
 * Normalize a candidate mode token to a supported mode ID.
 *
 * @param {unknown} mode - Candidate mode value from state, selector, or callers.
 * @returns {string} Supported mode ID, defaulting to Major Incident Management.
 */
function normalizeIntakeMode(mode) {
  const candidate = typeof mode === 'string' ? mode.trim() : '';
  return VALID_MODE_IDS.has(candidate) ? candidate : DEFAULT_INTAKE_MODE;
}

/**
 * Toggle a mode-controlled DOM region without unmounting its fields.
 *
 * @param {Element} element - DOM element marked with `data-mode-section`.
 * @param {boolean} shouldShow - Whether the section should be visible.
 * @returns {void}
 */
function setSectionVisibility(element, shouldShow) {
  element.toggleAttribute('hidden', !shouldShow);
  element.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
}

/**
 * Resolve the current mode from app-state-like payloads or the selector.
 *
 * @param {Partial<import('./storage.js').SerializedAppState>} [state] - Optional state snapshot.
 * @returns {string} Supported active intake mode ID.
 */
function resolveModeFromState(state) {
  return normalizeIntakeMode(
    state?.meta?.intakeMode
      ?? state?.intakeMode
      ?? activeIntakeMode
      ?? DEFAULT_INTAKE_MODE
  );
}

/**
 * Retrieve the currently active intake mode.
 *
 * @returns {string} Supported active intake mode ID.
 */
export function getActiveIntakeMode() {
  return activeIntakeMode;
}

/**
 * Apply an intake mode to all `data-mode-section` DOM regions.
 *
 * @param {string} [mode=DEFAULT_INTAKE_MODE] - Requested intake mode ID.
 * @param {Object} [options] - Optional apply settings.
 * @param {boolean} [options.silent=false] - Avoid dispatching change events and save callbacks.
 * @returns {string} The normalized mode that was applied.
 */
export function applyIntakeMode(mode = DEFAULT_INTAKE_MODE, { silent = false } = {}) {
  const normalizedMode = normalizeIntakeMode(mode);
  const visibility = INTAKE_MODE_SECTION_VISIBILITY[normalizedMode]
    || INTAKE_MODE_SECTION_VISIBILITY[DEFAULT_INTAKE_MODE];

  activeIntakeMode = normalizedMode;
  if (modeSelect && modeSelect.value !== normalizedMode) {
    modeSelect.value = normalizedMode;
  }

  document.querySelectorAll('[data-mode-section]').forEach((element) => {
    const sectionKey = element.getAttribute('data-mode-section');
    const shouldShow = sectionKey && Object.prototype.hasOwnProperty.call(visibility, sectionKey)
      ? visibility[sectionKey]
      : true;
    setSectionVisibility(element, !!shouldShow);
  });

  if (!silent) {
    if (typeof onModeChange === 'function') {
      onModeChange(normalizedMode);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(MODE_CHANGE_EVENT, { detail: { mode: normalizedMode } }));
    }
  }

  return normalizedMode;
}

/**
 * Initialize the mode selector and apply the restored or default mode.
 *
 * @param {Object} [options] - Optional initialization settings.
 * @param {Partial<import('./storage.js').SerializedAppState>} [options.state] - State snapshot to read first.
 * @param {(mode: string) => void} [options.onChange] - Callback invoked when users change mode.
 * @returns {string} The mode applied during initialization.
 */
export function initIntakeModeController({ state = null, onChange = null } = {}) {
  modeSelect = document.getElementById('intakeModeSelect');
  onModeChange = onChange;

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      applyIntakeMode(modeSelect.value);
    });
  }

  return applyIntakeMode(resolveModeFromState(state), { silent: true });
}
