/**
 * @module classroomDebriefComparison
 * @summary Instructor-only presentation controller for #319 class debrief comparison.
 * @description
 * Consumes the GET-only /api/classes/debrief derived read model. Comparison state
 * is presentation-only: no localStorage/sessionStorage/Intake persistence, no
 * snapshot application, and no coaching or collaboration mutation.
 */

import {
  listIntakeTargetDefinitions,
  listIntakeTargetFamilyDefinitions
} from './intakeTargets.js';

export const INSTRUCTOR_DEBRIEF_ENDPOINT = '/api/classes/debrief';
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REFRESH_MS = 5000;

function text(value) {
  return typeof value === 'string' ? value : '';
}

function createLocalElement(documentRef, tagName) {
  return documentRef.createElement(tagName);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function targetOptions() {
  return [
    ...listIntakeTargetDefinitions().map(definition => ({
      id: definition.id,
      label: definition.label,
      section: definition.section,
      kind: definition.kind
    })),
    ...listIntakeTargetFamilyDefinitions().map(definition => ({
      id: definition.id,
      label: definition.label,
      section: definition.section,
      kind: definition.kind
    }))
  ];
}

export function listDebriefTargetOptions() {
  return targetOptions().map(option => ({ ...option }));
}

function modelLooksValid(model) {
  return Boolean(
    model
    && typeof model === 'object'
    && !Array.isArray(model)
    && model.class
    && typeof model.class === 'object'
    && Array.isArray(model.workspaces)
  );
}

function chooseDefaultTarget(model, options) {
  const allowed = new Set(options.map(option => option.id));
  for (const workspace of model?.workspaces || []) {
    for (const projection of workspace?.current?.targets || []) {
      if (projection?.empty) continue;
      const semanticId = projection?.familyId || projection?.id;
      if (allowed.has(semanticId)) return semanticId;
    }
  }
  return allowed.has('problem.one-line') ? 'problem.one-line' : options[0]?.id || '';
}

function selectWorkspaceProjections(workspace, targetId) {
  const targets = Array.isArray(workspace?.current?.targets) ? workspace.current.targets : [];
  const isFamily = listIntakeTargetFamilyDefinitions().some(family => family.id === targetId);
  return isFamily
    ? targets.filter(target => target?.familyId === targetId)
    : targets.filter(target => target?.id === targetId);
}

function progressLabel(workspace) {
  if (!workspace?.current) return 'No live Intake';
  const active = Math.max(0, Number(workspace.activeParticipantCount) || 0);
  const editing = Math.max(0, Number(workspace.editingParticipantCount) || 0);
  const revision = positiveInteger(workspace.current.workspaceRevision);
  const activity = editing > 0
    ? `${editing} editing`
    : active > 0
      ? `${active} active`
      : 'No recent activity';
  return revision ? `${activity} · Revision ${revision}` : activity;
}

function comparisonText(projection) {
  const value = text(projection?.comparisonText).trim();
  return value || 'No evidence captured.';
}

function button(documentRef, label, onClick, className = 'btn-secondary') {
  const control = createLocalElement(documentRef, 'button');
  control.type = 'button';
  control.className = className;
  control.textContent = label;
  control.setAttribute('data-persistence', 'local-only');
  control.setAttribute('data-summary', 'exclude');
  control.addEventListener('click', onClick);
  return control;
}

/**
 * Create the Instructor debrief comparison presentation controller.
 *
 * @param {object} [options] Dependencies.
 * @returns {object} Controller.
 */
export function createClassroomDebriefComparisonController({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch,
  AbortControllerImpl = globalThis.AbortController,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  onSelectWorkspace = () => {},
  toast = () => {}
} = {}) {
  let instructorToken = '';
  let model = null;
  let selectedTargetId = '';
  let loading = false;
  let lastError = '';
  let refreshTimer = null;
  let refreshAbort = null;
  let destroyed = false;

  const options = targetOptions();
  const optionById = new Map(options.map(option => [option.id, option]));
  const element = id => documentRef?.getElementById?.(id) || null;

  const clearTimer = () => {
    if (refreshTimer !== null && typeof clearTimeoutImpl === 'function') {
      clearTimeoutImpl(refreshTimer);
    }
    refreshTimer = null;
  };

  const abortRefresh = () => {
    try { refreshAbort?.abort?.(); } catch {}
    refreshAbort = null;
  };

  const setStatus = (message, { error = false } = {}) => {
    const status = element('instructorDebriefStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };

  const renderTargetOptions = () => {
    const select = element('instructorDebriefTargetSelect');
    if (!select) return;
    select.replaceChildren();

    const sections = new Map();
    options.forEach(option => {
      const section = option.section || 'Other';
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(option);
    });

    sections.forEach((items, section) => {
      const group = documentRef.createElement('optgroup');
      group.label = section;
      items.forEach(item => {
        const option = createLocalElement(documentRef, 'option');
        option.value = item.id;
        option.textContent = item.label;
        option.setAttribute('data-persistence', 'local-only');
        option.setAttribute('data-summary', 'exclude');
        group.append(option);
      });
      select.append(group);
    });

    select.value = selectedTargetId;
  };

  const renderProgress = () => {
    const summary = element('instructorDebriefProgressSummary');
    const list = element('instructorDebriefProgressList');
    if (!summary || !list) return;
    list.replaceChildren();

    const workspaces = Array.isArray(model?.workspaces) ? model.workspaces : [];
    const activeCount = workspaces.filter(workspace => Number(workspace.activeParticipantCount) > 0).length;
    const editingCount = workspaces.filter(workspace => Number(workspace.editingParticipantCount) > 0).length;
    summary.textContent = workspaces.length
      ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} · ${activeCount} active${editingCount ? ` · ${editingCount} editing` : ''}`
      : 'No workspaces';

    if (!workspaces.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'instructor-debrief-comparison__empty';
      empty.textContent = 'Create or assign class workspaces to compare live Intake evidence.';
      list.append(empty);
      return;
    }

    workspaces.forEach(workspace => {
      const row = button(
        documentRef,
        '',
        () => { void onSelectWorkspace(workspace.id); },
        'instructor-debrief-progress__row'
      );
      row.setAttribute('aria-label', `Observe ${workspace.label || 'workspace'}`);

      const identity = documentRef.createElement('span');
      identity.className = 'instructor-debrief-progress__identity';
      const name = documentRef.createElement('strong');
      name.textContent = workspace.label || 'Workspace';
      const members = documentRef.createElement('small');
      const participantCount = Math.max(0, Number(workspace.participantCount) || 0);
      members.textContent = `${participantCount} participant${participantCount === 1 ? '' : 's'}`;
      identity.append(name, members);

      const state = documentRef.createElement('span');
      state.className = 'instructor-debrief-progress__state';
      state.textContent = progressLabel(workspace);

      row.append(identity, state);
      list.append(row);
    });
  };

  const renderComparison = () => {
    const title = element('instructorDebriefComparisonTitle');
    const matrix = element('instructorDebriefMatrix');
    if (!title || !matrix) return;
    matrix.replaceChildren();

    const definition = optionById.get(selectedTargetId);
    title.textContent = definition?.label || 'Selected Intake target';

    const workspaces = Array.isArray(model?.workspaces) ? model.workspaces : [];
    if (!workspaces.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'instructor-debrief-comparison__empty';
      empty.textContent = 'No workspaces are available for comparison.';
      matrix.append(empty);
      return;
    }

    workspaces.forEach(workspace => {
      const card = documentRef.createElement('article');
      card.className = 'instructor-debrief-cell';
      card.dataset.workspaceId = workspace.id || '';

      const header = documentRef.createElement('header');
      const identity = documentRef.createElement('div');
      const name = documentRef.createElement('strong');
      name.textContent = workspace.label || 'Workspace';
      const meta = documentRef.createElement('span');
      meta.textContent = progressLabel(workspace);
      identity.append(name, meta);
      const open = button(
        documentRef,
        'Observe',
        () => { void onSelectWorkspace(workspace.id); },
        'btn-secondary instructor-debrief-cell__observe'
      );
      open.setAttribute('aria-label', `Observe ${workspace.label || 'workspace'}`);
      header.append(identity, open);

      const body = documentRef.createElement('div');
      body.className = 'instructor-debrief-cell__evidence';
      const projections = selectWorkspaceProjections(workspace, selectedTargetId);

      if (!workspace.current) {
        const empty = documentRef.createElement('p');
        empty.className = 'instructor-debrief-cell__empty';
        empty.textContent = 'Live Intake unavailable.';
        body.append(empty);
      } else if (!projections.length) {
        const empty = documentRef.createElement('p');
        empty.className = 'instructor-debrief-cell__empty';
        empty.textContent = 'No evidence captured.';
        body.append(empty);
      } else {
        projections.forEach(projection => {
          const evidence = documentRef.createElement('div');
          evidence.className = 'instructor-debrief-evidence';
          if (projection.familyId) {
            const label = documentRef.createElement('strong');
            label.textContent = projection.label || 'Possible Cause';
            evidence.append(label);
          }
          const copy = documentRef.createElement('p');
          copy.textContent = comparisonText(projection);
          evidence.append(copy);
          body.append(evidence);
        });
      }

      card.append(header, body);
      matrix.append(card);
    });
  };

  const render = () => {
    const panel = element('instructorDebriefComparison');
    if (!panel) return;
    panel.hidden = !instructorToken;
    if (!instructorToken) return;

    renderProgress();
    renderTargetOptions();
    renderComparison();

    const refresh = element('instructorDebriefRefreshBtn');
    if (refresh) refresh.disabled = loading;

    if (loading) setStatus('Refreshing class comparison…');
    else if (lastError) setStatus(lastError, { error: true });
    else {
      const classTitle = text(model?.class?.title) || 'Instructor class';
      setStatus(model ? `Live comparison · ${classTitle}` : 'Loading class comparison…');
    }
  };

  const scheduleRefresh = () => {
    clearTimer();
    if (
      !instructorToken
      || destroyed
      || typeof setTimeoutImpl !== 'function'
    ) return;
    refreshTimer = setTimeoutImpl(() => {
      refreshTimer = null;
      void refresh();
    }, REFRESH_MS);
  };

  const responseJson = async response => response.json().catch(() => ({}));

  async function refresh() {
    if (!instructorToken || destroyed || loading || typeof fetchImpl !== 'function') return false;
    loading = true;
    lastError = '';
    abortRefresh();
    refreshAbort = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
    render();

    try {
      const response = await fetchImpl(INSTRUCTOR_DEBRIEF_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${instructorToken}` },
        signal: refreshAbort?.signal
      });
      const body = await responseJson(response);
      refreshAbort = null;

      if (!instructorToken || destroyed) return false;
      if (!response.ok || !modelLooksValid(body)) {
        lastError = response.status === 404
          ? 'Class comparison is no longer available.'
          : 'Could not refresh class comparison.';
        return false;
      }

      model = body;
      if (!selectedTargetId || !optionById.has(selectedTargetId)) {
        selectedTargetId = chooseDefaultTarget(model, options);
      }
      lastError = '';
      return true;
    } catch {
      refreshAbort = null;
      if (!instructorToken || destroyed) return false;
      lastError = 'Offline · class comparison will retry.';
      return false;
    } finally {
      loading = false;
      render();
      scheduleRefresh();
    }
  }

  const connectInstructor = token => {
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (!CAPABILITY_PATTERN.test(normalized) || destroyed) return false;
    instructorToken = normalized;
    model = null;
    selectedTargetId = '';
    lastError = '';
    clearTimer();
    render();
    void refresh();
    return true;
  };

  const disconnect = () => {
    clearTimer();
    abortRefresh();
    instructorToken = '';
    model = null;
    selectedTargetId = '';
    loading = false;
    lastError = '';
    const panel = element('instructorDebriefComparison');
    if (panel) panel.hidden = true;
    const progress = element('instructorDebriefProgressList');
    progress?.replaceChildren?.();
    const matrix = element('instructorDebriefMatrix');
    matrix?.replaceChildren?.();
  };

  const handleRefresh = () => { void refresh(); };
  const handleTargetChange = event => {
    const next = text(event?.target?.value);
    if (!optionById.has(next)) return;
    selectedTargetId = next;
    renderComparison();
  };

  const init = () => {
    renderTargetOptions();
    element('instructorDebriefRefreshBtn')?.addEventListener('click', handleRefresh);
    element('instructorDebriefTargetSelect')?.addEventListener('change', handleTargetChange);
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    disconnect();
    element('instructorDebriefRefreshBtn')?.removeEventListener('click', handleRefresh);
    element('instructorDebriefTargetSelect')?.removeEventListener('change', handleTargetChange);
  };

  return {
    init,
    destroy,
    connectInstructor,
    disconnect,
    refresh,
    getState: () => ({
      connected: Boolean(instructorToken),
      loading,
      selectedTargetId,
      workspaceCount: Array.isArray(model?.workspaces) ? model.workspaces.length : 0,
      lastError
    })
  };
}

export function initClassroomDebriefComparison(options) {
  const controller = createClassroomDebriefComparisonController(options);
  controller.init();
  return controller;
}
