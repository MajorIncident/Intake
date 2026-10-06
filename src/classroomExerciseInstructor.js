/**
 * @module classroomExerciseInstructor
 * @summary Owns Instructor staged-exercise discovery, draft setup, lifecycle, and console state.
 * @description
 *   Receives the active Instructor capability from the class lifecycle, keeps it
 *   in memory only, and reads/writes the Instructor-authorized exercise endpoint.
 *   Tranche 6C adds revision-safe Start/Pause/Resume plus current-stage
 *   Instructor facilitation context; later debrief/release actions remain deferred.
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

function sanitizeRelease(value) {
  if (!value || typeof value !== 'object') return null;
  const stageId = typeof value.stageId === 'string' ? value.stageId.trim() : '';
  const contentId = typeof value.contentId === 'string' ? value.contentId.trim() : '';
  if (!stageId || !contentId) return null;
  return {
    stageId,
    contentId,
    releasedAt: typeof value.releasedAt === 'string' ? value.releasedAt : null
  };
}

function sanitizeWorkspaceState(value) {
  if (!value || typeof value !== 'object') return null;
  const workspaceId = typeof value.workspaceId === 'string' ? value.workspaceId.trim() : '';
  const workspaceLabel = typeof value.workspaceLabel === 'string' ? value.workspaceLabel.trim() : '';
  const stageId = typeof value.stageId === 'string' ? value.stageId.trim() : '';
  if (!workspaceId || !workspaceLabel || !stageId) return null;
  return {
    workspaceId,
    workspaceKind: typeof value.workspaceKind === 'string' ? value.workspaceKind : '',
    workspaceLabel,
    stageId,
    readyForDebrief: value.readyForDebrief === true,
    readyAt: typeof value.readyAt === 'string' ? value.readyAt : null,
    readyWorkspaceRevision: Number.isInteger(value.readyWorkspaceRevision)
      ? value.readyWorkspaceRevision
      : null
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
  documentRef = globalThis.document,
  onSelectWorkspace = () => {}
} = {}) {
  let capability = '';
  let epoch = 0;
  let destroyed = false;
  let loading = false;
  let lastError = '';
  let lastNotice = '';
  let classroom = null;
  let exercise = null;
  let caseStudy = null;
  let availableCaseStudies = [];
  let selectedCaseStudyId = '';
  let releases = [];
  let workspaceState = [];

  const element = id => documentRef?.getElementById?.(id) || null;

  const currentPhaseLabel = () => {
    if (!exercise) return '';
    if (exercise.status === 'draft') return 'Draft';
    if (exercise.status === 'paused') return 'Paused';
    if (exercise.stagePhase === 'debrief') return 'Debrief';
    if (exercise.status === 'completed') return 'Completed';
    return 'In progress';
  };

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

  const renderSetup = () => {
    const select = element('instructorExerciseCaseSelect');
    const createButton = element('instructorExerciseCreateBtn');
    const help = element('instructorExerciseSetupHelp');
    if (!select) return;

    const requestedSelection = exercise?.caseStudyId || selectedCaseStudyId;
    select.replaceChildren();

    const placeholder = documentRef.createElement('option'); // data-persistence="local-only"
    placeholder.value = '';
    placeholder.textContent = availableCaseStudies.length
      ? 'Select a staged Case Study'
      : 'No staged Case Studies available';
    select.append(placeholder);

    availableCaseStudies.forEach(item => {
      const option = documentRef.createElement('option'); // data-persistence="local-only"
      option.value = item.id;
      option.textContent = item.name;
      select.append(option);
    });

    const selectionExists = availableCaseStudies.some(item => item.id === requestedSelection);
    selectedCaseStudyId = selectionExists ? requestedSelection : '';
    select.value = selectedCaseStudyId;
    select.disabled = loading || Boolean(exercise) || availableCaseStudies.length === 0;

    if (createButton) {
      createButton.disabled = loading || Boolean(exercise) || !selectedCaseStudyId;
      createButton.textContent = loading ? 'Working…' : 'Create draft';
    }
    if (help) {
      help.textContent = exercise
        ? 'This class already has an open exercise. Lifecycle controls will be added in the next console slices.'
        : 'Choose an explicitly staged Case Study. Creating a draft does not release anything to Students.';
    }
  };

  const currentStageContext = () => {
    if (!exercise?.currentStageId || !caseStudy?.simulation) return null;
    const stages = Array.isArray(caseStudy.simulation.stages) ? caseStudy.simulation.stages : [];
    const stage = stages.find(item => item.id === exercise.currentStageId) || null;
    if (!stage) return null;
    const instructorBlocks = new Map(
      (Array.isArray(caseStudy.simulation.instructorContent) ? caseStudy.simulation.instructorContent : [])
        .map(item => [item.id, item])
    );
    const studentBlocks = new Map(
      (Array.isArray(caseStudy.simulation.studentContent) ? caseStudy.simulation.studentContent : [])
        .map(item => [item.id, item])
    );
    const stageReleases = new Map(
      releases
        .filter(item => item.stageId === stage.id)
        .map(item => [item.contentId, item])
    );
    return {
      stage,
      instructorContent: (Array.isArray(stage.instructorContentIds) ? stage.instructorContentIds : [])
        .map(id => instructorBlocks.get(id))
        .filter(Boolean),
      optionalContent: (Array.isArray(stage.optionalReleaseIds) ? stage.optionalReleaseIds : [])
        .map(id => {
          const content = studentBlocks.get(id);
          return content ? { content, release: stageReleases.get(id) || null } : null;
        })
        .filter(Boolean)
    };
  };

  const renderLifecycle = () => {
    const lifecycle = element('instructorExerciseLifecycle');
    const start = element('instructorExerciseStartBtn');
    const pause = element('instructorExercisePauseBtn');
    const resume = element('instructorExerciseResumeBtn');
    if (!lifecycle) return;

    lifecycle.hidden = !exercise;
    const canStart = exercise?.status === 'draft' && !exercise.currentStageId;
    const canPause = exercise?.status === 'active';
    const canResume = exercise?.status === 'paused';

    if (start) {
      start.hidden = !canStart;
      start.disabled = loading || !canStart;
    }
    if (pause) {
      pause.hidden = !canPause;
      pause.disabled = loading || !canPause;
    }
    if (resume) {
      resume.hidden = !canResume;
      resume.disabled = loading || !canResume;
    }
  };

  const renderStage = () => {
    const panel = element('instructorExerciseStagePanel');
    if (!panel) return;
    const context = currentStageContext();
    panel.hidden = !context;
    if (!context) return;

    const { stage, instructorContent } = context;
    if (element('instructorExerciseStageTitle')) {
      element('instructorExerciseStageTitle').textContent = stage.title || 'Current stage';
    }
    if (element('instructorExerciseStageObjective')) {
      element('instructorExerciseStageObjective').textContent = stage.studentObjective || '';
    }
    if (element('instructorExerciseStageTiming')) {
      element('instructorExerciseStageTiming').textContent = Number.isFinite(stage.suggestedMinutes)
        ? `Suggested time: ${stage.suggestedMinutes} min`
        : '';
    }

    const facilitation = element('instructorExerciseFacilitation');
    const list = element('instructorExerciseFacilitationList');
    if (facilitation) facilitation.hidden = instructorContent.length === 0;
    if (list) {
      list.replaceChildren();
      instructorContent.forEach(item => {
        const block = documentRef.createElement('article');
        const title = documentRef.createElement('strong');
        title.textContent = item.title || 'Instructor note';
        const body = documentRef.createElement('p');
        body.textContent = item.body || '';
        block.append(title, body);
        list.append(block);
      });
    }
  };

  const renderReleases = () => {
    const panel = element('instructorExerciseReleasePanel');
    const list = element('instructorExerciseReleaseList');
    if (!panel || !list) return;
    const context = currentStageContext();
    const optionalContent = context?.optionalContent || [];
    panel.hidden = optionalContent.length === 0;
    list.replaceChildren();
    if (!optionalContent.length) return;

    const canRelease = exercise?.status === 'active' && exercise?.stagePhase === 'work' && !loading;
    optionalContent.forEach(item => {
      const row = documentRef.createElement('article');
      row.setAttribute('data-persistence', 'local-only');
      row.setAttribute('data-summary', 'exclude');
      const title = documentRef.createElement('strong');
      title.textContent = item.content.title || 'Optional evidence';
      const body = documentRef.createElement('p');
      body.textContent = item.content.body || '';
      row.append(title, body);

      if (item.release) {
        const state = documentRef.createElement('span');
        state.className = 'instructor-exercise-console__release-state';
        state.textContent = 'Released';
        row.append(state);
      } else {
        const button = documentRef.createElement('button'); // data-persistence="local-only" data-summary="exclude"
        button.type = 'button';
        button.className = 'btn-secondary';
        button.setAttribute('data-persistence', 'local-only');
        button.setAttribute('data-summary', 'exclude');
        button.textContent = canRelease ? 'Release to Students' : 'Resume to release';
        button.disabled = !canRelease;
        button.setAttribute('aria-label', `Release ${item.content.title || 'optional evidence'} to Students`);
        button.addEventListener('click', () => { void releaseContent(item.content.id); });
        row.append(button);
      }
      list.append(row);
    });
  };

  const renderProgress = () => {
    const panel = element('instructorExerciseProgressPanel');
    const list = element('instructorExerciseProgressList');
    const summary = element('instructorExerciseProgressSummary');
    if (!panel || !list) return;
    const stageId = exercise?.currentStageId || '';
    panel.hidden = !stageId;
    list.replaceChildren();
    if (!stageId) {
      if (summary) summary.textContent = '';
      return;
    }

    const rows = workspaceState.filter(item => item.stageId === stageId);
    const readyCount = rows.filter(item => item.readyForDebrief).length;
    const workingCount = rows.length - readyCount;
    if (summary) summary.textContent = rows.length
      ? `${readyCount} ready · ${workingCount} working`
      : 'No readiness signals yet';

    if (!rows.length) {
      const empty = documentRef.createElement('p');
      empty.className = 'instructor-exercise-progress__empty';
      empty.textContent = 'Waiting for teams to report readiness.';
      list.append(empty);
      return;
    }

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'instructor-exercise-console__progress-list';
    rows.forEach(item => {
      const button = documentRef.createElement('button'); // data-persistence="local-only" data-summary="exclude"
      button.type = 'button';
      button.className = 'instructor-exercise-progress__row';
      button.setAttribute('data-persistence', 'local-only');
      button.setAttribute('data-summary', 'exclude');
      button.setAttribute(
        'aria-label',
        `Observe ${item.workspaceLabel}, ${item.readyForDebrief ? 'Ready' : 'Working'}`
      );
      const label = documentRef.createElement('span');
      label.textContent = item.workspaceLabel;
      const state = documentRef.createElement('span');
      state.className = 'instructor-exercise-progress__state'
        + (item.readyForDebrief ? ' instructor-exercise-progress__state--ready' : '');
      state.textContent = item.readyForDebrief ? 'Ready' : 'Working';
      button.append(label, state);
      button.addEventListener('click', () => {
        Promise.resolve(onSelectWorkspace(item.workspaceId)).catch(() => {});
      });
      wrapper.append(button);
    });
    list.append(wrapper);
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
      const phase = currentPhaseLabel();
      if (status) status.textContent = lastNotice ? `${phase} · ${lastNotice}` : phase;
    } else {
      const count = availableCaseStudies.length;
      const availability = count === 1
        ? '1 staged Case Study available'
        : `${count} staged Case Studies available`;
      if (status) status.textContent = lastNotice ? `${availability} · ${lastNotice}` : availability;
    }

    if (exercise && caseStudy) {
      if (caseName) caseName.textContent = caseStudy.name || 'Current exercise';
      const stage = Array.isArray(caseStudy.simulation?.stages)
        ? caseStudy.simulation.stages.find(item => item.id === exercise.currentStageId)
        : null;
      if (detail) detail.textContent = stage
        ? `${stage.title} · ${stage.studentObjective}`
        : 'Draft exercise — no stage has started and nothing has been released to Students.';
    } else {
      if (caseName) caseName.textContent = 'No staged exercise selected';
      if (detail) detail.textContent = availableCaseStudies.length
        ? 'Choose a staged Case Study below to create the class exercise draft.'
        : 'The console is connected; no staged Case Study definition is currently available.';
    }
    renderSetup();
    renderLifecycle();
    renderStage();
    renderReleases();
    renderProgress();
    renderAvailable();
  };

  const resetState = () => {
    loading = false;
    lastError = '';
    lastNotice = '';
    classroom = null;
    exercise = null;
    caseStudy = null;
    availableCaseStudies = [];
    selectedCaseStudyId = '';
    releases = [];
    workspaceState = [];
  };

  const applyPayload = body => {
    classroom = body?.class && typeof body.class === 'object' ? body.class : null;
    exercise = body?.exercise && typeof body.exercise === 'object' ? body.exercise : null;
    caseStudy = body?.caseStudy && typeof body.caseStudy === 'object' ? body.caseStudy : null;
    releases = Array.isArray(body?.releases)
      ? body.releases.map(sanitizeRelease).filter(Boolean)
      : exercise ? releases : [];
    workspaceState = Array.isArray(body?.workspaceState)
      ? body.workspaceState.map(sanitizeWorkspaceState).filter(Boolean)
      : exercise ? workspaceState : [];
    if (Array.isArray(body?.availableCaseStudies)) {
      availableCaseStudies = body.availableCaseStudies
        .map(sanitizeCaseStudySummary)
        .filter(Boolean);
    }
    if (exercise?.caseStudyId) selectedCaseStudyId = exercise.caseStudyId;
    if (!exercise && selectedCaseStudyId && !availableCaseStudies.some(item => item.id === selectedCaseStudyId)) {
      selectedCaseStudyId = '';
    }
  };

  const refresh = async () => {
    if (destroyed || !capability || typeof fetchImpl !== 'function') return false;
    const localCapability = capability;
    const localEpoch = epoch;
    loading = true;
    lastError = '';
    lastNotice = '';
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
      applyPayload(body);
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

  const createDraft = async (caseStudyId = selectedCaseStudyId) => {
    if (
      destroyed
      || !capability
      || exercise
      || loading
      || typeof fetchImpl !== 'function'
    ) return false;

    const requestedId = typeof caseStudyId === 'string' ? caseStudyId.trim() : '';
    if (!availableCaseStudies.some(item => item.id === requestedId)) {
      lastError = 'Choose a staged Case Study.';
      lastNotice = '';
      render();
      return false;
    }

    const localCapability = capability;
    const localEpoch = epoch;
    selectedCaseStudyId = requestedId;
    loading = true;
    lastError = '';
    lastNotice = '';
    render();

    try {
      const response = await fetchImpl(INSTRUCTOR_EXERCISE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localCapability}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ caseStudyId: requestedId })
      });
      const body = await response.json().catch(() => ({}));
      if (destroyed || localEpoch !== epoch || capability !== localCapability) return false;

      if (response.status === 409) {
        loading = false;
        const reloaded = await refresh();
        if (reloaded && !destroyed && localEpoch === epoch) {
          lastNotice = 'current state reloaded';
          render();
        } else if (!lastError) {
          lastError = typeof body.error === 'string' ? body.error : 'Exercise changed. Refresh and retry.';
          render();
        }
        return false;
      }

      if (!response.ok) {
        lastError = response.status === 401 || response.status === 404
          ? 'Exercise access is no longer available.'
          : typeof body.error === 'string' && body.error
            ? body.error
            : 'Could not create the exercise draft.';
        return false;
      }

      applyPayload(body);
      lastNotice = body.created === false ? 'existing draft reused' : 'draft created';
      return true;
    } catch {
      if (destroyed || localEpoch !== epoch) return false;
      lastError = 'Could not create the exercise draft.';
      return false;
    } finally {
      if (!destroyed && localEpoch === epoch) {
        loading = false;
        render();
      }
    }
  };

  const mutateLifecycle = async action => {
    if (
      destroyed
      || !capability
      || !exercise
      || loading
      || typeof fetchImpl !== 'function'
    ) return false;

    const expectedRevision = Number(exercise.exerciseRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      lastError = 'Exercise revision is unavailable. Refresh and retry.';
      lastNotice = '';
      render();
      return false;
    }

    const allowed = (
      (action === 'start' && exercise.status === 'draft' && !exercise.currentStageId)
      || (action === 'pause' && exercise.status === 'active')
      || (action === 'resume' && exercise.status === 'paused')
    );
    if (!allowed) return false;

    const localCapability = capability;
    const localEpoch = epoch;
    loading = true;
    lastError = '';
    lastNotice = '';
    render();

    try {
      const response = await fetchImpl(INSTRUCTOR_EXERCISE_ENDPOINT, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localCapability}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, expectedRevision })
      });
      const body = await response.json().catch(() => ({}));
      if (destroyed || localEpoch !== epoch || capability !== localCapability) return false;

      if (response.status === 409) {
        loading = false;
        const reloaded = await refresh();
        if (reloaded && !destroyed && localEpoch === epoch) {
          lastNotice = 'current state reloaded';
          render();
        } else if (!lastError) {
          lastError = typeof body.error === 'string' ? body.error : 'Exercise changed. Refresh and retry.';
          render();
        }
        return false;
      }

      if (!response.ok) {
        lastError = response.status === 401 || response.status === 404
          ? 'Exercise access is no longer available.'
          : typeof body.error === 'string' && body.error
            ? body.error
            : 'Could not update the exercise.';
        return false;
      }

      applyPayload(body);
      lastNotice = action === 'start'
        ? 'exercise started'
        : action === 'pause'
          ? 'exercise paused'
          : 'exercise resumed';
      return true;
    } catch {
      if (destroyed || localEpoch !== epoch) return false;
      lastError = 'Could not update the exercise.';
      return false;
    } finally {
      if (!destroyed && localEpoch === epoch) {
        loading = false;
        render();
      }
    }
  };

  const releaseContent = async contentId => {
    if (
      destroyed
      || !capability
      || !exercise
      || loading
      || typeof fetchImpl !== 'function'
    ) return false;

    const context = currentStageContext();
    const requestedId = typeof contentId === 'string' ? contentId.trim() : '';
    const optional = context?.optionalContent?.find(item => item.content.id === requestedId) || null;
    if (!optional) return false;
    if (optional.release) {
      lastError = '';
      lastNotice = 'content already released';
      render();
      return true;
    }
    if (exercise.status !== 'active' || exercise.stagePhase !== 'work') return false;

    const expectedRevision = Number(exercise.exerciseRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      lastError = 'Exercise revision is unavailable. Refresh and retry.';
      lastNotice = '';
      render();
      return false;
    }

    const localCapability = capability;
    const localEpoch = epoch;
    loading = true;
    lastError = '';
    lastNotice = '';
    render();

    try {
      const response = await fetchImpl(INSTRUCTOR_EXERCISE_ENDPOINT, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localCapability}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'release-content',
          expectedRevision,
          contentId: requestedId
        })
      });
      const body = await response.json().catch(() => ({}));
      if (destroyed || localEpoch !== epoch || capability !== localCapability) return false;

      if (response.status === 409) {
        loading = false;
        const reloaded = await refresh();
        if (reloaded && !destroyed && localEpoch === epoch) {
          lastNotice = 'current state reloaded';
          render();
        } else if (!lastError) {
          lastError = typeof body.error === 'string' ? body.error : 'Exercise changed. Refresh and retry.';
          render();
        }
        return false;
      }

      if (!response.ok) {
        lastError = response.status === 401 || response.status === 404
          ? 'Exercise access is no longer available.'
          : typeof body.error === 'string' && body.error
            ? body.error
            : 'Could not release the Student evidence.';
        return false;
      }

      applyPayload(body);
      lastNotice = body.changed === false ? 'content already released' : 'content released';
      return true;
    } catch {
      if (destroyed || localEpoch !== epoch) return false;
      lastError = 'Could not release the Student evidence.';
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
  const handleSelect = event => {
    selectedCaseStudyId = typeof event?.target?.value === 'string' ? event.target.value : '';
    lastError = '';
    lastNotice = '';
    render();
  };
  const handleSetupSubmit = event => {
    event.preventDefault();
    void createDraft();
  };
  const handleStart = () => { void mutateLifecycle('start'); };
  const handlePause = () => { void mutateLifecycle('pause'); };
  const handleResume = () => { void mutateLifecycle('resume'); };

  element('instructorExerciseRefreshBtn')?.addEventListener('click', handleRefresh);
  element('instructorExerciseCaseSelect')?.addEventListener('change', handleSelect);
  element('instructorExerciseSetupForm')?.addEventListener('submit', handleSetupSubmit);
  element('instructorExerciseStartBtn')?.addEventListener('click', handleStart);
  element('instructorExercisePauseBtn')?.addEventListener('click', handlePause);
  element('instructorExerciseResumeBtn')?.addEventListener('click', handleResume);
  render();

  return {
    connectInstructor,
    disconnect,
    refresh,
    createDraft,
    start: () => mutateLifecycle('start'),
    pause: () => mutateLifecycle('pause'),
    resume: () => mutateLifecycle('resume'),
    releaseContent,
    getState: () => ({
      connected: Boolean(capability),
      loading,
      lastError,
      lastNotice,
      classroom,
      exercise,
      selectedCaseStudyId,
      caseStudy: caseStudy ? sanitizeCaseStudySummary(caseStudy) : null,
      availableCaseStudies: availableCaseStudies.map(item => ({ ...item })),
      releases: releases.map(item => ({ ...item })),
      workspaceState: workspaceState.map(item => ({ ...item }))
    }),
    destroy: () => {
      if (destroyed) return;
      element('instructorExerciseRefreshBtn')?.removeEventListener('click', handleRefresh);
      element('instructorExerciseCaseSelect')?.removeEventListener('change', handleSelect);
      element('instructorExerciseSetupForm')?.removeEventListener('submit', handleSetupSubmit);
      element('instructorExerciseStartBtn')?.removeEventListener('click', handleStart);
      element('instructorExercisePauseBtn')?.removeEventListener('click', handlePause);
      element('instructorExerciseResumeBtn')?.removeEventListener('click', handleResume);
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
