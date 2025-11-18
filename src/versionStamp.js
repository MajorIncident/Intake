/**
 * Footer metadata presenter responsible for rendering the current version and
 * build stamp beneath the global copyright notice.
 *
 * Anchors: updates the text content of the `#footerVersionMeta` element located
 * in `index.html`.
 * @module versionStamp
 */

const FOOTER_VERSION_SELECTOR = '#footerVersionMeta';
const DEFAULT_VERSION_LABEL = 'dev';

/**
 * Initialize the footer build stamp by reading data attributes and document
 * metadata, then formatting a friendly status line.
 * @param {Object} [options] - Optional dependencies primarily used for tests.
 * @param {Document} [options.doc=document] - Document reference for DOM access.
 * @param {Element|null} [options.target] - Explicit target element override.
 * @returns {void}
 */
export function initVersionStamp({ doc = document, target } = {}) {
  const resolvedTarget = target ?? doc.querySelector(FOOTER_VERSION_SELECTOR);
  if (!resolvedTarget) {
    return;
  }

  const { appVersion = '', buildLabel = '', buildDate = '' } = doc.body?.dataset ?? {};
  const versionLabel = (appVersion || DEFAULT_VERSION_LABEL).trim() || DEFAULT_VERSION_LABEL;
  const stamp = buildLabel.trim() || formatBuildDate(buildDate, doc.lastModified);
  resolvedTarget.textContent = stamp ? `Version ${versionLabel} • ${stamp}` : `Version ${versionLabel}`;
}

/**
 * Convert the provided build date string into a human friendly label.
 * @param {string} explicitDate - Optional ISO-like date string from data attributes.
 * @param {string} lastModified - Fallback last-modified timestamp from the document.
 * @returns {string} A localized build date label or an empty string when parsing fails.
 */
function formatBuildDate(explicitDate, lastModified) {
  const source = explicitDate?.trim() || lastModified;
  if (!source) {
    return '';
  }
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  try {
    return `Built ${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(parsed)}`;
  } catch (error) {
    console.debug('[versionStamp:formatBuildDate]', error);
    return `Built ${parsed.toLocaleString()}`;
  }
}
