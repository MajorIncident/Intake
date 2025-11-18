/**
 * @fileoverview Shared helpers for installing and restoring jsdom-powered globals.
 *
 * Provides utilities for DOM integration suites to mirror jsdom's window
 * objects onto the Node.js runtime without mutating the original navigator
 * descriptor (required for Node 22+).
 */
const GLOBAL_KEYS = [
  'window',
  'document',
  'CustomEvent',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'HTMLElement'
];

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function snapshotKey(key) {
  return {
    hadKey: Object.prototype.hasOwnProperty.call(globalThis, key),
    value: globalThis[key]
  };
}

/**
 * Installs jsdom globals on the Node.js runtime.
 *
 * @param {Window} window - The jsdom window instance to mirror on globalThis.
 * @returns {object} Snapshot of the previous global values for restoration.
 */
export function installJsdomGlobals(window) {
  if (!window) {
    throw new Error('installJsdomGlobals requires a window instance');
  }

  const snapshot = {
    entries: {},
    navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator') || originalNavigatorDescriptor
  };

  for (const key of GLOBAL_KEYS) {
    snapshot.entries[key] = snapshotKey(key);
    if (key in window) {
      globalThis[key] = window[key];
    } else if (snapshot.entries[key].hadKey) {
      delete globalThis[key];
    }
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    get: () => window.navigator
  });

  return snapshot;
}

/**
 * Restores the globals that were replaced by installJsdomGlobals.
 *
 * @param {object} snapshot - The object returned by installJsdomGlobals.
 */
export function restoreJsdomGlobals(snapshot = null) {
  if (!snapshot) return;

  for (const key of GLOBAL_KEYS) {
    const record = snapshot.entries?.[key];
    if (!record) continue;

    if (record.hadKey) {
      globalThis[key] = record.value;
    } else {
      delete globalThis[key];
    }
  }

  const descriptor = snapshot.navigatorDescriptor || originalNavigatorDescriptor;
  if (descriptor) {
    Object.defineProperty(globalThis, 'navigator', descriptor);
  } else {
    delete globalThis.navigator;
  }
}
