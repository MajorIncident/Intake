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

export const INSTRUCTOR_SESSION_STORAGE_KEY = 'kt-classroom-instructor-session-v1';
export const INSTRUCTOR_SESSION_VERSION = 1;
export const INSTRUCTOR_WORKSPACES_ENDPOINT = '/api/classes/workspaces';
export const INSTRUCTOR_OBSERVE_ENDPOINT = '/api/classes/observe';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROSTER_POLL_MS = 5000;
const OBSERVE_POLL_MS = 1200;

export function validateInstructorCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
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
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController
}) {
  let activeSession = null;
  let workspaces = [];
  let selectedWorkspaceId = '';
  let rosterTimer = null;
  let observerTimer = null;
  let rosterAbort = null;
  let observerAbort = null;
  let observerEpoch = 0;
  let localRecovery = null;
  let latestObservation = null;
  let destroyed = false;
  let busy = false;
  let searchQuery = '';
  let kindFilter = 'all';
  let lastError = '';
  const readonlyRecords = new Map();

  const element = id => documentRef?.getElementById(id) || null;
  const intakeWrap = () => documentRef?.querySelector?.('.wrap[data-experience-surface="intake"]') || null;
  const setStatus = status => {
    if (documentRef?.body) documentRef.body.dataset.instructorClassStatus = status;
  };
  const setConnectedLayout = connected => documentRef?.body?.classList?.toggle('instructor-class-connected', connected);
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
    if (element('instructorClassOpenBtn')) element('instructorClassOpenBtn').disabled = value;
    if (element('instructorClassRetryBtn')) element('instructorClassRetryBtn').disabled = value;
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
    if (element('instructorClassForm')) element('instructorClassForm').hidden = retry;
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

  const renderDashboard = () => {
    if (!activeSession) return;
    setConnectedLayout(true);
    setStatus(selectedWorkspaceId ? 'observing' : 'connected');
    if (element('instructorClassEntryCard')) element('instructorClassEntryCard').hidden = true;
    if (element('instructorClassDashboard')) element('instructorClassDashboard').hidden = false;
    if (element('instructorClassTitle')) element('instructorClassTitle').textContent = activeSession.class.title;
    renderExpiry(activeSession.class.expiresAt);
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

  const renderObservation = body => {
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = false;
    if (element('instructorObservedWorkspace')) element('instructorObservedWorkspace').textContent = body.workspace?.label || 'Selected workspace';
    if (element('instructorObservedRevision')) element('instructorObservedRevision').textContent = `Revision ${body.workspace?.revision || '—'}`;
    if (element('instructorObserverStatus')) element('instructorObserverStatus').textContent = 'Live read-only view';

    const list = element('instructorObservationParticipants');
    if (list) {
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
    wrap.setAttribute('aria-readonly', 'true');
    const controls = wrap.querySelectorAll(
      'input, textarea, select, button, [contenteditable], [role="button"], [role="checkbox"], [role="switch"], [draggable="true"]'
    );
    controls.forEach(control => {
      if (control.closest?.('#instructorObservationNotice, [data-instructor-coaching-control]')) return;
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
    if (element('instructorObservationNotice')) element('instructorObservationNotice').hidden = true;
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.INSTRUCTOR) {
      wrap.hidden = true;
      wrap.setAttribute('aria-hidden', 'true');
    }
  };

  const showObservedIntake = body => {
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
    const response = await fetchImpl(INSTRUCTOR_WORKSPACES_ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: rosterAbort?.signal
    });
    const body = await responseJson(response);
    rosterAbort = null;
    return { response, body };
  };

  const validWorkspace = workspace => (
    workspace
    && UUID_PATTERN.test(workspace.id || '')
    && ['individual', 'group'].includes(workspace.kind)
    && typeof workspace.label === 'string'
  );

  const acceptRoster = body => {
    if (typeof body.class?.id !== 'string' || typeof body.class?.title !== 'string' || !Array.isArray(body.workspaces)) {
      return false;
    }
    workspaces = body.workspaces.filter(validWorkspace);
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
    if (!activeSession || !selectedWorkspaceId || destroyed || typeof setTimeoutImpl !== 'function') return;
    observerTimer = setTimeoutImpl(() => {
      observerTimer = null;
      void observeWorkspace(epoch);
    }, OBSERVE_POLL_MS);
  };

  const terminalClass = message => {
    onClassDisconnected();
    stopLive();
    clearInstructorSession(storage);
    activeSession = null;
    workspaces = [];
    selectedWorkspaceId = '';
    restoreLocal();
    renderEntry();
    setError(message || 'This instructor class is no longer available.');
    return false;
  };

  const observeWorkspace = async epoch => {
    if (!activeSession || !selectedWorkspaceId || destroyed) return false;
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

  async function selectWorkspace(workspaceId) {
    if (!activeSession || !workspaces.some(item => item.id === workspaceId)) return false;
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
      const { response, body } = await fetchRoster(activeSession.instructorToken);
      if (response.status === 404 || response.status === 401) {
        return terminalClass('This instructor class is no longer available. Use the current Instructor access code.');
      }
      if (!response.ok || !acceptRoster(body)) {
        setError('Could not refresh the class roster. Live observation will keep retrying.');
        scheduleRoster();
        return false;
      }
      activeSession.class = { id: body.class.id, title: body.class.title, expiresAt: body.class.expiresAt || null };
      if (selectedWorkspaceId && !workspaces.some(item => item.id === selectedWorkspaceId)) {
        selectedWorkspaceId = '';
        latestObservation = null;
        restoreLocal();
      }
      saveSession();
      onClassConnected(token);
      renderDashboard();
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

  const activateClass = async (token, preferredWorkspaceId = '') => {
    onClassDisconnected();
    disconnectStandaloneCollaboration();
    setBusy(true);
    setStatus('connecting');
    setError('');
    try {
      const { response, body } = await fetchRoster(token);
      if (response.status === 404 || response.status === 401) {
        return terminalClass('The Instructor access code was not accepted or has expired.');
      }
      if (!response.ok || !acceptRoster(body)) {
        setError('The class service is unavailable right now. Your local Intake is unchanged.');
        renderEntry({ retry: Boolean(activeSession), message: 'The class service is unavailable right now.' });
        return false;
      }
      activeSession = {
        version: INSTRUCTOR_SESSION_VERSION,
        instructorToken: token,
        class: { id: body.class.id, title: body.class.title, expiresAt: body.class.expiresAt || null },
        selectedWorkspaceId: null,
        openedAt: new Date(now()).toISOString()
      };
      selectedWorkspaceId = workspaces.some(item => item.id === preferredWorkspaceId)
        ? preferredWorkspaceId
        : workspaces[0]?.id || '';
      saveSession();
      renderDashboard();
      renderRoster();
      if (element('instructorClassCode')) element('instructorClassCode').value = '';
      if (selectedWorkspaceId) await selectWorkspace(selectedWorkspaceId);
      else restoreLocal();
      scheduleRoster();
      return true;
    } catch {
      setError('Could not reach the class service. Your local Intake is unchanged.');
      renderEntry({ retry: Boolean(activeSession), message: 'Could not reach the class service.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openClass = async instructorCode => {
    const token = typeof instructorCode === 'string' ? instructorCode.trim() : '';
    if (!validateInstructorCapability(token)) {
      setError('Enter the current Instructor access code for this class.');
      return false;
    }
    return activateClass(token);
  };

  const resume = async () => {
    if (destroyed || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.INSTRUCTOR) return false;
    const stored = readInstructorSession(storage);
    if (!stored) {
      activeSession = null;
      workspaces = [];
      selectedWorkspaceId = '';
      renderEntry();
      return false;
    }
    activeSession = stored;
    selectedWorkspaceId = stored.selectedWorkspaceId || '';
    if (isInstructorSessionExpired(stored, now())) {
      return terminalClass('Your saved Instructor class access has expired. Use the current Instructor access code.');
    }
    if (element('instructorClassForm')) element('instructorClassForm').hidden = true;
    if (element('instructorClassResumePanel')) element('instructorClassResumePanel').hidden = false;
    if (element('instructorClassResumeTitle')) element('instructorClassResumeTitle').textContent = stored.class.title;
    if (element('instructorClassResumeMessage')) element('instructorClassResumeMessage').textContent = 'Reconnecting to your class roster…';
    return activateClass(stored.instructorToken, stored.selectedWorkspaceId || '');
  };

  const leaveClass = () => {
    onClassDisconnected();
    stopLive();
    clearInstructorSession(storage);
    activeSession = null;
    workspaces = [];
    selectedWorkspaceId = '';
    restoreLocal();
    renderEntry();
    setError('');
    toast('Left instructor class. Your local Intake was restored.');
    return true;
  };

  const pause = () => {
    onClassDisconnected();
    stopLive();
    restoreLocal();
    setConnectedLayout(false);
  };

  const handleSubmit = event => {
    event.preventDefault();
    void openClass(element('instructorClassCode')?.value || '');
  };
  const handleRetry = () => { void resume(); };
  const handleLeave = () => leaveClass();
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
    element('instructorClassForm')?.addEventListener('submit', handleSubmit);
    element('instructorClassRetryBtn')?.addEventListener('click', handleRetry);
    element('instructorClassLeaveBtn')?.addEventListener('click', handleLeave);
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
    element('instructorClassForm')?.removeEventListener('submit', handleSubmit);
    element('instructorClassRetryBtn')?.removeEventListener('click', handleRetry);
    element('instructorClassLeaveBtn')?.removeEventListener('click', handleLeave);
    element('instructorWorkspaceSearch')?.removeEventListener('input', handleSearch);
    element('instructorWorkspaceFilter')?.removeEventListener('change', handleFilter);
    element('instructorWorkspaceList')?.removeEventListener('keydown', handleRosterKeydown);
    windowRef?.removeEventListener?.('intake:experience-role-changed', handleRoleChange);
  };

  return {
    init,
    destroy,
    openClass,
    resume,
    refreshRoster,
    selectWorkspace,
    leaveClass,
    getState: () => ({
      activeSession, workspaces, selectedWorkspaceId, observerEpoch,
      latestObservation, busy, searchQuery, kindFilter, lastError
    })
  };
}

export function initInstructorClassroom(options) {
  const controller = createInstructorClassroomController(options);
  controller.init();
  return controller;
}
