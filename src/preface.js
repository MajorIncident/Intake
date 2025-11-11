/**
 * @file Preface form orchestration for the intake experience.
 * @module preface
 * This module wires up the descriptive "preface" section that captures what is happening now, what healthy looks like, and who is involved.
 * Several fields mirror into the incident summary (object and deviation), so synchronized updates keep the preface and knowledge tracker views aligned.
 */
import {
  getObjectISField,
  getDeviationISField,
  isObjectISDirty,
  isDeviationISDirty,
  refreshAllTokenizedText
} from './kt.js';

let refs = null;
let saveHandler = () => {};
let mirrorTimerId = null;
let lastObjectValue = '';
let lastNowValue = '';

const CONTAINMENT_STATUS_PAIRS = [
  ['assessing', 'containAssessing'],
  ['stoppingImpact', 'containStoppingImpact'],
  ['stabilized', 'containStabilized'],
  ['fixInProgress', 'containFixInProgress'],
  ['restoring', 'containRestoring'],
  ['monitoring', 'containMonitoring'],
  ['closed', 'containClosed']
];

const CONTAINMENT_STATUS_VALUES = new Set(CONTAINMENT_STATUS_PAIRS.map(([value]) => value));

const LEGACY_CONTAINMENT_STATUS_MAP = {
  none: 'assessing',
  mitigation: 'stabilized',
  restore: 'restoring'
};

/**
 * Normalizes legacy containment identifiers to the current vocabulary.
 * @param {string} value - Stored containment status value.
 * @returns {string} Validated containment status or an empty string.
 */
function normalizeContainmentStatus(value) {
  if (typeof value !== 'string') return '';
  if (CONTAINMENT_STATUS_VALUES.has(value)) return value;
  const legacy = LEGACY_CONTAINMENT_STATUS_MAP[value];
  return typeof legacy === 'string' ? legacy : '';
}

/**
 * Lazily resolves and caches all DOM nodes that participate in the preface form.
 * @returns {Record<string, HTMLElement | null>} Map of reference keys to nodes.
 */
function ensureRefs() {
  if (refs) return refs;
  refs = {
    oneLine: document.getElementById('oneLine'),
    proof: document.getElementById('proof'),
    objectPrefill: document.getElementById('objectPrefill'),
    healthy: document.getElementById('healthy'),
    now: document.getElementById('now'),
    bridgeOpenedUtc: document.getElementById('bridgeOpenedUtc'),
    icName: document.getElementById('icName'),
    bcName: document.getElementById('bcName'),
    semOpsName: document.getElementById('semOpsName'),
    severity: document.getElementById('severity'),
    detectMonitoring: document.getElementById('detectMonitoring'),
    detectUserReport: document.getElementById('detectUserReport'),
    detectAutomation: document.getElementById('detectAutomation'),
    detectOther: document.getElementById('detectOther'),
    evScreenshot: document.getElementById('evScreenshot'),
    evLogs: document.getElementById('evLogs'),
    evMetrics: document.getElementById('evMetrics'),
    evRepro: document.getElementById('evRepro'),
    evOther: document.getElementById('evOther'),
    labelHealthy: document.getElementById('labelHealthy'),
    labelNow: document.getElementById('labelNow'),
    docTitle: document.getElementById('docTitle'),
    docSubtitle: document.getElementById('docSubtitle'),
    impactNow: document.getElementById('impactNow'),
    impactFuture: document.getElementById('impactFuture'),
    impactTime: document.getElementById('impactTime'),
    containAssessing: document.getElementById('containAssessing'),
    containStoppingImpact: document.getElementById('containStoppingImpact'),
    containStabilized: document.getElementById('containStabilized'),
    containFixInProgress: document.getElementById('containFixInProgress'),
    containRestoring: document.getElementById('containRestoring'),
    containMonitoring: document.getElementById('containMonitoring'),
    containClosed: document.getElementById('containClosed'),
    containDesc: document.getElementById('containDesc')
  };
  return refs;
}

/**
 * Expands a textarea to fit its content while respecting configured minimums.
 * Relies on DOM `style` access and root CSS variables for sizing. No-op for
 * non-textarea nodes so callers can safely pass arbitrary targets during form
 * events.
 * @param {HTMLElement | null | undefined} el - Textarea element to resize.
 * @returns {void}
 */
export function autoResize(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  const attr = parseInt(el.getAttribute('data-min-height') || '', 10);
  const varMin = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ta-min-h'), 10);
  const fallback = Number.isFinite(varMin) ? varMin : 140;
  const minH = Number.isFinite(attr) ? attr : fallback;
  const base = Number.isFinite(attr) ? attr : 140;
  el.style.height = Math.max(minH, el.scrollHeight, base) + 'px';
}

/**
 * Collapses whitespace and truncates a value for inline labels.
 * @param {string} value - User-supplied text to normalize.
 * @param {number} [max] - Maximum characters before applying ellipsis (defaults to 90).
 * @returns {string} Normalized snippet.
 */
function compactText(value, max = 90) {
  const str = (value || '').trim().replace(/\s+/g, ' ');
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Reads the full "object" description, preferring the preface textarea but
 * falling back to the knowledge tracker mirror field.
 * Depends on DOM form controls provided by the preface layout.
 * @returns {string} Trimmed object description (possibly empty).
 */
export function getObjectFull() {
  const { objectPrefill } = ensureRefs();
  const objectIS = getObjectISField();
  return (objectPrefill?.value || objectIS?.value || '').trim();
}

/**
 * Reads the full "now" description, preferring the preface textarea but
 * falling back to the knowledge tracker mirror field.
 * Depends on DOM form controls provided by the preface layout.
 * @returns {string} Trimmed current deviation description (possibly empty).
 */
export function getDeviationFull() {
  const { now } = ensureRefs();
  const deviationIS = getDeviationISField();
  return (now?.value || deviationIS?.value || '').trim();
}

/**
 * Refreshes the document title, hero title, and helper labels based on the
 * current object and deviation values.
 * Mutates DOM text nodes (including `document.title`) and clears placeholders
 * to better guide follow-up inputs.
 * @returns {void}
 */
export function updatePrefaceTitles() {
  const {
    docTitle,
    docSubtitle,
    labelHealthy,
    labelNow,
    now,
    healthy
  } = ensureRefs();

  const objectFull = getObjectFull();
  const deviationFull = getDeviationFull();
  const objectAnchor = compactText(objectFull, 80) || 'the object';

  if (objectFull && deviationFull) {
    if (docTitle) {
      docTitle.textContent = `${objectFull} — ${deviationFull}`;
    }
    if (docSubtitle) {
      docSubtitle.textContent = `What is happening now to ${objectAnchor}: ${deviationFull}`;
    }
    document.title = `${compactText(objectFull, 50)} — ${compactText(deviationFull, 50)} · KT Intake`;
  } else {
    if (docTitle) {
      docTitle.textContent = 'KT Intake';
    }
    if (docSubtitle) {
      docSubtitle.textContent = '';
    }
    document.title = 'KT Intake';
  }

  if (labelNow) {
    labelNow.textContent = objectAnchor ? `What is happening now to ${objectAnchor}?` : 'What is happening now?';
  }
  if (labelHealthy) {
    labelHealthy.textContent = objectAnchor ? `What does healthy look like here for ${objectAnchor}?` : 'What does healthy look like?';
  }

  if (objectAnchor && now) {
    now.placeholder = '';
  }
  if (objectAnchor && healthy) {
    healthy.placeholder = '';
  }
}

/**
 * Handles text input changes by mirroring content, resizing, and saving.
 * Touches knowledge tracker fields and calls the save handler, which typically
 * persists to storage.
 * @param {HTMLTextAreaElement | HTMLInputElement | null} target - Field that triggered the change.
 * @returns {void}
 */
function handlePrefaceInput(target) {
  if (!target) return;
  autoResize(target);
  const { objectPrefill, now, oneLine } = ensureRefs();

  if (target === objectPrefill) {
    const objectIS = getObjectISField();
    if (objectIS && !objectIS.value.trim()) {
      objectIS.value = objectPrefill.value.trim();
      autoResize(objectIS);
      refreshAllTokenizedText();
    }
  }

  if (target === oneLine) {
    const deviationIS = getDeviationISField();
    if (deviationIS && !deviationIS.value.trim()) {
      deviationIS.value = oneLine.value.trim();
      autoResize(deviationIS);
      refreshAllTokenizedText();
    }
  }

  if (target === now) {
    const deviationIS = getDeviationISField();
    if (deviationIS && !deviationIS.value.trim()) {
      deviationIS.value = now.value.trim();
      autoResize(deviationIS);
      refreshAllTokenizedText();
    }
  }

  updatePrefaceTitles();
  refreshAllTokenizedText();
  saveHandler();
}

/**
 * Initializes preface form behaviour by attaching listeners and syncing state.
 * The provided `onSave` callback should persist to storage; it is invoked when
 * text inputs change, mirrored fields update, or detection/containment controls
 * toggle. Requires the preface DOM to be present before invocation.
 * @param {{ onSave?: () => void }} [options] - Configuration for persistence callbacks.
 * @param {() => void} [options.onSave] - Handler triggered after relevant input events to persist state.
 * @returns {void}
 */
export function initPreface({ onSave } = {}) {
  saveHandler = typeof onSave === 'function' ? onSave : () => {};
  const references = ensureRefs();
  const {
    oneLine,
    proof,
    objectPrefill,
    healthy,
    now,
    impactNow,
    impactFuture,
    impactTime,
    icName,
    bcName,
    semOpsName,
    severity,
    detectMonitoring,
    detectUserReport,
    detectAutomation,
    detectOther,
    evScreenshot,
    evLogs,
    evMetrics,
    evRepro,
    evOther,
    containDesc
  } = references;

  [oneLine, proof, objectPrefill, healthy, now, impactNow, impactFuture, impactTime].forEach(el => {
    if (!el) return;
    autoResize(el);
    el.addEventListener('input', () => handlePrefaceInput(el));
    el.addEventListener('keyup', () => syncMirror());
    el.addEventListener('change', () => syncMirror(true));
  });

  [icName, bcName, semOpsName].forEach(el => {
    if (!el) return;
    el.addEventListener('input', saveHandler);
  });

  if (severity) {
    severity.addEventListener('change', saveHandler);
  }

  [detectMonitoring, detectUserReport, detectAutomation, detectOther, evScreenshot, evLogs, evMetrics, evRepro, evOther].forEach(el => {
    if (!el) return;
    el.addEventListener('change', saveHandler);
  });

  if (containDesc) {
    containDesc.addEventListener('input', saveHandler);
  }

  const containmentRadios = CONTAINMENT_STATUS_PAIRS
    .map(([, key]) => references[key])
    .filter(Boolean);

  containmentRadios.forEach(el => {
    if (!el) return;
    el.addEventListener('change', saveHandler);
  });

  updatePrefaceTitles();
}

/**
 * Mirrors preface content into knowledge tracker fields when they are pristine.
 * Used by a polling timer to keep shared state aligned before serialization.
 * @param {boolean} [force] - When true, writes values regardless of change detection.
 * @returns {void}
 */
function syncMirror(force = false) {
  const currentObject = getObjectFull();
  const currentNow = getDeviationFull();
  let changed = false;

  if (force || currentObject !== lastObjectValue) {
    lastObjectValue = currentObject;
    const objectIS = getObjectISField();
    if (objectIS && !isObjectISDirty()) {
      if (objectIS.value !== currentObject) {
        objectIS.value = currentObject;
        autoResize(objectIS);
        changed = true;
      }
    }
  }

  if (force || currentNow !== lastNowValue) {
    lastNowValue = currentNow;
    const deviationIS = getDeviationISField();
    if (deviationIS && !isDeviationISDirty()) {
      if (deviationIS.value !== currentNow) {
        deviationIS.value = currentNow;
        autoResize(deviationIS);
        changed = true;
      }
    }
  }

  if (changed || force) {
    refreshAllTokenizedText();
    updatePrefaceTitles();
    saveHandler();
  }
}

/**
 * Starts the timer that keeps preface inputs mirrored into the knowledge tracker fields.
 * Invokes `window.setInterval` until {@link stopMirrorSync} is called, and immediately performs a forced sync.
 * @returns {void}
 */
export function startMirrorSync() {
  if (!mirrorTimerId) {
    mirrorTimerId = window.setInterval(() => syncMirror(), 300);
  }
  syncMirror(true);
}

/**
 * Stops the mirror synchronization timer started by {@link startMirrorSync}.
 * Clears the interval created with `window.setInterval` to avoid background DOM churn.
 * @returns {void}
 */
export function stopMirrorSync() {
  if (mirrorTimerId) {
    clearInterval(mirrorTimerId);
    mirrorTimerId = null;
  }
}

/**
 * Stamps the bridge-opened timestamp with the current UTC time and saves.
 * Focuses the input after writing the ISO string and triggers the registered save handler, which typically persists to storage.
 * @returns {void}
 */
export function setBridgeOpenedNow() {
  const { bridgeOpenedUtc } = ensureRefs();
  if (!bridgeOpenedUtc) return;
  bridgeOpenedUtc.value = new Date().toISOString();
  bridgeOpenedUtc.focus();
  saveHandler();
}

/**
 * Resolves the selected containment status radio value.
 * Reads from DOM radio buttons to maintain compatibility with legacy values.
 * @returns {string} Normalized containment status or an empty string.
 */
export function getContainmentStatus() {
  const references = ensureRefs();
  for (const [value, key] of CONTAINMENT_STATUS_PAIRS) {
    if (references[key]?.checked) {
      return value;
    }
  }
  return '';
}

/**
 * Collects the current preface values for persistence.
 * Reads directly from DOM nodes, including checkbox/radio states, so callers can serialize the result for storage or summary generation.
 * @returns {{
 *   pre: { oneLine: string, proof: string, objectPrefill: string, healthy: string, now: string },
 *   impact: { now: string, future: string, time: string },
 *   ops: {
 *     bridgeOpenedUtc: string,
 *     icName: string,
 *     bcName: string,
 *     semOpsName: string,
 *     severity: string,
 *     detectMonitoring: boolean,
 *     detectUserReport: boolean,
 *     detectAutomation: boolean,
 *     detectOther: boolean,
 *     evScreenshot: boolean,
 *     evLogs: boolean,
 *     evMetrics: boolean,
 *     evRepro: boolean,
 *     evOther: boolean,
 *     containStatus: string,
 *     containDesc: string
 *   }
 * }} Structured snapshot of the preface form.
 */
export function getPrefaceState() {
  const {
    oneLine,
    proof,
    objectPrefill,
    healthy,
    now,
    impactNow,
    impactFuture,
    impactTime,
    bridgeOpenedUtc,
    icName,
    bcName,
    semOpsName,
    severity,
    detectMonitoring,
    detectUserReport,
    detectAutomation,
    detectOther,
    evScreenshot,
    evLogs,
    evMetrics,
    evRepro,
    evOther,
    containDesc
  } = ensureRefs();

  return {
    pre: {
      oneLine: oneLine?.value || '',
      proof: proof?.value || '',
      objectPrefill: objectPrefill?.value || '',
      healthy: healthy?.value || '',
      now: now?.value || ''
    },
    impact: {
      now: impactNow?.value || '',
      future: impactFuture?.value || '',
      time: impactTime?.value || ''
    },
    ops: {
      bridgeOpenedUtc: bridgeOpenedUtc?.value || '',
      icName: icName?.value || '',
      bcName: bcName?.value || '',
      semOpsName: semOpsName?.value || '',
      severity: severity?.value || '',
      detectMonitoring: !!detectMonitoring?.checked,
      detectUserReport: !!detectUserReport?.checked,
      detectAutomation: !!detectAutomation?.checked,
      detectOther: !!detectOther?.checked,
      evScreenshot: !!evScreenshot?.checked,
      evLogs: !!evLogs?.checked,
      evMetrics: !!evMetrics?.checked,
      evRepro: !!evRepro?.checked,
      evOther: !!evOther?.checked,
      containStatus: getContainmentStatus(),
      containDesc: containDesc?.value || ''
    }
  };
}

/**
 * Applies a persisted preface snapshot back into the DOM.
 * Updates textarea values (triggering auto-resize), checkbox/radio selections, and related helpers.
 * Callers should follow with their own persistence to avoid re-saving the just-applied state.
 * @param {{
 *   pre?: { oneLine?: string, proof?: string, objectPrefill?: string, healthy?: string, now?: string },
 *   impact?: { now?: string, future?: string, time?: string },
 *   ops?: {
 *     bridgeOpenedUtc?: string,
 *     icName?: string,
 *     bcName?: string,
 *     semOpsName?: string,
 *     severity?: string,
 *     detectMonitoring?: boolean,
 *     detectUserReport?: boolean,
 *     detectAutomation?: boolean,
 *     detectOther?: boolean,
 *     evScreenshot?: boolean,
 *     evLogs?: boolean,
 *     evMetrics?: boolean,
 *     evRepro?: boolean,
 *     evOther?: boolean,
 *     containStatus?: string,
 *     containDesc?: string
 *   }
 * }} [state] - Serialized preface state to rehydrate.
 * @returns {void}
 */
export function applyPrefaceState(state = {}) {
  const refs = ensureRefs();
  const { pre = {}, impact = {}, ops = {} } = state;

  if (refs.oneLine) {
    refs.oneLine.value = pre.oneLine || '';
    autoResize(refs.oneLine);
  }
  if (refs.proof) {
    refs.proof.value = pre.proof || '';
    autoResize(refs.proof);
  }
  if (refs.objectPrefill) {
    refs.objectPrefill.value = pre.objectPrefill || '';
    autoResize(refs.objectPrefill);
  }
  if (refs.healthy) {
    refs.healthy.value = pre.healthy || '';
    autoResize(refs.healthy);
  }
  if (refs.now) {
    refs.now.value = pre.now || '';
    autoResize(refs.now);
  }

  if (refs.impactNow) {
    refs.impactNow.value = impact.now || '';
    autoResize(refs.impactNow);
  }
  if (refs.impactFuture) {
    refs.impactFuture.value = impact.future || '';
    autoResize(refs.impactFuture);
  }
  if (refs.impactTime) {
    refs.impactTime.value = impact.time || '';
    autoResize(refs.impactTime);
  }

  if (refs.bridgeOpenedUtc) {
    refs.bridgeOpenedUtc.value = ops.bridgeOpenedUtc || '';
  }
  if (refs.icName) {
    refs.icName.value = ops.icName || '';
  }
  if (refs.bcName) {
    refs.bcName.value = ops.bcName || '';
  }
  if (refs.semOpsName) {
    refs.semOpsName.value = ops.semOpsName || '';
  }
  if (refs.severity) {
    refs.severity.value = ops.severity || '';
  }

  if (refs.detectMonitoring) {
    refs.detectMonitoring.checked = !!ops.detectMonitoring;
  }
  if (refs.detectUserReport) {
    refs.detectUserReport.checked = !!ops.detectUserReport;
  }
  if (refs.detectAutomation) {
    refs.detectAutomation.checked = !!ops.detectAutomation;
  }
  if (refs.detectOther) {
    refs.detectOther.checked = !!ops.detectOther;
  }

  if (refs.evScreenshot) {
    refs.evScreenshot.checked = !!ops.evScreenshot;
  }
  if (refs.evLogs) {
    refs.evLogs.checked = !!ops.evLogs;
  }
  if (refs.evMetrics) {
    refs.evMetrics.checked = !!ops.evMetrics;
  }
  if (refs.evRepro) {
    refs.evRepro.checked = !!ops.evRepro;
  }
  if (refs.evOther) {
    refs.evOther.checked = !!ops.evOther;
  }

  if (refs.containDesc) {
    refs.containDesc.value = ops.containDesc || '';
  }

  const normalizedStatus = normalizeContainmentStatus(ops.containStatus);
  CONTAINMENT_STATUS_PAIRS.forEach(([value, key]) => {
    if (refs[key]) {
      refs[key].checked = normalizedStatus === value;
    }
  });

  updatePrefaceTitles();
}

/**
 * Provides key DOM references used when composing the preface summary.
 * Useful for consumers that need to read or clone content without duplicating selector logic.
 * @returns {{
 *   docTitle: HTMLElement | null,
 *   docSubtitle: HTMLElement | null,
 *   oneLine: HTMLTextAreaElement | null,
 *   proof: HTMLTextAreaElement | null,
 *   objectPrefill: HTMLTextAreaElement | null,
 *   healthy: HTMLTextAreaElement | null,
 *   now: HTMLTextAreaElement | null,
 *   impactNow: HTMLTextAreaElement | null,
 *   impactFuture: HTMLTextAreaElement | null,
 *   impactTime: HTMLTextAreaElement | null,
 *   containDesc: HTMLTextAreaElement | null,
 *   bridgeOpenedUtc: HTMLInputElement | null,
 *   icName: HTMLInputElement | null,
 *   bcName: HTMLInputElement | null,
 *   semOpsName: HTMLInputElement | null,
 *   severity: HTMLSelectElement | null
 * }} Collection of DOM nodes relevant to summary generation.
 */
export function getSummaryElements() {
  const refs = ensureRefs();
  return {
    docTitle: refs.docTitle,
    docSubtitle: refs.docSubtitle,
    oneLine: refs.oneLine,
    proof: refs.proof,
    objectPrefill: refs.objectPrefill,
    healthy: refs.healthy,
    now: refs.now,
    impactNow: refs.impactNow,
    impactFuture: refs.impactFuture,
    impactTime: refs.impactTime,
    containDesc: refs.containDesc,
    bridgeOpenedUtc: refs.bridgeOpenedUtc,
    icName: refs.icName,
    bcName: refs.bcName,
    semOpsName: refs.semOpsName,
    severity: refs.severity
  };
}
