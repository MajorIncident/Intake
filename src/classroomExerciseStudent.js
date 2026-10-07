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
      : []
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
  let destroyed = false;
  let epoch = 0;
  let timer = null;
  let abortController = null;
  const mobileQuery = windowRef?.matchMedia?.('(max-width: 700px)') || null;
  let expanded = !mobileQuery?.matches;
  let expansionTouched = false;

  const element = id => documentRef?.getElementById?.(id) || null;

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
    if (!panel) return;

    const visible = Boolean(capability && exercise);
    panel.hidden = !visible;
    documentRef?.body?.classList?.toggle('student-case-reference-visible', visible);
    renderExpansion();
    if (!visible) return;

    if (title) title.textContent = exercise.caseStudy?.name || 'Current exercise';
    if (status) {
      status.textContent = loading
        ? 'Refreshing current stage…'
        : lastError || phaseLabel(exercise);
    }
    if (stageTitle) stageTitle.textContent = exercise.currentStage?.title || 'Waiting for current stage';
    if (objective) objective.textContent = exercise.currentStage?.studentObjective || '';

    if (message) {
      const frozen = exercise.stagePhase === 'debrief'
        && exercise.studentEditingEnabled === false
        && exercise.status !== 'completed';
      message.hidden = !frozen;
      message.textContent = frozen
        ? 'Your instructor has frozen Student editing for this debrief. You can still review the released case material.'
        : '';
    }
    renderContent();
  };

  const applyPayload = body => {
    classroom = body?.class && typeof body.class === 'object' ? { ...body.class } : null;
    assignment = body?.assignment && typeof body.assignment === 'object' ? { ...body.assignment } : null;
    participant = body?.participant && typeof body.participant === 'object'
      ? { id: body.participant.id, displayName: body.participant.displayName }
      : null;
    exercise = sanitizeExercise(body?.exercise);
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
    clearView();
    renderExpansion();
  };

  const handleToggle = () => setExpanded(!expanded, { user: true });
  const handleMediaChange = event => {
    if (expansionTouched) return;
    setExpanded(!event.matches);
  };

  element('studentCaseReferenceToggle')?.addEventListener('click', handleToggle);
  mobileQuery?.addEventListener?.('change', handleMediaChange);
  renderExpansion();

  return {
    connectStudent,
    disconnect,
    refresh: () => refresh(epoch),
    setExpanded: next => setExpanded(next, { user: true }),
    getState: () => ({
      connected: Boolean(capability),
      loading,
      lastError,
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
            }))
          }
        : null
    }),
    destroy: () => {
      if (destroyed) return;
      element('studentCaseReferenceToggle')?.removeEventListener('click', handleToggle);
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
