/**
 * @module classroomJoinLink
 * @summary Owns the client-only Classroom join-link contract.
 * @description
 *   Join links carry only the human class code in the URL fragment. They never
 *   contain Instructor, Student-session, assignment, or workspace bearer
 *   capabilities. The fragment is consumed client-side and removed with
 *   history.replaceState so normal requests/referrers never receive the code.
 */

export const CLASSROOM_JOIN_FRAGMENT_KEY = 'join';

const JOIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

/**
 * Normalize the human Classroom join code.
 *
 * @param {unknown} value Candidate code.
 * @returns {string} Canonical eight-character code or an empty string.
 */
export function normalizeClassroomJoinLinkCode(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/gu, '');
  return JOIN_CODE_PATTERN.test(normalized) ? normalized : '';
}

/**
 * Format a canonical human join code for display.
 *
 * @param {unknown} value Candidate code.
 * @returns {string} XXXX-XXXX display form or an empty string.
 */
export function formatClassroomJoinLinkCode(value) {
  const normalized = normalizeClassroomJoinLinkCode(value);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : '';
}

/**
 * Read a valid Classroom join intent from the current URL fragment.
 *
 * Only the dedicated `#join=<human-code>` value is interpreted. Capability-
 * shaped or malformed values are ignored.
 *
 * @param {Location|{hash?:string}|null} [locationRef=globalThis.location] Location-like object.
 * @returns {string} Canonical human join code or an empty string.
 */
export function readClassroomJoinIntent(locationRef = globalThis.location) {
  const hash = typeof locationRef?.hash === 'string' ? locationRef.hash : '';
  if (!hash.startsWith('#')) return '';
  try {
    const params = new URLSearchParams(hash.slice(1));
    const values = params.getAll(CLASSROOM_JOIN_FRAGMENT_KEY);
    if (values.length !== 1) return '';
    return normalizeClassroomJoinLinkCode(values[0]);
  } catch {
    return '';
  }
}

/**
 * Build a shareable Classroom join URL.
 *
 * Existing search/query data is intentionally discarded so a share action can
 * never accidentally forward a Standalone collaboration capability or other
 * query-string state from the Instructor's current browser.
 *
 * @param {unknown} joinCode Human Classroom join code.
 * @param {Location|{href?:string,origin?:string,pathname?:string}|null} [locationRef=globalThis.location] Current app location.
 * @returns {string} Shareable URL or an empty string.
 */
export function buildClassroomJoinUrl(joinCode, locationRef = globalThis.location) {
  const normalized = normalizeClassroomJoinLinkCode(joinCode);
  if (!normalized) return '';
  try {
    const href = typeof locationRef?.href === 'string' && locationRef.href
      ? locationRef.href
      : `${locationRef?.origin || ''}${locationRef?.pathname || '/'}`;
    const url = new URL(href);
    url.search = '';
    url.hash = `${CLASSROOM_JOIN_FRAGMENT_KEY}=${normalized}`;
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Consume a valid Classroom join intent and remove the fragment without reload.
 *
 * @param {object} [options] Dependencies.
 * @param {Location|{hash?:string,pathname?:string,search?:string}|null} [options.locationRef=globalThis.location] Location-like object.
 * @param {History|{state?:unknown,replaceState?:Function}|null} [options.historyRef=globalThis.history] History-like object.
 * @returns {string} Canonical human join code or an empty string.
 */
export function consumeClassroomJoinIntent({
  locationRef = globalThis.location,
  historyRef = globalThis.history
} = {}) {
  const joinCode = readClassroomJoinIntent(locationRef);
  if (!joinCode) return '';

  try {
    const pathname = typeof locationRef?.pathname === 'string' && locationRef.pathname
      ? locationRef.pathname
      : '/';
    const search = typeof locationRef?.search === 'string' ? locationRef.search : '';
    historyRef?.replaceState?.(historyRef?.state ?? null, '', `${pathname}${search}`);
  } catch {
    // Fragment removal is privacy hygiene, not a prerequisite for normal join.
  }
  return joinCode;
}
