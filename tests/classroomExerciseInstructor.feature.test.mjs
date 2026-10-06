/**
 * Feature coverage for the Tranche 6 Instructor staged-exercise console.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_EXERCISE_ENDPOINT,
  createInstructorExerciseConsoleController
} from '../src/classroomExerciseInstructor.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKEN = 'i'.repeat(43);
let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function discoveryBody() {
  return {
    class: { id: 'class-1', title: 'PSDM Class' },
    exercise: null,
    availableCaseStudies: [
      { id: 'staged-a', name: 'Staged Case A', description: 'First staged simulation.', supportedModes: ['full'] },
      { id: 'staged-b', name: 'Staged Case B', description: 'Second staged simulation.', supportedModes: ['intake'] }
    ]
  };
}

function draftBody({ created = true, caseStudyId = 'staged-a', name = 'Staged Case A' } = {}) {
  return {
    class: { id: 'class-1', title: 'PSDM Class' },
    exercise: {
      id: 'exercise-1',
      caseStudyId,
      status: 'draft',
      stagePhase: 'work',
      exerciseRevision: 1,
      currentStageId: null
    },
    caseStudy: {
      id: caseStudyId,
      name,
      description: 'Instructor simulation.',
      supportedModes: ['full'],
      simulation: {
        stages: [{ id: 'stage-1', title: 'Hidden until started', studentObjective: 'Objective' }],
        instructorContent: [{ body: 'Instructor-only content remains in memory.' }]
      }
    },
    created
  };
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('Instructor exercise console discovers staged summaries and enables explicit selection without persisting capability', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(200, discoveryBody());
    }
  });

  assert.equal(await controller.connectInstructor(TOKEN), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], INSTRUCTOR_EXERCISE_ENDPOINT);
  assert.equal(requests[0][1].method, 'GET');
  assert.equal(requests[0][1].headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(dom.window.document.getElementById('instructorExerciseConsole').hidden, false);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, '2 staged Case Studies available');
  assert.equal(dom.window.document.querySelectorAll('#instructorExerciseAvailableList li').length, 2);

  const select = dom.window.document.getElementById('instructorExerciseCaseSelect');
  const createButton = dom.window.document.getElementById('instructorExerciseCreateBtn');
  assert.equal(select.options.length, 3);
  assert.equal(createButton.disabled, true);

  select.value = 'staged-a';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(controller.getState().selectedCaseStudyId, 'staged-a');
  assert.equal(createButton.disabled, false);

  assert.equal(dom.window.localStorage.length, 0);
  assert.equal(dom.window.document.body.textContent.includes(TOKEN), false);
  assert.equal('capability' in controller.getState(), false);

  controller.disconnect();
  assert.equal(dom.window.document.getElementById('instructorExerciseConsole').hidden, true);
  assert.deepEqual(controller.getState().availableCaseStudies, []);
  controller.destroy();
});

test('Instructor creates a selected staged draft without releasing Student content or exposing full simulation through public state', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (options.method === 'GET') return response(200, discoveryBody());
      return response(201, draftBody({ created: true }));
    }
  });

  assert.equal(await controller.connectInstructor(TOKEN), true);
  const select = dom.window.document.getElementById('instructorExerciseCaseSelect');
  select.value = 'staged-a';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(await controller.createDraft(), true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1][1].method, 'POST');
  assert.equal(requests[1][1].headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(requests[1][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[1][1].body), { caseStudyId: 'staged-a' });

  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'Draft · draft created');
  assert.equal(dom.window.document.getElementById('instructorExerciseCaseName').textContent, 'Staged Case A');
  assert.equal(
    dom.window.document.getElementById('instructorExerciseDetail').textContent,
    'Draft exercise — no stage has started and nothing has been released to Students.'
  );
  assert.equal(dom.window.document.getElementById('instructorExerciseCaseSelect').disabled, true);
  assert.equal(dom.window.document.getElementById('instructorExerciseCreateBtn').disabled, true);
  assert.equal(controller.getState().exercise.exerciseRevision, 1);
  assert.equal(JSON.stringify(controller.getState()).includes('Instructor-only content'), false);
  assert.equal(dom.window.localStorage.length, 0);
  controller.destroy();
});

test('Instructor accepts an idempotent existing-draft response as the represented current exercise', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (_url, options) => options.method === 'GET'
      ? response(200, discoveryBody())
      : response(200, draftBody({ created: false }))
  });

  await controller.connectInstructor(TOKEN);
  const select = dom.window.document.getElementById('instructorExerciseCaseSelect');
  select.value = 'staged-a';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(await controller.createDraft(), true);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'Draft · existing draft reused');
  assert.equal(controller.getState().exercise.caseStudyId, 'staged-a');
  controller.destroy();
});

test('Instructor draft conflict reloads authoritative current exercise instead of retrying a stale create', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let getCount = 0;
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (_url, options) => {
      requests.push(options.method);
      if (options.method === 'POST') {
        return response(409, {
          error: 'Another exercise is already open for this class.',
          exercise: { id: 'exercise-race', caseStudyId: 'staged-b', exerciseRevision: 2 }
        });
      }
      getCount += 1;
      if (getCount === 1) return response(200, discoveryBody());
      return response(200, {
        ...discoveryBody(),
        ...draftBody({ created: false, caseStudyId: 'staged-b', name: 'Staged Case B' }),
        availableCaseStudies: discoveryBody().availableCaseStudies
      });
    }
  });

  await controller.connectInstructor(TOKEN);
  const select = dom.window.document.getElementById('instructorExerciseCaseSelect');
  select.value = 'staged-a';
  select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(await controller.createDraft(), false);
  assert.deepEqual(requests, ['GET', 'POST', 'GET']);
  assert.equal(controller.getState().exercise.caseStudyId, 'staged-b');
  assert.equal(controller.getState().selectedCaseStudyId, 'staged-b');
  assert.equal(dom.window.document.getElementById('instructorExerciseCaseName').textContent, 'Staged Case B');
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'Draft · current state reloaded');
  controller.destroy();
});

test('Instructor lifecycle sends optimistic revisions and renders current-stage facilitation context', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let exerciseState = {
    id: 'exercise-1',
    caseStudyId: 'staged-a',
    status: 'draft',
    stagePhase: 'work',
    exerciseRevision: 1,
    currentStageId: null
  };
  const caseStudy = {
    id: 'staged-a',
    name: 'Staged Case A',
    description: 'Instructor simulation.',
    supportedModes: ['full'],
    simulation: {
      stages: [{
        id: 'stage-1',
        title: 'Clarify the situation',
        studentObjective: 'Frame the initial problem.',
        suggestedMinutes: 7,
        instructorContentIds: ['teach-1']
      }],
      instructorContent: [{
        id: 'teach-1',
        kind: 'facilitation',
        title: 'Facilitation cue',
        body: 'Keep teams focused on the deviation.'
      }]
    }
  };

  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (_url, options) => {
      requests.push({
        method: options.method,
        body: options.body ? JSON.parse(options.body) : null
      });
      if (options.method === 'GET') {
        return response(200, {
          class: { id: 'class-1', title: 'PSDM Class' },
          exercise: { ...exerciseState },
          caseStudy,
          availableCaseStudies: discoveryBody().availableCaseStudies
        });
      }
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        assert.equal(body.expectedRevision, exerciseState.exerciseRevision);
        if (body.action === 'start') {
          exerciseState = { ...exerciseState, status: 'active', currentStageId: 'stage-1', exerciseRevision: 2 };
        } else if (body.action === 'pause') {
          exerciseState = { ...exerciseState, status: 'paused', exerciseRevision: 3 };
        } else if (body.action === 'resume') {
          exerciseState = { ...exerciseState, status: 'active', exerciseRevision: 4 };
        }
        return response(200, {
          class: { id: 'class-1', title: 'PSDM Class' },
          exercise: { ...exerciseState },
          caseStudy,
          releases: [],
          workspaceState: [],
          checkpoints: [],
          editFreezeEnforced: true,
          changed: true
        });
      }
      return response(405, {});
    }
  });

  assert.equal(await controller.connectInstructor(TOKEN), true);
  assert.equal(dom.window.document.getElementById('instructorExerciseStartBtn').hidden, false);

  assert.equal(await controller.start(), true);
  assert.deepEqual(requests.at(-1), {
    method: 'PATCH',
    body: { action: 'start', expectedRevision: 1 }
  });
  assert.equal(controller.getState().exercise.exerciseRevision, 2);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'In progress · exercise started');
  assert.equal(dom.window.document.getElementById('instructorExerciseStageTitle').textContent, 'Clarify the situation');
  assert.equal(dom.window.document.getElementById('instructorExerciseStageObjective').textContent, 'Frame the initial problem.');
  assert.equal(dom.window.document.getElementById('instructorExerciseStageTiming').textContent, 'Suggested time: 7 min');
  assert.equal(dom.window.document.getElementById('instructorExerciseFacilitationList').textContent.includes('Facilitation cue'), true);
  assert.equal(dom.window.document.getElementById('instructorExerciseFacilitationList').textContent.includes('Keep teams focused on the deviation.'), true);
  assert.equal(dom.window.document.getElementById('instructorExercisePauseBtn').hidden, false);

  assert.equal(await controller.pause(), true);
  assert.deepEqual(requests.at(-1), {
    method: 'PATCH',
    body: { action: 'pause', expectedRevision: 2 }
  });
  assert.equal(controller.getState().exercise.status, 'paused');
  assert.equal(dom.window.document.getElementById('instructorExerciseResumeBtn').hidden, false);

  assert.equal(await controller.resume(), true);
  assert.deepEqual(requests.at(-1), {
    method: 'PATCH',
    body: { action: 'resume', expectedRevision: 3 }
  });
  assert.equal(controller.getState().exercise.status, 'active');
  assert.equal(controller.getState().exercise.exerciseRevision, 4);
  controller.destroy();
});

test('Instructor lifecycle conflict refreshes authoritative state without replaying stale intent', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let getCount = 0;
  const draft = draftBody({ created: false });

  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (_url, options) => {
      requests.push(options.method);
      if (options.method === 'GET') {
        getCount += 1;
        if (getCount === 1) {
          return response(200, {
            ...draft,
            availableCaseStudies: discoveryBody().availableCaseStudies
          });
        }
        return response(200, {
          ...draft,
          exercise: {
            ...draft.exercise,
            status: 'active',
            currentStageId: 'stage-1',
            exerciseRevision: 2
          },
          availableCaseStudies: discoveryBody().availableCaseStudies
        });
      }
      if (options.method === 'PATCH') {
        return response(409, {
          error: 'Exercise changed. Refresh and retry.',
          exercise: {
            ...draft.exercise,
            status: 'active',
            currentStageId: 'stage-1',
            exerciseRevision: 2
          }
        });
      }
      return response(405, {});
    }
  });

  await controller.connectInstructor(TOKEN);
  assert.equal(await controller.start(), false);
  assert.deepEqual(requests, ['GET', 'PATCH', 'GET']);
  assert.equal(controller.getState().exercise.status, 'active');
  assert.equal(controller.getState().exercise.exerciseRevision, 2);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'In progress · current state reloaded');
  assert.equal(dom.window.document.getElementById('instructorExercisePauseBtn').hidden, false);
  controller.destroy();
});

test('Instructor releases only current-stage optional evidence and progress rows reuse observer navigation', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  const observed = [];
  let exerciseState = {
    id: 'exercise-1',
    caseStudyId: 'staged-a',
    status: 'active',
    stagePhase: 'work',
    exerciseRevision: 2,
    currentStageId: 'stage-1'
  };
  let releases = [];
  const workspaceState = [
    {
      workspaceId: 'workspace-a',
      workspaceKind: 'group',
      workspaceLabel: 'Team Alpha',
      stageId: 'stage-1',
      readyForDebrief: true,
      readyAt: 'ready',
      readyWorkspaceRevision: 7
    },
    {
      workspaceId: 'workspace-b',
      workspaceKind: 'group',
      workspaceLabel: 'Team Beta',
      stageId: 'stage-1',
      readyForDebrief: false,
      readyAt: null,
      readyWorkspaceRevision: null
    }
  ];
  const caseStudy = {
    id: 'staged-a',
    name: 'Staged Case A',
    description: 'Instructor simulation.',
    supportedModes: ['full'],
    simulation: {
      studentContent: [
        { id: 'hint-1', kind: 'evidence', title: 'Current optional evidence', body: 'Release this now.' },
        { id: 'future-2', kind: 'evidence', title: 'Future optional evidence', body: 'Do not show this yet.' }
      ],
      instructorContent: [],
      stages: [
        {
          id: 'stage-1',
          title: 'Clarify',
          studentObjective: 'Clarify the problem.',
          suggestedMinutes: 5,
          optionalReleaseIds: ['hint-1'],
          instructorContentIds: []
        },
        {
          id: 'stage-2',
          title: 'Analyze',
          studentObjective: 'Analyze later evidence.',
          suggestedMinutes: 5,
          optionalReleaseIds: ['future-2'],
          instructorContentIds: []
        }
      ]
    }
  };

  const body = () => ({
    class: { id: 'class-1', title: 'PSDM Class' },
    exercise: { ...exerciseState },
    caseStudy,
    releases: releases.map(item => ({ ...item })),
    workspaceState: workspaceState.map(item => ({ ...item })),
    checkpoints: [],
    editFreezeEnforced: true,
    availableCaseStudies: discoveryBody().availableCaseStudies
  });

  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    onSelectWorkspace: workspaceId => observed.push(workspaceId),
    fetchImpl: async (_url, options) => {
      requests.push({
        method: options.method,
        body: options.body ? JSON.parse(options.body) : null
      });
      if (options.method === 'GET') return response(200, body());
      if (options.method === 'PATCH') {
        const payload = JSON.parse(options.body);
        assert.deepEqual(payload, {
          action: 'release-content',
          expectedRevision: 2,
          contentId: 'hint-1'
        });
        releases = [{ stageId: 'stage-1', contentId: 'hint-1', releasedAt: 'released' }];
        exerciseState = { ...exerciseState, exerciseRevision: 3 };
        return response(200, { ...body(), changed: true });
      }
      return response(405, {});
    }
  });

  assert.equal(await controller.connectInstructor(TOKEN), true);
  const releaseText = dom.window.document.getElementById('instructorExerciseReleaseList').textContent;
  assert.equal(releaseText.includes('Current optional evidence'), true);
  assert.equal(releaseText.includes('Future optional evidence'), false);
  assert.equal(dom.window.document.getElementById('instructorExerciseProgressSummary').textContent, '1 ready · 1 working');

  dom.window.document
    .querySelector('[aria-label="Observe Team Beta, Working"]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(observed, ['workspace-b']);

  assert.equal(await controller.releaseContent('hint-1'), true);
  assert.deepEqual(requests.at(-1), {
    method: 'PATCH',
    body: {
      action: 'release-content',
      expectedRevision: 2,
      contentId: 'hint-1'
    }
  });
  assert.equal(controller.getState().exercise.exerciseRevision, 3);
  assert.equal(controller.getState().releases.length, 1);
  assert.equal(controller.getState().workspaceState.length, 2);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'In progress · content released');
  assert.equal(dom.window.document.getElementById('instructorExerciseReleaseList').textContent.includes('Released'), true);
  assert.equal(
    dom.window.document.querySelector('[aria-label="Release Current optional evidence to Students"]'),
    null
  );
  controller.destroy();
});

test('Instructor evidence-release conflict refreshes authoritative released state without replay', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let getCount = 0;
  const caseStudy = {
    id: 'staged-a',
    name: 'Staged Case A',
    description: 'Instructor simulation.',
    supportedModes: ['full'],
    simulation: {
      studentContent: [
        { id: 'hint-1', kind: 'evidence', title: 'Current optional evidence', body: 'Release this now.' }
      ],
      instructorContent: [],
      stages: [{
        id: 'stage-1',
        title: 'Clarify',
        studentObjective: 'Clarify the problem.',
        suggestedMinutes: 5,
        optionalReleaseIds: ['hint-1'],
        instructorContentIds: []
      }]
    }
  };
  const payload = ({ revision, released }) => ({
    class: { id: 'class-1', title: 'PSDM Class' },
    exercise: {
      id: 'exercise-1',
      caseStudyId: 'staged-a',
      status: 'active',
      stagePhase: 'work',
      exerciseRevision: revision,
      currentStageId: 'stage-1'
    },
    caseStudy,
    releases: released
      ? [{ stageId: 'stage-1', contentId: 'hint-1', releasedAt: 'released' }]
      : [],
    workspaceState: [],
    checkpoints: [],
    editFreezeEnforced: true,
    availableCaseStudies: discoveryBody().availableCaseStudies
  });

  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (_url, options) => {
      requests.push(options.method);
      if (options.method === 'GET') {
        getCount += 1;
        return response(200, getCount === 1
          ? payload({ revision: 2, released: false })
          : payload({ revision: 3, released: true }));
      }
      if (options.method === 'PATCH') {
        return response(409, {
          error: 'Exercise changed. Refresh and retry.',
          exercise: payload({ revision: 3, released: true }).exercise
        });
      }
      return response(405, {});
    }
  });

  await controller.connectInstructor(TOKEN);
  assert.equal(await controller.releaseContent('hint-1'), false);
  assert.deepEqual(requests, ['GET', 'PATCH', 'GET']);
  assert.equal(controller.getState().exercise.exerciseRevision, 3);
  assert.equal(controller.getState().releases[0].contentId, 'hint-1');
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'In progress · current state reloaded');
  assert.equal(dom.window.document.getElementById('instructorExerciseReleaseList').textContent.includes('Released'), true);
  controller.destroy();
});

test('Instructor exercise console keeps a connected shell on transient read failure and can refresh', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  let attempt = 0;
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) return response(500, { error: 'Nope' });
      return response(200, { class: { id: 'class-1', title: 'PSDM Class' }, exercise: null, availableCaseStudies: [] });
    }
  });

  assert.equal(await controller.connectInstructor(TOKEN), false);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'Could not load the class exercise.');
  assert.equal(dom.window.document.getElementById('instructorExerciseConsole').hidden, false);
  assert.equal(await controller.refresh(), true);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, '0 staged Case Studies available');
  controller.destroy();
});
