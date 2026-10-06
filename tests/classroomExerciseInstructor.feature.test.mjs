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
