/**
 * Feature coverage for the Student staged-exercise case reference.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  STUDENT_EXERCISE_ENDPOINT,
  STUDENT_EXERCISE_READY_ENDPOINT,
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
  readiness = null,
  assignment = { id: 'workspace-1', kind: 'group', label: 'Team Alpha' },
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
    assignment,
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
      readiness,
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


test('Student can mark Ready and Resume working with only the stable class-session capability', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let ready = false;
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (url === STUDENT_EXERCISE_ENDPOINT) {
        return response(200, payload({
          readiness: ready
            ? {
                stageId: 'stage-1',
                readyForDebrief: true,
                readyAt: '2099-12-31T23:30:00.000Z',
                readyWorkspaceRevision: 7
              }
            : null
        }));
      }
      if (url === STUDENT_EXERCISE_READY_ENDPOINT) {
        const body = JSON.parse(options.body);
        ready = body.ready;
        return response(200, {
          assignment: { id: 'workspace-1', kind: 'group', label: 'Team Alpha' },
          readiness: {
            stageId: 'stage-1',
            readyForDebrief: ready,
            readyAt: ready ? '2099-12-31T23:30:00.000Z' : null,
            readyWorkspaceRevision: ready ? 7 : null
          },
          changed: true
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  assert.equal(await controller.connectStudent(TOKEN), true);
  const readinessPanel = dom.window.document.getElementById('studentCaseReferenceReadiness');
  const status = dom.window.document.getElementById('studentCaseReferenceReadinessStatus');
  const button = dom.window.document.getElementById('studentCaseReferenceReadyBtn');
  assert.equal(readinessPanel.hidden, false);
  assert.equal(status.textContent, 'Working');
  assert.equal(button.textContent, 'Mark Ready');
  assert.equal(button.getAttribute('aria-pressed'), 'false');

  assert.equal(await controller.setReadiness(true), true);
  assert.equal(status.textContent, 'Ready for debrief · Intake revision 7');
  assert.equal(button.textContent, 'Resume working');
  assert.equal(button.getAttribute('aria-pressed'), 'true');

  const readyRequest = requests.find(([url]) => url === STUDENT_EXERCISE_READY_ENDPOINT);
  assert.ok(readyRequest);
  assert.equal(readyRequest[1].method, 'PUT');
  assert.equal(readyRequest[1].headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(readyRequest[1].body), { ready: true });
  assert.equal(readyRequest[1].body.includes('workspace'), false);
  assert.equal(JSON.stringify(controller.getState()).includes(TOKEN), false);

  assert.equal(await controller.setReadiness(false), true);
  assert.equal(status.textContent, 'Working');
  assert.equal(button.textContent, 'Mark Ready');
  assert.equal(button.getAttribute('aria-pressed'), 'false');

  const readyBodies = requests
    .filter(([url]) => url === STUDENT_EXERCISE_READY_ENDPOINT)
    .map(([, options]) => JSON.parse(options.body));
  assert.deepEqual(readyBodies, [{ ready: true }, { ready: false }]);

  controller.destroy();
});

test('Student readiness 409 refreshes authoritative assignment and does not replay stale intent', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const requests = [];
  let exerciseReads = 0;
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (url === STUDENT_EXERCISE_READY_ENDPOINT) {
        return response(409, {
          error: 'Student assignment changed. Refresh and retry.'
        });
      }
      if (url === STUDENT_EXERCISE_ENDPOINT) {
        exerciseReads += 1;
        return response(200, exerciseReads === 1
          ? payload()
          : payload({
              assignment: null,
              readiness: null
            }));
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  assert.equal(await controller.connectStudent(TOKEN), true);
  assert.equal(await controller.setReadiness(true), false);

  const readyRequests = requests.filter(([url]) => url === STUDENT_EXERCISE_READY_ENDPOINT);
  assert.equal(readyRequests.length, 1, 'stale Ready intent is never replayed');
  assert.equal(exerciseReads, 2, '409 is followed by exactly one authoritative exercise refresh');
  assert.equal(controller.getState().assignment, null);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceReadiness').hidden, true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceReadyBtn').hidden, true);

  controller.destroy();
});

test('Student readiness controls are unavailable outside active work', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => response(200, payload({
      stagePhase: 'debrief',
      editing: false,
      readiness: {
        stageId: 'stage-1',
        readyForDebrief: true,
        readyAt: '2099-12-31T23:30:00.000Z',
        readyWorkspaceRevision: 4
      }
    })),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  await controller.connectStudent(TOKEN);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceReadiness').hidden, true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceReadyBtn').hidden, true);
  assert.equal(await controller.setReadiness(false), false);

  controller.destroy();
});


test('frozen Student debrief projects Intake read only and restores when editing reopens', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  let reads = 0;
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => {
      reads += 1;
      return response(200, reads === 1
        ? payload({ stagePhase: 'debrief', editing: false })
        : payload({ stagePhase: 'debrief', editing: true }));
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  const oneLine = dom.window.document.getElementById('oneLine');
  const addCause = dom.window.document.getElementById('addCauseBtn');
  const leaveClass = dom.window.document.getElementById('studentClassLeaveBtn');
  const wrap = dom.window.document.querySelector('.wrap[data-experience-surface="intake"]');

  assert.equal(oneLine.readOnly, false);
  assert.equal(addCause.disabled, false);
  assert.equal(leaveClass.disabled, false);

  await controller.connectStudent(TOKEN);

  assert.equal(wrap.classList.contains('student-exercise-readonly'), true);
  assert.equal(oneLine.readOnly, true);
  assert.equal(oneLine.getAttribute('aria-readonly'), 'true');
  assert.equal(addCause.disabled, true);
  assert.equal(addCause.hasAttribute('data-student-exercise-readonly-control'), true);
  assert.equal(leaveClass.disabled, false, 'Leave class remains available during a frozen debrief');
  assert.equal(leaveClass.hasAttribute('data-student-exercise-readonly-control'), false);

  await controller.refresh();

  assert.equal(wrap.classList.contains('student-exercise-readonly'), false);
  assert.equal(oneLine.readOnly, false);
  assert.equal(oneLine.hasAttribute('aria-readonly'), false);
  assert.equal(addCause.disabled, false);
  assert.equal(addCause.hasAttribute('data-student-exercise-readonly-control'), false);
  assert.equal(leaveClass.disabled, false);

  controller.destroy();
});

test('paused frozen debrief remains read only and disconnect restores original control state', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  const controller = createStudentExerciseReferenceController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    fetchImpl: async () => response(200, payload({
      status: 'paused',
      stagePhase: 'debrief',
      editing: false
    })),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  const oneLine = dom.window.document.getElementById('oneLine');
  const addCause = dom.window.document.getElementById('addCauseBtn');
  await controller.connectStudent(TOKEN);

  assert.equal(oneLine.readOnly, true);
  assert.equal(addCause.disabled, true);
  assert.equal(dom.window.document.getElementById('studentCaseReferenceStatus').textContent, 'Paused · debrief · editing frozen');

  controller.disconnect();

  assert.equal(oneLine.readOnly, false);
  assert.equal(addCause.disabled, false);
  assert.equal(dom.window.document.querySelector('.wrap[data-experience-surface="intake"]').classList.contains('student-exercise-readonly'), false);

  controller.destroy();
});
