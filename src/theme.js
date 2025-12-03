/**
 * @module theme
 * @summary Manages the intake appearance preference and syncs it with the DOM.
 * @description
 *   Provides helpers to normalize theme values, apply them to the document, and
 *   persist the choice in localStorage while notifying listeners of changes.
 */

const THEME_STORAGE_KEY = 'kt-intake-theme';
const DARK = 'dark';
const LIGHT = 'light';

/**
 * Normalize a theme string to one of the supported values.
 *
 * @param {string} theme - Candidate theme value.
 * @returns {'dark'|'light'} A recognized theme token.
 */
export function normalizeTheme(theme) {
  return theme === DARK ? DARK : LIGHT;
}

/**
 * Read the stored theme preference or fallback to the system setting.
 *
 * @returns {'dark'|'light'} The preferred theme token.
 */
export function getStoredTheme() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && typeof stored === 'string') {
      return normalizeTheme(stored.trim().toLowerCase());
    }
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return DARK;
  }
  return LIGHT;
}

/**
 * Determine the currently active theme preference.
 *
 * @returns {'dark'|'light'} The active theme token.
 */
export function getThemePreference() {
  const bodyTheme = typeof document !== 'undefined' && document.body
    ? document.body.dataset.theme
    : '';
  if (bodyTheme) {
    return normalizeTheme(bodyTheme);
  }
  return getStoredTheme();
}

/**
 * Apply the provided theme to the document and persist it.
 *
 * @param {string} theme - Desired theme token.
 * @returns {'dark'|'light'} The normalized theme that was applied.
 */
export function applyThemePreference(theme) {
  const normalized = normalizeTheme(theme);
  const body = typeof document !== 'undefined' ? document.body : null;
  if (body) {
    body.dataset.theme = normalized;
    body.classList.toggle('theme-dark', normalized === DARK);
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (_error) {
      // ignore storage errors in restricted environments
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('intake:theme-changed', { detail: { theme: normalized } }));
    } catch (_error) {
      // ignore dispatch errors when CustomEvent is unavailable
    }
  }
  return normalized;
}

/**
 * Initialize the document theme from storage or system preference.
 *
 * @returns {'dark'|'light'} The applied theme token.
 */
export function initThemeFromStorage() {
  const preferred = getStoredTheme();
  return applyThemePreference(preferred);
}
