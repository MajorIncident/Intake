/**
 * @module experienceRoleController
 * @summary Owns first-run experience selection, role resume, and declarative role-based surface visibility.
 * @description
 *   The controller manages the [feature:experience-role] chooser and broad
 *   `data-experience-surface` regions. Its local preference is intentionally
 *   separate from `kt-intake-full-v2` so role choice never enters Intake
 *   snapshots, file exports, summaries, or template payloads.
 */

import { STORAGE_KEY as INTAKE_STORAGE_KEY } from './storage.js';
import {
  LEGACY_DEFAULT_EXPERIENCE_ROLE,
  getExperienceRoleDefinition,
  isExperienceSurfaceVisible,
  normalizeExperienceRole
} from './experienceRoles.js';

/** Dedicated local-only role preference, never part of serialized Intake state. */
export const EXPERIENCE_ROLE_STORAGE_KEY = 'kt-experience-role-v1';
/** Current preference-envelope version. */
export const EXPERIENCE_ROLE_PREFERENCE_VERSION = 1;

const ROLE_CHANGED_EVENT = 'intake:experience-role-changed';

let activeExperienceRole = null;
let documentRef = null;
let windowRef = null;
let storageRef = null;
let locationRef = null;
let chooserRequired = false;
let chooserReturnFocus = null;

/**
 * Safely resolve the default browser localStorage object.
 *
 * @returns {Storage|null} Browser storage when available.
 */
function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Read and normalize the dedicated experience-role preference.
 *
 * Both the versioned JSON envelope and a legacy raw role string are accepted so
 * the preference can evolve without ever touching Intake-state migrations.
 *
 * @param {Storage|null} [storage=defaultStorage()] - Storage implementation to read.
 * @returns {string|null} Stored canonical role or null.
 */
export function readExperienceRolePreference(storage = defaultStorage()) {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(EXPERIENCE_ROLE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const direct = normalizeExperienceRole(raw);
    if (direct) {
      return direct;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return normalizeExperienceRole(parsed.role);
  } catch (_error) {
    return null;
  }
}

/**
 * Persist the selected role in its independent preference envelope.
 *
 * @param {unknown} role - Role to persist.
 * @param {Storage|null} [storage=defaultStorage()] - Storage implementation to write.
 * @returns {boolean} Whether the preference was written successfully.
 */
export function persistExperienceRolePreference(role, storage = defaultStorage()) {
  const normalized = normalizeExperienceRole(role);
  if (!normalized || !storage) {
    return false;
  }
  try {
    storage.setItem(EXPERIENCE_ROLE_STORAGE_KEY, JSON.stringify({
      version: EXPERIENCE_ROLE_PREFERENCE_VERSION,
      role: normalized
    }));
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Return the experience role currently applied to the mounted document.
 *
 * @returns {string|null} Active role, or null while first-run selection is required.
 */
export function getActiveExperienceRole() {
  return activeExperienceRole;
}

/**
 * Identify a legacy context that must continue directly into Standalone.
 *
 * Existing Intake snapshots and existing secret-link collaboration URLs predate
 * the role chooser. Auto-adopting Standalone keeps those users and links from
 * being interrupted by a new first-run gate.
 *
 * @returns {boolean} Whether backward-compatible Standalone migration is required.
 */
function hasLegacyStandaloneContext() {
  try {
    if (storageRef?.getItem(INTAKE_STORAGE_KEY)) {
      return true;
    }
  } catch (_error) {
    // Restricted storage should not prevent URL compatibility below.
  }

  try {
    const search = typeof locationRef?.search === 'string' ? locationRef.search : '';
    return new URLSearchParams(search).has('workspace');
  } catch (_error) {
    return false;
  }
}

/**
 * Set one role-controlled DOM region to its requested visibility state.
 *
 * @param {Element} element - Element carrying `data-experience-surface`.
 * @param {boolean} visible - Whether the surface should be available.
 * @returns {void}
 */
function setSurfaceVisibility(element, visible) {
  element.toggleAttribute('hidden', !visible);
  element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/**
 * Synchronize labels that expose the current product-level experience.
 *
 * @param {string|null} role - Active role.
 * @returns {void}
 */
function renderRoleLabels(role) {
  if (!documentRef) {
    return;
  }
  const definition = getExperienceRoleDefinition(role);
  const label = definition?.label || 'Choose experience';
  documentRef.querySelectorAll('[data-experience-role-label]').forEach((element) => {
    element.textContent = label;
  });
}

/**
 * Apply broad product-surface visibility for a role.
 *
 * @param {string} role - Canonical experience role.
 * @returns {void}
 */
function renderRoleSurfaces(role) {
  if (!documentRef) {
    return;
  }
  documentRef.querySelectorAll('[data-experience-surface]').forEach((element) => {
    const surface = element.getAttribute('data-experience-surface') || '';
    setSurfaceVisibility(element, isExperienceSurfaceVisible(role, surface));
  });
}

/**
 * Dispatch the role-change event used by later classroom slices.
 *
 * @param {string} role - Canonical role.
 * @returns {void}
 */
function dispatchRoleChange(role) {
  if (!windowRef || typeof windowRef.dispatchEvent !== 'function') {
    return;
  }
  try {
    windowRef.dispatchEvent(new windowRef.CustomEvent(ROLE_CHANGED_EVENT, {
      detail: { role }
    }));
  } catch (_error) {
    // Older/restricted browser contexts may not support CustomEvent construction.
  }
}

/**
 * Apply an experience role without modifying Intake state.
 *
 * @param {unknown} role - Requested role.
 * @param {object} [options] - Apply behavior.
 * @param {boolean} [options.persist=true] - Persist the independent role preference.
 * @param {boolean} [options.announce=true] - Dispatch the role-change event.
 * @returns {string|null} Applied canonical role or null when unsupported.
 */
export function applyExperienceRole(role, { persist = true, announce = true } = {}) {
  const normalized = normalizeExperienceRole(role);
  if (!normalized || !documentRef) {
    return null;
  }

  activeExperienceRole = normalized;
  documentRef.body.dataset.experienceRole = normalized;
  renderRoleLabels(normalized);
  renderRoleSurfaces(normalized);

  if (persist) {
    persistExperienceRolePreference(normalized, storageRef);
  }
  if (announce) {
    dispatchRoleChange(normalized);
  }

  return normalized;
}

/**
 * Return all focusable controls inside the role chooser.
 *
 * @returns {HTMLElement[]} Visible chooser controls.
 */
function chooserFocusables() {
  const chooser = documentRef?.getElementById('experienceRoleDialog');
  if (!chooser) {
    return [];
  }
  return [...chooser.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && !element.hasAttribute('disabled'));
}

function resolveReturnFocus(requested) {
  const hiddenBySelf = Boolean(requested?.hidden) || requested?.getAttribute?.('aria-hidden') === 'true';
  const hiddenByAncestor = Boolean(requested?.closest?.('[hidden], [aria-hidden="true"]'));
  if (requested && !hiddenBySelf && !hiddenByAncestor && typeof requested.focus === 'function') {
    return requested;
  }
  const viewTrigger = documentRef?.querySelector('[data-menu-target="viewMenu"]');
  return viewTrigger && typeof viewTrigger.focus === 'function' ? viewTrigger : null;
}

/**
 * Resolve a visible menubar trigger when the launcher lives inside a menu panel.
 *
 * @param {HTMLElement} button - Experience chooser launcher.
 * @returns {HTMLElement} Preferred focus origin.
 */
function getRoleSwitcherFocusOrigin(button) {
  const panel = button.closest?.('.menu-panel');
  const selector = panel?.id ? '[data-menu-target="' + panel.id + '"]' : '';
  const trigger = selector ? documentRef?.querySelector(selector) : null;
  return trigger || button;
}

/**
 * Focus the first role choice after the chooser becomes visible.
 *
 * @returns {void}
 */
function focusFirstChoice() {
  const target = documentRef?.querySelector('[data-experience-role-choice]');
  if (!target || typeof target.focus !== 'function') {
    return;
  }
  const schedule = typeof windowRef?.requestAnimationFrame === 'function'
    ? windowRef.requestAnimationFrame.bind(windowRef)
    : (callback) => callback();
  schedule(() => target.focus());
}

/**
 * Open the role chooser.
 *
 * @param {object} [options] - Chooser behavior.
 * @param {boolean} [options.required=false] - Whether the chooser may be dismissed without choosing.
 * @param {HTMLElement|null} [options.returnFocus=null] - Control to refocus after optional dismissal.
 * @returns {void}
 */
export function openExperienceRoleChooser({ required = false, returnFocus = null } = {}) {
  const gate = documentRef?.getElementById('experienceRoleGate');
  const cancel = documentRef?.getElementById('experienceRoleCancelBtn');
  if (!gate) {
    return;
  }

  chooserRequired = required;
  chooserReturnFocus = returnFocus || documentRef?.activeElement || null;
  gate.hidden = false;
  gate.setAttribute('aria-hidden', 'false');
  documentRef.body.classList.add('experience-role-gate-open');
  if (cancel) {
    cancel.hidden = required;
  }
  focusFirstChoice();
}

/**
 * Close the role chooser when dismissal is allowed or a role was selected.
 *
 * @param {object} [options] - Close behavior.
 * @param {boolean} [options.force=false] - Close even when first-run selection is required.
 * @returns {boolean} Whether the chooser closed.
 */
export function closeExperienceRoleChooser({ force = false } = {}) {
  const gate = documentRef?.getElementById('experienceRoleGate');
  if (!gate || (chooserRequired && !force)) {
    return false;
  }

  gate.hidden = true;
  gate.setAttribute('aria-hidden', 'true');
  documentRef.body.classList.remove('experience-role-gate-open');
  chooserRequired = false;

  const target = resolveReturnFocus(chooserReturnFocus);
  chooserReturnFocus = null;
  if (target) {
    target.focus();
  }
  return true;
}

/**
 * Keep keyboard focus inside the modal chooser and support Escape for optional switching.
 *
 * @param {KeyboardEvent} event - Document keyboard event.
 * @returns {void}
 */
function handleChooserKeydown(event) {
  const gate = documentRef?.getElementById('experienceRoleGate');
  if (!gate || gate.hidden) {
    return;
  }

  if (event.key === 'Escape') {
    if (!chooserRequired) {
      event.preventDefault();
      closeExperienceRoleChooser();
    }
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusables = chooserFocusables();
  if (!focusables.length) {
    return;
  }
  const currentIndex = focusables.indexOf(documentRef.activeElement);
  const lastIndex = focusables.length - 1;

  if (event.shiftKey && currentIndex <= 0) {
    event.preventDefault();
    focusables[lastIndex].focus();
  } else if (!event.shiftKey && currentIndex === lastIndex) {
    event.preventDefault();
    focusables[0].focus();
  }
}

/**
 * Bind one mounted chooser/menu DOM to role actions.
 *
 * @returns {void}
 */
function bindRoleControls() {
  documentRef.querySelectorAll('[data-experience-role-choice]').forEach((button) => {
    if (button.dataset.experienceRoleBound === 'true') {
      return;
    }
    button.dataset.experienceRoleBound = 'true';
    button.addEventListener('click', () => {
      const role = button.getAttribute('data-experience-role-choice');
      if (applyExperienceRole(role)) {
        closeExperienceRoleChooser({ force: true });
      }
    });
  });

  documentRef.querySelectorAll('[data-open-experience-role-chooser]').forEach((button) => {
    if (button.dataset.experienceRoleBound === 'true') {
      return;
    }
    button.dataset.experienceRoleBound = 'true';
    button.addEventListener('click', () => {
      openExperienceRoleChooser({
        required: false,
        returnFocus: getRoleSwitcherFocusOrigin(button)
      });
    });
  });

  const cancel = documentRef.getElementById('experienceRoleCancelBtn');
  if (cancel && cancel.dataset.experienceRoleBound !== 'true') {
    cancel.dataset.experienceRoleBound = 'true';
    cancel.addEventListener('click', () => closeExperienceRoleChooser());
  }

  if (documentRef.body.dataset.experienceRoleKeysBound !== 'true') {
    documentRef.body.dataset.experienceRoleKeysBound = 'true';
    documentRef.addEventListener('keydown', handleChooserKeydown);
  }
}

/**
 * Initialize experience-role resume and first-run selection.
 *
 * Existing Intake snapshots or existing secret collaboration links are migrated
 * silently to Standalone. A genuinely new context receives the required chooser.
 *
 * @param {object} [options] - Dependency overrides for tests or embedded contexts.
 * @param {Document} [options.documentRef=document] - Mounted document.
 * @param {Window} [options.windowRef=window] - Mounted window.
 * @param {Storage|null} [options.storage=localStorage] - Local preference storage.
 * @param {Location|{search:string}} [options.location=window.location] - Current location.
 * @returns {string|null} Resumed/applied role, or null while first-run choice is pending.
 */
export function initExperienceRoleController({
  documentRef: nextDocument = typeof document !== 'undefined' ? document : null,
  windowRef: nextWindow = typeof window !== 'undefined' ? window : null,
  storage = defaultStorage(),
  location = nextWindow?.location || null
} = {}) {
  documentRef = nextDocument;
  windowRef = nextWindow;
  storageRef = storage;
  locationRef = location;
  chooserRequired = false;
  chooserReturnFocus = null;

  if (!documentRef?.body) {
    return null;
  }

  bindRoleControls();

  const storedRole = readExperienceRolePreference(storageRef);
  if (storedRole) {
    applyExperienceRole(storedRole, { persist: false, announce: false });
    closeExperienceRoleChooser({ force: true });
    return storedRole;
  }

  if (hasLegacyStandaloneContext()) {
    const migratedRole = applyExperienceRole(LEGACY_DEFAULT_EXPERIENCE_ROLE, {
      persist: true,
      announce: false
    });
    closeExperienceRoleChooser({ force: true });
    return migratedRole;
  }

  activeExperienceRole = null;
  documentRef.body.dataset.experienceRole = 'unselected';
  renderRoleLabels(null);
  openExperienceRoleChooser({ required: true });
  return null;
}
