/**
 * Communications drawer controller responsible for persistence and focus safety.
 *
 * The module exposes helpers to initialise and toggle the drawer UI while storing the
 * open state in `localStorage` so it survives page refreshes. When the drawer is
 * active, focus is trapped inside the panel and restored to the previously active
 * control when closed to maintain accessibility.
 *
 * @module commsDrawer
 */

/**
 * Local storage key used to persist the communications drawer visibility state.
 * @type {string}
 */
export const COMMS_DRAWER_STORAGE_KEY = 'comms.drawerOpen';

const STORAGE_KEY = COMMS_DRAWER_STORAGE_KEY;

let commsBtn = null;
let commsDrawer = null;
let commsBackdrop = null;
let commsCloseBtn = null;
let commsDrawerOpen = false;
let commsDrawerReady = false;
let commsReturnFocus = null;

function parseStoredBoolean(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'boolean' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function loadStoredDrawerState() {
  try {
    return parseStoredBoolean(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    return null;
  }
}

function saveDrawerState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(!!commsDrawerOpen));
  } catch (_error) {
    /* ignore storage errors */
  }
}

function getDrawerFocusables() {
  if (!commsDrawer) return [];
  const nodes = commsDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  return [...nodes].filter(el => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function focusFirstElement() {
  const focusables = getDrawerFocusables();
  const target = focusables.length ? focusables[0] : commsCloseBtn || commsDrawer;
  if (target && typeof target.focus === 'function') {
    requestAnimationFrame(() => target.focus());
  }
}

function restoreFocus() {
  const target = commsReturnFocus && typeof commsReturnFocus.focus === 'function'
    ? commsReturnFocus
    : commsBtn;
  commsReturnFocus = null;
  if (target && typeof target.focus === 'function') {
    requestAnimationFrame(() => target.focus());
  }
}

/**
 * Keep keyboard focus constrained within the open drawer.
 *
 * @param {KeyboardEvent} event - The keydown event emitted from the drawer container.
 * @returns {void}
 */
function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const focusables = getDrawerFocusables();
  if (!focusables.length) {
    event.preventDefault();
    if (commsCloseBtn && typeof commsCloseBtn.focus === 'function') {
      commsCloseBtn.focus();
    }
    return;
  }
  const currentIndex = focusables.indexOf(document.activeElement);
  if (event.shiftKey) {
    if (currentIndex <= 0) {
      event.preventDefault();
      focusables[focusables.length - 1].focus();
    }
  } else if (currentIndex === focusables.length - 1) {
    event.preventDefault();
    focusables[0].focus();
  }
}

/**
 * Capture the element that should regain focus after the drawer closes.
 *
 * @returns {void}
 */
function rememberReturnFocus() {
  const active = document.activeElement;
  if (active && commsDrawer && commsDrawer.contains(active)) {
    commsReturnFocus = commsBtn;
    return;
  }
  if (active && typeof active.focus === 'function' && active !== document.body) {
    commsReturnFocus = active;
  } else {
    commsReturnFocus = commsBtn;
  }
}

function setCommsDrawer(open, { skipFocus = false, skipSave = false } = {}) {
  if (!commsDrawerReady) return;
  const shouldOpen = !!open;
  if (shouldOpen === commsDrawerOpen) {
    if (!skipSave) {
      saveDrawerState();
    }
    return;
  }
  commsDrawerOpen = shouldOpen;
  if (commsDrawer) {
    commsDrawer.classList.toggle('is-open', shouldOpen);
    commsDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (commsBackdrop) {
    commsBackdrop.classList.toggle('is-open', shouldOpen);
    commsBackdrop.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (commsBtn) {
    commsBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
  document.body.classList.toggle('comms-drawer-open', shouldOpen);

  if (shouldOpen) {
    if (!skipFocus) {
      focusFirstElement();
    }
  } else {
    if (!skipFocus) {
      restoreFocus();
    } else {
      commsReturnFocus = null;
    }
  }

  if (!skipSave) {
    saveDrawerState();
  }
}

function handleDrawerKeydown(event) {
  if (!commsDrawerOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCommsDrawer();
    return;
  }
  trapFocus(event);
}

function handleGlobalKeydown(event) {
  if (!commsDrawerReady || event.defaultPrevented) return;
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (event.altKey && !event.ctrlKey && !event.metaKey && key === 'c') {
    event.preventDefault();
    toggleCommsDrawer();
    return;
  }
  if (key === 'escape' && commsDrawerOpen) {
    event.preventDefault();
    closeCommsDrawer();
  }
}

/**
 * Prepare the communications drawer by wiring DOM references, listeners, and stored state.
 *
 * @returns {void}
 */
export function initCommsDrawer() {
  if (commsDrawerReady) return;
  commsBtn = document.getElementById('commsBtn');
  commsDrawer = document.getElementById('commsDrawer');
  commsBackdrop = document.getElementById('commsBackdrop');
  commsCloseBtn = document.getElementById('commsCloseBtn');
  commsDrawerReady = !!commsDrawer;
  if (!commsDrawerReady) {
    return;
  }
  if (commsBtn) {
    commsBtn.setAttribute('aria-expanded', 'false');
  }
  if (commsDrawer) {
    commsDrawer.setAttribute('aria-hidden', 'true');
    commsDrawer.addEventListener('keydown', handleDrawerKeydown);
  }
  if (commsBackdrop) {
    commsBackdrop.setAttribute('aria-hidden', 'true');
  }
  const storedState = loadStoredDrawerState();
  if (typeof storedState === 'boolean') {
    commsReturnFocus = commsBtn;
    setCommsDrawer(storedState, { skipFocus: true, skipSave: true });
  }
  document.addEventListener('keydown', handleGlobalKeydown);
}

/**
 * Open the communications drawer and record where focus should return.
 *
 * @returns {void}
 */
export function openCommsDrawer() {
  if (!commsDrawerReady) return;
  if (!commsDrawerOpen) {
    rememberReturnFocus();
  }
  setCommsDrawer(true);
}

/**
 * Close the communications drawer and restore focus when appropriate.
 *
 * @returns {void}
 */
export function closeCommsDrawer() {
  if (!commsDrawerReady) return;
  setCommsDrawer(false);
}

/**
 * Toggle the communications drawer, capturing focus when transitioning from closed.
 *
 * @returns {void}
 */
export function toggleCommsDrawer() {
  if (!commsDrawerReady) return;
  if (!commsDrawerOpen) {
    rememberReturnFocus();
  }
  setCommsDrawer(!commsDrawerOpen);
}
