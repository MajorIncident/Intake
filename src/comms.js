/**
 * @module Communications
 * Manages communication cadence tracking, stored DOM references, and log visibility
 * state for the incident intake page. This module owns the countdown timer lifecycle
 * and ensures cadence updates propagate through the controls card UI.
 */

let refs = null;
let commLog = [];
let commCadence = '';
let commNextDueIso = '';
let commShowAll = false;
let cadenceTimerId = null;
let dueToastShown = false;
let saveHandler = () => {};
let toastHandler = () => {};

/**
 * Resolves and memoizes DOM references required by the communications module.
 * Lazily queries the document once and reuses the stored map for subsequent calls.
 *
 * @returns {Object} Cached reference collection for communications controls.
 */
function ensureRefs() {
  if (refs) return refs;
  const group = document.getElementById('commCadenceGroup');
  refs = {
    internalBtn: document.getElementById('commInternalStampBtn'),
    externalBtn: document.getElementById('commExternalStampBtn'),
    nextUpdateInput: document.getElementById('commNextUpdateTime'),
    controlsCard: document.getElementById('commControlsCard'),
    cadenceGroup: group,
    cadenceRadios: group ? [...group.querySelectorAll('input[name="commCadence"]')] : [],
    countdown: document.getElementById('commCountdown'),
    dueAlert: document.getElementById('commDueAlert'),
    logList: document.getElementById('commLogList'),
    logToggleBtn: document.getElementById('commLogToggleBtn')
  };
  return refs;
}

/**
 * Normalises the active cadence value to minutes.
 *
 * @returns {number|null} Cadence minutes or null when not a finite number.
 */
function getCadenceMinutes() {
  const mins = parseInt(commCadence, 10);
  return Number.isFinite(mins) ? mins : null;
}

/**
 * Formats a date instance into an `HH:MM` string compatible with time inputs.
 *
 * @param {Date} date - Date to convert.
 * @returns {string} Formatted time string or empty string for invalid dates.
 */
function toTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Converts an `HH:MM` string into an ISO timestamp representing the next occurrence.
 *
 * @param {string} value - Time value from the manual next update input.
 * @returns {string} ISO string or empty string when the value cannot be parsed.
 */
function isoFromTimeValue(value) {
  if (!value) return '';
  const parts = value.split(':');
  if (parts.length < 2) return '';
  const [hh, mm] = parts.map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(hh, mm, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

/**
 * Updates the communications controls to reflect whether a cadence is currently due.
 * Mutates DOM state for alert visibility and card highlighting.
 *
 * @param {boolean} isDue - Indicates if the next communication is due immediately.
 */
function toggleCommDue(isDue) {
  const { controlsCard, dueAlert } = ensureRefs();
  if (controlsCard) {
    controlsCard.classList.toggle('communication-due', !!isDue);
  }
  if (dueAlert) {
    if (isDue) {
      dueAlert.textContent = 'Next communication is due now. Reconfirm updates.';
      dueAlert.hidden = false;
    } else {
      dueAlert.textContent = '';
      dueAlert.hidden = true;
    }
  }
}

/**
 * Produces a countdown label describing the remaining time until the next cadence.
 *
 * @param {number} ms - Milliseconds until the next communication.
 * @returns {string} Human-readable countdown string.
 */
function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}h ${rem}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

/**
 * Syncs cadence radio inputs with the stored cadence value.
 * Mutates radio selection state which is shared across the module.
 */
function updateCadenceRadios() {
  const { cadenceRadios } = ensureRefs();
  if (!cadenceRadios || !cadenceRadios.length) return;
  cadenceRadios.forEach(radio => {
    radio.checked = radio.value === commCadence;
  });
}

/**
 * Re-renders the communications log list and toggle button to match stored entries.
 * Manipulates DOM nodes and visibility flags based on the current log state.
 */
function updateCommLogUI() {
  const { logList, logToggleBtn } = ensureRefs();
  if (!logList) return;
  logList.innerHTML = '';
  if (!commLog.length) {
    const li = document.createElement('li');
    li.className = 'comm-log__empty';
    li.textContent = 'No communications logged yet.';
    logList.appendChild(li);
    if (logToggleBtn) {
      logToggleBtn.hidden = true;
      logToggleBtn.setAttribute('aria-expanded', 'false');
    }
    return;
  }
  const limit = 6;
  const entries = commShowAll ? commLog : commLog.slice(0, limit);
  entries.forEach(entry => {
    const li = document.createElement('li');
    const typeSpan = document.createElement('span');
    typeSpan.className = 'comm-log__type';
    typeSpan.textContent = entry.type === 'external' ? 'External' : 'Internal';
    li.appendChild(typeSpan);
    if (entry.message) {
      const messageSpan = document.createElement('span');
      messageSpan.className = 'comm-log__message';
      messageSpan.textContent = entry.message;
      li.appendChild(messageSpan);
    }
    const timeEl = document.createElement('time');
    timeEl.className = 'comm-log__time';
    if (entry.ts) {
      const d = new Date(entry.ts);
      if (!Number.isNaN(d.valueOf())) {
        timeEl.dateTime = entry.ts;
        timeEl.textContent = d.toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      } else {
        timeEl.textContent = entry.ts;
      }
    }
    li.appendChild(timeEl);
    logList.appendChild(li);
  });
  if (logToggleBtn) {
    const hasExtra = commLog.length > limit;
    logToggleBtn.hidden = !hasExtra;
    if (hasExtra) {
      logToggleBtn.textContent = commShowAll ? 'Show less' : 'Show all';
      logToggleBtn.setAttribute('aria-expanded', commShowAll ? 'true' : 'false');
    } else {
      logToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }
}

/**
 * Refreshes the countdown display and due alerts based on the stored next due ISO.
 * Handles toast notifications when the cadence becomes due.
 */
function updateCadenceState() {
  const { countdown } = ensureRefs();
  if (!countdown) return;
  if (!commNextDueIso) {
    countdown.textContent = '';
    toggleCommDue(false);
    return;
  }
  const now = new Date();
  const due = new Date(commNextDueIso);
  if (Number.isNaN(due.valueOf())) {
    countdown.textContent = '';
    toggleCommDue(false);
    return;
  }
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) {
    countdown.textContent = 'Due now';
    toggleCommDue(true);
    if (!dueToastShown) {
      dueToastShown = true;
      toastHandler('Next communication is due now.');
    }
    return;
  }
  countdown.textContent = `Next in ${formatCountdown(diff)}`;
  toggleCommDue(false);
}

/**
 * Resets the cadence interval timer and triggers an immediate state refresh.
 * Updates the shared `cadenceTimerId` to manage interval lifecycles.
 */
function scheduleCadenceTick() {
  if (cadenceTimerId) {
    clearInterval(cadenceTimerId);
  }
  cadenceTimerId = window.setInterval(updateCadenceState, 15000);
  updateCadenceState();
}

/**
 * Stores the next due date and syncs the manual time input and countdown timer.
 * Mutates shared cadence state and ensures timers are running.
 *
 * @param {Date} date - The upcoming communication deadline.
 */
function setNextDue(date) {
  const { nextUpdateInput } = ensureRefs();
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return;
  commNextDueIso = date.toISOString();
  const val = toTimeValue(date);
  if (nextUpdateInput) {
    nextUpdateInput.value = val;
  }
  dueToastShown = false;
  scheduleCadenceTick();
}

/**
 * Bootstraps the communications UI by wiring DOM references, handlers, and timers.
 *
 * @param {Object} [options] - Optional configuration hooks.
 * @param {Function} [options.onSave] - Callback invoked whenever communications
 * state changes require persistence.
 * @param {Function} [options.showToast] - Callback invoked to present toast alerts.
 */
export function initializeCommunications({ onSave, showToast } = {}) {
  saveHandler = typeof onSave === 'function' ? onSave : () => {};
  toastHandler = typeof showToast === 'function' ? showToast : () => {};
  ensureRefs();
  updateCadenceRadios();
  updateCommLogUI();
  scheduleCadenceTick();
}

/**
 * Tears down the cadence interval timer so the module stops updating the DOM.
 */
export function disposeCommunications() {
  if (cadenceTimerId) {
    clearInterval(cadenceTimerId);
    cadenceTimerId = null;
  }
}

/**
 * Records a communication entry, updates the UI, and schedules the next cadence.
 *
 * @param {string} type - Communication type identifier (e.g., `internal` or `external`).
 * @param {string} [message] - Optional freeform detail shown in the log.
 */
export function logCommunication(type, message = '') {
  const now = new Date();
  const iso = now.toISOString();
  const entry = { type, ts: iso };
  if (typeof message === 'string' && message.trim()) {
    entry.message = message.trim();
  }
  commLog.unshift(entry);
  commLog = commLog.slice(0, 20);
  commShowAll = false;
  updateCommLogUI();
  const mins = getCadenceMinutes();
  if (mins) {
    const due = new Date(now);
    due.setMinutes(due.getMinutes() + mins);
    setNextDue(due);
  }
  saveHandler();
}

/**
 * Toggles whether all communications or the condensed list are displayed.
 */
export function toggleLogVisibility() {
  commShowAll = !commShowAll;
  updateCommLogUI();
}

/**
 * Updates the cadence selection and recalculates the next due timestamp.
 *
 * @param {string} value - Selected cadence value, typically minutes as a string.
 */
export function setCadence(value) {
  commCadence = value || '';
  dueToastShown = false;
  updateCadenceRadios();
  const mins = getCadenceMinutes();
  if (mins && commLog.length) {
    const last = commLog[0];
    if (last?.ts) {
      const base = new Date(last.ts);
      if (!Number.isNaN(base.valueOf())) {
        base.setMinutes(base.getMinutes() + mins);
        setNextDue(base);
      }
    }
  }
  if (!mins) {
    commNextDueIso = '';
    updateCadenceState();
  } else {
    scheduleCadenceTick();
  }
  saveHandler();
}

/**
 * Applies a manually selected next update time and refreshes timers accordingly.
 *
 * @param {string} value - `HH:MM` formatted time from the manual next update input.
 * @param {Object} [options] - Optional behaviour flags.
 * @param {boolean} [options.skipSave=false] - Prevents calling the save handler when true.
 */
export function setManualNextUpdate(value, { skipSave = false } = {}) {
  const { nextUpdateInput } = ensureRefs();
  if (!value) {
    commNextDueIso = '';
    dueToastShown = false;
    if (nextUpdateInput) {
      nextUpdateInput.value = '';
    }
    toggleCommDue(false);
    const { countdown } = ensureRefs();
    if (countdown) {
      countdown.textContent = '';
    }
    if (!skipSave) {
      saveHandler();
    }
    return;
  }
  const iso = isoFromTimeValue(value);
  if (!iso) return;
  commNextDueIso = iso;
  if (nextUpdateInput) {
    nextUpdateInput.value = value;
  }
  toggleCommDue(false);
  dueToastShown = false;
  scheduleCadenceTick();
  updateCadenceState();
  if (!skipSave) {
    saveHandler();
  }
}

/**
 * Collects the current communications state used for persistence.
 *
 * @returns {Object} Serializable state snapshot for storage.
 */
export function getCommunicationsState() {
  const { nextUpdateInput } = ensureRefs();
  return {
    commCadence,
    commLog: commLog.slice(0),
    commNextDueIso,
    commNextUpdateTime: nextUpdateInput?.value || ''
  };
}

/**
 * Restores persisted communications state and syncs DOM controls.
 *
 * @param {Object} [state] - Previously saved communications state payload.
 * @param {string} [state.commCadence] - Stored cadence value.
 * @param {Array} [state.commLog] - Previously logged communication entries.
 * @param {string} [state.commNextDueIso] - ISO timestamp of the upcoming cadence.
 * @param {string} [state.commNextUpdateTime] - Manual next update time input value.
 */
export function applyCommunicationsState(state = {}) {
  const { commCadence: cad = '', commLog: log = [], commNextDueIso: dueIso = '', commNextUpdateTime = '' } = state;
  commCadence = typeof cad === 'string' ? cad : '';
  commLog = Array.isArray(log)
    ? log.filter(entry => entry && typeof entry.type === 'string' && typeof entry.ts === 'string')
    : [];
  commNextDueIso = typeof dueIso === 'string' ? dueIso : '';
  commShowAll = false;
  const { nextUpdateInput } = ensureRefs();
  if (nextUpdateInput) {
    nextUpdateInput.value = typeof commNextUpdateTime === 'string' ? commNextUpdateTime : '';
  }
  dueToastShown = false;
  updateCadenceRadios();
  updateCommLogUI();
  if (commNextDueIso) {
    const due = new Date(commNextDueIso);
    if (!Number.isNaN(due.valueOf())) {
      const val = toTimeValue(due);
      if (nextUpdateInput) {
        nextUpdateInput.value = val;
      }
    }
  }
  if (!commNextDueIso && nextUpdateInput && nextUpdateInput.value) {
    setManualNextUpdate(nextUpdateInput.value, { skipSave: true });
  } else if (!commNextDueIso) {
    updateCadenceState();
  } else {
    scheduleCadenceTick();
  }
}

/**
 * Exposes key DOM elements to consumers needing to attach additional listeners.
 *
 * @returns {Object} Map of communication control elements.
 */
export function getCommunicationElements() {
  const { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios } = ensureRefs();
  return { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios };
}
