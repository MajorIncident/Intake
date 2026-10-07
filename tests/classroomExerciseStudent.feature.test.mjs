/**
 * Feature coverage for the Student staged-exercise case reference.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  STUDENT_EXERCISE_ENDPOINT,
  createStudentExerciseReferenceController
} from '../src/classroomExerciseStudent.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKEN = 'l'.repeat(43);

let dom = null;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function payload({
  revision = 2,
  status = 'active',
  stagePhase = 'work',
  editing = true,
  stageTitle = 'Clarify the case',
  objective = 'Capture the initial situation.',
  content = [
    {
      stageId: 'stage-1',
      releaseType: 'initial',
      releasedAt: null,
      content: {
        id: 'brief-1',
        kind: 'narrative',
        title: 'Initial briefing',
        body: 'Student-safe released case material.'
      }
    }
  ]
} = {}) {
  return {
    class: { id: 'class-1', title: 'PSDM Class' },
    participant: { id: 'participant-1', displayName: 'Alex' },
    assignment: { id: 'workspace-1', kind: 'group', label: 'Team Alpha' },
    exercise: {
      id: 'exercise-1',
      caseStudyId: 'protected-case-id',
      caseStudy: {
        id: 'protected-case-id',
        name: 'Student-visible case name',
        description: 'Student-visible summary.'
      },
      status,
      stagePhase,
      exerciseRevision: revision,
      studentEditingEnabled: editing,
      editFreezeEnforced: true,
      currentStage: {
        id: revision > 2 ? 'stage-2' : 'stage-1',
        title: stageTitle,
        studentObjective: objective
      },
      releasedContent: content,
      readiness: null,
      futureStage: {
        title: 'DO NOT SHOW FUTURE STAGE'
      },
      instructorContent: [{
        title: 'DO NOT SHOW INSTRUCTOR CONTENT'
      }]
    }
  };
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('Student reference uses only the Student exercise endpoint and projects Student-safe fields', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  const timers = [];
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(200, payload());
    },
    setTimeoutImpl: fn => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeoutImpl: () => {}
  });

  assert.equal(await controller.connectStudent(TOKEN), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], STUDENT_EXERCISE_ENDPOINT);
  assert.equal(requests[0][1].method, 'GET');
  assert.equal(requests[0][1].headers.Authorization, `Bearer ${TOKEN}`);

  const panel = dom.window.document.getElementById('studentCaseReference');
  assert.equal(panel.hidden, false);
  assert.equal(dom.window.document.body.classList.contains('student-case-reference-visible'), true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceTitle').textContent, 'Student-visible case name');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceStatus').textContent, 'Work');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceStageTitle').textContent, 'Clarify the case');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceObjective').textContent, 'Capture the initial situation.');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceContent').textContent.includes('Initial briefing'), true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceContent').textContent.includes('Student-safe released case material.'), true);

  const rendered = panel.textContent;
  assert.equal(rendered.includes('DO NOT SHOW FUTURE STAGE'), false);
  assert.equal(rendered.includes('DO NOT SHOW INSTRUCTOR CONTENT'), false);
  const stateText = JSON.stringify(controller.getState());
  assert.equal(stateText.includes(TOKEN), false, 'public state never exposes the Student bearer capability');
  assert.equal(stateText.includes('DO NOT SHOW FUTURE STAGE'), false);
  assert.equal(stateText.includes('DO NOT SHOW INSTRUCTOR CONTENT'), false);
  assert.equal(dom.window.localStorage.length, 0, 'reference controller adds no browser storage');
  assert.equal(timers.length, 1, 'successful read schedules exercise polling');

  controller.destroy();
});

test('Student reference refreshes to a new revision and explains a frozen debrief', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const timers = [];
  let read = 0;
  const secondContent = [
    ...payload().exercise.releasedContent,
    {
      stageId: 'stage-2',
      releaseType: 'initial',
      releasedAt: null,
      content: {
        id: 'brief-2',
        kind: 'evidence',
        title: 'Second-stage evidence',
        body: 'New Student-safe evidence after the stage transition.'
      }
    }
  ];
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => {
      read += 1;
      return response(200, read === 1
        ? payload()
        : payload({
            revision: 3,
            stagePhase: 'debrief',
            editing: false,
            stageTitle: 'Analyze the evidence',
            objective: 'Compare the released evidence.',
            content: secondContent
          }));
    },
    setTimeoutImpl: fn => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeoutImpl: () => {}
  });

  assert.equal(await controller.connectStudent(TOKEN), true);
  const nextPoll = timers.shift();
  await nextPoll();
  await new Promise(resolve => setImmediate(resolve));

  const state = controller.getState();
  assert.equal(state.exercise.exerciseRevision, 3);
  assert.equal(state.exercise.currentStage.title, 'Analyze the evidence');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceStatus').textContent, 'Debrief · editing frozen');
  assert.equal(dom.window.document.getElementById('studentCaseReferenceContent').textContent.includes('Second-stage evidence'), true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceMessage').hidden, false);
  assert.match(dom.window.document.getElementById('studentCaseReferenceMessage').textContent, /frozen Student editing/i);

  controller.destroy();
});

test('Student reference defaults collapsed on mobile and remains explicitly expandable', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  dom.window.matchMedia = query => ({
    matches: query === '(max-width: 700px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => response(200, payload()),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  await controller.connectStudent(TOKEN);
  const panel = dom.window.document.getElementById('studentCaseReference');
  const toggle = dom.window.document.getElementById('studentCaseReferenceToggle');
  assert.equal(controller.getState().expanded, false);
  assert.equal(panel.classList.contains('is-collapsed'), true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.textContent, 'Open case reference');

  toggle.click();
  assert.equal(controller.getState().expanded, true);
  assert.equal(panel.classList.contains('is-collapsed'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.textContent, 'Collapse reference');

  controller.destroy();
});

test('Student reference clears exercise content immediately on session disconnect', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => response(200, payload()),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  await controller.connectStudent(TOKEN);
  assert.equal(dom.window.document.getElementById('studentCaseReference').hidden, false);
  controller.disconnect();

  assert.equal(controller.getState().connected, false);
  assert.equal(controller.getState().exercise, null);
  assert.equal(dom.window.document.getElementById('studentCaseReference').hidden, true);
  assert.equal(dom.window.document.body.classList.contains('student-case-reference-visible'), false);
  controller.destroy();
});
