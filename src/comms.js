let refs = null;
let commLog = [];
let commCadence = '';
let commNextDueIso = '';
let commShowAll = false;
let cadenceTimerId = null;
let dueToastShown = false;
let saveHandler = () => {};
let toastHandler = () => {};

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

function getCadenceMinutes() {
  const mins = parseInt(commCadence, 10);
  return Number.isFinite(mins) ? mins : null;
}

function toTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

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

function updateCadenceRadios() {
  const { cadenceRadios } = ensureRefs();
  if (!cadenceRadios || !cadenceRadios.length) return;
  cadenceRadios.forEach(radio => {
    radio.checked = radio.value === commCadence;
  });
}

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

function scheduleCadenceTick() {
  if (cadenceTimerId) {
    clearInterval(cadenceTimerId);
  }
  cadenceTimerId = window.setInterval(updateCadenceState, 15000);
  updateCadenceState();
}

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

export function initializeCommunications({ onSave, showToast } = {}) {
  saveHandler = typeof onSave === 'function' ? onSave : () => {};
  toastHandler = typeof showToast === 'function' ? showToast : () => {};
  ensureRefs();
  updateCadenceRadios();
  updateCommLogUI();
  scheduleCadenceTick();
}

export function disposeCommunications() {
  if (cadenceTimerId) {
    clearInterval(cadenceTimerId);
    cadenceTimerId = null;
  }
}

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

export function toggleLogVisibility() {
  commShowAll = !commShowAll;
  updateCommLogUI();
}

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

export function getCommunicationsState() {
  const { nextUpdateInput } = ensureRefs();
  return {
    commCadence,
    commLog: commLog.slice(0),
    commNextDueIso,
    commNextUpdateTime: nextUpdateInput?.value || ''
  };
}

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

export function getCommunicationElements() {
  const { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios } = ensureRefs();
  return { internalBtn, externalBtn, logToggleBtn, nextUpdateInput, cadenceRadios };
}
