/**
 * @module classroomStudent
 * @summary Owns Student class admission, same-device resume, class context, and explicit class exit.
 * @description
 *   Classroom credentials remain separate from SerializedAppState. Student join
 *   and assignment capabilities are used once and discarded; only the issued
 *   per-participant workspace capability is retained in a dedicated local-only
 *   resume envelope. The existing collaboration controller owns all snapshot,
 *   revision, presence, conflict, and field-activity behavior after admission.
 */

import { getActiveExperienceRole } from './experienceRoleController.js';
import { EXPERIENCE_ROLE_IDS } from './experienceRoles.js';

export const STUDENT_SESSION_STORAGE_KEY = 'kt-classroom-student-session-v1';
export const STUDENT_RECOVERY_STORAGE_KEY = 'kt-classroom-student-local-recovery-v1';
export const STUDENT_SESSION_VERSION = 1;
export const STUDENT_JOIN_ENDPOINT = '/api/classes/join';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DISPLAY_NAME_MAX_LENGTH = 60;

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
 * Read a validated Student resume envelope.
 *
 * @param {Storage|null} storage - Local storage implementation.
 * @returns {object|null} Resume envelope or null.
 */
export function readStudentSession(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(STUDENT_SESSION_STORAGE_KEY) || 'null');
    if (
      !parsed
      || parsed.version !== STUDENT_SESSION_VERSION
      || !validateStudentCapability(parsed.workspaceToken)
      || typeof parsed.class?.id !== 'string'
      || typeof parsed.class?.title !== 'string'
      || typeof parsed.workspace?.id !== 'string'
      || typeof parsed.workspace?.label !== 'string'
      || !['individual', 'group'].includes(parsed.workspace?.kind)
      || typeof parsed.participant?.id !== 'string'
      || typeof parsed.participant?.displayName !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist a Student resume envelope outside Intake state.
 *
 * @param {Storage|null} storage - Local storage implementation.
 * @param {object} session - Validated session.
 * @returns {boolean} Whether persistence succeeded.
 */
export function persistStudentSession(storage, session) {
  if (!storage || !session || !validateStudentCapability(session.workspaceToken)) return false;
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
  const expiries = [session.class?.expiresAt, session.workspace?.expiresAt]
    .map(value => Date.parse(value || ''))
    .filter(Number.isFinite);
  return expiries.length > 0 && Math.min(...expiries) <= nowMs;
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
  toast = () => {}
}) {
  let activeSession = null;
  let connecting = false;
  let destroyed = false;
  let lastError = '';

  const element = id => documentRef?.getElementById(id) || null;
  const intakeWrap = () => documentRef?.querySelector?.('.wrap[data-experience-surface="intake"]') || null;

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

  const renderContext = session => {
    const title = element('studentClassContextTitle');
    const workspace = element('studentClassWorkspace');
    const identity = element('studentClassIdentity');
    const kind = element('studentClassWorkspaceKind');
    const expiry = element('studentClassExpiry');
    if (title) title.textContent = session?.class?.title || 'Student class';
    if (workspace) workspace.textContent = session?.workspace?.label || 'Assigned workspace';
    if (identity) identity.textContent = session?.participant?.displayName || 'Student';
    if (kind) kind.textContent = session?.workspace?.kind === 'group' ? 'Team workspace' : 'Individual workspace';
    if (expiry) {
      const stamp = Date.parse(session?.class?.expiresAt || '');
      expiry.textContent = Number.isFinite(stamp)
        ? `Class access expires ${new Date(stamp).toLocaleDateString()}`
        : 'Instructor-managed class';
    }
  };

  const renderEntry = ({ retry = false, message = '' } = {}) => {
    setStatus(retry ? 'retry' : 'disconnected');
    const form = element('studentClassJoinForm');
    const resume = element('studentClassResumePanel');
    if (form) form.hidden = retry;
    if (resume) resume.hidden = !retry;
    const resumeTitle = element('studentClassResumeTitle');
    if (resumeTitle) resumeTitle.textContent = activeSession?.class?.title || 'Your class workspace';
    const resumeMessage = element('studentClassResumeMessage');
    if (resumeMessage) resumeMessage.textContent = message || 'We could not reconnect to your saved class workspace.';
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) wrap.hidden = true;
  };

  const renderConnected = session => {
    setStatus('connected');
    renderContext(session);
    const wrap = intakeWrap();
    if (wrap && getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) wrap.hidden = false;
    const form = element('studentClassJoinForm');
    const resume = element('studentClassResumePanel');
    if (form) form.hidden = false;
    if (resume) resume.hidden = true;
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

  const restoreLocalRecovery = () => {
    const snapshot = readRecovery();
    if (!snapshot) return false;
    try {
      apply?.(snapshot);
      saveLocal?.(snapshot);
      return true;
    } catch {
      return false;
    } finally {
      try { storage?.removeItem(STUDENT_RECOVERY_STORAGE_KEY); } catch {}
    }
  };

  const buildSession = body => ({
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

  const isTerminalCollaborationFailure = () => {
    const state = collaboration?.getState?.() || {};
    return Boolean(state.pollingStopped || /invalid|missing|expired/i.test(state.terminalStatus || ''));
  };

  const attachSession = async session => {
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
      renderConnected(session);
      return true;
    }
    if (isTerminalCollaborationFailure()) {
      collaboration?.leave?.({ silent: true });
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

  const resume = async () => {
    if (destroyed || getActiveExperienceRole() !== EXPERIENCE_ROLE_IDS.STUDENT) return false;
    const collaborationState = collaboration?.getState?.() || {};
    if (collaborationState.token && collaborationState.sessionKind !== 'classroom') {
      collaboration.leave?.({ silent: true });
    }
    const stored = readStudentSession(storage);
    if (!stored) {
      activeSession = null;
      renderEntry();
      return false;
    }
    if (isStudentSessionExpired(stored, now())) {
      clearStudentSession(storage);
      activeSession = null;
      restoreLocalRecovery();
      renderEntry();
      setError('Your saved class access has expired. Ask your instructor for new class and assignment codes.');
      return false;
    }
    return attachSession(stored);
  };

  const join = async ({ classCode, assignmentCode, displayName }) => {
    if (connecting) return false;
    const normalizedName = normalizeStudentDisplayName(displayName);
    const joinToken = typeof classCode === 'string' ? classCode.trim() : '';
    const assignmentToken = typeof assignmentCode === 'string' ? assignmentCode.trim() : '';
    if (!validateStudentCapability(joinToken) || !validateStudentCapability(assignmentToken) || !normalizedName) {
      setError('Enter your name and the current class and assignment codes from your instructor.');
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
      const response = await fetchImpl(STUDENT_JOIN_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${joinToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assignmentToken,
          participantId,
          displayName: normalizedName
        })
      });
      const body = await response.json().catch(() => ({}));
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
        || typeof body.class?.id !== 'string'
        || typeof body.class?.title !== 'string'
        || typeof body.workspace?.id !== 'string'
        || !['individual', 'group'].includes(body.workspace?.kind)
        || typeof body.workspace?.label !== 'string'
        || typeof body.self?.id !== 'string'
        || typeof body.self?.displayName !== 'string'
      ) {
        setError('The class service returned an incomplete workspace response.');
        return false;
      }

      preserveLocalRecovery();
      const session = buildSession(body);
      persistStudentSession(storage, session);
      activeSession = session;

      const classInput = element('studentClassCode');
      const assignmentInput = element('studentAssignmentCode');
      if (classInput) classInput.value = '';
      if (assignmentInput) assignmentInput.value = '';

      return await attachSession(session);
    } catch {
      setError('Could not reach the class service. Your local Intake is unchanged.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const leaveClass = ({ restore = true } = {}) => {
    collaboration?.leave?.({ silent: true });
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
    join({
      classCode: element('studentClassCode')?.value || '',
      assignmentCode: element('studentAssignmentCode')?.value || '',
      displayName: element('studentDisplayName')?.value || ''
    });
  };

  const handleRetry = () => resume();
  const handleLeave = () => leaveClass();

  const handleRoleChange = event => {
    const role = event?.detail?.role;
    if (role === EXPERIENCE_ROLE_IDS.STUDENT) {
      resume();
      return;
    }
    if (collaboration?.getState?.().sessionKind === 'classroom') {
      collaboration.leave({ silent: true });
    }
  };

  const init = () => {
    element('studentClassJoinForm')?.addEventListener('submit', handleJoinSubmit);
    element('studentClassRetryBtn')?.addEventListener('click', handleRetry);
    element('studentClassLeaveBtn')?.addEventListener('click', handleLeave);
    windowRef?.addEventListener?.('intake:experience-role-changed', handleRoleChange);
    if (getActiveExperienceRole() === EXPERIENCE_ROLE_IDS.STUDENT) resume();
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    element('studentClassJoinForm')?.removeEventListener('submit', handleJoinSubmit);
    element('studentClassRetryBtn')?.removeEventListener('click', handleRetry);
    element('studentClassLeaveBtn')?.removeEventListener('click', handleLeave);
    windowRef?.removeEventListener?.('intake:experience-role-changed', handleRoleChange);
  };

  return {
    init,
    destroy,
    join,
    resume,
    leaveClass,
    getState: () => ({ activeSession, connecting, lastError })
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
