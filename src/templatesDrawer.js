/**
 * Templates drawer controller responsible for rendering curated templates,
 * enforcing password confirmation, and applying the selected payload.
 *
 * The module mirrors the communications drawer focus management so the
 * Templates UI remains accessible while it overlays the intake form. It wires
 * the template registry to the drawer list, manages mode chips, validates the
 * `${modeKey}${currentMinutes}` password, and applies the chosen template via
 * {@link applyAppState}. Consumers should import the exported helpers and wire
 * the launcher/backdrop buttons inside `main.js` similar to the comms drawer.
 *
 * @module templatesDrawer
 */

import {
  listTemplates,
  listTemplateModes,
  getTemplatePayload,
  TEMPLATE_MODE_IDS,
  TEMPLATE_KINDS
} from './templates.js';
import { applyAppState, collectAppState } from './appState.js';
import { showToast } from './toast.js';

const templateRecords = listTemplates();
const templateIndex = new Map(templateRecords.map(template => [template.id, template]));

const modeRecords = listTemplateModes();
const modeIndex = new Map(modeRecords.map(mode => [mode.id, mode]));

let templatesBtn = null;
let templatesDrawer = null;
let templatesBackdrop = null;
let templatesCloseBtn = null;
let templatesListEl = null;
let templatesModeGroup = null;
let templatesPasswordInput = null;
let templatesApplyBtn = null;
let templatesAuthSection = null;
let templatesTypeHint = null;
let passwordErrorEl = null;

let templatesDrawerOpen = false;
let templatesDrawerReady = false;
let templatesReturnFocus = null;

let selectedTemplateId = templateRecords.length ? templateRecords[0].id : null;
let selectedModeId = modeIndex.has(TEMPLATE_MODE_IDS.FULL)
  ? TEMPLATE_MODE_IDS.FULL
  : modeRecords.length
    ? modeRecords[modeRecords.length - 1].id
    : null;

function getSelectedTemplateMeta() {
  if (!selectedTemplateId) {
    return null;
  }
  return templateIndex.get(selectedTemplateId) || null;
}

function isStandardTemplate(templateMeta = getSelectedTemplateMeta()) {
  return Boolean(templateMeta && templateMeta.templateKind === TEMPLATE_KINDS.STANDARD);
}

function getDrawerFocusables() {
  if (!templatesDrawer) return [];
  const nodes = templatesDrawer.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return [...nodes].filter(el => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function focusFirstElement() {
  const focusables = getDrawerFocusables();
  const target = focusables.length ? focusables[0] : templatesCloseBtn || templatesDrawer;
  if (target && typeof target.focus === 'function') {
    requestAnimationFrame(() => target.focus());
  }
}

function restoreFocus() {
  const target = templatesReturnFocus && typeof templatesReturnFocus.focus === 'function'
    ? templatesReturnFocus
    : templatesBtn;
  templatesReturnFocus = null;
  if (target && typeof target.focus === 'function') {
    requestAnimationFrame(() => target.focus());
  }
}

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const focusables = getDrawerFocusables();
  if (!focusables.length) {
    event.preventDefault();
    if (templatesCloseBtn && typeof templatesCloseBtn.focus === 'function') {
      templatesCloseBtn.focus();
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

function rememberReturnFocus() {
  const active = document.activeElement;
  if (active && templatesDrawer && templatesDrawer.contains(active)) {
    templatesReturnFocus = templatesBtn;
    return;
  }
  if (active && typeof active.focus === 'function' && active !== document.body) {
    templatesReturnFocus = active;
  } else {
    templatesReturnFocus = templatesBtn;
  }
}

function ensurePasswordErrorElement() {
  if (passwordErrorEl || !templatesAuthSection) {
    return passwordErrorEl;
  }
  passwordErrorEl = document.createElement('p');
  passwordErrorEl.className = 'templates-auth__error';
  passwordErrorEl.setAttribute('role', 'alert');
  passwordErrorEl.setAttribute('aria-live', 'polite');
  passwordErrorEl.hidden = true;
  templatesAuthSection.appendChild(passwordErrorEl);
  return passwordErrorEl;
}

function setPasswordError(message) {
  if (!templatesPasswordInput) return;
  const errorEl = ensurePasswordErrorElement();
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  templatesPasswordInput.setAttribute('aria-invalid', 'true');
}

function clearPasswordError() {
  if (!templatesPasswordInput) return;
  templatesPasswordInput.setAttribute('aria-invalid', 'false');
  const errorEl = ensurePasswordErrorElement();
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
}

function updateApplyButtonState() {
  if (!templatesApplyBtn) return;
  const disabled = !selectedTemplateId || !selectedModeId;
  templatesApplyBtn.disabled = disabled;
}

function updateTemplateTypeHint() {
  if (!templatesTypeHint) return;
  const template = getSelectedTemplateMeta();
  if (!template) {
    templatesTypeHint.textContent = '';
    templatesTypeHint.hidden = true;
    return;
  }
  if (isStandardTemplate(template)) {
    templatesTypeHint.textContent = '';
    templatesTypeHint.hidden = true;
    return;
  }
  templatesTypeHint.hidden = false;
  templatesTypeHint.textContent = '';
}

function updatePasswordRequirement() {
  const needsPassword = !isStandardTemplate();
  if (templatesAuthSection) {
    templatesAuthSection.hidden = !needsPassword;
  }
  if (!needsPassword) {
    clearPasswordError();
    if (templatesPasswordInput) {
      templatesPasswordInput.value = '';
    }
  }
}

function updateModeLockState() {
  const lockModes = isStandardTemplate();
  if (lockModes) {
    selectedModeId = TEMPLATE_MODE_IDS.FULL;
  }
  if (templatesModeGroup) {
    templatesModeGroup.classList.toggle('is-locked', lockModes);
    const buttons = templatesModeGroup.querySelectorAll('.templates-mode');
    buttons.forEach(button => {
      button.disabled = lockModes;
      if (lockModes) {
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.removeAttribute('aria-disabled');
      }
    });
  }
  updateModeSelection();
  updateApplyButtonState();
}

function refreshTemplateDetails() {
  updateTemplateTypeHint();
  updatePasswordRequirement();
  updateModeLockState();
}

function updateTemplateSelection() {
  if (!templatesListEl) return;
  const buttons = templatesListEl.querySelectorAll('.templates-list__item');
  buttons.forEach(button => {
    const id = button.dataset.templateId || '';
    const isActive = id === selectedTemplateId;
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
  });
}

function updateModeSelection() {
  if (!templatesModeGroup) return;
  const buttons = templatesModeGroup.querySelectorAll('.templates-mode');
  buttons.forEach(button => {
    const id = button.dataset.mode || '';
    const isActive = id === selectedModeId;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
  });
}

/**
 * Build a selectable list item for a template metadata record.
 *
 * @param {{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS }} template - Template data.
 * @returns {HTMLLIElement} List item element containing the template trigger.
 */
function createTemplateListItem(template) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'templates-list__item';
  button.dataset.templateId = template.id;
  button.dataset.templateKind = template.templateKind;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', 'false');
  const name = document.createElement('span');
  name.className = 'templates-list__name';
  name.textContent = template.name;
  const meta = document.createElement('span');
  meta.className = 'templates-list__meta';
  meta.textContent = template.description;
  button.appendChild(name);
  button.appendChild(meta);
  li.appendChild(button);
  return li;
}

/**
 * Create a titled group that clusters templates of a shared kind.
 *
 * @param {string} title - Visible title for the group.
 * @param {string} subtitle - Helper copy describing the group.
 * @param {Array<{ id: string, name: string, description: string, templateKind: keyof typeof TEMPLATE_KINDS }>} templates - Templates to list.
 * @returns {HTMLElement|null} Section element when templates exist, otherwise null.
 */
function buildTemplatesGroup(title, subtitle, templates) {
  if (!templates.length) {
    return null;
  }
  const section = document.createElement('section');
  section.className = 'templates-group';
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', title);
  const header = document.createElement('header');
  header.className = 'templates-group__header';
  const heading = document.createElement('p');
  heading.className = 'templates-group__title';
  heading.textContent = title;
  header.appendChild(heading);
  if (subtitle) {
    const sub = document.createElement('p');
    sub.className = 'templates-group__subtitle';
    sub.textContent = subtitle;
    header.appendChild(sub);
  }
  section.appendChild(header);
  const list = document.createElement('ul');
  list.className = 'templates-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', title);
  templates.forEach(template => {
    list.appendChild(createTemplateListItem(template));
  });
  section.appendChild(list);
  return section;
}

function renderTemplatesList() {
  if (!templatesListEl) return;
  templatesListEl.innerHTML = '';
  if (!templateRecords.length) {
    const empty = document.createElement('p');
    empty.className = 'templates-list__empty';
    empty.textContent = 'No templates available yet.';
    templatesListEl.appendChild(empty);
    selectedTemplateId = null;
    updateApplyButtonState();
    refreshTemplateDetails();
    return;
  }
  const standardTemplates = templateRecords.filter(template => template.templateKind === TEMPLATE_KINDS.STANDARD);
  const caseTemplates = templateRecords.filter(template => template.templateKind === TEMPLATE_KINDS.CASE_STUDY);
  const fragment = document.createDocumentFragment();
  const standardGroup = buildTemplatesGroup(
    'Templates',
    'Standard prefills that apply instantly.',
    standardTemplates
  );
  if (standardGroup) {
    fragment.appendChild(standardGroup);
  }
  const caseGroup = buildTemplatesGroup(
    'Case Studies',
    'Instructor-led walkthroughs that unlock with a password.',
    caseTemplates
  );
  if (caseGroup) {
    fragment.appendChild(caseGroup);
  }
  if (!fragment.childNodes.length) {
    const fallbackGroup = buildTemplatesGroup('Templates', '', templateRecords);
    if (fallbackGroup) {
      fragment.appendChild(fallbackGroup);
    }
  }
  templatesListEl.appendChild(fragment);
  updateTemplateSelection();
  refreshTemplateDetails();
  updateApplyButtonState();
}

function renderModes() {
  if (!templatesModeGroup) return;
  templatesModeGroup.innerHTML = '';
  if (!modeRecords.length) {
    selectedModeId = null;
    updateApplyButtonState();
    return;
  }
  const fragment = document.createDocumentFragment();
  modeRecords.forEach(mode => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'templates-mode';
    button.dataset.mode = mode.id;
    button.textContent = mode.name;
    button.setAttribute('aria-pressed', 'false');
    fragment.appendChild(button);
  });
  templatesModeGroup.appendChild(fragment);
  if (!selectedModeId) {
    selectedModeId = modeRecords[0].id;
  }
  updateModeSelection();
  updateApplyButtonState();
}

function handleTemplateClick(event) {
  const target = event.target instanceof Element
    ? event.target.closest('.templates-list__item')
    : null;
  if (!target || !templatesListEl || !templatesListEl.contains(target)) {
    return;
  }
  event.preventDefault();
  const id = target.dataset.templateId;
  if (!id || id === selectedTemplateId || !templateIndex.has(id)) {
    return;
  }
  selectedTemplateId = id;
  updateTemplateSelection();
  refreshTemplateDetails();
  updateApplyButtonState();
}

function handleModeClick(event) {
  const target = event.target instanceof Element
    ? event.target.closest('.templates-mode')
    : null;
  if (!target || !templatesModeGroup || !templatesModeGroup.contains(target)) {
    return;
  }
  event.preventDefault();
  if (isStandardTemplate()) {
    return;
  }
  const id = target.dataset.mode;
  if (!id || id === selectedModeId || !modeIndex.has(id)) {
    return;
  }
  selectedModeId = id;
  updateModeSelection();
  clearPasswordError();
  updateApplyButtonState();
}

function buildExpectedPassword() {
  if (!selectedModeId) return '';
  const minutes = String(new Date().getMinutes()).padStart(2, '0');
  const normalizedModeKey = selectedModeId.replace(/-/g, '');
  return `${normalizedModeKey}${minutes}`;
}

function validatePassword() {
  if (isStandardTemplate()) {
    return true;
  }
  if (!templatesPasswordInput) {
    return true;
  }
  const raw = templatesPasswordInput.value.trim();
  if (!raw) {
    setPasswordError('Enter the template password to continue.');
    return false;
  }
  const expected = buildExpectedPassword();
  if (!expected) {
    setPasswordError('Select a mode before applying a template.');
    return false;
  }
  if (raw !== expected) {
    setPasswordError('Password does not match mode key. Please contact your instructor.');
    return false;
  }
  clearPasswordError();
  return true;
}

function applySelectedTemplate() {
  if (!templatesDrawerReady || !selectedTemplateId) {
    return;
  }
  const templateMeta = getSelectedTemplateMeta();
  const requiresPassword = !isStandardTemplate(templateMeta);
  const modeToApply = requiresPassword ? selectedModeId : TEMPLATE_MODE_IDS.FULL;
  if (!modeToApply) {
    return;
  }
  if (requiresPassword && !validatePassword()) {
    return;
  }
  const payload = getTemplatePayload(selectedTemplateId, modeToApply);
  if (!payload) {
    setPasswordError('That mode is not available for the selected template.');
    return;
  }
  const rollbackSnapshot = collectAppState();
  try {
    applyAppState(payload);
  } catch (error) {
    console.error('[templatesDrawer] Failed to apply template.', error);
    if (rollbackSnapshot) {
      try {
        applyAppState(rollbackSnapshot);
      } catch (restoreError) {
        console.error('[templatesDrawer] Failed to restore previous state.', restoreError);
      }
    }
    setPasswordError('Unable to apply the template. Please try again.');
    return;
  }
  if (templatesPasswordInput) {
    templatesPasswordInput.value = '';
  }
  clearPasswordError();
  closeTemplatesDrawer();
  const modeMeta = modeIndex.get(modeToApply);
  const templateName = templateMeta ? templateMeta.name : 'Template';
  const modeName = modeMeta ? modeMeta.name : modeToApply;
  showToast(`Applied “${templateName}” in ${modeName} mode ✨`);
}

function setTemplatesDrawer(open, { skipFocus = false } = {}) {
  if (!templatesDrawerReady) return;
  const shouldOpen = !!open;
  if (shouldOpen === templatesDrawerOpen) {
    return;
  }
  templatesDrawerOpen = shouldOpen;
  if (templatesDrawer) {
    templatesDrawer.classList.toggle('is-open', shouldOpen);
    templatesDrawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (templatesBackdrop) {
    templatesBackdrop.classList.toggle('is-open', shouldOpen);
    templatesBackdrop.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  }
  if (templatesBtn) {
    templatesBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
  document.body.classList.toggle('templates-drawer-open', shouldOpen);
  if (shouldOpen) {
    if (!skipFocus) {
      focusFirstElement();
    }
  } else if (!skipFocus) {
    restoreFocus();
  } else {
    templatesReturnFocus = null;
  }
}

function handleDrawerKeydown(event) {
  if (!templatesDrawerOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTemplatesDrawer();
    return;
  }
  trapFocus(event);
}

function handleGlobalKeydown(event) {
  if (!templatesDrawerReady || event.defaultPrevented) return;
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (event.altKey && !event.ctrlKey && !event.metaKey && key === 't') {
    event.preventDefault();
    toggleTemplatesDrawer();
    return;
  }
  if (key === 'escape' && templatesDrawerOpen) {
    event.preventDefault();
    closeTemplatesDrawer();
  }
}

function wireDrawerInternalEvents() {
  if (!templatesDrawerReady) return;
  if (templatesListEl) {
    templatesListEl.addEventListener('click', handleTemplateClick);
  }
  if (templatesModeGroup) {
    templatesModeGroup.addEventListener('click', handleModeClick);
  }
  if (templatesApplyBtn) {
    templatesApplyBtn.addEventListener('click', applySelectedTemplate);
  }
  if (templatesPasswordInput) {
    templatesPasswordInput.addEventListener('input', () => {
      if (templatesPasswordInput.value.trim()) {
        clearPasswordError();
      }
    });
    templatesPasswordInput.setAttribute('aria-invalid', 'false');
  }
  if (templatesDrawer) {
    templatesDrawer.addEventListener('keydown', handleDrawerKeydown);
  }
  document.addEventListener('keydown', handleGlobalKeydown);
}

/**
 * Initialize the templates drawer by rendering template cards, mode chips,
 * and wiring local event listeners.
 *
 * @returns {void}
 */
export function initTemplatesDrawer() {
  if (templatesDrawerReady) return;
  templatesBtn = document.getElementById('templatesBtn');
  templatesDrawer = document.getElementById('templatesDrawer');
  templatesBackdrop = document.getElementById('templatesBackdrop');
  templatesCloseBtn = document.getElementById('templatesCloseBtn');
  templatesListEl = document.getElementById('templatesList');
  templatesModeGroup = document.getElementById('templatesModeGroup');
  templatesPasswordInput = document.getElementById('templatesPassword');
  templatesApplyBtn = document.getElementById('templatesApplyBtn');
  templatesAuthSection = document.querySelector('.templates-auth');
  templatesTypeHint = document.getElementById('templatesTypeHint');

  templatesDrawerReady = Boolean(
    templatesDrawer
    && templatesBackdrop
    && templatesListEl
    && templatesModeGroup
    && templatesPasswordInput
    && templatesApplyBtn
  );

  if (!templatesDrawerReady) {
    return;
  }

  if (templatesBtn) {
    templatesBtn.setAttribute('aria-expanded', 'false');
  }
  templatesDrawer.setAttribute('aria-hidden', 'true');
  templatesBackdrop.setAttribute('aria-hidden', 'true');

  renderTemplatesList();
  renderModes();
  wireDrawerInternalEvents();
}

/**
 * Open the templates drawer while capturing the return focus target.
 *
 * @returns {void}
 */
export function openTemplatesDrawer() {
  if (!templatesDrawerReady) return;
  if (!templatesDrawerOpen) {
    rememberReturnFocus();
  }
  setTemplatesDrawer(true);
}

/**
 * Close the templates drawer and restore focus when appropriate.
 *
 * @param {{ skipFocus?: boolean }} [options] - Optional close options.
 * @returns {void}
 */
export function closeTemplatesDrawer(options = {}) {
  if (!templatesDrawerReady) return;
  const { skipFocus = false } = options;
  setTemplatesDrawer(false, { skipFocus });
}

/**
 * Toggle the templates drawer visibility, preserving focus safety.
 *
 * @returns {void}
 */
export function toggleTemplatesDrawer() {
  if (!templatesDrawerReady) return;
  if (!templatesDrawerOpen) {
    rememberReturnFocus();
  }
  setTemplatesDrawer(!templatesDrawerOpen);
}
