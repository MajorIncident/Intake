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
import {
  DEBRIEF_EVIDENCE_MODES,
  selectDebriefTargetAcrossWorkspaces
} from './classroomDebriefModel.js';

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
  for (const targetId of model?.recommendedTargetIds || []) {
    if (allowed.has(targetId)) return targetId;
  }
  for (const workspace of model?.workspaces || []) {
    for (const projection of workspace?.current?.targets || []) {
      if (projection?.empty) continue;
      const semanticId = projection?.familyId || projection?.id;
      if (allowed.has(semanticId)) return semanticId;
    }
  }
  return allowed.has('problem.one-line') ? 'problem.one-line' : options[0]?.id || '';
}

function hasAnyCheckpoint(model) {
  return (Array.isArray(model?.workspaces) ? model.workspaces : [])
    .some(workspace => Boolean(workspace?.checkpoint));
}

function evidenceMetaLabel(workspace, mode) {
  if (mode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT) {
    const revision = positiveInteger(workspace?.checkpoint?.workspaceRevision);
    return workspace?.checkpoint
      ? revision ? `Checkpoint · Revision ${revision}` : 'Checkpoint captured'
      : 'Checkpoint unavailable';
  }
  return progressLabel(workspace);
}

function progressLabel(workspace) {
  if (workspace?.readiness && typeof workspace.readiness.readyForDebrief === 'boolean') {
    const ready = workspace.readiness.readyForDebrief;
    const revision = ready
      ? positiveInteger(workspace.readiness.workspaceRevision)
      : positiveInteger(workspace?.current?.workspaceRevision);
    const state = ready ? 'Ready' : 'Working';
    return revision ? `${state} · Revision ${revision}` : state;
  }
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

function coachingRecord(workspace, targetId) {
  if (typeof targetId !== 'string' || !targetId) return null;
  return (Array.isArray(workspace?.coaching?.targets) ? workspace.coaching.targets : [])
    .find(record => record?.targetId === targetId) || null;
}

function renderCoachingBadges(documentRef, workspace, projection, mode) {
  const record = coachingRecord(workspace, projection?.id);
  if (!record) return null;

  const container = documentRef.createElement('div');
  container.className = 'instructor-debrief-coaching';
  container.setAttribute('aria-label', 'Instructor coaching status');

  if (mode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT) {
    const context = documentRef.createElement('span');
    context.className = 'instructor-debrief-coaching__context';
    context.textContent = 'Current coaching';
    container.append(context);
  }

  const status = documentRef.createElement('span');
  const meets = record.status === 'meets-standard';
  status.className = meets
    ? 'instructor-debrief-coaching__badge instructor-debrief-coaching__badge--meets'
    : 'instructor-debrief-coaching__badge instructor-debrief-coaching__badge--needs';
  status.textContent = meets ? 'Meets standard' : 'Needs improvement';
  container.append(status);

  if (record.changedSinceReview) {
    const changed = documentRef.createElement('span');
    changed.className = 'instructor-debrief-coaching__badge instructor-debrief-coaching__badge--changed';
    changed.textContent = 'Changed since review';
    container.append(changed);
  }

  return container;
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
  let evidenceMode = DEBRIEF_EVIDENCE_MODES.CURRENT;
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

  const renderRecommendations = () => {
    const panel = element('instructorDebriefRecommendations');
    const list = element('instructorDebriefRecommendationList');
    if (!panel || !list) return;
    list.replaceChildren();

    const ids = (Array.isArray(model?.recommendedTargetIds) ? model.recommendedTargetIds : [])
      .filter(targetId => optionById.has(targetId));
    panel.hidden = ids.length === 0;
    if (!ids.length) return;

    ids.forEach(targetId => {
      const definition = optionById.get(targetId);
      const control = button(
        documentRef,
        definition?.label || targetId,
        () => {
          selectedTargetId = targetId;
          renderTargetOptions();
          renderRecommendations();
          renderComparison();
        },
        'instructor-debrief-recommendation'
      );
      control.setAttribute('aria-pressed', selectedTargetId === targetId ? 'true' : 'false');
      list.append(control);
    });
  };

  const renderEvidenceMode = () => {
    const group = element('instructorDebriefEvidenceMode');
    const current = element('instructorDebriefCurrentBtn');
    const checkpoint = element('instructorDebriefCheckpointBtn');
    const sourceLabel = element('instructorDebriefEvidenceSourceLabel');
    const help = element('instructorDebriefTargetHelp');
    const checkpointAvailable = hasAnyCheckpoint(model);

    if (evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT && !checkpointAvailable) {
      evidenceMode = DEBRIEF_EVIDENCE_MODES.CURRENT;
    }

    if (group) group.hidden = !checkpointAvailable;
    if (current) current.setAttribute('aria-pressed', evidenceMode === DEBRIEF_EVIDENCE_MODES.CURRENT ? 'true' : 'false');
    if (checkpoint) {
      checkpoint.setAttribute('aria-pressed', evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT ? 'true' : 'false');
      checkpoint.disabled = !checkpointAvailable;
    }
    if (sourceLabel) {
      sourceLabel.textContent = evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT
        ? 'Immutable debrief checkpoint'
        : 'Current live evidence';
    }
    if (help) {
      help.textContent = checkpointAvailable
        ? 'Switch between current live evidence and the immutable current-stage checkpoint. Stage focus suggestions never hide or score other Intake targets.'
        : 'Compare current live evidence. Stage focus suggestions never hide or score other Intake targets.';
    }
  };

  const renderProgress = () => {
    const summary = element('instructorDebriefProgressSummary');
    const list = element('instructorDebriefProgressList');
    if (!summary || !list) return;
    list.replaceChildren();

    const workspaces = Array.isArray(model?.workspaces) ? model.workspaces : [];
    const readinessRows = workspaces.filter(workspace => (
      workspace?.readiness && typeof workspace.readiness.readyForDebrief === 'boolean'
    ));
    if (readinessRows.length) {
      const readyCount = readinessRows.filter(workspace => workspace.readiness.readyForDebrief).length;
      const workingCount = readinessRows.length - readyCount;
      const unknownCount = workspaces.length - readinessRows.length;
      summary.textContent = `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} · ${readyCount} ready · ${workingCount} working${unknownCount ? ` · ${unknownCount} no stage status` : ''}`;
    } else {
      const activeCount = workspaces.filter(workspace => Number(workspace.activeParticipantCount) > 0).length;
      const editingCount = workspaces.filter(workspace => Number(workspace.editingParticipantCount) > 0).length;
      summary.textContent = workspaces.length
        ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} · ${activeCount} active${editingCount ? ` · ${editingCount} editing` : ''}`
        : 'No workspaces';
    }

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
      if (workspace?.readiness?.readyForDebrief === true) {
        state.classList.add('instructor-debrief-progress__state--ready');
      } else if (workspace?.readiness?.readyForDebrief === false) {
        state.classList.add('instructor-debrief-progress__state--working');
      }
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
    const selectedCells = selectDebriefTargetAcrossWorkspaces(
      model,
      selectedTargetId,
      { mode: evidenceMode }
    );
    const cellByWorkspace = new Map(
      selectedCells.map(cell => [cell.workspace.id, cell])
    );
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
      card.dataset.debriefWorkspaceId = workspace.id || '';

      const header = documentRef.createElement('header');
      const identity = documentRef.createElement('div');
      const name = documentRef.createElement('strong');
      name.textContent = workspace.label || 'Workspace';
      const meta = documentRef.createElement('span');
      meta.textContent = evidenceMetaLabel(workspace, evidenceMode);
      identity.append(name, meta);
      const open = button(
        documentRef,
        evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT ? 'Observe live' : 'Observe',
        () => { void onSelectWorkspace(workspace.id); },
        'btn-secondary instructor-debrief-cell__observe'
      );
      open.setAttribute(
        'aria-label',
        evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT
          ? `Observe current live Intake for ${workspace.label || 'workspace'}`
          : `Observe ${workspace.label || 'workspace'}`
      );
      header.append(identity, open);

      const body = documentRef.createElement('div');
      body.className = 'instructor-debrief-cell__evidence';
      const selectedCell = cellByWorkspace.get(workspace.id) || null;
      const projections = selectedCell?.projections || [];

      if (!selectedCell?.sourceAvailable) {
        const empty = documentRef.createElement('p');
        empty.className = 'instructor-debrief-cell__empty';
        empty.textContent = evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT
          ? 'Checkpoint unavailable for this workspace.'
          : 'Live Intake unavailable.';
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
          const coaching = renderCoachingBadges(documentRef, workspace, projection, evidenceMode);
          if (coaching) evidence.append(coaching);
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
    renderRecommendations();
    renderEvidenceMode();
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
      if (evidenceMode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT && !hasAnyCheckpoint(model)) {
        evidenceMode = DEBRIEF_EVIDENCE_MODES.CURRENT;
      }
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
    evidenceMode = DEBRIEF_EVIDENCE_MODES.CURRENT;
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
    evidenceMode = DEBRIEF_EVIDENCE_MODES.CURRENT;
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
    renderRecommendations();
    renderComparison();
  };
  const setEvidenceMode = mode => {
    const next = mode === DEBRIEF_EVIDENCE_MODES.CHECKPOINT
      ? DEBRIEF_EVIDENCE_MODES.CHECKPOINT
      : DEBRIEF_EVIDENCE_MODES.CURRENT;
    if (next === DEBRIEF_EVIDENCE_MODES.CHECKPOINT && !hasAnyCheckpoint(model)) return false;
    evidenceMode = next;
    renderEvidenceMode();
    renderComparison();
    return true;
  };
  const handleCurrentMode = () => { setEvidenceMode(DEBRIEF_EVIDENCE_MODES.CURRENT); };
  const handleCheckpointMode = () => { setEvidenceMode(DEBRIEF_EVIDENCE_MODES.CHECKPOINT); };

  const init = () => {
    renderTargetOptions();
    element('instructorDebriefRefreshBtn')?.addEventListener('click', handleRefresh);
    element('instructorDebriefTargetSelect')?.addEventListener('change', handleTargetChange);
    element('instructorDebriefCurrentBtn')?.addEventListener('click', handleCurrentMode);
    element('instructorDebriefCheckpointBtn')?.addEventListener('click', handleCheckpointMode);
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    disconnect();
    element('instructorDebriefRefreshBtn')?.removeEventListener('click', handleRefresh);
    element('instructorDebriefTargetSelect')?.removeEventListener('change', handleTargetChange);
    element('instructorDebriefCurrentBtn')?.removeEventListener('click', handleCurrentMode);
    element('instructorDebriefCheckpointBtn')?.removeEventListener('click', handleCheckpointMode);
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
      evidenceMode,
      checkpointAvailable: hasAnyCheckpoint(model),
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
