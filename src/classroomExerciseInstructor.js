/**
 * @module classroomExerciseInstructor
 * @summary Owns Instructor staged-exercise discovery and the read-only console foundation.
 * @description
 *   Receives the active Instructor capability from the class lifecycle, keeps it
 *   in memory only, and reads /api/classes/exercise. Tranche 6A deliberately
 *   exposes no exercise mutation actions; later Tranche 6 slices extend this
 *   controller with revision-safe lifecycle controls.
 */

export const INSTRUCTOR_EXERCISE_ENDPOINT = '/api/classes/exercise';

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function validCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value.trim());
}

function sanitizeCaseStudySummary(value) {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return null;
  return {
    id,
    name,
    description: typeof value.description === 'string' ? value.description : '',
    supportedModes: Array.isArray(value.supportedModes)
      ? value.supportedModes.filter(mode => typeof mode === 'string')
      : []
  };
}

/**
 * Create the Instructor exercise console controller.
 *
 * @param {object} [options] Dependency overrides.
 * @returns {object} Exercise console controller.
 */
export function createInstructorExerciseConsoleController({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document
} = {}) {
  let capability = '';
  let epoch = 0;
  let destroyed = false;
  let loading = false;
  let lastError = '';
  let classroom = null;
  let exercise = null;
  let caseStudy = null;
  let availableCaseStudies = [];

  const element = id => documentRef?.getElementById?.(id) || null;

  const renderAvailable = () => {
    const list = element('instructorExerciseAvailableList');
    if (!list) return;
    list.replaceChildren();
    if (!availableCaseStudies.length) {
      const item = documentRef.createElement('li');
      item.className = 'instructor-exercise-console__empty';
      item.textContent = 'No staged Case Studies are authored for classroom simulation yet.';
      list.append(item);
      return;
    }
    availableCaseStudies.forEach(item => {
      const row = documentRef.createElement('li');
      const name = documentRef.createElement('strong');
      name.textContent = item.name;
      row.append(name);
      if (item.description) {
        const description = documentRef.createElement('span');
        description.textContent = item.description;
        row.append(description);
      }
      list.append(row);
    });
  };

  const render = () => {
    const panel = element('instructorExerciseConsole');
    const status = element('instructorExerciseStatus');
    const caseName = element('instructorExerciseCaseName');
    const detail = element('instructorExerciseDetail');
    const refreshButton = element('instructorExerciseRefreshBtn');
    if (!panel) return;

    panel.hidden = !capability;
    if (!capability) return;
    if (refreshButton) refreshButton.disabled = loading;

    if (loading) {
      if (status) status.textContent = 'Loading exercise…';
    } else if (lastError) {
      if (status) status.textContent = lastError;
    } else if (exercise) {
      const phase = exercise.status === 'draft'
        ? 'Draft'
        : exercise.status === 'paused'
          ? 'Paused'
          : exercise.stagePhase === 'debrief'
            ? 'Debrief'
            : exercise.status === 'completed'
              ? 'Completed'
              : 'In progress';
      if (status) status.textContent = phase;
    } else {
      const count = availableCaseStudies.length;
      if (status) status.textContent = count === 1
        ? '1 staged Case Study available'
        : `${count} staged Case Studies available`;
    }

    if (exercise && caseStudy) {
      if (caseName) caseName.textContent = caseStudy.name || 'Current exercise';
      const stage = Array.isArray(caseStudy.simulation?.stages)
        ? caseStudy.simulation.stages.find(item => item.id === exercise.currentStageId)
        : null;
      if (detail) detail.textContent = stage
        ? `${stage.title} · ${stage.studentObjective}`
        : 'Draft exercise — no stage has started.';
    } else {
      if (caseName) caseName.textContent = 'No staged exercise selected';
      if (detail) detail.textContent = availableCaseStudies.length
        ? 'Staged Case Studies are available. Exercise setup will be enabled in the next console slice.'
        : 'The console is connected; no staged Case Study definition is currently available.';
    }
    renderAvailable();
  };

  const resetState = () => {
    loading = false;
    lastError = '';
    classroom = null;
    exercise = null;
    caseStudy = null;
    availableCaseStudies = [];
  };

  const refresh = async () => {
    if (destroyed || !capability || typeof fetchImpl !== 'function') return false;
    const localCapability = capability;
    const localEpoch = epoch;
    loading = true;
    lastError = '';
    render();
    try {
      const response = await fetchImpl(INSTRUCTOR_EXERCISE_ENDPOINT, {
        method: 'GET',
        headers: { Authorization: `Bearer ${localCapability}` }
      });
      const body = await response.json().catch(() => ({}));
      if (destroyed || localEpoch !== epoch || capability !== localCapability) return false;
      if (!response.ok) {
        lastError = response.status === 401 || response.status === 404
          ? 'Exercise access is no longer available.'
          : 'Could not load the class exercise.';
        return false;
      }
      classroom = body.class && typeof body.class === 'object' ? body.class : null;
      exercise = body.exercise && typeof body.exercise === 'object' ? body.exercise : null;
      caseStudy = body.caseStudy && typeof body.caseStudy === 'object' ? body.caseStudy : null;
      availableCaseStudies = Array.isArray(body.availableCaseStudies)
        ? body.availableCaseStudies.map(sanitizeCaseStudySummary).filter(Boolean)
        : [];
      return true;
    } catch {
      if (destroyed || localEpoch !== epoch) return false;
      lastError = 'Could not load the class exercise.';
      return false;
    } finally {
      if (!destroyed && localEpoch === epoch) {
        loading = false;
        render();
      }
    }
  };

  const connectInstructor = async token => {
    if (!validCapability(token) || destroyed) return false;
    epoch += 1;
    capability = token.trim();
    resetState();
    render();
    return refresh();
  };

  const disconnect = () => {
    epoch += 1;
    capability = '';
    resetState();
    render();
  };

  const handleRefresh = () => { void refresh(); };
  element('instructorExerciseRefreshBtn')?.addEventListener('click', handleRefresh);
  render();

  return {
    connectInstructor,
    disconnect,
    refresh,
    getState: () => ({
      connected: Boolean(capability),
      loading,
      lastError,
      classroom,
      exercise,
      caseStudy: caseStudy ? sanitizeCaseStudySummary(caseStudy) : null,
      availableCaseStudies: availableCaseStudies.map(item => ({ ...item }))
    }),
    destroy: () => {
      if (destroyed) return;
      element('instructorExerciseRefreshBtn')?.removeEventListener('click', handleRefresh);
      disconnect();
      destroyed = true;
    }
  };
}

/**
 * Initialize the Instructor staged exercise console.
 *
 * @param {Parameters<typeof createInstructorExerciseConsoleController>[0]} options Dependencies.
 * @returns {ReturnType<typeof createInstructorExerciseConsoleController>} Controller.
 */
export function initInstructorExerciseConsole(options) {
  return createInstructorExerciseConsoleController(options);
}
