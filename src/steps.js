import {
  STEPS_PHASES,
  STEP_DEFINITIONS
} from './constants.js';

export const STEPS_ITEMS_KEY = 'steps.items';
export const STEPS_DRAWER_KEY = 'steps.drawerOpen';

let stepsBtn = null;
let stepsCompletedLabel = null;
let stepsDrawer = null;
let stepsBackdrop = null;
let stepsList = null;
let stepsCloseBtn = null;
let stepsDrawerProgress = null;

let stepsItems = STEP_DEFINITIONS.map(def => ({
  id: def.id,
  phase: def.phase,
  label: def.label,
  checked: false
}));

let stepsDrawerOpen = false;
let stepsReady = false;
let stepsReturnFocus = null;
let onFullSave = null;
let onLogCommunication = null;

function parseJsonSafe(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function hydrateStepsFromLocalStorage() {
  const storedItems = parseJsonSafe(localStorage.getItem(STEPS_ITEMS_KEY));
  const map = new Map();
  if (Array.isArray(storedItems)) {
    storedItems.forEach(item => {
      if (!item || item.id === undefined) return;
      const key = String(item.id);
      map.set(key, {
        checked: !!item.checked,
        label: typeof item.label === 'string' ? item.label : ''
      });
    });
  }
  stepsItems = STEP_DEFINITIONS.map(def => {
    const stored = map.get(def.id);
    return {
      id: def.id,
      phase: def.phase,
      label: stored && stored.label ? stored.label : def.label,
      checked: stored ? !!stored.checked : false
    };
  });
  const storedDrawer = parseJsonSafe(localStorage.getItem(STEPS_DRAWER_KEY));
  if (typeof storedDrawer === 'boolean') {
    stepsDrawerOpen = storedDrawer;
  }
}

function saveStepsItemsToLocalStorage() {
  try {
    const payload = stepsItems.map(item => ({
      id: item.id,
      label: item.label,
      checked: !!item.checked
    }));
    localStorage.setItem(STEPS_ITEMS_KEY, JSON.stringify(payload));
  } catch (_error) {
    /* ignore */
  }
}

function saveStepsDrawerStateToLocalStorage() {
  try {
    localStorage.setItem(STEPS_DRAWER_KEY, JSON.stringify(!!stepsDrawerOpen));
  } catch (_error) {
    /* ignore */
  }
}

function triggerFullSave() {
  if (stepsReady && typeof onFullSave === 'function') {
    onFullSave();
  }
}

function emitStepLog(message) {
  if (typeof onLogCommunication === 'function' && message) {
    onLogCommunication('internal', message);
  }
}

export function getStepsCounts() {
  const total = stepsItems.length;
  const completed = stepsItems.filter(item => item.checked).length;
  return { total, completed };
}

function formatStepsBadge() {
  const { total, completed } = getStepsCounts();
  return `${completed} of ${total}`;
}

function formatStepsDrawerProgress() {
  const { total, completed } = getStepsCounts();
  return `${completed} of ${total} completed`;
}

function updateStepsProgressUI() {
  const badgeText = formatStepsBadge();
  if (stepsCompletedLabel) {
    stepsCompletedLabel.textContent = badgeText;
  }
  if (stepsDrawerProgress) {
    stepsDrawerProgress.textContent = formatStepsDrawerProgress();
  }
}

function getDrawerFocusables() {
  if (!stepsDrawer) return [];
  const nodes = stepsDrawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  return [...nodes].filter(el => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function handleStepToggle(event) {
  const checkbox = event.currentTarget;
  if (!checkbox || !checkbox.dataset) return;
  const stepId = checkbox.dataset.stepId;
  const step = stepsItems.find(item => item.id === stepId);
  if (!step) return;
  step.checked = !!checkbox.checked;
  updateStepsProgressUI();
  saveStepsItemsToLocalStorage();
  triggerFullSave();
  const message = step.checked ? `Step checked: ${step.label}` : `Step unchecked: ${step.label}`;
  emitStepLog(message);
}

function handleStepsDrawerKeydown(event) {
  if (event.key !== 'Tab') return;
  const focusables = getDrawerFocusables();
  if (!focusables.length) {
    event.preventDefault();
    if (stepsCloseBtn) {
      stepsCloseBtn.focus();
    }
    return;
  }
  const index = focusables.indexOf(document.activeElement);
  if (event.shiftKey) {
    if (index <= 0) {
      event.preventDefault();
      focusables[focusables.length - 1].focus();
    }
  } else {
    if (index === focusables.length - 1) {
      event.preventDefault();
      focusables[0].focus();
    }
  }
}

function handleStepsGlobalKeydown(event) {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (key === 's' && event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    toggleStepsDrawer();
    return;
  }
  if (event.key === 'Escape' && stepsDrawerOpen) {
    event.preventDefault();
    closeStepsDrawer();
  }
}

function renderStepsList() {
  if (!stepsList) return;
  stepsList.innerHTML = '';
  const grouped = new Map();
  stepsItems.forEach(step => {
    if (!grouped.has(step.phase)) {
      grouped.set(step.phase, []);
    }
    grouped.get(step.phase).push(step);
  });
  STEPS_PHASES.forEach(phase => {
    const items = grouped.get(phase.id);
    if (!items || !items.length) return;
    const details = document.createElement('details');
    details.className = 'steps-category';
    details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'steps-category__header';
    const textWrap = document.createElement('div');
    textWrap.className = 'steps-category__header-text';
    const phaseEl = document.createElement('span');
    phaseEl.className = 'steps-category__phase';
    phaseEl.textContent = `Phase ${phase.id}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'steps-category__name';
    nameEl.textContent = phase.label;
    textWrap.appendChild(phaseEl);
    textWrap.appendChild(nameEl);
    const chevron = document.createElement('span');
    chevron.className = 'steps-category__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    summary.appendChild(textWrap);
    summary.appendChild(chevron);
    details.appendChild(summary);
    const container = document.createElement('div');
    container.className = 'steps-category__items';
    items.forEach(step => {
      const row = document.createElement('div');
      row.className = 'steps-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `step-${step.id}`;
      checkbox.dataset.stepId = step.id;
      checkbox.checked = !!step.checked;
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = step.label;
      checkbox.addEventListener('change', handleStepToggle);
      row.appendChild(checkbox);
      row.appendChild(label);
      container.appendChild(row);
    });
    details.appendChild(container);
    stepsList.appendChild(details);
  });
}

function setStepsDrawer(open, options = {}) {
  const shouldOpen = !!open;
  const skipFocus = !!options.skipFocus;
  const skipSave = !!options.skipSave;
  if (shouldOpen && !stepsDrawerOpen) {
    stepsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  stepsDrawerOpen = shouldOpen;
  if (stepsDrawer) {
    stepsDrawer.classList.toggle('is-open', shouldOpen);
    stepsDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (stepsBackdrop) {
    stepsBackdrop.classList.toggle('is-open', shouldOpen);
    stepsBackdrop.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (stepsBtn) {
    stepsBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
  document.body.classList.toggle('steps-drawer-open', shouldOpen);
  if (shouldOpen) {
    if (!skipFocus) {
      const focusables = getDrawerFocusables();
      const target = focusables.length ? focusables[0] : stepsCloseBtn || stepsDrawer;
      requestAnimationFrame(() => {
        target?.focus?.();
      });
    }
  } else {
    const target = stepsBtn || stepsReturnFocus;
    if (!skipFocus) {
      requestAnimationFrame(() => {
        target?.focus?.();
      });
    }
    stepsReturnFocus = null;
  }
  if (stepsDrawerProgress) {
    stepsDrawerProgress.textContent = formatStepsDrawerProgress();
  }
  if (!skipSave) {
    saveStepsDrawerStateToLocalStorage();
    triggerFullSave();
  }
}

export function openStepsDrawer() {
  setStepsDrawer(true);
}

export function closeStepsDrawer() {
  setStepsDrawer(false);
}

export function toggleStepsDrawer() {
  setStepsDrawer(!stepsDrawerOpen);
}

export function exportStepsState() {
  return {
    items: stepsItems.map(item => ({
      id: item.id,
      label: item.label,
      checked: !!item.checked
    })),
    drawerOpen: !!stepsDrawerOpen
  };
}

export function importStepsState(data) {
  if (!data) return;
  let incoming = null;
  if (Array.isArray(data.items)) {
    incoming = data.items;
  } else if (Array.isArray(data.steps)) {
    incoming = data.steps;
  }
  if (Array.isArray(incoming)) {
    const map = new Map();
    incoming.forEach(item => {
      if (!item) return;
      const key = item.id !== undefined ? String(item.id) : (item.stepId !== undefined ? String(item.stepId) : '');
      if (!key) return;
      map.set(key, {
        checked: !!item.checked,
        label: typeof item.label === 'string' ? item.label : (typeof item.title === 'string' ? item.title : '')
      });
    });
    stepsItems = STEP_DEFINITIONS.map(def => {
      const stored = map.get(def.id);
      return {
        id: def.id,
        phase: def.phase,
        label: stored && stored.label ? stored.label : def.label,
        checked: stored ? !!stored.checked : false
      };
    });
  }
  if (typeof data.drawerOpen === 'boolean') {
    stepsDrawerOpen = data.drawerOpen;
  } else if (typeof data.open === 'boolean') {
    stepsDrawerOpen = data.open;
  }
  renderStepsList();
  updateStepsProgressUI();
  setStepsDrawer(stepsDrawerOpen, { skipFocus: true, skipSave: true });
  saveStepsItemsToLocalStorage();
  saveStepsDrawerStateToLocalStorage();
}

export function getStepsItems() {
  return stepsItems.map(item => ({
    id: item.id,
    phase: item.phase,
    label: item.label,
    checked: !!item.checked
  }));
}

export function initStepsFeature(options = {}) {
  onFullSave = typeof options.onSave === 'function' ? options.onSave : null;
  onLogCommunication = typeof options.onLog === 'function' ? options.onLog : null;

  stepsBtn = document.getElementById('stepsBtn');
  stepsCompletedLabel = document.getElementById('stepsCompletedLabel');
  stepsDrawer = document.getElementById('stepsDrawer');
  stepsBackdrop = document.getElementById('stepsBackdrop');
  stepsList = document.getElementById('stepsList');
  stepsCloseBtn = document.getElementById('stepsCloseBtn');
  stepsDrawerProgress = document.getElementById('stepsDrawerProgress');

  hydrateStepsFromLocalStorage();
  renderStepsList();
  updateStepsProgressUI();
  setStepsDrawer(stepsDrawerOpen, { skipFocus: true, skipSave: true });

  if (stepsBtn) {
    stepsBtn.addEventListener('click', toggleStepsDrawer);
  }
  if (stepsCloseBtn) {
    stepsCloseBtn.addEventListener('click', closeStepsDrawer);
  }
  if (stepsBackdrop) {
    stepsBackdrop.addEventListener('click', closeStepsDrawer);
  }
  if (stepsDrawer) {
    stepsDrawer.addEventListener('keydown', handleStepsDrawerKeydown);
  }
  document.addEventListener('keydown', handleStepsGlobalKeydown);
  stepsReady = true;
}
