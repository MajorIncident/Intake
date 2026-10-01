/**
 * @module classroomCoaching
 * @summary Instructor coaching controls and Student read-only feedback presentation.
 * @description
 * Coaching uses its own class API and never participates in Intake serialization or collaboration
 * snapshot revisions. Both Instructor and Student surfaces resolve targets through coachableFields.
 */

import { listResolvedCoachableTargets, resolveCoachableTarget } from './coachableFields.js';

export const INSTRUCTOR_COACHING_ENDPOINT = '/api/classes/coaching';
export const STUDENT_COACHING_ENDPOINT = '/api/classes/coaching/student';
export const STUDENT_COACHING_POLL_MS = 2500;

function statusLabel(status) {
  return status === 'meets-standard' ? 'Meets standard' : 'Needs improvement';
}

/**
 * Determine whether a reviewed target has changed since the Instructor review.
 *
 * @param {object} feedback Coaching record.
 * @param {object|null} target Current resolved target.
 * @returns {boolean} True when current field evidence differs from reviewed evidence.
 */
export function feedbackChangedSinceReview(feedback, target) {
  return Boolean(feedback?.reviewedFieldFingerprint && target?.fingerprint
    && feedback.reviewedFieldFingerprint !== target.fingerprint);
}

/**
 * Create the shared classroom coaching controller.
 *
 * @param {object} options Dependencies.
 * @returns {object} Coaching controller.
 */
export function createClassroomCoachingController({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document,
  getRows = () => [],
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  toast = () => {}
} = {}) {
  let instructorContext = null;
  let instructorFeedback = new Map();
  let instructorEpoch = 0;
  let studentToken = '';
  let studentFeedback = new Map();
  let studentTimer = null;
  let studentEpoch = 0;
  let destroyed = false;

  const markLocalOnly = element => {
    element.setAttribute('data-persistence', 'local-only');
    element.setAttribute('data-summary', 'exclude');
    return element;
  };
  const makeButton = text => {
    const button = documentRef.createElement('button'); // data-persistence="local-only" data-summary="exclude"
    markLocalOnly(button);
    button.type = 'button';
    button.textContent = text;
    return button;
  };
  const makeTextarea = () => {
    const textarea = documentRef.createElement('textarea'); // data-persistence="local-only" data-summary="exclude"
    markLocalOnly(textarea);
    textarea.rows = 2;
    textarea.maxLength = 2000;
    textarea.placeholder = 'Optional coaching note';
    return textarea;
  };
  const clearTimer = () => {
    if (studentTimer !== null && typeof clearTimeoutImpl === 'function') clearTimeoutImpl(studentTimer);
    studentTimer = null;
  };
  const clearPanels = kind => {
    documentRef?.querySelectorAll?.(`.classroom-coaching--${kind}`).forEach(panel => panel.remove());
    documentRef?.querySelectorAll?.(`[data-coaching-has-${kind}]`).forEach(mount => {
      mount.removeAttribute(`data-coaching-has-${kind}`);
    });
  };
  const resolvedTargets = () => listResolvedCoachableTargets({ documentRef, rows: getRows?.() || [] });
  const resolvedTarget = targetId => resolveCoachableTarget(targetId, { documentRef, rows: getRows?.() || [] });

  const requestJson = async (url, options) => {
    const response = await fetchImpl(url, options);
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };

  const renderInstructor = () => {
    clearPanels('instructor');
    if (!instructorContext) return;
    resolvedTargets().forEach(target => {
      const record = instructorFeedback.get(target.id) || null;
      const panel = documentRef.createElement('div');
      panel.className = 'classroom-coaching classroom-coaching--instructor';
      panel.dataset.coachingTargetId = target.id;
      panel.setAttribute('data-instructor-coaching-control', '');
      markLocalOnly(panel);
      target.mount.setAttribute('data-coaching-has-instructor', '');

      const heading = documentRef.createElement('div');
      heading.className = 'classroom-coaching__heading';
      const eyebrow = documentRef.createElement('span');
      eyebrow.className = 'classroom-coaching__eyebrow';
      eyebrow.textContent = 'Instructor coaching';
      heading.append(eyebrow);
      if (record) {
        const revision = documentRef.createElement('span');
        revision.className = 'classroom-coaching__revision';
        revision.textContent = `Feedback v${record.feedbackRevision}`;
        heading.append(revision);
      }

      const actions = documentRef.createElement('div');
      actions.className = 'classroom-coaching__actions';
      const meets = makeButton('✓ Meets standard');
      meets.className = 'classroom-coaching__status';
      meets.setAttribute('aria-pressed', String(record?.status === 'meets-standard'));
      const improve = makeButton('Needs improvement');
      improve.className = 'classroom-coaching__status';
      improve.setAttribute('aria-pressed', String(record?.status === 'needs-improvement'));
      actions.append(meets, improve);

      const details = documentRef.createElement('details');
      details.className = 'classroom-coaching__note-editor';
      const summary = documentRef.createElement('summary');
      summary.textContent = record?.note ? 'Edit note' : 'Add note';
      const note = makeTextarea();
      note.value = record?.note || '';
      note.setAttribute('aria-label', `Coaching note for ${target.label}`);
      const noteActions = documentRef.createElement('div');
      noteActions.className = 'classroom-coaching__note-actions';
      const saveNote = makeButton('Save note');
      saveNote.className = 'btn-mini';
      noteActions.append(saveNote);
      if (record) {
        const clear = makeButton('Clear feedback');
        clear.className = 'btn-mini btn-ghost';
        clear.addEventListener('click', () => { void clearInstructorFeedback(target.id); });
        noteActions.append(clear);
      }
      details.append(summary, note, noteActions);

      const meta = documentRef.createElement('div');
      meta.className = 'classroom-coaching__meta';
      if (record) {
        const status = documentRef.createElement('span');
        status.className = 'classroom-coaching__current';
        status.textContent = statusLabel(record.status);
        meta.append(status);
        if (record.note) {
          const notePreview = documentRef.createElement('span');
          notePreview.className = 'classroom-coaching__note-preview';
          notePreview.textContent = record.note;
          meta.append(notePreview);
        }
        if (feedbackChangedSinceReview(record, target)) {
          const stale = documentRef.createElement('span');
          stale.className = 'classroom-coaching__stale';
          stale.textContent = 'Changed since review';
          meta.append(stale);
        }
      }

      meets.addEventListener('click', () => { void saveInstructorFeedback(target.id, 'meets-standard', note.value); });
      improve.addEventListener('click', () => { void saveInstructorFeedback(target.id, 'needs-improvement', note.value); });
      saveNote.addEventListener('click', () => {
        const status = instructorFeedback.get(target.id)?.status;
        if (!status) { toast('Choose Meets standard or Needs improvement before saving a note.'); return; }
        void saveInstructorFeedback(target.id, status, note.value);
      });

      panel.append(heading, actions, details);
      if (meta.childNodes.length) panel.append(meta);
      target.mount.append(panel);
    });
  };

  async function fetchInstructorFeedback(epoch = instructorEpoch) {
    if (!instructorContext || destroyed) return false;
    const { instructorToken, workspaceId } = instructorContext;
    try {
      const { response, body } = await requestJson(
        `${INSTRUCTOR_COACHING_ENDPOINT}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${instructorToken}` } }
      );
      if (epoch !== instructorEpoch || !instructorContext || workspaceId !== instructorContext.workspaceId) return false;
      if (!response.ok || !Array.isArray(body.feedback)) return false;
      instructorFeedback = new Map(body.feedback.map(record => [record.targetId, record]));
      renderInstructor();
      return true;
    } catch {
      return false;
    }
  }

  async function saveInstructorFeedback(targetId, status, note = '') {
    if (!instructorContext || destroyed) return false;
    const target = resolvedTarget(targetId);
    if (!target) return false;
    const context = instructorContext;
    try {
      const { response, body } = await requestJson(
        `${INSTRUCTOR_COACHING_ENDPOINT}?workspaceId=${encodeURIComponent(context.workspaceId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${context.instructorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId,
            status,
            note,
            reviewedWorkspaceRevision: context.workspaceRevision,
            reviewedFieldFingerprint: target.fingerprint
          })
        }
      );
      if (!response.ok || !body.feedback || context.workspaceId !== instructorContext?.workspaceId) return false;
      instructorFeedback.set(body.feedback.targetId, body.feedback);
      renderInstructor();
      toast(status === 'meets-standard' ? 'Marked Meets standard.' : 'Marked Needs improvement.');
      return true;
    } catch {
      toast('Could not save coaching feedback.');
      return false;
    }
  }

  async function clearInstructorFeedback(targetId) {
    if (!instructorContext || destroyed) return false;
    const context = instructorContext;
    try {
      const { response, body } = await requestJson(
        `${INSTRUCTOR_COACHING_ENDPOINT}?workspaceId=${encodeURIComponent(context.workspaceId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${context.instructorToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId })
        }
      );
      if (!response.ok || context.workspaceId !== instructorContext?.workspaceId) return false;
      instructorFeedback.delete(targetId);
      renderInstructor();
      if (body.cleared) toast('Coaching feedback cleared.');
      return true;
    } catch {
      toast('Could not clear coaching feedback.');
      return false;
    }
  }

  const showInstructorWorkspace = context => {
    const changedWorkspace = instructorContext?.workspaceId !== context?.workspaceId;
    instructorContext = context?.instructorToken && context?.workspaceId && Number.isInteger(context?.workspaceRevision)
      ? { ...context }
      : null;
    if (!instructorContext) { hideInstructorWorkspace(); return; }
    if (changedWorkspace) {
      instructorFeedback = new Map();
      instructorEpoch += 1;
      renderInstructor();
      void fetchInstructorFeedback(instructorEpoch);
    } else {
      renderInstructor();
    }
  };

  const hideInstructorWorkspace = () => {
    instructorEpoch += 1;
    instructorContext = null;
    instructorFeedback = new Map();
    clearPanels('instructor');
  };

  const renderStudent = () => {
    clearPanels('student');
    if (!studentToken) return;
    studentFeedback.forEach(record => {
      const target = resolvedTarget(record.targetId);
      if (!target) return;
      const panel = documentRef.createElement('div');
      panel.className = `classroom-coaching classroom-coaching--student classroom-coaching--${record.status}`;
      panel.dataset.coachingTargetId = record.targetId;
      markLocalOnly(panel);
      target.mount.setAttribute('data-coaching-has-student', '');

      const heading = documentRef.createElement('div');
      heading.className = 'classroom-coaching__heading';
      const label = documentRef.createElement('strong');
      label.textContent = `Instructor feedback · ${statusLabel(record.status)}`;
      heading.append(label);
      panel.append(heading);
      if (record.note) {
        const note = documentRef.createElement('p');
        note.className = 'classroom-coaching__student-note';
        note.textContent = record.note;
        panel.append(note);
      }
      if (feedbackChangedSinceReview(record, target)) {
        const stale = documentRef.createElement('span');
        stale.className = 'classroom-coaching__stale';
        stale.textContent = 'Changed since review';
        panel.append(stale);
      }
      target.mount.append(panel);
    });
  };

  const scheduleStudent = epoch => {
    clearTimer();
    if (!studentToken || destroyed || typeof setTimeoutImpl !== 'function') return;
    studentTimer = setTimeoutImpl(() => { studentTimer = null; void fetchStudentFeedback(epoch); }, STUDENT_COACHING_POLL_MS);
  };

  async function fetchStudentFeedback(epoch = studentEpoch) {
    if (!studentToken || destroyed) return false;
    const token = studentToken;
    try {
      const { response, body } = await requestJson(STUDENT_COACHING_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (epoch !== studentEpoch || token !== studentToken || destroyed) return false;
      if (response.status === 404) { studentFeedback = new Map(); renderStudent(); scheduleStudent(epoch); return false; }
      if (!response.ok || !Array.isArray(body.feedback)) { scheduleStudent(epoch); return false; }
      studentFeedback = new Map(body.feedback.map(record => [record.targetId, record]));
      renderStudent();
      scheduleStudent(epoch);
      return true;
    } catch {
      if (epoch === studentEpoch && token === studentToken) scheduleStudent(epoch);
      return false;
    }
  }

  const connectStudent = token => {
    studentEpoch += 1;
    studentToken = typeof token === 'string' ? token : '';
    studentFeedback = new Map();
    clearPanels('student');
    if (studentToken) void fetchStudentFeedback(studentEpoch);
  };

  const disconnectStudent = () => {
    studentEpoch += 1;
    studentToken = '';
    studentFeedback = new Map();
    clearTimer();
    clearPanels('student');
  };

  const handleInput = () => {
    if (studentToken) renderStudent();
    if (instructorContext) renderInstructor();
  };

  const init = () => {
    documentRef?.addEventListener?.('input', handleInput);
    documentRef?.addEventListener?.('change', handleInput);
    return true;
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    disconnectStudent();
    hideInstructorWorkspace();
    documentRef?.removeEventListener?.('input', handleInput);
    documentRef?.removeEventListener?.('change', handleInput);
  };

  return {
    init, destroy,
    showInstructorWorkspace, hideInstructorWorkspace, fetchInstructorFeedback, saveInstructorFeedback, clearInstructorFeedback,
    connectStudent, disconnectStudent, fetchStudentFeedback,
    getState: () => ({
      instructorContext, instructorFeedback, instructorEpoch, studentToken, studentFeedback, studentEpoch
    })
  };
}

/**
 * Initialize the classroom coaching controller.
 *
 * @param {Parameters<typeof createClassroomCoachingController>[0]} options Dependencies.
 * @returns {ReturnType<typeof createClassroomCoachingController>} Initialized controller.
 */
export function initClassroomCoaching(options) {
  const controller = createClassroomCoachingController(options);
  controller.init();
  return controller;
}
