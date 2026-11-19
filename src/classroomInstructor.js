/**
 * @module classroomInstructor
 * @summary Owns Instructor class resume, workspace navigation, and read-only live Intake observation.
 * @description
 *   The Instructor capability is persisted only in a dedicated local resume
 *   envelope. Workspace observation uses the Instructor-only GET endpoint and
 *   projects snapshots into the existing Intake DOM without persisting observed
 *   state or acquiring an editable Student workspace capability.
 */

import { getActiveExperienceRole } from './experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from './experienceRoles.js';
import { buildClassroomJoinUrl } from './classroomJoinLink.js';
import { renderClassroomJoinQr } from './classroomJoinQr.js';
import { TEMPLATE_MODES } from './templateModes.js';

export const INSTRUCTOR_SESSION_STORAGE_KEY = 'kt-classroom-instructor-session-v1';
export const INSTRUCTOR_SESSION_VERSION = 1;
export const INSTRUCTOR_CLASSES_ENDPOINT = '/api/classes';
export const INSTRUCTOR_WORKSPACES_ENDPOINT = '/api/classes/workspaces';
export const INSTRUCTOR_PARTICIPANTS_ENDPOINT = '/api/classes/participants';
export const INSTRUCTOR_OBSERVE_ENDPOINT = '/api/classes/observe';
export const INSTRUCTOR_TRANSFER_ENDPOINT = '/api/classes/transfer';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const JOIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROSTER_POLL_MS = 5000;
const OBSERVE_POLL_MS = 1200;

export function validateInstructorCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
}

export function normalizeInstructorJoinCode(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/gu, '');
  return JOIN_CODE_PATTERN.test(normalized) ? normalized : '';
}

export function formatInstructorJoinCode(value) {
  const normalized = normalizeInstructorJoinCode(value);
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : '';
}

export function readInstructorSession(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY) || 'null');
    if (
      !parsed
      || parsed.version !== INSTRUCTOR_SESSION_VERSION
      || !validateInstructorCapability(parsed.instructorToken)
      || typeof parsed.class?.id !== 'string'
      || typeof parsed.class?.title !== 'string'
      || (parsed.joinCode && !normalizeInstructorJoinCode(parsed.joinCode))
      || (parsed.selectedWorkspaceId && !UUID_PATTERN.test(parsed.selectedWorkspaceId))
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistInstructorSession(storage, session) {
  if (!storage || !session || !validateInstructorCapability(session.instructorToken)) return false;
  try {
    storage.setItem(INSTRUCTOR_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearInstructorSession(storage = globalThis.localStorage) {
  try { storage?.removeItem(INSTRUCTOR_SESSION_STORAGE_KEY); } catch {}
}

export function isInstructorSessionExpired(session, nowMs = Date.now()) {
  const stamp = Date.parse(session?.class?.expiresAt || '');
  return Number.isFinite(stamp) && stamp <= nowMs;
}

function cloneSnapshot(value) {
  if (!value || typeof value !== 'object') return {};
  try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
}

function captureStorage(storage) {
  const entries = [];
  if (!storage) return entries;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) entries.push([key, storage.getItem(key)]);
    }
  } catch {}
  return entries;
}

function restoreStorage(storage, entries) {
  if (!storage) return;
  try {
    storage.clear();
    entries.forEach(([key, value]) => {
      if (value !== null) storage.setItem(key, value);
    });
  } catch {}
}

export function createInstructorClassroomController({
  collaboration,
  collect,
  apply,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  now = () => Date.now(),
  toast = () => {},
  onObservation = () => {},
  onObservationEnd = () => {},
  onClassConnected = () => {},
  onClassDisconnected = () => {},
  onRoster = () => {},
  onResumeUnavailable = () => {},
  confirmImpl = message => (typeof windowRef?.confirm === 'function' ? windowRef.confirm(message) === true : false),
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController
}) {
  let activeSession = null;
  let workspaces = [];
  let participants = [];
  let selectedWorkspaceId = '';
  let rosterTimer = null;
  let observerTimer = null;
  let rosterAbort = null;
  let observerAbort = null;
  let observerEpoch = 0;
  let localRecovery = null;
  let latestObservation = null;
  let checkpointView = null;
  let joinsEnabled = true;
  let transferInfo = null;
  let bulkRunning = false;
  let destroyed = false;
  let busy = false;
  let searchQuery = '';
  let kindFilter = 'all';
  let lastError = '';
  let joinQrExpanded = false;
  const mobileRailQuery = windowRef?.matchMedia?.('(max-width: 700px)') || null;
  let railExpanded = !mobileRailQuery?.matches;
  let railPreferenceTouched = false;
  const readonlyRecords = new Map();

  const element = id => documentRef?.getElementById(id) || null;
  const intakeWrap = () => documentRef?.querySelector?.('.wrap[data-experience-surface="intake"]') || null;
  const setStatus = status => {
    if (documentRef?.body) documentRef.body.dataset.instructorClassStatus = status;
  };
  const setConnectedLayout = connected => {
    documentRef?.body?.classList?.toggle('instructor-class-connected', connected);
    documentRef?.body?.classList?.toggle('instructor-rail-collapsed', Boolean(connected && !railExpanded));
  };
  const renderRailExpansion = () => {
    const dashboard = element('instructorClassDashboard');
    const toggle = element('instructorClassPanelToggle');
    dashboard?.classList?.toggle('is-collapsed', !railExpanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(railExpanded));
      toggle.textContent = railExpanded ? 'Collapse class panel' : 'Open class panel';
    }
    documentRef?.body?.classList?.toggle(
      'instructor-rail-collapsed',
      Boolean(activeSession && !railExpanded)
    );
  };
  const setRailExpanded = (expanded, { user = false } = {}) => {
    railExpanded = Boolean(expanded);
    if (user) railPreferenceTouched = true;
    renderRailExpansion();
    return railExpanded;
  };
  const setError = message => {
    lastError = message || '';
    const error = element('instructorClassError');
    if (error) {
      error.textContent = lastError;
      error.hidden = !lastError;
    }
  };
  const setBusy = value => {
    busy = value;
    [
      'instructorClassStartBtn',
      'instructorClassOpenBtn',
      'instructorClassRetryBtn',
      'instructorWorkspaceCreateBtn',
      'instructorCopyJoinCodeBtn',
      'instructorShareClassBtn',
      'instructorShowJoinQrBtn',
      'instructorJoinsToggleBtn',
      'instructorMoveDeviceBtn',
      'instructorTransferRedeemBtn',
      'instructorIndividualWorkspacesBtn',
      'instructorWorkspaceRenameBtn',
      'instructorWorkspaceRenameSaveBtn',
      'instructorWorkspaceRemoveBtn'
    ].forEach(id => {
      if (element(id)) element(id).disabled = value;
    });
    element('instructorParticipantList')?.querySelectorAll?.('select')?.forEach(select => {
      select.disabled = value;
    });
  };
  const abort = controller => { try { controller?.abort?.(); } catch {} };
  const clearTimer = timer => {
    if (timer !== null && typeof clearTimeoutImpl === 'function') clearTimeoutImpl(timer);
  };
  const stopLive = () => {
    observerEpoch += 1;
    clearTimer(rosterTimer);
    clearTimer(observerTimer);
    rosterTimer = null;
    observerTimer = null;
    abort(rosterAbort);
    abort(observerAbort);
    rosterAbort = null;
    observerAbort = null;
  };
  const saveSession = () => {
    if (!activeSession) return false;
    activeSession.selectedWorkspaceId = selectedWorkspaceId || null;
    return persistInstructorSession(storage, activeSession);
  };

  const renderExpiry = value => {
    const target = element('instructorClassExpiry');
    if (!target) return;
    const stamp = Date.parse(value || '');
    target.textContent = Number.isFinite(stamp)
      ? `Access expires ${new Date(stamp).toLocaleDateString()}`
      : 'Instructor-managed class';
  };

  const renderEntry = ({ retry = false, message = '' } = {}) => {
    setConnectedLayout(false);
    setStatus(retry ? 'retry' : 'disconnected');
    if (element('instructorClassEntryCard')) element('instructorClassEntryCard').hidden = false;
    if (element('instructorClassDashboard')) element('instructorClassDashboard').hidden = true;
    if (element('instructorClassStartForm')) element('instructorClassStartForm').hidden = retry;
    if (element('instructorClassResumePanel')) element('instructorClassResumePanel').hidden = !retry;
    if (element('instructorClassResumeTitle')) {
      element('instructorClassResumeTitle').textContent = activeSession?.class?.title || 'Saved instructor class';
    }
    if (element('instructorClassResumeMessage')) {
      element('instructorClassResumeMessage').textContent = message || 'We could not reconnect to this class.';
    }
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.INSTRUCTOR) {
      wrap.hidden = true;
      wrap.setAttribute('aria-hidden', 'true');
    }
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = true;
  };

  const renderJoinQrPanel = () => {
    const toggle = element('instructorShowJoinQrBtn');
    const panel = element('instructorJoinQrPanel');
    const svg = element('instructorJoinQrSvg');
    const code = element('instructorJoinQrCode');
    const error = element('instructorJoinQrError');
    const joinCode = formatInstructorJoinCode(activeSession?.joinCode || activeSession?.class?.joinCode || '');
    const joinUrl = buildClassroomJoinUrl(joinCode, windowRef?.location);
    const available = Boolean(joinCode && joinUrl);

    if (toggle) {
      toggle.disabled = busy || !available;
      toggle.setAttribute('aria-expanded', String(Boolean(available && joinQrExpanded)));
      toggle.textContent = joinQrExpanded ? 'Hide QR' : 'Show QR';
    }
    if (!panel) return;

    panel.hidden = !available || !joinQrExpanded;
    if (panel.hidden) return;

    if (code) code.textContent = joinCode;
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }

    try {
      const rendered = renderClassroomJoinQr(svg, joinUrl, {
        label: `Scan to join ${activeSession?.class?.title || 'this class'} with code ${joinCode}`
      });
      if (svg) svg.hidden = !rendered;
      if (!rendered && error) {
        error.hidden = false;
        error.textContent = 'QR unavailable. Use Share class or Copy code.';
      }
    } catch {
      if (svg) svg.hidden = true;
      if (error) {
        error.hidden = false;
        error.textContent = 'QR unavailable for this link. Use Share class or Copy code.';
      }
    }
  };

  const toggleJoinQr = () => {
    if (!activeSession) return false;
    joinQrExpanded = !joinQrExpanded;
    renderJoinQrPanel();
    return joinQrExpanded;
  };

  const renderJoins = () => {
    const button = element('instructorJoinsToggleBtn');
    if (button) {
      button.textContent = joinsEnabled ? 'Pause new joins' : 'Allow new joins';
      button.setAttribute('aria-pressed', String(!joinsEnabled));
    }
    if (element('instructorJoinsStatus')) {
      element('instructorJoinsStatus').textContent = joinsEnabled
        ? 'New Students can join with this code.'
        : 'New joins are paused. Students already in the class are not affected.';
    }
  };

  const renderTransferPanel = () => {
    const panel = element('instructorTransferPanel');
    const button = element('instructorMoveDeviceBtn');
    const visible = Boolean(transferInfo);
    if (panel) panel.hidden = !visible;
    if (button) button.setAttribute('aria-expanded', String(visible));
    if (!visible) return;
    if (element('instructorTransferCode')) element('instructorTransferCode').textContent = transferInfo.code;
    if (element('instructorTransferExpiry')) {
      const expires = Date.parse(transferInfo.expiresAt);
      const time = Number.isFinite(expires)
        ? new Date(expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : '';
      element('instructorTransferExpiry').textContent = time
        ? `Works once, until ${time}.`
        : 'Works once, for 10 minutes.';
    }
  };

  const selectedLiveWorkspace = () => (
    checkpointView ? null : workspaces.find(item => item.id === selectedWorkspaceId) || null
  );

  const renderWorkspaceManage = () => {
    const workspace = selectedLiveWorkspace();
    if (element('instructorWorkspaceManage')) element('instructorWorkspaceManage').hidden = !workspace;
    const form = element('instructorWorkspaceRenameForm');
    if (!workspace && form && !form.hidden) {
      form.hidden = true;
      element('instructorWorkspaceRenameBtn')?.setAttribute('aria-expanded', 'false');
    }
  };

  const renderBulkIndividual = () => {
    const button = element('instructorIndividualWorkspacesBtn');
    if (!button) return;
    const waiting = participants.filter(participant => !participant.assignment).length;
    button.disabled = busy || bulkRunning || waiting === 0;
  };

  const renderDashboard = () => {
    if (!activeSession) return;
    renderJoins();
    renderTransferPanel();
    renderWorkspaceManage();
    setConnectedLayout(true);
    setStatus(selectedWorkspaceId ? 'observing' : 'connected');
    if (element('instructorClassEntryCard')) element('instructorClassEntryCard').hidden = true;
    if (element('instructorClassDashboard')) element('instructorClassDashboard').hidden = false;
    if (element('instructorClassTitle')) element('instructorClassTitle').textContent = activeSession.class.title;
    renderRailExpansion();
    renderExpiry(activeSession.class.expiresAt);
    const joinCode = formatInstructorJoinCode(activeSession.joinCode || activeSession.class?.joinCode || '');
    if (element('instructorJoinCode')) element('instructorJoinCode').textContent = joinCode || 'Unavailable';
    if (element('instructorCopyJoinCodeBtn')) element('instructorCopyJoinCodeBtn').disabled = !joinCode || busy;
    if (element('instructorShareClassBtn')) element('instructorShareClassBtn').disabled = !joinCode || busy;
    renderJoinQrPanel();
    setError('');
  };

  const effectiveWorkspaceActivity = workspace => {
    if (latestObservation?.workspace?.id === workspace.id) {
      const participants = Array.isArray(latestObservation.participants) ? latestObservation.participants : [];
      return {
        active: participants.filter(item => item.activityState !== 'idle').length,
        editing: participants.filter(item => item.activityState === 'editing').length,
        total: Math.max(workspace.participantCount || 0, participants.length)
      };
    }
    return {
      active: Number(workspace.activeParticipantCount) || 0,
      editing: Number(workspace.editingParticipantCount) || 0,
      total: Number(workspace.participantCount) || 0
    };
  };

  const renderRoster = () => {
    const list = element('instructorWorkspaceList');
    if (!list) return;
    list.replaceChildren();
    const query = searchQuery.trim().toLowerCase();
    const visible = workspaces.filter(workspace => {
      const matchesKind = kindFilter === 'all' || workspace.kind === kindFilter;
      const matchesQuery = !query
        || workspace.label.toLowerCase().includes(query)
        || workspace.kind.toLowerCase().includes(query);
      return matchesKind && matchesQuery;
    });

    visible.forEach(workspace => {
      const button = documentRef.createElement('button'); // data-persistence="local-only"
      button.type = 'button';
      button.setAttribute('data-persistence', 'local-only');
      button.setAttribute('data-summary', 'exclude');
      button.className = 'instructor-workspace-item';
      button.dataset.workspaceId = workspace.id;
      button.setAttribute('aria-current', workspace.id === selectedWorkspaceId ? 'true' : 'false');

      const top = documentRef.createElement('span');
      top.className = 'instructor-workspace-item__top';
      const label = documentRef.createElement('strong');
      label.textContent = workspace.label;
      const kind = documentRef.createElement('span');
      kind.className = 'instructor-workspace-item__kind';
      kind.textContent = workspace.kind === 'group' ? 'Team' : 'Individual';
      top.append(label, kind);

      const activity = effectiveWorkspaceActivity(workspace);
      const meta = documentRef.createElement('span');
      meta.className = 'instructor-workspace-item__meta';
      const activityText = activity.editing > 0
        ? `${activity.editing} editing`
        : activity.active > 0
          ? `${activity.active} active`
          : 'No one active';
      meta.textContent = `${activityText} · ${activity.total} member${activity.total === 1 ? '' : 's'}`;
      button.append(top, meta);
      if (workspace.caseStudy && typeof workspace.caseStudy.name === 'string') {
        const loadedCase = documentRef.createElement('span');
        loadedCase.className = 'instructor-workspace-item__case';
        const modeName = TEMPLATE_MODES.find(mode => mode.id === workspace.caseStudy.mode)?.name;
        loadedCase.textContent = `Case Study: ${workspace.caseStudy.name}${modeName ? ` · ${modeName}` : ''}`;
        button.append(loadedCase);
      }
      button.addEventListener('click', () => { void selectWorkspace(workspace.id); });
      list.append(button);
    });

    if (element('instructorRosterSummary')) {
      element('instructorRosterSummary').textContent = visible.length === workspaces.length
        ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}`
        : `${visible.length} of ${workspaces.length} workspaces`;
    }
    if (!visible.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'instructor-workspace-empty';
      empty.textContent = workspaces.length
        ? 'No workspaces match this filter.'
        : 'No student or team workspaces have been created yet.';
      list.append(empty);
    }
  };

  const renderParticipants = () => {
    const list = element('instructorParticipantList');
    if (!list) return;
    list.replaceChildren();

    if (element('instructorParticipantSummary')) {
      const waiting = participants.filter(participant => !participant.assignment).length;
      element('instructorParticipantSummary').textContent =
        `${participants.length} student${participants.length === 1 ? '' : 's'} · ${waiting} waiting`;
    }

    participants.forEach(participant => {
      const row = documentRef.createElement('div');
      row.className = 'instructor-participant-row';
      row.dataset.participantId = participant.id;
      row.setAttribute('data-persistence', 'local-only');
      row.setAttribute('data-summary', 'exclude');

      const identity = documentRef.createElement('div');
      identity.className = 'instructor-participant-row__identity';
      const name = documentRef.createElement('strong');
      name.textContent = participant.displayName || 'Student';
      const status = documentRef.createElement('span');
      status.textContent = participant.assignment
        ? `${participant.assignment.kind === 'group' ? 'Team' : 'Individual'} · ${participant.assignment.label}`
        : 'Waiting / unassigned';
      identity.append(name, status);

      const select = documentRef.createElement('select'); // data-persistence="local-only"
      select.setAttribute('aria-label', `Assignment for ${participant.displayName || 'student'}`);
      select.setAttribute('data-persistence', 'local-only');
      select.setAttribute('data-summary', 'exclude');
      select.disabled = busy;

      const waitingOption = documentRef.createElement('option'); // data-persistence="local-only"
      waitingOption.value = '';
      waitingOption.textContent = 'Waiting / unassigned';
      select.append(waitingOption);

      workspaces.forEach(workspace => {
        const option = documentRef.createElement('option'); // data-persistence="local-only"
        option.value = workspace.id;
        option.textContent = `${workspace.kind === 'group' ? 'Team' : 'Individual'} · ${workspace.label}`;
        select.append(option);
      });
      select.value = participant.assignment?.id || '';
      select.addEventListener('change', event => {
        void assignParticipant(participant.id, event.target.value || null);
      });

      row.append(identity, select);
      list.append(row);
    });

    renderBulkIndividual();
    if (!participants.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'instructor-participant-empty';
      empty.textContent = 'No students have joined yet. Share the Student join code; late arrivals will appear here automatically.';
      list.append(empty);
    }
  };

  const renderObservation = body => {
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = false;
    renderWorkspaceManage();
    if (element('instructorObservedWorkspace')) element('instructorObservedWorkspace').textContent = body.workspace?.label || 'Selected workspace';
    if (element('instructorObservedRevision')) element('instructorObservedRevision').textContent = `Revision ${body.workspace?.revision || '—'}`;
    if (element('instructorObserverStatus')) element('instructorObserverStatus').textContent = 'Live read-only view';
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = true;

    const list = element('instructorObservationParticipants');
    if (list) {
      list.setAttribute('aria-label', 'Recent student activity');
      list.replaceChildren();
      const participants = Array.isArray(body.participants) ? body.participants : [];
      participants.forEach(participant => {
        const item = documentRef.createElement('li');
        item.className = 'instructor-observation-person';
        const state = ['editing', 'focused', 'idle'].includes(participant.activityState)
          ? participant.activityState
          : 'active';
        item.textContent = `${participant.displayName || 'Student'} · ${state}`;
        list.append(item);
      });
      if (!participants.length) {
        const item = documentRef.createElement('li');
        item.className = 'instructor-observation-person instructor-observation-person--muted';
        item.textContent = 'No recent participant activity';
        list.append(item);
      }
    }
  };

  const renderCheckpointObservation = checkpoint => {
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = false;
    renderWorkspaceManage();
    if (element('instructorObservedWorkspace')) {
      element('instructorObservedWorkspace').textContent = checkpoint.workspaceLabel || 'Selected workspace';
    }
    if (element('instructorObservedRevision')) {
      element('instructorObservedRevision').textContent =
        `Checkpoint at debrief start · Revision ${checkpoint.workspaceRevision}`;
    }
    if (element('instructorObserverStatus')) {
      element('instructorObserverStatus').textContent = 'Immutable checkpoint · live updates paused';
    }
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = false;

    const list = element('instructorObservationParticipants');
    if (list) {
      list.setAttribute('aria-label', 'Checkpoint inspection status');
      list.replaceChildren();
      const item = documentRef.createElement('li');
      item.className = 'instructor-observation-person instructor-observation-person--muted';
      item.textContent = 'Captured before debrief discussion';
      list.append(item);
    }
  };

  const markObserverStale = message => {
    if (element('instructorObserverStatus')) element('instructorObserverStatus').textContent = message || 'Reconnecting…';
  };

  const preserveLocalRecovery = () => {
    if (localRecovery) return;
    const snapshot = collect?.();
    if (snapshot && typeof snapshot === 'object') localRecovery = cloneSnapshot(snapshot);
  };

  const restoreReadonlyProjection = () => {
    readonlyRecords.forEach((record, control) => {
      if (!control) return;
      if (record.disabled !== undefined) control.disabled = record.disabled;
      if (record.readOnly !== undefined) control.readOnly = record.readOnly;
      if (record.tabIndex === null) control.removeAttribute?.('tabindex');
      else control.setAttribute?.('tabindex', record.tabIndex);
      if (record.ariaDisabled === null) control.removeAttribute?.('aria-disabled');
      else control.setAttribute?.('aria-disabled', record.ariaDisabled);
      if (record.ariaReadonly === null) control.removeAttribute?.('aria-readonly');
      else control.setAttribute?.('aria-readonly', record.ariaReadonly);
      if (record.contentEditable === null) control.removeAttribute?.('contenteditable');
      else control.setAttribute?.('contenteditable', record.contentEditable);
      if (record.draggable !== undefined) control.draggable = record.draggable;
      control.removeAttribute?.('data-instructor-readonly-control');
    });
    readonlyRecords.clear();
    const wrap = intakeWrap();
    wrap?.classList?.remove('instructor-observer-readonly');
    wrap?.removeAttribute?.('aria-readonly');
  };

  const projectReadonly = () => {
    const wrap = intakeWrap();
    if (!wrap) return;
    wrap.classList.add('instructor-observer-readonly');
    const controls = wrap.querySelectorAll(
      'input, textarea, select, button, [contenteditable], [role="button"], [role="checkbox"], [role="switch"], [draggable="true"]'
    );
    controls.forEach(control => {
      if (control.closest?.('#instructorObservationNotice, #instructorDebriefComparison, [data-instructor-coaching-control]')) return;
      if (!readonlyRecords.has(control)) {
        readonlyRecords.set(control, {
          disabled: 'disabled' in control ? control.disabled : undefined,
          readOnly: 'readOnly' in control ? control.readOnly : undefined,
          tabIndex: control.hasAttribute?.('tabindex') ? control.getAttribute('tabindex') : null,
          ariaDisabled: control.hasAttribute?.('aria-disabled') ? control.getAttribute('aria-disabled') : null,
          ariaReadonly: control.hasAttribute?.('aria-readonly') ? control.getAttribute('aria-readonly') : null,
          contentEditable: control.hasAttribute?.('contenteditable') ? control.getAttribute('contenteditable') : null,
          draggable: 'draggable' in control ? control.draggable : undefined
        });
      }
      const tag = control.tagName;
      const type = String(control.getAttribute?.('type') || '').toLowerCase();
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type))) {
        control.readOnly = true;
        control.setAttribute('aria-readonly', 'true');
      } else if ('disabled' in control) {
        control.disabled = true;
      } else {
        control.setAttribute('aria-disabled', 'true');
        control.setAttribute('tabindex', '-1');
      }
      if (control.hasAttribute?.('contenteditable')) control.setAttribute('contenteditable', 'false');
      if ('draggable' in control) control.draggable = false;
      control.setAttribute?.('data-instructor-readonly-control', '');
    });
    if (wrap.contains(documentRef.activeElement) && typeof documentRef.activeElement?.blur === 'function') {
      documentRef.activeElement.blur();
    }
  };

  const applyObservedSnapshot = snapshot => {
    preserveLocalRecovery();
    const before = captureStorage(storage);
    const projected = cloneSnapshot(snapshot);
    delete projected.appearance;
    try {
      apply?.(projected);
    } finally {
      restoreStorage(storage, before);
    }
    projectReadonly();
  };

  const restoreLocal = () => {
    onObservationEnd();
    restoreReadonlyProjection();
    if (localRecovery) {
      const snapshot = localRecovery;
      localRecovery = null;
      try { apply?.(snapshot); } catch {}
    }
    latestObservation = null;
    checkpointView = null;
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = true;
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = true;
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.INSTRUCTOR) {
      wrap.hidden = true;
      wrap.setAttribute('aria-hidden', 'true');
    }
  };

  const showObservedIntake = body => {
    checkpointView = null;
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = true;
    const revisionChanged = latestObservation?.workspace?.id !== body.workspace?.id
      || latestObservation?.workspace?.revision !== body.workspace?.revision;
    latestObservation = body;
    if (revisionChanged) applyObservedSnapshot(body.snapshot);
    else projectReadonly();
    const wrap = intakeWrap();
    if (wrap) {
      wrap.hidden = false;
      wrap.setAttribute('aria-hidden', 'false');
    }
    setStatus('observing');
    renderObservation(body);
    renderRoster();
    onObservation({
      instructorToken: activeSession?.instructorToken || '',
      workspaceId: body.workspace?.id || '',
      workspaceRevision: body.workspace?.revision || 0
    });
  };

  const responseJson = async response => response.json().catch(() => ({}));

  const fetchRoster = async token => {
    abort(rosterAbort);
    rosterAbort = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: rosterAbort?.signal
    };
    const [workspaceResponse, participantResponse] = await Promise.all([
      fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, options),
      fetchImpl(INSTRUCTOR_PARTICIPANTS_ENDPOINT, options)
    ]);
    const [workspaceBody, participantBody] = await Promise.all([
      responseJson(workspaceResponse),
      responseJson(participantResponse)
    ]);
    rosterAbort = null;
    return { workspaceResponse, workspaceBody, participantResponse, participantBody };
  };

  const validWorkspace = workspace => (
    workspace
    && UUID_PATTERN.test(workspace.id || '')
    && ['individual', 'group'].includes(workspace.kind)
    && typeof workspace.label === 'string'
  );

  const validParticipant = participant => (
    participant
    && UUID_PATTERN.test(participant.id || '')
    && typeof participant.displayName === 'string'
    && Number.isInteger(participant.assignmentRevision)
    && (
      participant.assignment === null
      || (
        validWorkspace(participant.assignment)
      )
    )
  );

  const acceptRoster = (workspaceBody, participantBody) => {
    if (
      typeof workspaceBody.class?.id !== 'string'
      || typeof workspaceBody.class?.title !== 'string'
      || !Array.isArray(workspaceBody.workspaces)
      || typeof participantBody.class?.id !== 'string'
      || participantBody.class.id !== workspaceBody.class.id
      || !Array.isArray(participantBody.participants)
    ) {
      return false;
    }
    workspaces = workspaceBody.workspaces.filter(validWorkspace);
    participants = participantBody.participants.filter(validParticipant);
    try { onRoster(workspaces.map(workspace => ({ ...workspace }))); } catch {}
    return true;
  };

  const scheduleRoster = () => {
    clearTimer(rosterTimer);
    if (!activeSession || destroyed || typeof setTimeoutImpl !== 'function') return;
    rosterTimer = setTimeoutImpl(() => {
      rosterTimer = null;
      void refreshRoster();
    }, ROSTER_POLL_MS);
  };

  const scheduleObserver = epoch => {
    clearTimer(observerTimer);
    if (
      !activeSession
      || !selectedWorkspaceId
      || checkpointView
      || destroyed
      || typeof setTimeoutImpl !== 'function'
    ) return;
    observerTimer = setTimeoutImpl(() => {
      observerTimer = null;
      void observeWorkspace(epoch);
    }, OBSERVE_POLL_MS);
  };

  const terminalClass = message => {
    onClassDisconnected();
    stopLive();
    transferInfo = null;
    joinsEnabled = true;
    renderTransferPanel();
    clearInstructorSession(storage);
    activeSession = null;
    workspaces = [];
    participants = [];
    selectedWorkspaceId = '';
    restoreLocal();
    renderEntry();
    const explanation = message || 'This instructor class is no longer available.';
    setError(explanation);
    onResumeUnavailable(explanation);
    return false;
  };

  const observeWorkspace = async epoch => {
    if (!activeSession || !selectedWorkspaceId || checkpointView || destroyed) return false;
    const requestedId = selectedWorkspaceId;
    abort(observerAbort);
    observerAbort = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
    try {
      const response = await fetchImpl(
        `${INSTRUCTOR_OBSERVE_ENDPOINT}?workspaceId=${encodeURIComponent(requestedId)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${activeSession.instructorToken}` },
          signal: observerAbort?.signal
        }
      );
      const body = await responseJson(response);
      observerAbort = null;
      if (epoch !== observerEpoch || requestedId !== selectedWorkspaceId || destroyed) return false;
      if (response.status === 404) {
        markObserverStale('Workspace no longer available');
        await refreshRoster();
        return false;
      }
      if (!response.ok || !body.snapshot || typeof body.snapshot !== 'object' || body.workspace?.id !== requestedId) {
        markObserverStale('Reconnecting…');
        scheduleObserver(epoch);
        return false;
      }
      showObservedIntake(body);
      scheduleObserver(epoch);
      return true;
    } catch {
      observerAbort = null;
      if (epoch !== observerEpoch || requestedId !== selectedWorkspaceId || destroyed) return false;
      markObserverStale('Offline · retrying');
      scheduleObserver(epoch);
      return false;
    }
  };

  async function inspectCheckpoint({ workspace, checkpoint } = {}) {
    const workspaceId = typeof workspace?.id === 'string' ? workspace.id : '';
    const represented = workspaces.find(item => item.id === workspaceId);
    const revision = Number(checkpoint?.workspaceRevision);
    if (
      !activeSession
      || !represented
      || !checkpoint?.snapshot
      || typeof checkpoint.snapshot !== 'object'
      || !Number.isInteger(revision)
      || revision < 1
    ) return false;

    selectedWorkspaceId = workspaceId;
    saveSession();
    observerEpoch += 1;
    abort(observerAbort);
    observerAbort = null;
    clearTimer(observerTimer);
    observerTimer = null;
    latestObservation = null;
    checkpointView = {
      workspaceId,
      workspaceLabel: represented.label,
      stageId: typeof checkpoint.stageId === 'string' ? checkpoint.stageId : '',
      workspaceRevision: revision,
      capturedAt: typeof checkpoint.capturedAt === 'string' ? checkpoint.capturedAt : null
    };
    onObservationEnd();
    applyObservedSnapshot(checkpoint.snapshot);
    const wrap = intakeWrap();
    if (wrap) {
      wrap.hidden = false;
      wrap.setAttribute('aria-hidden', 'false');
    }
    setStatus('observing-checkpoint');
    renderCheckpointObservation(checkpointView);
    renderRoster();
    return true;
  }

  async function returnToLiveObservation() {
    if (!checkpointView || !selectedWorkspaceId) return false;
    checkpointView = null;
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = true;
    return selectWorkspace(selectedWorkspaceId);
  }

  async function selectWorkspace(workspaceId) {
    if (!activeSession || !workspaces.some(item => item.id === workspaceId)) return false;
    checkpointView = null;
    if (element('instructorObservationLiveBtn')) element('instructorObservationLiveBtn').hidden = true;
    selectedWorkspaceId = workspaceId;
    onObservationEnd();
    saveSession();
    observerEpoch += 1;
    const epoch = observerEpoch;
    abort(observerAbort);
    observerAbort = null;
    clearTimer(observerTimer);
    observerTimer = null;
    renderRoster();
    setStatus('connecting-observer');
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = false;
    if (element('instructorObservedWorkspace')) {
      element('instructorObservedWorkspace').textContent =
        workspaces.find(item => item.id === workspaceId)?.label || 'Selected workspace';
    }
    markObserverStale('Connecting read-only view…');
    return observeWorkspace(epoch);
  }

  async function refreshRoster() {
    if (!activeSession || destroyed) return false;
    try {
      const {
        workspaceResponse,
        workspaceBody,
        participantResponse,
        participantBody
      } = await fetchRoster(activeSession.instructorToken);
      if (
        [workspaceResponse.status, participantResponse.status].some(status => status === 404 || status === 401)
      ) {
        return terminalClass(
          'This class is no longer managed from this device. It may have been moved to another device or ended. '
          + 'Start a new class, continue it here with a transfer code, or ask an administrator.'
        );
      }
      if (
        !workspaceResponse.ok
        || !participantResponse.ok
        || !acceptRoster(workspaceBody, participantBody)
      ) {
        setError('Could not refresh the class roster. Live observation will keep retrying.');
        scheduleRoster();
        return false;
      }
      activeSession.class = {
        id: workspaceBody.class.id,
        title: workspaceBody.class.title,
        expiresAt: workspaceBody.class.expiresAt || null
      };
      activeSession.joinCode = formatInstructorJoinCode(
        workspaceBody.class.joinCode || activeSession.joinCode || ''
      );
      if (typeof workspaceBody.class.joinsEnabled === 'boolean') joinsEnabled = workspaceBody.class.joinsEnabled;
      if (selectedWorkspaceId && !workspaces.some(item => item.id === selectedWorkspaceId)) {
        selectedWorkspaceId = '';
        latestObservation = null;
        restoreLocal();
      }
      saveSession();
      renderDashboard();
      renderParticipants();
      renderRoster();
      if (!selectedWorkspaceId && workspaces[0]) await selectWorkspace(workspaces[0].id);
      scheduleRoster();
      return true;
    } catch {
      setError('Could not refresh the class roster. Check your connection.');
      scheduleRoster();
      return false;
    }
  }

  const disconnectStandaloneCollaboration = () => {
    const state = collaboration?.getState?.() || {};
    if (state.token) collaboration?.leave?.({ silent: true });
  };

  const activateClass = async (token, preferredWorkspaceId = '', sessionHints = {}) => {
    onClassDisconnected();
    disconnectStandaloneCollaboration();
    setBusy(true);
    setStatus('connecting');
    setError('');
    try {
      const {
        workspaceResponse,
        workspaceBody,
        participantResponse,
        participantBody
      } = await fetchRoster(token);
      if (
        [workspaceResponse.status, participantResponse.status].some(status => status === 404 || status === 401)
      ) {
        return terminalClass('This saved class was not accepted or has expired. It may have been moved to another device or ended.');
      }
      if (
        !workspaceResponse.ok
        || !participantResponse.ok
        || !acceptRoster(workspaceBody, participantBody)
      ) {
        setError('The class service is unavailable right now. Your local Intake is unchanged.');
        renderEntry({ retry: Boolean(activeSession), message: 'The class service is unavailable right now.' });
        return false;
      }
      activeSession = {
        version: INSTRUCTOR_SESSION_VERSION,
        instructorToken: token,
        joinCode: formatInstructorJoinCode(
          sessionHints.joinCode
          || workspaceBody.class.joinCode
          || activeSession?.joinCode
          || ''
        ),
        class: {
          id: workspaceBody.class.id,
          title: workspaceBody.class.title,
          expiresAt: workspaceBody.class.expiresAt || null
        },
        selectedWorkspaceId: null,
        openedAt: sessionHints.openedAt || activeSession?.openedAt || new Date(now()).toISOString()
      };
      selectedWorkspaceId = workspaces.some(item => item.id === preferredWorkspaceId)
        ? preferredWorkspaceId
        : workspaces[0]?.id || '';
      saveSession();
      onClassConnected(token);
      renderDashboard();
      renderParticipants();
      renderRoster();
      if (element('instructorClassTitleInput')) element('instructorClassTitleInput').value = '';
      if (selectedWorkspaceId) await selectWorkspace(selectedWorkspaceId);
      else restoreLocal();
      scheduleRoster();
      return true;
    } catch {
      setError('Could not reach the class service. Your local Intake is unchanged.');
      renderEntry({ retry: Boolean(activeSession), message: 'The class service is unavailable right now.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startClass = async (titleValue, classPasswordValue = '') => {
    const title = typeof titleValue === 'string' ? titleValue.trim() : '';
    const classPassword = typeof classPasswordValue === 'string' ? classPasswordValue.trim() : '';
    if (!title || title.length > 120) {
      setError('Enter a class title before starting the class.');
      return false;
    }
    if (!classPassword) {
      setError('Enter the class password to start a class.');
      return false;
    }
    if (!fetchImpl) {
      setError('The class service is unavailable right now.');
      return false;
    }

    setBusy(true);
    setStatus('creating');
    setError('');
    disconnectStandaloneCollaboration();
    try {
      const response = await fetchImpl(INSTRUCTOR_CLASSES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, classPassword })
      });
      const body = await responseJson(response);
      if (response.status === 403 && body.code === 'class-password-invalid') {
        setError('That class password is not correct. Check it with your program administrator.');
        return false;
      }
      if (response.status === 429) {
        setError(body.error || 'Too many attempts from this network. Please wait and try again.');
        return false;
      }
      if (
        response.status !== 201
        || !validateInstructorCapability(body.instructorToken)
        || typeof body.class?.id !== 'string'
        || typeof body.class?.title !== 'string'
      ) {
        setError(body.error || 'Could not start the class.');
        return false;
      }

      const createdSession = {
        version: INSTRUCTOR_SESSION_VERSION,
        instructorToken: body.instructorToken,
        joinCode: formatInstructorJoinCode(body.joinCode || ''),
        class: {
          id: body.class.id,
          title: body.class.title,
          expiresAt: body.class.expiresAt || null
        },
        selectedWorkspaceId: null,
        openedAt: new Date(now()).toISOString()
      };
      activeSession = createdSession;
      saveSession();

      return activateClass(body.instructorToken, '', {
        joinCode: createdSession.joinCode,
        openedAt: createdSession.openedAt
      });
    } catch {
      setError('Could not start the class. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async (kindValue, labelValue) => {
    if (!activeSession || busy) return false;
    const kind = ['group', 'individual'].includes(kindValue) ? kindValue : '';
    const label = typeof labelValue === 'string' ? labelValue.trim() : '';
    if (!kind || !label || label.length > 80) {
      setError('Enter a workspace name and choose Team or Individual.');
      return false;
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeSession.instructorToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ kind, label, snapshot: {} })
      });
      const body = await responseJson(response);
      if (!response.ok || !validWorkspace(body.workspace)) {
        setError(body.error || 'Could not create the workspace.');
        return false;
      }
      if (element('instructorWorkspaceLabel')) element('instructorWorkspaceLabel').value = '';
      toast(`${kind === 'group' ? 'Team' : 'Individual workspace'} created.`);
      await refreshRoster();
      return true;
    } catch {
      setError('Could not create the workspace. Check your connection.');
      return false;
    } finally {
      setBusy(false);
      renderParticipants();
    }
  };

  const assignParticipant = async (participantId, workspaceId) => {
    if (!activeSession || busy || !UUID_PATTERN.test(participantId || '')) return false;
    if (workspaceId !== null && !workspaces.some(workspace => workspace.id === workspaceId)) {
      renderParticipants();
      return false;
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_PARTICIPANTS_ENDPOINT, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${activeSession.instructorToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ participantId, workspaceId })
      });
      const body = await responseJson(response);
      if (!response.ok) {
        setError(body.error || 'Could not update the Student assignment.');
        renderParticipants();
        return false;
      }
      toast(body.changed === false
        ? 'Student assignment is already current.'
        : workspaceId
          ? 'Student assignment updated.'
          : 'Student returned to Waiting.');
      await refreshRoster();
      return true;
    } catch {
      setError('Could not update the Student assignment. Check your connection.');
      renderParticipants();
      return false;
    } finally {
      setBusy(false);
      renderParticipants();
    }
  };

  const authorizedJsonHeaders = () => ({
    Authorization: `Bearer ${activeSession.instructorToken}`,
    'Content-Type': 'application/json'
  });

  /**
   * Turns new Student joins on or off for the class (existing Students are unaffected).
   * @param {boolean} enabled - Whether new joins are allowed.
   * @returns {Promise<boolean>} True when the server accepted the change.
   */
  const setJoins = async enabled => {
    if (!activeSession || busy) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_CLASSES_ENDPOINT, {
        method: 'PATCH',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ action: 'set-joins', enabled: Boolean(enabled) })
      });
      const body = await responseJson(response);
      if (!response.ok || typeof body.class?.joinsEnabled !== 'boolean') {
        setError(body.error || 'Could not change whether new Students can join.');
        return false;
      }
      joinsEnabled = body.class.joinsEnabled;
      toast(joinsEnabled ? 'New Students can join again.' : 'New joins paused.');
      return true;
    } catch {
      setError('Could not change whether new Students can join. Check your connection.');
      return false;
    } finally {
      setBusy(false);
      renderJoins();
    }
  };

  /**
   * Renames a class workspace (team or individual).
   * @param {string} workspaceId - Public workspace ID.
   * @param {string} labelValue - New name.
   * @returns {Promise<boolean>} True when renamed.
   */
  const renameWorkspace = async (workspaceId, labelValue) => {
    if (!activeSession || busy || !workspaces.some(item => item.id === workspaceId)) return false;
    const label = typeof labelValue === 'string' ? labelValue.trim() : '';
    if (!label || label.length > 80) {
      setError('Enter a workspace name of up to 80 characters.');
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, {
        method: 'PATCH',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ workspaceId, label })
      });
      const body = await responseJson(response);
      if (!response.ok || !validWorkspace(body.workspace)) {
        setError(body.error || 'Could not rename the workspace.');
        return false;
      }
      if (element('instructorWorkspaceRenameForm')) element('instructorWorkspaceRenameForm').hidden = true;
      element('instructorWorkspaceRenameBtn')?.setAttribute('aria-expanded', 'false');
      if (workspaceId === selectedWorkspaceId && element('instructorObservedWorkspace')) {
        element('instructorObservedWorkspace').textContent = body.workspace.label;
      }
      toast('Workspace renamed.');
      await refreshRoster();
      return true;
    } catch {
      setError('Could not rename the workspace. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Removes an empty class workspace after confirmation. The server refuses
   * while Students are assigned, so a Student is never stranded.
   * @param {string} workspaceId - Public workspace ID.
   * @returns {Promise<boolean>} True when removed.
   */
  const removeWorkspace = async workspaceId => {
    const workspace = workspaces.find(item => item.id === workspaceId);
    if (!activeSession || busy || !workspace) return false;
    if ((Number(workspace.participantCount) || 0) > 0) {
      setError(`Move or unassign the Students in “${workspace.label}” before removing it.`);
      return false;
    }
    const proceed = confirmImpl(
      `Remove “${workspace.label}”?\n\n`
      + 'Its Intake work will no longer be available to anyone in the class. This cannot be undone.'
    );
    if (!proceed) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, {
        method: 'DELETE',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ workspaceId })
      });
      const body = await responseJson(response);
      if (!response.ok) {
        setError(body.error || 'Could not remove the workspace.');
        return false;
      }
      toast(`Removed “${workspace.label}”.`);
      await refreshRoster();
      return true;
    } catch {
      setError('Could not remove the workspace. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setBulkStatus = message => {
    if (element('instructorIndividualWorkspacesStatus')) {
      element('instructorIndividualWorkspacesStatus').textContent = message || '';
    }
  };

  /**
   * Gives every Waiting Student an individual workspace named after them and
   * assigns them to it. Re-running only touches Students still Waiting, and an
   * empty individual workspace with the same name is reused rather than duplicated.
   * @returns {Promise<{assigned: number, total: number}>} Progress summary.
   */
  const createIndividualWorkspacesForWaiting = async () => {
    if (!activeSession || busy || bulkRunning) return { assigned: 0, total: 0 };
    const waiting = participants.filter(participant => !participant.assignment);
    if (!waiting.length) {
      setBulkStatus('No Students are waiting.');
      return { assigned: 0, total: 0 };
    }
    bulkRunning = true;
    setBusy(true);
    setError('');
    let assigned = 0;
    const claimed = new Set();
    try {
      for (const [index, participant] of waiting.entries()) {
        setBulkStatus(`Setting up ${index + 1} of ${waiting.length}…`);
        const label = (participant.displayName || 'Student').trim().slice(0, 80) || 'Student';
        let workspace = workspaces.find(item => (
          item.kind === 'individual'
          && item.label === label
          && !(Number(item.participantCount) > 0)
          && !claimed.has(item.id)
        ));
        if (!workspace) {
          const created = await fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, {
            method: 'POST',
            headers: authorizedJsonHeaders(),
            body: JSON.stringify({ kind: 'individual', label, snapshot: {} })
          });
          const createdBody = await responseJson(created);
          if (!created.ok || !validWorkspace(createdBody.workspace)) {
            throw new Error(createdBody.error || 'Could not create a workspace.');
          }
          workspace = { ...createdBody.workspace, participantCount: 0 };
          workspaces.push(workspace);
        }
        claimed.add(workspace.id);
        const assignment = await fetchImpl(INSTRUCTOR_PARTICIPANTS_ENDPOINT, {
          method: 'PATCH',
          headers: authorizedJsonHeaders(),
          body: JSON.stringify({ participantId: participant.id, workspaceId: workspace.id })
        });
        const assignmentBody = await responseJson(assignment);
        if (!assignment.ok) throw new Error(assignmentBody.error || 'Could not assign a Student.');
        workspace.participantCount = 1;
        assigned += 1;
      }
      setBulkStatus(`${assigned} Student${assigned === 1 ? '' : 's'} now ${assigned === 1 ? 'has' : 'have'} their own workspace.`);
      toast('Individual workspaces are ready.');
    } catch (error) {
      setBulkStatus('');
      setError(
        `Set up ${assigned} of ${waiting.length}. ${error?.message || 'Something went wrong.'} `
        + 'Run it again to finish the rest.'
      );
    } finally {
      bulkRunning = false;
      setBusy(false);
      await refreshRoster();
    }
    return { assigned, total: waiting.length };
  };

  /**
   * Creates a one-time code that moves this class to another Instructor device.
   * @returns {Promise<boolean>} True when a code is shown.
   */
  const createTransferCode = async () => {
    if (!activeSession || busy) return false;
    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_CLASSES_ENDPOINT, {
        method: 'PATCH',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ action: 'create-transfer' })
      });
      const body = await responseJson(response);
      if (!response.ok || !/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u.test(body.transferCode || '')) {
        setError(body.error || 'Could not create a transfer code.');
        return false;
      }
      transferInfo = { code: body.transferCode, expiresAt: body.expiresAt || null };
      renderTransferPanel();
      return true;
    } catch {
      setError('Could not create a transfer code. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const closeTransferPanel = () => {
    transferInfo = null;
    renderTransferPanel();
  };

  /**
   * Continues a class on this device using a transfer code from the other device.
   * @param {string} codeValue - Code as typed.
   * @returns {Promise<boolean>} True when this device now manages the class.
   */
  const redeemTransferCode = async codeValue => {
    const transferCode = typeof codeValue === 'string' ? codeValue.toUpperCase().replace(/[\s-]+/gu, '') : '';
    if (!/^[A-Z2-9]{12}$/u.test(transferCode)) {
      setError('Enter the 12-character transfer code shown on the other device.');
      return false;
    }
    if (!fetchImpl || busy) return false;
    setBusy(true);
    setStatus('creating');
    setError('');
    disconnectStandaloneCollaboration();
    try {
      const response = await fetchImpl(INSTRUCTOR_TRANSFER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferCode })
      });
      const body = await responseJson(response);
      if (
        !response.ok
        || !validateInstructorCapability(body.instructorToken)
        || typeof body.class?.id !== 'string'
        || typeof body.class?.title !== 'string'
      ) {
        setError(body.error || 'That transfer code is not valid. Codes work once and expire after 10 minutes.');
        return false;
      }
      const movedSession = {
        version: INSTRUCTOR_SESSION_VERSION,
        instructorToken: body.instructorToken,
        joinCode: formatInstructorJoinCode(body.joinCode || ''),
        class: { id: body.class.id, title: body.class.title, expiresAt: body.class.expiresAt || null },
        selectedWorkspaceId: null,
        openedAt: new Date(now()).toISOString()
      };
      activeSession = movedSession;
      if (typeof body.class.joinsEnabled === 'boolean') joinsEnabled = body.class.joinsEnabled;
      saveSession();
      toast(`Now managing “${body.class.title}” on this device.`);
      return activateClass(body.instructorToken, '', {
        joinCode: movedSession.joinCode,
        openedAt: movedSession.openedAt
      });
    } catch {
      setError('Could not continue the class. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value, successMessage) => {
    if (!value) return false;
    try {
      if (windowRef?.navigator?.clipboard?.writeText) {
        await windowRef.navigator.clipboard.writeText(value);
        toast(successMessage);
        return true;
      }
      const temporary = documentRef?.createElement?.('textarea');
      if (!temporary) return false;
      temporary.value = value;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      documentRef.body?.append(temporary);
      temporary.select();
      const copied = documentRef.execCommand?.('copy') === true;
      temporary.remove();
      if (copied) toast(successMessage);
      return copied;
    } catch {
      return false;
    }
  };

  const copyJoinCode = async () => {
    const joinCode = formatInstructorJoinCode(activeSession?.joinCode || '');
    if (!joinCode) return false;
    const copied = await copyText(joinCode, 'Student join code copied.');
    if (!copied) toast(`Student join code: ${joinCode}`);
    return copied;
  };

  const shareClass = async () => {
    const joinCode = formatInstructorJoinCode(activeSession?.joinCode || '');
    const joinUrl = buildClassroomJoinUrl(joinCode, windowRef?.location);
    if (!joinUrl) return false;

    if (typeof windowRef?.navigator?.share === 'function') {
      try {
        await windowRef.navigator.share({
          title: activeSession?.class?.title
            ? `Join ${activeSession.class.title}`
            : 'Join KT Intake class',
          text: `Join this KT Intake class with code ${joinCode}.`,
          url: joinUrl
        });
        toast('Class join link shared.');
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
      }
    }

    const copied = await copyText(joinUrl, 'Class join link copied.');
    if (!copied) toast(`Class join link: ${joinUrl}`);
    return copied;
  };

  const resume = async () => {
    if (destroyed || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.INSTRUCTOR) return false;
    const stored = readInstructorSession(storage);
    if (!stored) {
      activeSession = null;
      workspaces = [];
      participants = [];
      selectedWorkspaceId = '';
      renderEntry();
      return false;
    }
    activeSession = stored;
    selectedWorkspaceId = stored.selectedWorkspaceId || '';
    if (isInstructorSessionExpired(stored, now())) {
      return terminalClass('Your saved Instructor class access has expired. Start a new class; recovery will be handled through Administration / Maintenance.');
    }
    if (element('instructorClassStartForm')) element('instructorClassStartForm').hidden = true;
    if (element('instructorClassResumePanel')) element('instructorClassResumePanel').hidden = false;
    if (element('instructorClassResumeTitle')) element('instructorClassResumeTitle').textContent = stored.class.title;
    if (element('instructorClassResumeMessage')) element('instructorClassResumeMessage').textContent = 'Reconnecting to your class roster…';
    return activateClass(stored.instructorToken, stored.selectedWorkspaceId || '');
  };

  const leaveClass = () => {
    onClassDisconnected();
    stopLive();
    transferInfo = null;
    joinsEnabled = true;
    renderTransferPanel();
    clearInstructorSession(storage);
    activeSession = null;
    workspaces = [];
    participants = [];
    selectedWorkspaceId = '';
    restoreLocal();
    renderEntry();
    setError('');
    toast('Left instructor class. Your local Intake was restored.');
    return true;
  };

  const classTitleForMessages = () => activeSession?.class?.title || 'this class';

  /**
   * Leaves the class on this device after explicit confirmation. The class keeps
   * running for Students; this device loses its only Instructor credential.
   * @returns {boolean} True when the Instructor left.
   */
  const requestLeaveClass = () => {
    if (!activeSession) return leaveClass();
    const proceed = confirmImpl(
      `Leave “${classTitleForMessages()}” on this device?\n\n`
      + 'The class keeps running and Students can keep working, but this device will no longer be able to manage it. '
      + 'Getting it back requires an administrator.\n\n'
      + 'To close the class for everyone instead, choose End class.'
    );
    if (!proceed) return false;
    return leaveClass();
  };

  /**
   * Ends the class for everyone (server revocation) after explicit confirmation,
   * then clears this device's Instructor session.
   * @returns {Promise<boolean>} True when the class was ended.
   */
  const endClass = async () => {
    if (!activeSession || busy) return false;
    const title = classTitleForMessages();
    const proceed = confirmImpl(
      `End “${title}” for everyone?\n\n`
      + 'Students lose access immediately, new joins stop, and the class cannot be reopened. '
      + 'Team work stays readable only to administrators until it expires.'
    );
    if (!proceed) return false;
    if (!fetchImpl) {
      setError('The class service is unavailable right now.');
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetchImpl(INSTRUCTOR_CLASSES_ENDPOINT, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeSession.instructorToken}` }
      });
      const body = await responseJson(response);
      // 404 means the class is already ended/expired; either way this device is done with it.
      if (!response.ok && response.status !== 404) {
        setError(body.error || 'Could not end the class. Please try again.');
        return false;
      }
    } catch {
      setError('Could not reach the class service. The class is still running; please try again.');
      return false;
    } finally {
      setBusy(false);
    }
    leaveClass();
    toast(`Ended “${title}”. Students no longer have access.`);
    return true;
  };

  const pause = () => {
    onClassDisconnected();
    stopLive();
    restoreLocal();
    setConnectedLayout(false);
  };

  const handleStartSubmit = event => {
    event.preventDefault();
    const passwordInput = element('instructorClassPasswordInput');
    const classPassword = passwordInput?.value || '';
    void startClass(element('instructorClassTitleInput')?.value || '', classPassword).then(started => {
      if (started && passwordInput) passwordInput.value = '';
    });
  };
  const handleWorkspaceCreate = event => {
    event.preventDefault();
    void createWorkspace(
      element('instructorWorkspaceKind')?.value || 'group',
      element('instructorWorkspaceLabel')?.value || ''
    );
  };
  const handleCopyJoinCode = () => { void copyJoinCode(); };
  const handleShareClass = () => { void shareClass(); };
  const handleJoinQrToggle = () => { toggleJoinQr(); };
  const handleRailToggle = () => { setRailExpanded(!railExpanded, { user: true }); };
  const handleRailMediaChange = event => {
    if (railPreferenceTouched) return;
    setRailExpanded(!event.matches);
  };
  const handleRetry = () => { void resume(); };
  const handleLeave = () => requestLeaveClass();
  const handleJoinsToggle = () => { void setJoins(!joinsEnabled); };
  const handleMoveDevice = () => {
    if (transferInfo) { closeTransferPanel(); return; }
    void createTransferCode();
  };
  const handleTransferCopy = () => { if (transferInfo) void copyText(transferInfo.code, 'Transfer code copied.'); };
  const handleTransferClose = () => closeTransferPanel();
  const handleTransferSubmit = event => {
    event.preventDefault();
    const input = element('instructorTransferCodeInput');
    void redeemTransferCode(input?.value || '').then(moved => {
      if (moved && input) input.value = '';
    });
  };
  const handleBulkIndividual = () => { void createIndividualWorkspacesForWaiting(); };
  const handleRenameOpen = () => {
    const workspace = selectedLiveWorkspace();
    const form = element('instructorWorkspaceRenameForm');
    if (!workspace || !form) return;
    const opening = form.hidden;
    form.hidden = !opening;
    element('instructorWorkspaceRenameBtn')?.setAttribute('aria-expanded', String(opening));
    if (opening) {
      const input = element('instructorWorkspaceRenameInput');
      if (input) {
        input.value = workspace.label;
        input.focus?.();
      }
    }
  };
  const handleRenameSubmit = event => {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    void renameWorkspace(selectedWorkspaceId, element('instructorWorkspaceRenameInput')?.value || '');
  };
  const handleRenameCancel = () => {
    if (element('instructorWorkspaceRenameForm')) element('instructorWorkspaceRenameForm').hidden = true;
    element('instructorWorkspaceRenameBtn')?.setAttribute('aria-expanded', 'false');
    element('instructorWorkspaceRenameBtn')?.focus?.();
  };
  const handleRemove = () => { if (selectedWorkspaceId) void removeWorkspace(selectedWorkspaceId); };
  const handleEndClass = () => { void endClass(); };
  const handleReturnToLive = () => { void returnToLiveObservation(); };
  const handleSearch = event => {
    searchQuery = event?.target?.value || '';
    renderRoster();
  };
  const handleFilter = event => {
    kindFilter = ['all', 'individual', 'group'].includes(event?.target?.value) ? event.target.value : 'all';
    renderRoster();
  };
  const handleRosterKeydown = event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...(element('instructorWorkspaceList')?.querySelectorAll?.('.instructor-workspace-item') || [])];
    if (!buttons.length) return;
    const current = buttons.indexOf(documentRef.activeElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = current < 0 ? 0 : (current + delta + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].focus();
  };
  const handleRoleChange = event => {
    if (event?.detail?.role === EXPERIENCE_ROLE_IDS.INSTRUCTOR) void resume();
    else pause();
  };

  const init = () => {
    element('instructorClassStartForm')?.addEventListener('submit', handleStartSubmit);
    element('instructorWorkspaceCreateForm')?.addEventListener('submit', handleWorkspaceCreate);
    element('instructorCopyJoinCodeBtn')?.addEventListener('click', handleCopyJoinCode);
    element('instructorShareClassBtn')?.addEventListener('click', handleShareClass);
    element('instructorShowJoinQrBtn')?.addEventListener('click', handleJoinQrToggle);
    element('instructorClassPanelToggle')?.addEventListener('click', handleRailToggle);
    mobileRailQuery?.addEventListener?.('change', handleRailMediaChange);
    element('instructorClassRetryBtn')?.addEventListener('click', handleRetry);
    element('instructorClassLeaveBtn')?.addEventListener('click', handleLeave);
    element('instructorClassEndBtn')?.addEventListener('click', handleEndClass);
    element('instructorJoinsToggleBtn')?.addEventListener('click', handleJoinsToggle);
    element('instructorMoveDeviceBtn')?.addEventListener('click', handleMoveDevice);
    element('instructorTransferCopyBtn')?.addEventListener('click', handleTransferCopy);
    element('instructorTransferCloseBtn')?.addEventListener('click', handleTransferClose);
    element('instructorTransferForm')?.addEventListener('submit', handleTransferSubmit);
    element('instructorIndividualWorkspacesBtn')?.addEventListener('click', handleBulkIndividual);
    element('instructorWorkspaceRenameBtn')?.addEventListener('click', handleRenameOpen);
    element('instructorWorkspaceRenameForm')?.addEventListener('submit', handleRenameSubmit);
    element('instructorWorkspaceRenameCancelBtn')?.addEventListener('click', handleRenameCancel);
    element('instructorWorkspaceRemoveBtn')?.addEventListener('click', handleRemove);
    element('instructorObservationLiveBtn')?.addEventListener('click', handleReturnToLive);
    element('instructorWorkspaceSearch')?.addEventListener('input', handleSearch);
    element('instructorWorkspaceFilter')?.addEventListener('change', handleFilter);
    element('instructorWorkspaceList')?.addEventListener('keydown', handleRosterKeydown);
    windowRef?.addEventListener?.('intake:experience-role-changed', handleRoleChange);
    if (getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.INSTRUCTOR) void resume();
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    onClassDisconnected();
    stopLive();
    onObservationEnd();
    restoreReadonlyProjection();
    element('instructorClassStartForm')?.removeEventListener('submit', handleStartSubmit);
    element('instructorWorkspaceCreateForm')?.removeEventListener('submit', handleWorkspaceCreate);
    element('instructorCopyJoinCodeBtn')?.removeEventListener('click', handleCopyJoinCode);
    element('instructorShareClassBtn')?.removeEventListener('click', handleShareClass);
    element('instructorShowJoinQrBtn')?.removeEventListener('click', handleJoinQrToggle);
    element('instructorClassPanelToggle')?.removeEventListener('click', handleRailToggle);
    mobileRailQuery?.removeEventListener?.('change', handleRailMediaChange);
    element('instructorClassRetryBtn')?.removeEventListener('click', handleRetry);
    element('instructorClassLeaveBtn')?.removeEventListener('click', handleLeave);
    element('instructorClassEndBtn')?.removeEventListener('click', handleEndClass);
    element('instructorJoinsToggleBtn')?.removeEventListener('click', handleJoinsToggle);
    element('instructorMoveDeviceBtn')?.removeEventListener('click', handleMoveDevice);
    element('instructorTransferCopyBtn')?.removeEventListener('click', handleTransferCopy);
    element('instructorTransferCloseBtn')?.removeEventListener('click', handleTransferClose);
    element('instructorTransferForm')?.removeEventListener('submit', handleTransferSubmit);
    element('instructorIndividualWorkspacesBtn')?.removeEventListener('click', handleBulkIndividual);
    element('instructorWorkspaceRenameBtn')?.removeEventListener('click', handleRenameOpen);
    element('instructorWorkspaceRenameForm')?.removeEventListener('submit', handleRenameSubmit);
    element('instructorWorkspaceRenameCancelBtn')?.removeEventListener('click', handleRenameCancel);
    element('instructorWorkspaceRemoveBtn')?.removeEventListener('click', handleRemove);
    element('instructorObservationLiveBtn')?.removeEventListener('click', handleReturnToLive);
    element('instructorWorkspaceSearch')?.removeEventListener('input', handleSearch);
    element('instructorWorkspaceFilter')?.removeEventListener('change', handleFilter);
    element('instructorWorkspaceList')?.removeEventListener('keydown', handleRosterKeydown);
    windowRef?.removeEventListener?.('intake:experience-role-changed', handleRoleChange);
  };

  return {
    init,
    destroy,
    startClass,
    createWorkspace,
    assignParticipant,
    copyJoinCode,
    shareClass,
    toggleJoinQr,
    resume,
    refreshRoster,
    selectWorkspace,
    inspectCheckpoint,
    returnToLiveObservation,
    leaveClass,
    requestLeaveClass,
    endClass,
    setJoins,
    renameWorkspace,
    removeWorkspace,
    createIndividualWorkspacesForWaiting,
    createTransferCode,
    redeemTransferCode,
    setRailExpanded: expanded => setRailExpanded(expanded, { user: true }),
    getState: () => ({
      activeSession, workspaces, participants, selectedWorkspaceId, observerEpoch,
      latestObservation,
      checkpointView: checkpointView ? { ...checkpointView } : null,
      busy, searchQuery, kindFilter, lastError, railExpanded, joinQrExpanded,
      joinsEnabled, transferInfo: transferInfo ? { ...transferInfo } : null
    })
  };
}

export function initInstructorClassroom(options) {
  const controller = createInstructorClassroomController(options);
  controller.init();
  return controller;
}
