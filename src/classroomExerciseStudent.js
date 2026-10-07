/**
 * @module classroomExerciseStudent
 * @summary Owns the Student current-stage case reference for staged Classroom exercises.
 * @description
 *   Receives only the stable Student class-session capability, keeps it in memory,
 *   reads the Student-authorized staged exercise endpoint, and renders only the
 *   current stage plus cumulative Student-safe released content. It never fetches
 *   the complete protected Case Study payload and never persists exercise state.
 */

export const STUDENT_EXERCISE_ENDPOINT = '/api/classes/exercise/student';
export const STUDENT_EXERCISE_READY_ENDPOINT = '/api/classes/exercise/student/ready';
export const STUDENT_EXERCISE_POLL_MS = 2500;

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function validCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
}

function sanitizeCaseStudy(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return null;
  return {
    id,
    name,
    description: typeof value.description === 'string' ? value.description : ''
  };
}

function sanitizeStage(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!id || !title) return null;
  return {
    id,
    title,
    studentObjective: typeof value.studentObjective === 'string' ? value.studentObjective : ''
  };
}

function sanitizeReleasedContent(value) {
  if (!value || typeof value !== 'object') return null;
  const stageId = typeof value.stageId === 'string' ? value.stageId.trim() : '';
  const content = value.content;
  if (!stageId || !content || typeof content !== 'object') return null;
  const id = typeof content.id === 'string' ? content.id.trim() : '';
  const title = typeof content.title === 'string' ? content.title.trim() : '';
  if (!id || !title) return null;
  return {
    stageId,
    releaseType: value.releaseType === 'optional' ? 'optional' : 'initial',
    releasedAt: typeof value.releasedAt === 'string' ? value.releasedAt : null,
    content: {
      id,
      kind: typeof content.kind === 'string' ? content.kind : '',
      title,
      body: typeof content.body === 'string' ? content.body : ''
    }
  };
}

function sanitizeReadiness(value) {
  if (!value || typeof value !== 'object') return null;
  const stageId = typeof value.stageId === 'string' ? value.stageId.trim() : '';
  if (!stageId || typeof value.readyForDebrief !== 'boolean') return null;
  const revision = value.readyWorkspaceRevision;
  return {
    stageId,
    readyForDebrief: value.readyForDebrief,
    readyAt: typeof value.readyAt === 'string' ? value.readyAt : null,
    readyWorkspaceRevision: Number.isInteger(revision) && revision >= 0 ? revision : null
  };
}

function sanitizeExercise(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const revision = Number(value.exerciseRevision);
  if (!id || !Number.isInteger(revision) || revision < 1) return null;
  const status = ['draft', 'active', 'paused', 'completed'].includes(value.status)
    ? value.status
    : '';
  const stagePhase = ['work', 'debrief'].includes(value.stagePhase) ? value.stagePhase : '';
  if (!status || !stagePhase) return null;
  return {
    id,
    caseStudy: sanitizeCaseStudy(value.caseStudy),
    status,
    stagePhase,
    exerciseRevision: revision,
    studentEditingEnabled: value.studentEditingEnabled !== false,
    editFreezeEnforced: value.editFreezeEnforced === true,
    currentStage: sanitizeStage(value.currentStage),
    releasedContent: Array.isArray(value.releasedContent)
      ? value.releasedContent.map(sanitizeReleasedContent).filter(Boolean)
      : [],
    readiness: sanitizeReadiness(value.readiness)
  };
}

function phaseLabel(exercise) {
  if (!exercise) return '';
  if (exercise.status === 'completed') return 'Completed';
  if (exercise.status === 'draft') return 'Waiting to start';
  if (exercise.status === 'paused') {
    if (exercise.stagePhase === 'debrief' && exercise.studentEditingEnabled === false) {
      return 'Paused · debrief · editing frozen';
    }
    return exercise.stagePhase === 'debrief' ? 'Paused · debrief' : 'Paused · work';
  }
  if (exercise.stagePhase === 'debrief') {
    return exercise.studentEditingEnabled === false
      ? 'Debrief · editing frozen'
      : 'Debrief · editing open';
  }
  return 'Work';
}

/**
 * Create the Student staged-exercise reference controller.
 *
 * @param {object} [options] Dependency overrides.
 * @returns {object} Student case-reference controller.
 */
export function createStudentExerciseReferenceController({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController,
  pollMs = STUDENT_EXERCISE_POLL_MS
} = {}) {
  let capability = '';
  let exercise = null;
  let classroom = null;
  let assignment = null;
  let participant = null;
  let loading = false;
  let lastError = '';
  let readinessUpdating = false;
  let readinessError = '';
  let destroyed = false;
  let epoch = 0;
  let timer = null;
  let abortController = null;
  const readonlyRecords = new Map();
  const mobileQuery = windowRef?.matchMedia?.('(max-width: 700px)') || null;
  let expanded = !mobileQuery?.matches;
  let expansionTouched = false;

  const element = id => documentRef?.getElementById?.(id) || null;
  const intakeWrap = () => documentRef?.querySelector?.('.wrap[data-experience-surface="intake"]') || null;

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
      control.removeAttribute?.('data-student-exercise-readonly-control');
    });
    readonlyRecords.clear();
    intakeWrap()?.classList?.remove('student-exercise-readonly');
  };

  const projectReadonly = () => {
    const wrap = intakeWrap();
    if (!wrap) return;
    wrap.classList.add('student-exercise-readonly');
    const controls = wrap.querySelectorAll(
      'input, textarea, select, button, [contenteditable], [role="button"], [role="checkbox"], [role="switch"], [draggable="true"]'
    );
    controls.forEach(control => {
      if (control.closest?.('#studentExperienceNotice')) return;
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
      control.setAttribute?.('data-student-exercise-readonly-control', '');
    });
    if (wrap.contains(documentRef.activeElement) && typeof documentRef.activeElement?.blur === 'function') {
      documentRef.activeElement.blur();
    }
  };

  const syncReadonlyProjection = () => {
    const frozenDebrief = Boolean(
      exercise
      && exercise.status !== 'completed'
      && exercise.stagePhase === 'debrief'
      && exercise.studentEditingEnabled === false
      && exercise.editFreezeEnforced === true
    );
    if (frozenDebrief) projectReadonly();
    else restoreReadonlyProjection();
  };

  const stopTimer = () => {
    if (timer !== null && typeof clearTimeoutImpl === 'function') clearTimeoutImpl(timer);
    timer = null;
  };

  const abort = () => {
    try { abortController?.abort?.(); } catch {}
    abortController = null;
  };

  const schedule = (localEpoch = epoch) => {
    stopTimer();
    if (
      destroyed
      || !capability
      || localEpoch !== epoch
      || typeof setTimeoutImpl !== 'function'
    ) return;
    timer = setTimeoutImpl(() => {
      timer = null;
      void refresh(localEpoch);
    }, pollMs);
  };

  const renderExpansion = () => {
    const panel = element('studentCaseReference');
    const toggle = element('studentCaseReferenceToggle');
    panel?.classList?.toggle('is-collapsed', !expanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Collapse reference' : 'Open case reference';
    }
  };

  const setExpanded = (next, { user = false } = {}) => {
    expanded = Boolean(next);
    if (user) expansionTouched = true;
    renderExpansion();
    return expanded;
  };

  const clearView = () => {
    exercise = null;
    classroom = null;
    assignment = null;
    participant = null;
    lastError = '';
    readinessUpdating = false;
    readinessError = '';
    const panel = element('studentCaseReference');
    if (panel) panel.hidden = true;
    documentRef?.body?.classList?.remove('student-case-reference-visible');
  };

  const renderContent = () => {
    const list = element('studentCaseReferenceContent');
    if (!list) return;
    list.replaceChildren();
    if (!exercise?.releasedContent?.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'student-case-reference__empty';
      empty.textContent = exercise?.status === 'draft'
        ? 'Your instructor has not started the exercise yet.'
        : 'No case material has been released for this stage yet.';
      list.append(empty);
      return;
    }

    exercise.releasedContent.forEach(item => {
      const article = documentRef.createElement('article');
      article.className = 'student-case-reference__item';
      article.setAttribute('data-persistence', 'local-only');
      article.setAttribute('data-summary', 'exclude');
      const title = documentRef.createElement('strong');
      title.textContent = item.content.title;
      const body = documentRef.createElement('p');
      body.textContent = item.content.body;
      article.append(title, body);
      list.append(article);
    });
  };

  const render = () => {
    const panel = element('studentCaseReference');
    const title = element('studentCaseReferenceTitle');
    const status = element('studentCaseReferenceStatus');
    const stageTitle = element('studentCaseReferenceStageTitle');
    const objective = element('studentCaseReferenceObjective');
    const message = element('studentCaseReferenceMessage');
    const readinessPanel = element('studentCaseReferenceReadiness');
    const readinessStatus = element('studentCaseReferenceReadinessStatus');
    const readinessButton = element('studentCaseReferenceReadyBtn');
    if (!panel) return;

    const visible = Boolean(capability && exercise);
    panel.hidden = !visible;
    documentRef?.body?.classList?.toggle('student-case-reference-visible', visible);
    renderExpansion();
    if (!visible) {
      restoreReadonlyProjection();
      return;
    }

    if (title) title.textContent = exercise.caseStudy?.name || 'Current exercise';
    if (status) {
      status.textContent = loading
        ? 'Refreshing current stage…'
        : lastError || phaseLabel(exercise);
    }
    if (stageTitle) stageTitle.textContent = exercise.currentStage?.title || 'Waiting for current stage';
    if (objective) objective.textContent = exercise.currentStage?.studentObjective || '';

    const readinessForCurrentStage = exercise.readiness?.stageId === exercise.currentStage?.id
      ? exercise.readiness
      : null;
    const isReady = readinessForCurrentStage?.readyForDebrief === true;
    const canManageReadiness = exercise.status === 'active'
      && exercise.stagePhase === 'work'
      && Boolean(exercise.currentStage)
      && Boolean(assignment);

    if (readinessPanel) readinessPanel.hidden = !canManageReadiness;
    if (readinessStatus) {
      if (readinessUpdating) {
        readinessStatus.textContent = 'Updating team status…';
      } else if (readinessError) {
        readinessStatus.textContent = readinessError;
      } else if (isReady) {
        readinessStatus.textContent = Number.isInteger(readinessForCurrentStage.readyWorkspaceRevision)
          ? `Ready for debrief · Intake revision ${readinessForCurrentStage.readyWorkspaceRevision}`
          : 'Ready for debrief';
      } else {
        readinessStatus.textContent = 'Working';
      }
    }
    if (readinessButton) {
      readinessButton.hidden = !canManageReadiness;
      readinessButton.disabled = readinessUpdating || !canManageReadiness;
      readinessButton.setAttribute('aria-pressed', String(isReady));
      readinessButton.textContent = isReady ? 'Resume working' : 'Mark Ready';
    }

    if (message) {
      const frozen = exercise.stagePhase === 'debrief'
        && exercise.studentEditingEnabled === false
        && exercise.status !== 'completed';
      message.hidden = !frozen;
      message.textContent = frozen
        ? 'Your instructor has frozen Student editing for this debrief. You can still review the released case material.'
        : '';
    }
    syncReadonlyProjection();
    renderContent();
  };

  const applyPayload = body => {
    classroom = body?.class && typeof body.class === 'object' ? { ...body.class } : null;
    assignment = body?.assignment && typeof body.assignment === 'object' ? { ...body.assignment } : null;
    participant = body?.participant && typeof body.participant === 'object'
      ? { id: body.participant.id, displayName: body.participant.displayName }
      : null;
    exercise = sanitizeExercise(body?.exercise);
    readinessError = '';
  };

  async function refresh(requestEpoch = epoch) {
    if (
      destroyed
      || !capability
      || requestEpoch !== epoch
      || typeof fetchImpl !== 'function'
    ) return false;

    const localCapability = capability;
    loading = true;
    lastError = '';
    render();
    abort();
    abortController = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;

    try {
      const response = await fetchImpl(STUDENT_EXERCISE_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${localCapability}` },
        signal: abortController?.signal
      });
      const body = await response.json().catch(() => ({}));
      abortController = null;
      if (destroyed || requestEpoch !== epoch || capability !== localCapability) return false;

      if (response.status === 401 || response.status === 404) {
        disconnect();
        return false;
      }
      if (response.status === 409) {
        exercise = null;
        lastError = 'The exercise definition changed. Waiting for the instructor to refresh the class.';
        render();
        schedule(requestEpoch);
        return false;
      }
      if (!response.ok) {
        lastError = 'Case reference is temporarily unavailable.';
        render();
        schedule(requestEpoch);
        return false;
      }

      applyPayload(body);
      lastError = '';
      render();
      schedule(requestEpoch);
      return true;
    } catch (error) {
      abortController = null;
      if (destroyed || requestEpoch !== epoch || error?.name === 'AbortError') return false;
      lastError = 'Case reference is temporarily unavailable.';
      render();
      schedule(requestEpoch);
      return false;
    } finally {
      if (!destroyed && requestEpoch === epoch) {
        loading = false;
        render();
      }
    }
  }

  async function setReadiness(nextReady, requestEpoch = epoch) {
    if (
      destroyed
      || !capability
      || requestEpoch !== epoch
      || readinessUpdating
      || typeof fetchImpl !== 'function'
      || exercise?.status !== 'active'
      || exercise?.stagePhase !== 'work'
      || !exercise?.currentStage
      || !assignment
    ) return false;

    const localCapability = capability;
    const desiredReady = Boolean(nextReady);
    readinessUpdating = true;
    readinessError = '';
    stopTimer();
    abort();
    render();
    abortController = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;

    try {
      const response = await fetchImpl(STUDENT_EXERCISE_READY_ENDPOINT, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localCapability}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ready: desiredReady }),
        signal: abortController?.signal
      });
      const body = await response.json().catch(() => ({}));
      abortController = null;
      if (destroyed || requestEpoch !== epoch || capability !== localCapability) return false;

      if (response.status === 401 || response.status === 404) {
        disconnect();
        return false;
      }
      if (response.status === 409) {
        readinessError = 'Class or assignment changed. Refreshing team status…';
        render();
        await refresh(requestEpoch);
        return false;
      }
      if (!response.ok) {
        readinessError = 'Unable to update team readiness.';
        render();
        schedule(requestEpoch);
        return false;
      }

      assignment = body?.assignment && typeof body.assignment === 'object'
        ? { ...body.assignment }
        : assignment;
      if (exercise) {
        exercise = {
          ...exercise,
          readiness: sanitizeReadiness(body?.readiness)
        };
      }
      readinessError = '';
      render();
      schedule(requestEpoch);
      return true;
    } catch (error) {
      abortController = null;
      if (destroyed || requestEpoch !== epoch || error?.name === 'AbortError') return false;
      readinessError = 'Unable to update team readiness.';
      render();
      schedule(requestEpoch);
      return false;
    } finally {
      if (!destroyed && requestEpoch === epoch) {
        readinessUpdating = false;
        render();
      }
    }
  }

  const connectStudent = async token => {
    if (destroyed || !validCapability(token)) return false;
    epoch += 1;
    stopTimer();
    abort();
    capability = token.trim();
    exercise = null;
    lastError = '';
    render();
    return refresh(epoch);
  };

  const disconnect = () => {
    epoch += 1;
    stopTimer();
    abort();
    capability = '';
    restoreReadonlyProjection();
    clearView();
    renderExpansion();
  };

  const handleToggle = () => setExpanded(!expanded, { user: true });
  const handleReadyToggle = () => {
    const current = exercise?.readiness?.stageId === exercise?.currentStage?.id
      ? exercise.readiness.readyForDebrief === true
      : false;
    void setReadiness(!current, epoch);
  };
  const handleMediaChange = event => {
    if (expansionTouched) return;
    setExpanded(!event.matches);
  };

  element('studentCaseReferenceToggle')?.addEventListener('click', handleToggle);
  element('studentCaseReferenceReadyBtn')?.addEventListener('click', handleReadyToggle);
  mobileQuery?.addEventListener?.('change', handleMediaChange);
  renderExpansion();

  return {
    connectStudent,
    disconnect,
    refresh: () => refresh(epoch),
    setReadiness: ready => setReadiness(Boolean(ready), epoch),
    setExpanded: next => setExpanded(next, { user: true }),
    getState: () => ({
      connected: Boolean(capability),
      loading,
      lastError,
      readinessUpdating,
      readinessError,
      expanded,
      classroom,
      assignment,
      participant,
      exercise: exercise
        ? {
            ...exercise,
            caseStudy: exercise.caseStudy ? { ...exercise.caseStudy } : null,
            currentStage: exercise.currentStage ? { ...exercise.currentStage } : null,
            releasedContent: exercise.releasedContent.map(item => ({
              ...item,
              content: { ...item.content }
            })),
            readiness: exercise.readiness ? { ...exercise.readiness } : null
          }
        : null
    }),
    destroy: () => {
      if (destroyed) return;
      element('studentCaseReferenceToggle')?.removeEventListener('click', handleToggle);
      element('studentCaseReferenceReadyBtn')?.removeEventListener('click', handleReadyToggle);
      mobileQuery?.removeEventListener?.('change', handleMediaChange);
      disconnect();
      destroyed = true;
    }
  };
}

/**
 * Initialize the Student staged-exercise case reference.
 *
 * @param {Parameters<typeof createStudentExerciseReferenceController>[0]} options Dependencies.
 * @returns {ReturnType<typeof createStudentExerciseReferenceController>} Controller.
 */
export function initStudentExerciseReference(options) {
  return createStudentExerciseReferenceController(options);
}
