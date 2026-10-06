/**
 * Feature coverage for the Tranche 6A Instructor staged-exercise console foundation.
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

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('Instructor exercise console discovers staged summaries without persisting its capability', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(200, {
        class: { id: 'class-1', title: 'PSDM Class' },
        exercise: null,
        availableCaseStudies: [
          { id: 'staged-a', name: 'Staged Case A', description: 'First staged simulation.', supportedModes: ['full'] },
          { id: 'staged-b', name: 'Staged Case B', description: 'Second staged simulation.', supportedModes: ['intake'] }
        ]
      });
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
  assert.equal(dom.window.document.getElementById('instructorExerciseAvailableList').textContent.includes('Staged Case A'), true);
  assert.equal(dom.window.localStorage.length, 0);
  assert.equal(dom.window.document.body.textContent.includes(TOKEN), false);
  assert.equal('capability' in controller.getState(), false);

  controller.disconnect();
  assert.equal(dom.window.document.getElementById('instructorExerciseConsole').hidden, true);
  assert.deepEqual(controller.getState().availableCaseStudies, []);
  controller.destroy();
});

test('Instructor exercise console renders an existing draft without exposing the full simulation through public state', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const controller = createInstructorExerciseConsoleController({
    documentRef: dom.window.document,
    fetchImpl: async () => response(200, {
      class: { id: 'class-1', title: 'PSDM Class' },
      exercise: { id: 'exercise-1', status: 'draft', stagePhase: 'work', exerciseRevision: 1, currentStageId: null },
      caseStudy: {
        id: 'staged-a',
        name: 'Staged Case A',
        description: 'Instructor simulation.',
        supportedModes: ['full'],
        simulation: {
          stages: [{ id: 'stage-1', title: 'Hidden until started', studentObjective: 'Objective' }],
          instructorContent: [{ body: 'Instructor-only content remains in memory.' }]
        }
      },
      availableCaseStudies: [{ id: 'staged-a', name: 'Staged Case A', description: 'Instructor simulation.', supportedModes: ['full'] }]
    })
  });

  assert.equal(await controller.connectInstructor(TOKEN), true);
  assert.equal(dom.window.document.getElementById('instructorExerciseStatus').textContent, 'Draft');
  assert.equal(dom.window.document.getElementById('instructorExerciseCaseName').textContent, 'Staged Case A');
  assert.equal(dom.window.document.getElementById('instructorExerciseDetail').textContent, 'Draft exercise — no stage has started.');
  assert.deepEqual(controller.getState().caseStudy, {
    id: 'staged-a',
    name: 'Staged Case A',
    description: 'Instructor simulation.',
    supportedModes: ['full']
  });
  assert.equal(JSON.stringify(controller.getState()).includes('Instructor-only content'), false);
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
