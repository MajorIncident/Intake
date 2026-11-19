/**
 * @module classroomCaseAssignment
 * @summary Instructor panel that loads a protected Case Study into class workspaces (#343).
 * @description
 *   Owns the `[feature:instructor-case-assignment]` region of the Instructor
 *   shell: Case Study, starting point (template mode), and target workspace
 *   selects, the load button, the result status line, and the live display of
 *   the pedagogical mode password for Students who open a Case Study
 *   themselves.
 *
 *   The protected payload never reaches this browser. The panel posts the
 *   selection to `POST /api/classes/case-studies/assign`; the server projects
 *   the Case Study and writes it as the next collaboration revision of each
 *   workspace, so Students receive it on their next poll. Untouched
 *   workspaces load directly. Workspaces with Student work are listed in a
 *   confirmation and replaced only with the exact revision the Instructor saw.
 *
 *   Inputs: the Instructor capability (`connectInstructor`), the Case Study
 *   catalog (`getCatalog`, refreshed on `intake:protected-case-studies-changed`),
 *   and the roster (`setWorkspaces`, fed by the Instructor controller). Nothing
 *   here is Intake state: no persistence, no summary, no export.
 */

import { TEMPLATE_MODES, templateModePassword } from './templateModes.js';

export const INSTRUCTOR_CASE_ASSIGN_ENDPOINT = '/api/classes/case-studies/assign';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_REFRESH_MS = 10000;
const MODE_NAMES = new Map(TEMPLATE_MODES.map(mode => [mode.id, mode.name]));

/**
 * Human name for a template mode.
 * @param {string} modeId - Mode identifier.
 * @returns {string} Display name.
 */
export function caseAssignmentModeName(modeId) {
  return MODE_NAMES.get(modeId) || modeId;
}

/**
 * Joins workspace names for a sentence ("A", "A and B", "A, B and C").
 * @param {string[]} names - Names to join.
 * @returns {string} Readable list.
 */
function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Creates the Instructor Case Study assignment controller.
 * @param {object} [options] - Dependencies.
 * @param {Function} [options.fetchImpl] - Fetch implementation.
 * @param {Document} [options.documentRef] - Document owning the panel.
 * @param {Window} [options.windowRef] - Window for catalog-change events.
 * @param {() => Array<object>} [options.getCatalog] - Authorized Case Study catalog provider.
 * @param {(message: string) => boolean} [options.confirmImpl] - Confirmation prompt.
 * @param {() => number} [options.now] - Clock for the mode password.
 * @param {() => void} [options.onLoaded] - Called after any workspace changed (refreshes the roster).
 * @param {Function} [options.setIntervalImpl] - Interval scheduler.
 * @param {Function} [options.clearIntervalImpl] - Interval canceller.
 * @returns {object} Controller API.
 */
export function createInstructorCaseAssignmentController({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  getCatalog = () => [],
  confirmImpl = message => (typeof windowRef?.confirm === 'function' ? windowRef.confirm(message) === true : false),
  now = () => Date.now(),
  onLoaded = () => {},
  setIntervalImpl = globalThis.setInterval?.bind(globalThis),
  clearIntervalImpl = globalThis.clearInterval?.bind(globalThis)
} = {}) {
  let capability = '';
  let epoch = 0;
  let workspaces = [];
  let catalog = [];
  let selectedCaseStudyId = '';
  let selectedMode = '';
  let selectedTarget = 'all';
  let busy = false;
  let status = '';
  let passwordTimer = null;
  let destroyed = false;

  const element = id => documentRef?.getElementById?.(id) || null;

  const selectedCaseStudy = () => catalog.find(item => item.id === selectedCaseStudyId) || null;

  const option = (value, text) => {
    const item = documentRef.createElement('option'); // data-persistence="local-only"
    item.value = value;
    item.textContent = text;
    item.setAttribute('data-persistence', 'local-only');
    item.setAttribute('data-summary', 'exclude');
    return item;
  };

  const renderCaseSelect = () => {
    const select = element('instructorCaseAssignmentCase');
    if (!select) return;
    select.replaceChildren(option('', catalog.length ? 'Select a Case Study' : 'No Case Studies available'));
    catalog.forEach(item => select.append(option(item.id, item.name)));
    if (!catalog.some(item => item.id === selectedCaseStudyId)) selectedCaseStudyId = '';
    select.value = selectedCaseStudyId;
    select.disabled = busy || !capability || catalog.length === 0;
  };

  const renderModeSelect = () => {
    const select = element('instructorCaseAssignmentMode');
    if (!select) return;
    const caseStudy = selectedCaseStudy();
    const modes = caseStudy ? TEMPLATE_MODES.filter(mode => caseStudy.supportedModes.includes(mode.id)) : TEMPLATE_MODES;
    select.replaceChildren(...modes.map(mode => option(mode.id, mode.name)));
    if (!modes.some(mode => mode.id === selectedMode)) selectedMode = modes[0]?.id || '';
    select.value = selectedMode;
    select.disabled = busy || !caseStudy;
  };

  const renderTargetSelect = () => {
    const select = element('instructorCaseAssignmentTarget');
    if (!select) return;
    select.replaceChildren(option('all', 'All workspaces'));
    workspaces.forEach(workspace => {
      select.append(option(workspace.id, `${workspace.kind === 'group' ? 'Team' : 'Individual'} · ${workspace.label}`));
    });
    if (selectedTarget !== 'all' && !workspaces.some(workspace => workspace.id === selectedTarget)) selectedTarget = 'all';
    select.value = selectedTarget;
    select.disabled = busy || !capability;
  };

  const renderPassword = () => {
    const value = element('instructorCaseAssignmentPasswordValue');
    const modeName = element('instructorCaseAssignmentPasswordMode');
    const wrapper = element('instructorCaseAssignmentPassword');
    const password = selectedCaseStudy() ? templateModePassword(selectedMode, new Date(now())) : '';
    if (wrapper) wrapper.hidden = !password;
    if (value) value.textContent = password;
    if (modeName) modeName.textContent = caseAssignmentModeName(selectedMode);
  };

  const render = () => {
    if (destroyed) return;
    renderCaseSelect();
    renderModeSelect();
    renderTargetSelect();
    renderPassword();
    const button = element('instructorCaseAssignmentBtn');
    if (button) {
      button.disabled = busy || !capability || !selectedCaseStudy() || !selectedMode || workspaces.length === 0;
      button.textContent = busy ? 'Loading…' : 'Load Case Study';
    }
    const statusEl = element('instructorCaseAssignmentStatus');
    if (statusEl) statusEl.textContent = status;
  };

  const refreshCatalog = () => {
    const records = typeof getCatalog === 'function' ? getCatalog() : [];
    catalog = Array.isArray(records)
      ? records.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.supportedModes))
      : [];
    render();
  };

  const stopPasswordClock = () => {
    if (passwordTimer !== null) clearIntervalImpl?.(passwordTimer);
    passwordTimer = null;
  };

  const startPasswordClock = () => {
    stopPasswordClock();
    if (typeof setIntervalImpl === 'function') passwordTimer = setIntervalImpl(renderPassword, PASSWORD_REFRESH_MS);
  };

  const post = async body => {
    const response = await fetchImpl(INSTRUCTOR_CASE_ASSIGN_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${capability}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  const describe = ({ caseLabel, loaded, kept, changed, missing }) => {
    const parts = [];
    if (loaded.length) {
      parts.push(`Loaded ${caseLabel} into ${loaded.length} workspace${loaded.length === 1 ? '' : 's'}.`);
    } else {
      parts.push(`${caseLabel} was not loaded into any workspace.`);
    }
    if (kept.length) parts.push(`${joinNames(kept)} kept ${kept.length === 1 ? 'its' : 'their'} work.`);
    if (changed.length) {
      parts.push(`${joinNames(changed)} changed while you were deciding, so ${changed.length === 1 ? 'it was' : 'they were'} not replaced. Try again to see the latest work.`);
    }
    if (missing.length) parts.push(`${missing.length} workspace${missing.length === 1 ? ' no longer exists' : 's no longer exist'}.`);
    return parts.join(' ');
  };

  /**
   * Loads the selected Case Study into the selected workspace(s).
   * @param {{caseStudyId?: string, mode?: string, target?: string}} [selection] - Overrides for the current selection.
   * @returns {Promise<{loaded: number, kept: number, changed: number, missing: number}|null>} Outcome counts, or null when nothing was sent.
   */
  const loadCaseStudy = async (selection = {}) => {
    if (selection.caseStudyId !== undefined) selectedCaseStudyId = selection.caseStudyId;
    if (selection.mode !== undefined) selectedMode = selection.mode;
    if (selection.target !== undefined) selectedTarget = selection.target;
    const caseStudy = selectedCaseStudy();
    if (destroyed || busy || !capability || !caseStudy || !caseStudy.supportedModes.includes(selectedMode)
      || typeof fetchImpl !== 'function') return null;
    if (!workspaces.length) {
      status = 'Create a workspace first.';
      render();
      return null;
    }

    const localEpoch = epoch;
    const caseLabel = `${caseStudy.name} (${caseAssignmentModeName(selectedMode)})`;
    const base = { caseStudyId: caseStudy.id, mode: selectedMode };
    const loaded = [];
    const kept = [];
    const changed = [];
    const missing = [];
    busy = true;
    status = `Loading ${caseLabel}…`;
    render();
    try {
      const first = await post({
        ...base,
        targets: selectedTarget === 'all' ? 'all' : [{ workspaceId: selectedTarget }]
      });
      if (localEpoch !== epoch || destroyed) return null;
      if (!first.response.ok || !Array.isArray(first.payload.results)) {
        status = first.response.status === 401
          ? 'This class is no longer managed from this device.'
          : (typeof first.payload.error === 'string' && first.payload.error) || 'Could not load the Case Study. Try again.';
        return null;
      }
      const label = result => result.label || 'A workspace';
      const withWork = [];
      first.payload.results.forEach(result => {
        if (result.status === 'loaded') loaded.push(label(result));
        else if (result.status === 'has-work') withWork.push(result);
        else if (result.status === 'changed') changed.push(label(result));
        else missing.push(result.workspaceId);
      });

      if (withWork.length) {
        const names = withWork.map(label);
        const proceed = confirmImpl(
          `${joinNames(names)} already ${names.length === 1 ? 'has' : 'have'} Student work. `
          + `Replace it with ${caseLabel}? Their current work will be overwritten for everyone in `
          + `${names.length === 1 ? 'that workspace' : 'those workspaces'}. Choose Cancel to keep it.`
        );
        if (localEpoch !== epoch || destroyed) return null;
        if (!proceed) {
          kept.push(...names);
        } else {
          const second = await post({
            ...base,
            replaceExisting: true,
            targets: withWork.map(result => ({ workspaceId: result.workspaceId, expectedRevision: result.revision }))
          });
          if (localEpoch !== epoch || destroyed) return null;
          if (!second.response.ok || !Array.isArray(second.payload.results)) {
            kept.push(...names);
          } else {
            second.payload.results.forEach(result => {
              if (result.status === 'loaded') loaded.push(label(result));
              else if (result.status === 'not-found') missing.push(result.workspaceId);
              else changed.push(label(result));
            });
          }
        }
      }

      status = describe({ caseLabel, loaded, kept, changed, missing });
      if (loaded.length) {
        try { onLoaded(); } catch {}
      }
      return { loaded: loaded.length, kept: kept.length, changed: changed.length, missing: missing.length };
    } catch {
      if (localEpoch === epoch && !destroyed) status = 'Could not load the Case Study. Check your connection and try again.';
      return null;
    } finally {
      if (localEpoch === epoch && !destroyed) {
        busy = false;
        render();
      }
    }
  };

  const handleCaseChange = event => {
    selectedCaseStudyId = event.target.value || '';
    status = '';
    render();
  };
  const handleModeChange = event => {
    selectedMode = event.target.value || '';
    render();
  };
  const handleTargetChange = event => {
    selectedTarget = event.target.value || 'all';
    render();
  };
  const handleSubmit = event => {
    event.preventDefault();
    void loadCaseStudy();
  };
  const handleCatalogChanged = () => refreshCatalog();

  const init = () => {
    element('instructorCaseAssignmentForm')?.addEventListener('submit', handleSubmit);
    element('instructorCaseAssignmentCase')?.addEventListener('change', handleCaseChange);
    element('instructorCaseAssignmentMode')?.addEventListener('change', handleModeChange);
    element('instructorCaseAssignmentTarget')?.addEventListener('change', handleTargetChange);
    windowRef?.addEventListener?.('intake:protected-case-studies-changed', handleCatalogChanged);
    refreshCatalog();
  };

  /**
   * Connects the panel to an Instructor capability.
   * @param {string} token - Instructor capability.
   * @returns {boolean} Whether the capability was accepted.
   */
  const connectInstructor = token => {
    const value = typeof token === 'string' ? token.trim() : '';
    epoch += 1;
    busy = false;
    status = '';
    capability = CAPABILITY_PATTERN.test(value) ? value : '';
    if (capability) startPasswordClock();
    else stopPasswordClock();
    refreshCatalog();
    return Boolean(capability);
  };

  /** Disconnects the panel and forgets the capability and roster. @returns {void} */
  const disconnect = () => {
    epoch += 1;
    capability = '';
    workspaces = [];
    busy = false;
    status = '';
    stopPasswordClock();
    render();
  };

  /**
   * Receives the Instructor roster.
   * @param {Array<{id: string, label: string, kind: string}>} list - Live workspaces.
   * @returns {void}
   */
  const setWorkspaces = list => {
    workspaces = Array.isArray(list)
      ? list.filter(item => item && typeof item.id === 'string' && typeof item.label === 'string')
        .map(item => ({ id: item.id, label: item.label, kind: item.kind === 'individual' ? 'individual' : 'group' }))
      : [];
    render();
  };

  const destroy = () => {
    disconnect();
    destroyed = true;
    element('instructorCaseAssignmentForm')?.removeEventListener('submit', handleSubmit);
    element('instructorCaseAssignmentCase')?.removeEventListener('change', handleCaseChange);
    element('instructorCaseAssignmentMode')?.removeEventListener('change', handleModeChange);
    element('instructorCaseAssignmentTarget')?.removeEventListener('change', handleTargetChange);
    windowRef?.removeEventListener?.('intake:protected-case-studies-changed', handleCatalogChanged);
  };

  return {
    init,
    destroy,
    connectInstructor,
    disconnect,
    setWorkspaces,
    refreshCatalog,
    loadCaseStudy,
    getState: () => ({
      connected: Boolean(capability),
      busy,
      status,
      selectedCaseStudyId,
      selectedMode,
      selectedTarget,
      workspaceCount: workspaces.length,
      catalogCount: catalog.length,
      password: selectedCaseStudy() ? templateModePassword(selectedMode, new Date(now())) : ''
    })
  };
}

/**
 * Creates and initializes the Instructor Case Study assignment panel.
 * @param {Parameters<typeof createInstructorCaseAssignmentController>[0]} options - Dependencies.
 * @returns {ReturnType<typeof createInstructorCaseAssignmentController>} Controller.
 */
export function initInstructorCaseAssignment(options) {
  const controller = createInstructorCaseAssignmentController(options);
  controller.init();
  return controller;
}
