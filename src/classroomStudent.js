/**
 * @module classroomStudent
 * @summary Owns Student class admission, waiting, assignment switching, same-device resume, and explicit class exit.
 * @description
 *   Live Classroom credentials remain separate from SerializedAppState. The
 *   human join code is admission-only and discarded after use. A stable Student
 *   class-session capability is persisted locally, while assignment-specific
 *   workspace edit capabilities remain memory-only and are reacquired from the
 *   server after reload, reassignment, or reconnect. Legacy two-code Student
 *   sessions remain readable during the additive migration.
 */

import { getActiveExperienceRole } from './experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from './experienceRoles.js';
import {
  consumeClassroomJoinIntent,
  formatClassroomJoinLinkCode
} from './classroomJoinLink.js';

export const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';
export const STUDENT_RECOVERY_STORAGE_KEY = 'kt-classroom-student-local-recovery-v1';
export const STUDENT_SESSION_VERSION = 1;
export const STUDENT_ADMIT_ENDPOINT = '/api/classes/admit';
export const STUDENT_STATUS_ENDPOINT = '/api/classes/student';
export const STUDENT_ACCESS_ENDPOINT = '/api/classes/student/access';
export const STUDENT_JOIN_ENDPOINT = '/api/classes/join';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const JOIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const DISPLAY_NAME_MAX_LENGTH = 60;
const LIVE_STATUS_POLL_MS = 2500;

/**
 * Normalize a required Student display name for client-side validation.
 *
 * @param {unknown} value - Candidate name.
 * @returns {string|null} Normalized name or null when invalid.
 */
export function normalizeStudentDisplayName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > DISPLAY_NAME_MAX_LENGTH || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Validate a browser-facing classroom capability shape.
 *
 * @param {unknown} value - Candidate capability.
 * @returns {boolean} Whether the value has the expected URL-safe token shape.
 */
export function validateStudentCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
}

/**
 * Normalize the human Student class code.
 *
 * @param {unknown} value - Candidate join code.
 * @returns {string} Normalized eight-character code or an empty string.
 */
export function normalizeStudentJoinCode(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/gu, '');
  return JOIN_CODE_PATTERN.test(normalized) ? normalized : '';
}

function validClassContext(value) {
  return value && typeof value.id === 'string' && typeof value.title === 'string';
}

function validParticipantContext(value) {
  return value && typeof value.id === 'string' && typeof value.displayName === 'string';
}

function validWorkspaceContext(value) {
  return value
    && typeof value.id === 'string'
    && ['individual', 'group'].includes(value.kind)
    && typeof value.label === 'string';
}

function validLegacySession(parsed) {
  return validateStudentCapability(parsed?.workspaceToken)
    && validClassContext(parsed?.class)
    && validWorkspaceContext(parsed?.workspace)
    && validParticipantContext(parsed?.participant);
}

function validLiveSession(parsed) {
  return parsed?.mode === 'live'
    && validateStudentCapability(parsed.studentSessionToken)
    && validClassContext(parsed.class)
    && validParticipantContext(parsed.participant)
    && Number.isInteger(parsed.assignmentRevision)
    && parsed.assignmentRevision >= 0
    && (parsed.assignment === null || validWorkspaceContext(parsed.assignment))
    && !parsed.workspaceToken;
}

function validateStudentSessionEnvelope(parsed) {
  return parsed
    && parsed.version === STUDENT_SESSION_VERSION
    && (validLegacySession(parsed) || validLiveSession(parsed));
}

/**
 * Read a validated Student resume envelope.
 *
 * @param {Storage|null} storage - Local storage implementation.
 * @returns {object|null} Resume envelope or null.
 */
export function readStudentSession(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(STUDENT_SESSION_STORAGE_KEY) || 'null');
    return validateStudentSessionEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist a Student resume envelope outside Intake state.
 *
 * @param {Storage|null} storage - Local storage implementation.
 * @param {object} session - Validated legacy or live session.
 * @returns {boolean} Whether persistence succeeded.
 */
export function persistStudentSession(storage, session) {
  if (!storage || !validateStudentSessionEnvelope(session)) return false;
  try {
    storage.setItem(STUDENT_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the Student resume envelope.
 *
 * @param {Storage|null} storage - Local storage implementation.
 * @returns {void}
 */
export function clearStudentSession(storage = globalThis.localStorage) {
  try { storage?.removeItem(STUDENT_SESSION_STORAGE_KEY); } catch {}
}

/**
 * Determine whether a stored Student session is past its server-provided expiry.
 *
 * @param {object|null} session - Student session.
 * @param {number} nowMs - Current epoch milliseconds.
 * @returns {boolean} Whether the class/workspace has expired.
 */
export function isStudentSessionExpired(session, nowMs = Date.now()) {
  if (!session) return false;
  const expiries = session.mode === 'live'
    ? [session.class?.expiresAt]
    : [session.class?.expiresAt, session.workspace?.expiresAt];
  const timestamps = expiries
    .map(value => Date.parse(value || ''))
    .filter(Number.isFinite);
  return timestamps.length > 0 && Math.min(...timestamps) <= nowMs;
}

/**
 * Create the Student classroom controller.
 *
 * @param {object} options - Dependencies.
 * @returns {object} Student controller.
 */
export function createStudentClassroomController({
  collaboration,
  collect,
  apply,
  saveLocal,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  now = () => Date.now(),
  toast = () => {},
  onClassConnected = () => {},
  onClassDisconnected = () => {},
  onSessionConnected = () => {},
  onSessionDisconnected = () => {},
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController
}) {
  let activeSession = null;
  let activeWorkspaceToken = '';
  let connecting = false;
  let destroyed = false;
  let lastError = '';
  let liveEpoch = 0;
  let statusTimer = null;
  let statusAbort = null;

  const element = id => documentRef?.getElementById(id) || null;
  const intakeWrap = () => documentRef?.querySelector?.('.wrap[data-experience-surface="intake"]') || null;

  const clearTimer = timer => {
    if (timer !== null && typeof clearTimeoutImpl === 'function') clearTimeoutImpl(timer);
  };

  const abort = controller => {
    try { controller?.abort?.(); } catch {}
  };

  const responseJson = async response => response.json().catch(() => ({}));

  const setError = message => {
    lastError = message || '';
    const error = element('studentClassJoinError');
    if (error) {
      error.textContent = lastError;
      error.hidden = !lastError;
    }
  };

  const setBusy = busy => {
    connecting = busy;
    const submit = element('studentClassJoinSubmit');
    const retry = element('studentClassRetryBtn');
    if (submit) submit.disabled = busy;
    if (retry) retry.disabled = busy;
    documentRef?.body?.toggleAttribute?.('data-student-class-busy', busy);
  };

  const setStatus = status => {
    if (documentRef?.body) documentRef.body.dataset.studentClassStatus = status;
  };

  const sessionAssignment = session => (
    session?.mode === 'live' ? session.assignment : session?.workspace
  );

  const renderContext = session => {
    const assignment = sessionAssignment(session);
    const title = element('studentClassContextTitle');
    const workspace = element('studentClassWorkspace');
    const identity = element('studentClassIdentity');
    const kind = element('studentClassWorkspaceKind');
    const expiry = element('studentClassExpiry');
    if (title) title.textContent = session?.class?.title || 'Student class';
    if (workspace) workspace.textContent = assignment?.label || 'Assigned workspace';
    if (identity) identity.textContent = session?.participant?.displayName || 'Student';
    if (kind) kind.textContent = assignment?.kind === 'group' ? 'Team workspace' : 'Individual workspace';
    if (expiry) {
      const stamp = Date.parse(session?.class?.expiresAt || '');
      expiry.textContent = Number.isFinite(stamp)
        ? `Class access expires ${new Date(stamp).toLocaleDateString()}`
        : 'Instructor-managed class';
    }
  };

  const setEntryPanels = ({ form = false, waiting = false, resume = false } = {}) => {
    if (element('studentClassJoinForm')) element('studentClassJoinForm').hidden = !form;
    if (element('studentClassWaitingPanel')) element('studentClassWaitingPanel').hidden = !waiting;
    if (element('studentClassResumePanel')) element('studentClassResumePanel').hidden = !resume;
  };

  const renderEntry = ({ retry = false, message = '' } = {}) => {
    setStatus(retry ? 'retry' : 'disconnected');
    setEntryPanels({ form: !retry, resume: retry });
    const resumeTitle = element('studentClassResumeTitle');
    if (resumeTitle) resumeTitle.textContent = activeSession?.class?.title || 'Your class';
    const resumeMessage = element('studentClassResumeMessage');
    if (resumeMessage) resumeMessage.textContent = message || 'We could not reconnect to your saved class.';
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) wrap.hidden = true;
  };

  const renderHolding = (session, {
    status = 'waiting',
    title = 'Waiting for your instructor',
    message = 'You are in the class. Your instructor has not assigned you to a team or individual workspace yet.'
  } = {}) => {
    setStatus(status);
    setEntryPanels({ waiting: true });
    if (element('studentClassWaitingTitle')) element('studentClassWaitingTitle').textContent = title;
    if (element('studentClassWaitingMessage')) element('studentClassWaitingMessage').textContent = message;
    if (element('studentClassWaitingClass')) element('studentClassWaitingClass').textContent = session?.class?.title || 'Student class';
    if (element('studentClassWaitingIdentity')) element('studentClassWaitingIdentity').textContent = session?.participant?.displayName || 'Student';
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) wrap.hidden = true;
    setError('');
  };

  const renderWaiting = session => renderHolding(session);

  const renderConnected = session => {
    setStatus('connected');
    renderContext(session);
    setEntryPanels({ form: true });
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) wrap.hidden = false;
    setError('');
  };

  const readRecovery = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(STUDENT_RECOVERY_STORAGE_KEY) || 'null');
      return parsed?.snapshot && typeof parsed.snapshot === 'object' ? parsed.snapshot : null;
    } catch {
      return null;
    }
  };

  const preserveLocalRecovery = () => {
    try {
      if (!storage || storage.getItem(STUDENT_RECOVERY_STORAGE_KEY)) return;
      const snapshot = collect?.();
      if (snapshot && typeof snapshot === 'object') {
        storage.setItem(STUDENT_RECOVERY_STORAGE_KEY, JSON.stringify({
          savedAt: new Date(now()).toISOString(),
          snapshot
        }));
      }
    } catch {}
  };

  const restoreLocalRecovery = ({ clear = true } = {}) => {
    const snapshot = readRecovery();
    if (!snapshot) return false;
    try {
      apply?.(snapshot);
      saveLocal?.(snapshot);
      return true;
    } catch {
      return false;
    } finally {
      if (clear) {
        try { storage?.removeItem(STUDENT_RECOVERY_STORAGE_KEY); } catch {}
      }
    }
  };

  const buildLegacySession = body => ({
    version: STUDENT_SESSION_VERSION,
    class: {
      id: body.class.id,
      title: body.class.title,
      expiresAt: body.class.expiresAt || null
    },
    workspace: {
      id: body.workspace.id,
      kind: body.workspace.kind,
      label: body.workspace.label,
      expiresAt: body.workspace.expiresAt || null
    },
    participant: {
      id: body.self.id,
      displayName: body.self.displayName
    },
    workspaceToken: body.workspaceToken,
    joinedAt: new Date(now()).toISOString()
  });

  const normalizeAssignment = assignment => (
    validWorkspaceContext(assignment)
      ? { id: assignment.id, kind: assignment.kind, label: assignment.label }
      : null
  );

  const buildLiveSession = body => ({
    version: STUDENT_SESSION_VERSION,
    mode: 'live',
    class: {
      id: body.class.id,
      title: body.class.title,
      expiresAt: body.class.expiresAt || null
    },
    participant: {
      id: body.participant.id,
      displayName: body.participant.displayName
    },
    studentSessionToken: body.studentSessionToken,
    assignmentRevision: body.participant.assignmentRevision,
    assignment: normalizeAssignment(body.assignment),
    joinedAt: new Date(now()).toISOString()
  });

  const isTerminalCollaborationFailure = () => {
    const state = collaboration?.getState?.() || {};
    return Boolean(state.pollingStopped || /invalid|missing|expired/i.test(state.terminalStatus || ''));
  };

  const disconnectWorkspace = () => {
    const state = collaboration?.getState?.() || {};
    if (activeWorkspaceToken || state.sessionKind === 'classroom') {
      collaboration?.leave?.({ silent: true });
      onClassDisconnected();
    }
    activeWorkspaceToken = '';
  };

  const stopLivePolling = () => {
    clearTimer(statusTimer);
    statusTimer = null;
    abort(statusAbort);
    statusAbort = null;
  };

  const scheduleLiveStatus = (epoch, delay = LIVE_STATUS_POLL_MS) => {
    clearTimer(statusTimer);
    statusTimer = null;
    if (
      destroyed
      || activeSession?.mode !== 'live'
      || epoch !== liveEpoch
      || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.STUDENT
      || typeof setTimeoutImpl !== 'function'
    ) return;
    statusTimer = setTimeoutImpl(() => {
      statusTimer = null;
      void syncLiveStatus(epoch);
    }, delay);
  };

  const terminalLiveSession = message => {
    liveEpoch += 1;
    stopLivePolling();
    disconnectWorkspace();
    onSessionDisconnected();
    clearStudentSession(storage);
    activeSession = null;
    restoreLocalRecovery();
    renderEntry();
    setError(message || 'This class session is no longer available. Ask your instructor for the current class code.');
    return false;
  };

  const attachLegacySession = async session => {
    activeSession = session;
    setBusy(true);
    setStatus('connecting');
    renderContext(session);
    const connected = await collaboration?.connect?.(session.workspaceToken, {
      displayName: session.participant.displayName,
      classroom: true
    });
    setBusy(false);
    if (connected) {
      activeWorkspaceToken = session.workspaceToken;
      renderConnected(session);
      onClassConnected(session.workspaceToken);
      return true;
    }
    if (isTerminalCollaborationFailure()) {
      collaboration?.leave?.({ silent: true });
      onClassDisconnected();
      activeWorkspaceToken = '';
      clearStudentSession(storage);
      activeSession = null;
      restoreLocalRecovery();
      renderEntry();
      setError('This class workspace is no longer available. Ask your instructor for current class and assignment codes.');
      return false;
    }
    renderEntry({
      retry: true,
      message: 'We could not reconnect to your saved class workspace. Check your connection and try again.'
    });
    return false;
  };

  const validLiveStatusBody = body => (
    validClassContext(body?.class)
    && validParticipantContext(body?.participant)
    && Number.isInteger(body.participant.assignmentRevision)
    && body.participant.assignmentRevision >= 0
    && (body.assignment === null || validWorkspaceContext(body.assignment))
  );

  const updateLiveSessionFromStatus = body => {
    activeSession = {
      ...activeSession,
      class: {
        id: body.class.id,
        title: body.class.title,
        expiresAt: body.class.expiresAt || null
      },
      participant: {
        id: body.participant.id,
        displayName: body.participant.displayName
      },
      assignmentRevision: body.participant.assignmentRevision,
      assignment: normalizeAssignment(body.assignment)
    };
    persistStudentSession(storage, activeSession);
  };

  const connectLiveAssignment = async epoch => {
    if (destroyed || activeSession?.mode !== 'live' || epoch !== liveEpoch || !activeSession.assignment) return false;
    const target = activeSession.assignment;
    disconnectWorkspace();
    renderHolding(activeSession, {
      status: 'connecting',
      title: `Joining ${target.label}`,
      message: 'Your instructor assigned your workspace. Loading the current team Intake…'
    });

    try {
      const response = await fetchImpl(STUDENT_ACCESS_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeSession.studentSessionToken}` }
      });
      const body = await responseJson(response);
      if (epoch !== liveEpoch || destroyed) return false;

      if (response.status === 404 || response.status === 401) {
        return terminalLiveSession('This class session is no longer available. Ask your instructor for the current class code.');
      }
      if (response.status === 409 && body.status === 'waiting' && validParticipantContext(body.participant)) {
        activeSession = {
          ...activeSession,
          class: validClassContext(body.class) ? {
            id: body.class.id,
            title: body.class.title,
            expiresAt: body.class.expiresAt || null
          } : activeSession.class,
          participant: {
            id: body.participant.id,
            displayName: body.participant.displayName
          },
          assignmentRevision: Number.isInteger(body.participant.assignmentRevision)
            ? body.participant.assignmentRevision
            : activeSession.assignmentRevision,
          assignment: null
        };
        persistStudentSession(storage, activeSession);
        renderWaiting(activeSession);
        scheduleLiveStatus(epoch);
        return true;
      }
      if (
        !response.ok
        || !validateStudentCapability(body.workspaceToken)
        || !validClassContext(body.class)
        || !validParticipantContext(body.participant)
        || !Number.isInteger(body.participant.assignmentRevision)
        || !validWorkspaceContext(body.assignment)
      ) {
        renderHolding(activeSession, {
          status: 'retry',
          title: 'Reconnecting to your assignment',
          message: 'We could not load your assigned workspace yet. Intake will retry automatically.'
        });
        scheduleLiveStatus(epoch);
        return false;
      }

      activeSession = {
        ...activeSession,
        class: {
          id: body.class.id,
          title: body.class.title,
          expiresAt: body.class.expiresAt || null
        },
        participant: {
          id: body.participant.id,
          displayName: body.participant.displayName
        },
        assignmentRevision: body.participant.assignmentRevision,
        assignment: normalizeAssignment(body.assignment)
      };
      persistStudentSession(storage, activeSession);

      const workspaceToken = body.workspaceToken;
      const connected = await collaboration?.connect?.(workspaceToken, {
        displayName: activeSession.participant.displayName,
        classroom: true
      });
      if (epoch !== liveEpoch || destroyed) {
        collaboration?.leave?.({ silent: true });
        return false;
      }
      if (!connected) {
        activeWorkspaceToken = '';
        renderHolding(activeSession, {
          status: 'retry',
          title: 'Assignment changed',
          message: 'Your workspace access changed while Intake was connecting. Retrying the current assignment…'
        });
        scheduleLiveStatus(epoch, 500);
        return false;
      }

      activeWorkspaceToken = workspaceToken;
      renderConnected(activeSession);
      onClassConnected(workspaceToken);
      scheduleLiveStatus(epoch);
      return true;
    } catch {
      if (epoch !== liveEpoch || destroyed) return false;
      renderHolding(activeSession, {
        status: 'retry',
        title: 'Reconnecting to your assignment',
        message: 'The class service is temporarily unavailable. Intake will retry automatically.'
      });
      scheduleLiveStatus(epoch);
      return false;
    }
  };

  async function syncLiveStatus(epoch = liveEpoch) {
    if (
      destroyed
      || activeSession?.mode !== 'live'
      || epoch !== liveEpoch
      || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.STUDENT
    ) return false;

    abort(statusAbort);
    statusAbort = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
    try {
      const response = await fetchImpl(STUDENT_STATUS_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${activeSession.studentSessionToken}` },
        signal: statusAbort?.signal
      });
      const body = await responseJson(response);
      statusAbort = null;
      if (epoch !== liveEpoch || destroyed) return false;

      if (response.status === 404 || response.status === 401) {
        return terminalLiveSession('This class session is no longer available. Ask your instructor for the current class code.');
      }
      if (!response.ok || !validLiveStatusBody(body)) {
        if (!activeWorkspaceToken) {
          renderHolding(activeSession, {
            status: 'retry',
            title: 'Checking your class assignment',
            message: 'The class service is temporarily unavailable. Intake will keep retrying.'
          });
        }
        scheduleLiveStatus(epoch);
        return false;
      }

      const previousRevision = activeSession.assignmentRevision;
      const previousAssignmentId = activeSession.assignment?.id || null;
      const nextAssignmentId = body.assignment?.id || null;
      const assignmentChanged = previousRevision !== body.participant.assignmentRevision
        || previousAssignmentId !== nextAssignmentId;

      updateLiveSessionFromStatus(body);

      if (!activeSession.assignment) {
        const wasAssigned = Boolean(activeWorkspaceToken || previousAssignmentId);
        disconnectWorkspace();
        renderWaiting(activeSession);
        if (wasAssigned && assignmentChanged) toast('Your instructor moved you back to Waiting.');
        scheduleLiveStatus(epoch);
        return true;
      }

      if (!assignmentChanged && activeWorkspaceToken) {
        renderConnected(activeSession);
        scheduleLiveStatus(epoch);
        return true;
      }

      if (previousAssignmentId && previousAssignmentId !== activeSession.assignment.id) {
        toast(`Your instructor moved you to ${activeSession.assignment.label}.`);
      }
      return connectLiveAssignment(epoch);
    } catch {
      statusAbort = null;
      if (epoch !== liveEpoch || destroyed) return false;
      if (!activeWorkspaceToken) {
        renderHolding(activeSession, {
          status: 'retry',
          title: 'Checking your class assignment',
          message: 'The class service is temporarily unavailable. Intake will keep retrying.'
        });
      }
      scheduleLiveStatus(epoch);
      return false;
    }
  }

  const activateLiveSession = async session => {
    activeSession = session;
    activeWorkspaceToken = '';
    liveEpoch += 1;
    const epoch = liveEpoch;
    stopLivePolling();
    persistStudentSession(storage, session);
    onSessionConnected(session.studentSessionToken);
    renderHolding(session, {
      status: 'connecting',
      title: 'Joining your class',
      message: 'Checking whether your instructor has assigned a workspace…'
    });
    return syncLiveStatus(epoch);
  };

  const resume = async () => {
    if (destroyed || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.STUDENT) return false;
    const collaborationState = collaboration?.getState?.() || {};
    if (collaborationState.token && collaborationState.sessionKind !== 'classroom') {
      collaboration.leave?.({ silent: true });
    }
    const stored = readStudentSession(storage);
    if (!stored) {
      activeSession = null;
      activeWorkspaceToken = '';
      renderEntry();
      return false;
    }
    if (isStudentSessionExpired(stored, now())) {
      if (stored.mode === 'live') {
        activeSession = stored;
        return terminalLiveSession('Your saved class access has expired. Ask your instructor for the current class code.');
      }
      clearStudentSession(storage);
      activeSession = null;
      activeWorkspaceToken = '';
      restoreLocalRecovery();
      renderEntry();
      setError('Your saved class access has expired. Ask your instructor for new class and assignment codes.');
      return false;
    }
    if (stored.mode === 'live') {
      return activateLiveSession(stored);
    }
    return attachLegacySession(stored);
  };

  const clearAdmissionInputs = () => {
    if (element('studentClassCode')) element('studentClassCode').value = '';
    if (element('studentAssignmentCode')) element('studentAssignmentCode').value = '';
    if (element('studentLegacyJoin')) element('studentLegacyJoin').open = false;
  };

  const applyJoinIntent = () => {
    if (readStudentSession(storage)) return false;
    const joinCode = consumeClassroomJoinIntent({
      locationRef: windowRef?.location,
      historyRef: windowRef?.history
    });
    if (!joinCode) return false;

    activeSession = null;
    activeWorkspaceToken = '';
    renderEntry();
    const input = element('studentClassCode');
    if (input) input.value = formatClassroomJoinLinkCode(joinCode);
    setError('');
    if (element('studentDisplayName') && typeof element('studentDisplayName').focus === 'function') {
      element('studentDisplayName').focus();
    }
    return true;
  };

  const joinLegacy = async ({ classCode, assignmentCode, displayName, participantId }) => {
    const joinToken = typeof classCode === 'string' ? classCode.trim() : '';
    const assignmentToken = typeof assignmentCode === 'string' ? assignmentCode.trim() : '';
    if (!validateStudentCapability(joinToken) || !validateStudentCapability(assignmentToken)) {
      setError('Enter the current long class and assignment codes from your instructor.');
      return false;
    }

    const response = await fetchImpl(STUDENT_JOIN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${joinToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assignmentToken,
        participantId,
        displayName
      })
    });
    const body = await responseJson(response);
    if (!response.ok) {
      if (response.status === 404) {
        setError('The class or assignment code was not accepted. Ask your instructor for the current codes.');
      } else if (response.status === 400) {
        setError('Check your name and class codes, then try again.');
      } else {
        setError('The class service is unavailable right now. Your local Intake is unchanged.');
      }
      return false;
    }
    if (
      !validateStudentCapability(body.workspaceToken)
      || !validClassContext(body.class)
      || !validWorkspaceContext(body.workspace)
      || !validParticipantContext(body.self)
    ) {
      setError('The class service returned an incomplete workspace response.');
      return false;
    }

    preserveLocalRecovery();
    const session = buildLegacySession(body);
    persistStudentSession(storage, session);
    activeSession = session;
    clearAdmissionInputs();
    return attachLegacySession(session);
  };

  const joinLive = async ({ classCode, displayName, participantId }) => {
    const joinCode = normalizeStudentJoinCode(classCode);
    if (!joinCode) {
      setError('Enter the eight-character class code from your instructor.');
      return false;
    }

    const response = await fetchImpl(STUDENT_ADMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        joinCode,
        participantId,
        displayName
      })
    });
    const body = await responseJson(response);
    if (!response.ok) {
      if (response.status === 404) {
        setError('That class code is not available. Ask your instructor for the current code.');
      } else if (response.status === 400) {
        setError('Check your name and class code, then try again.');
      } else {
        setError('The class service is unavailable right now. Your local Intake is unchanged.');
      }
      return false;
    }
    if (
      !validateStudentCapability(body.studentSessionToken)
      || !validClassContext(body.class)
      || !validParticipantContext(body.participant)
      || !Number.isInteger(body.participant.assignmentRevision)
      || (body.assignment !== null && !validWorkspaceContext(body.assignment))
    ) {
      setError('The class service returned an incomplete admission response.');
      return false;
    }

    preserveLocalRecovery();
    const session = buildLiveSession(body);
    persistStudentSession(storage, session);
    activeSession = session;
    clearAdmissionInputs();
    return activateLiveSession(session);
  };

  const join = async ({ classCode, assignmentCode = '', displayName }) => {
    if (connecting) return false;
    const normalizedName = normalizeStudentDisplayName(displayName);
    if (!normalizedName) {
      setError('Enter your name before joining the class.');
      return false;
    }
    const participantId = collaboration?.getState?.().profile?.participantId;
    if (typeof participantId !== 'string') {
      setError('Student identity could not be initialized. Refresh the page and try again.');
      return false;
    }

    setBusy(true);
    setError('');
    try {
      return assignmentCode?.trim()
        ? await joinLegacy({
            classCode,
            assignmentCode,
            displayName: normalizedName,
            participantId
          })
        : await joinLive({
            classCode,
            displayName: normalizedName,
            participantId
          });
    } catch {
      setError('Could not reach the class service. Your local Intake is unchanged.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const leaveClass = ({ restore = true } = {}) => {
    liveEpoch += 1;
    stopLivePolling();
    disconnectWorkspace();
    onSessionDisconnected();
    clearStudentSession(storage);
    activeSession = null;
    const restored = restore ? restoreLocalRecovery() : false;
    renderEntry();
    setError('');
    toast(restored
      ? 'Left class. Your previous local Intake was restored.'
      : 'Left class. Your local Intake copy was kept.');
    return restored;
  };

  const handleJoinSubmit = event => {
    event.preventDefault();
    void join({
      classCode: element('studentClassCode')?.value || '',
      assignmentCode: element('studentAssignmentCode')?.value || '',
      displayName: element('studentDisplayName')?.value || ''
    });
  };

  const handleRetry = () => { void resume(); };
  const handleLeave = () => leaveClass();

  const handleRoleChange = event => {
    const role = event?.detail?.role;
    if (role === EXPERIENCE_ROLE_IDS.STUDENT) {
      if (!applyJoinIntent()) void resume();
      return;
    }
    liveEpoch += 1;
    stopLivePolling();
    disconnectWorkspace();
    if (activeSession?.mode === 'live') onSessionDisconnected();
    restoreLocalRecovery({ clear: false });
  };

  const init = () => {
    element('studentClassJoinForm')?.addEventListener('submit', handleJoinSubmit);
    element('studentClassRetryBtn')?.addEventListener('click', handleRetry);
    element('studentClassLeaveBtn')?.addEventListener('click', handleLeave);
    element('studentClassWaitingLeaveBtn')?.addEventListener('click', handleLeave);
    windowRef?.addEventListener?.('intake:experience-role-changed', handleRoleChange);
    if (getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) {
      if (!applyJoinIntent()) void resume();
    }
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    liveEpoch += 1;
    stopLivePolling();
    onClassDisconnected();
    onSessionDisconnected();
    element('studentClassJoinForm')?.removeEventListener('submit', handleJoinSubmit);
    element('studentClassRetryBtn')?.removeEventListener('click', handleRetry);
    element('studentClassLeaveBtn')?.removeEventListener('click', handleLeave);
    element('studentClassWaitingLeaveBtn')?.removeEventListener('click', handleLeave);
    windowRef?.removeEventListener?.('intake:experience-role-changed', handleRoleChange);
  };

  return {
    init,
    destroy,
    join,
    resume,
    refreshStatus: () => activeSession?.mode === 'live' ? syncLiveStatus(liveEpoch) : false,
    leaveClass,
    getState: () => ({
      activeSession,
      activeWorkspaceToken,
      connecting,
      lastError,
      liveEpoch
    })
  };
}

/**
 * Initialize the Student classroom controller.
 *
 * @param {Parameters<typeof createStudentClassroomController>[0]} options - Dependencies.
 * @returns {ReturnType<typeof createStudentClassroomController>} Initialized controller.
 */
export function initStudentClassroom(options) {
  const controller = createStudentClassroomController(options);
  controller.init();
  return controller;
}
