/**
 * Feature coverage for Instructor coaching controls and Student read-only feedback.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  createClassroomCoachingController,
  feedbackChangedSinceReview
} from '../src/classroomCoaching.js';
import { fingerprintCoachingEvidence } from '../src/coachableFields.js';

const INSTRUCTOR_TOKEN = 'i'.repeat(43);
const STUDENT_TOKEN = 's'.repeat(43);
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

let dom = null;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function mountField(value = 'Original problem') {
  dom = new JSDOM('<div class="field" id="problemField"><label for="oneLine">Problem</label><textarea id="oneLine"></textarea></div>');
  dom.window.document.getElementById('oneLine').value = value;
  return dom.window.document;
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('Instructor coaching saves status/note against the current field fingerprint and stays usable while typing', async () => {
  const documentRef = mountField('Original problem');
  const requests = [];
  const controller = createClassroomCoachingController({
    documentRef,
    getRows: () => [],
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (options.method === 'GET') {
        return response(200, { feedback: [] });
      }
      if (options.method === 'PUT') {
        const sent = JSON.parse(options.body);
        return response(200, {
          feedback: {
            ...sent,
            feedbackRevision: 1,
            createdAt: 'created',
            updatedAt: 'updated'
          }
        });
      }
      return response(500, {});
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {},
    toast: () => {}
  });
  controller.init();

  controller.showInstructorWorkspace({
    instructorToken: INSTRUCTOR_TOKEN,
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 7
  });
  await settle();

  const panel = documentRef.querySelector('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
  assert.ok(panel);
  assert.equal(panel.getAttribute('data-persistence'), 'local-only');
  assert.equal(panel.getAttribute('data-summary'), 'exclude');

  const note = panel.querySelector('textarea');
  note.value = 'Make the deviation measurable.';
  note.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(note.isConnected, true, 'typing a coaching note must not replace the editor');

  const improve = [...panel.querySelectorAll('button')].find(button => button.textContent === 'Needs improvement');
  improve.click();
  await settle();

  const put = requests.find(([, options]) => options.method === 'PUT');
  assert.ok(put);
  const sent = JSON.parse(put[1].body);
  assert.equal(sent.targetId, 'problem.one-line');
  assert.equal(sent.status, 'needs-improvement');
  assert.equal(sent.note, 'Make the deviation measurable.');
  assert.equal(sent.reviewedWorkspaceRevision, 7);
  assert.equal(
    sent.reviewedFieldFingerprint,
    fingerprintCoachingEvidence('problem.one-line', 'Original problem')
  );

  const refreshed = documentRef.querySelector('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
  assert.match(refreshed.textContent, /Needs improvement/);
  assert.match(refreshed.textContent, /Make the deviation measurable/);
  refreshed.querySelectorAll('button, textarea').forEach(control => {
    assert.equal(control.getAttribute('data-persistence'), 'local-only');
    assert.equal(control.getAttribute('data-summary'), 'exclude');
  });

  documentRef.getElementById('oneLine').value = 'Revised problem';
  controller.showInstructorWorkspace({
    instructorToken: INSTRUCTOR_TOKEN,
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 8
  });
  assert.match(
    documentRef.querySelector('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]').textContent,
    /Changed since review/
  );

  controller.destroy();
});

test('Student coaching renders status and note without any feedback write controls', async () => {
  const documentRef = mountField('Reviewed problem');
  const reviewedFingerprint = fingerprintCoachingEvidence('problem.one-line', 'Reviewed problem');
  const requests = [];
  const controller = createClassroomCoachingController({
    documentRef,
    getRows: () => [],
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(200, {
        workspace: { id: WORKSPACE_ID },
        feedback: [{
          targetId: 'problem.one-line',
          status: 'meets-standard',
          note: 'Clear and measurable.',
          reviewedWorkspaceRevision: 4,
          reviewedFieldFingerprint: reviewedFingerprint,
          feedbackRevision: 2
        }]
      });
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });
  controller.init();

  controller.connectStudent(STUDENT_TOKEN);
  await settle();

  let panel = documentRef.querySelector('.classroom-coaching--student[data-coaching-target-id="problem.one-line"]');
  assert.ok(panel);
  assert.match(panel.textContent, /Instructor feedback · Meets standard/);
  assert.match(panel.textContent, /Clear and measurable/);
  assert.doesNotMatch(panel.textContent, /Changed since review/);
  assert.equal(panel.querySelector('button, textarea, input, select'), null);
  assert.equal(panel.getAttribute('data-persistence'), 'local-only');
  assert.equal(panel.getAttribute('data-summary'), 'exclude');

  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/classes/coaching/student');
  assert.equal(requests[0][1].method, 'GET');
  assert.equal(requests[0][1].headers.Authorization, `Bearer ${STUDENT_TOKEN}`);
  assert.equal(String(requests[0][0]).includes('workspaceId'), false);

  const field = documentRef.getElementById('oneLine');
  field.value = 'Student changed this after review';
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  panel = documentRef.querySelector('.classroom-coaching--student[data-coaching-target-id="problem.one-line"]');
  assert.match(panel.textContent, /Changed since review/);

  controller.disconnectStudent();
  assert.equal(documentRef.querySelector('.classroom-coaching--student'), null);
  controller.destroy();
});

test('changed-since-review compares field evidence rather than workspace revision alone', () => {
  const fingerprint = fingerprintCoachingEvidence('problem.one-line', 'Same field value');
  const feedback = {
    reviewedWorkspaceRevision: 3,
    reviewedFieldFingerprint: fingerprint
  };

  assert.equal(feedbackChangedSinceReview(feedback, { fingerprint }), false);
  assert.equal(
    feedbackChangedSinceReview(feedback, {
      fingerprint: fingerprintCoachingEvidence('problem.one-line', 'Changed field value')
    }),
    true
  );
});

test('late Instructor feedback from a previous workspace cannot replace the current workspace coaching state', async () => {
  const documentRef = mountField('Current problem');
  let resolveFirst;
  const controller = createClassroomCoachingController({
    documentRef,
    getRows: () => [],
    fetchImpl: async url => {
      if (String(url).includes(WORKSPACE_ID)) {
        return new Promise(resolve => { resolveFirst = resolve; });
      }
      return response(200, {
        feedback: [{
          targetId: 'problem.one-line',
          status: 'meets-standard',
          note: 'Current workspace',
          reviewedWorkspaceRevision: 2,
          reviewedFieldFingerprint: fingerprintCoachingEvidence('problem.one-line', 'Current problem'),
          feedbackRevision: 1
        }]
      });
    }
  });
  controller.init();

  controller.showInstructorWorkspace({
    instructorToken: INSTRUCTOR_TOKEN,
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 1
  });
  await settle();

  const secondWorkspace = '22222222-2222-4222-8222-222222222222';
  controller.showInstructorWorkspace({
    instructorToken: INSTRUCTOR_TOKEN,
    workspaceId: secondWorkspace,
    workspaceRevision: 2
  });
  await settle();

  assert.match(
    documentRef.querySelector('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]').textContent,
    /Current workspace/
  );

  resolveFirst(response(200, {
    feedback: [{
      targetId: 'problem.one-line',
      status: 'needs-improvement',
      note: 'Stale previous workspace',
      reviewedWorkspaceRevision: 1,
      reviewedFieldFingerprint: fingerprintCoachingEvidence('problem.one-line', 'Current problem'),
      feedbackRevision: 9
    }]
  }));
  await settle();

  const panel = documentRef.querySelector('.classroom-coaching--instructor[data-coaching-target-id="problem.one-line"]');
  assert.doesNotMatch(panel.textContent, /Stale previous workspace/);
  assert.match(panel.textContent, /Current workspace/);
  controller.destroy();
});


test('dynamic Possible Cause coaching follows persisted cause identity after card rerender', async () => {
  const cause = {
    id: 'cause-cache-rule',
    suspect: 'Cache rule',
    accusation: 'Routes checkout incorrectly',
    impact: 'Requests time out',
    summaryText: 'Cache rule routes checkout incorrectly',
    confidence: 'medium',
    evidence: 'Timeouts correlate with the rule.',
    findings: {},
    editing: false,
    testingOpen: false
  };
  const targetId = 'possible-cause.cause-cache-rule';
  dom = new JSDOM(`<main><article class="cause-card" data-cause-id="${cause.id}"></article></main>`);
  const documentRef = dom.window.document;
  const requests = [];
  const controller = createClassroomCoachingController({
    documentRef,
    getRows: () => [],
    getCauses: () => [cause],
    fetchImpl: async (_url, options) => {
      requests.push(options);
      if (options.method === 'GET') return response(200, { feedback: [] });
      const sent = JSON.parse(options.body);
      return response(200, { feedback: { ...sent, feedbackRevision: 1 } });
    },
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });

  controller.init();
  controller.showInstructorWorkspace({
    instructorToken: INSTRUCTOR_TOKEN,
    workspaceId: WORKSPACE_ID,
    workspaceRevision: 7
  });
  await settle();

  let panel = documentRef.querySelector(`[data-coaching-target-id="${targetId}"]`);
  assert.ok(panel);
  [...panel.querySelectorAll('button')]
    .find(button => button.textContent === 'Needs improvement')
    .click();
  await settle();

  const put = requests.find(options => options.method === 'PUT');
  assert.ok(put);
  assert.equal(JSON.parse(put.body).targetId, targetId);

  cause.evidence = 'Changed evidence';
  documentRef.querySelector('.cause-card').remove();
  const replacement = documentRef.createElement('article');
  replacement.className = 'cause-card';
  replacement.dataset.causeId = cause.id;
  documentRef.querySelector('main').append(replacement);
  documentRef.dispatchEvent(new dom.window.CustomEvent('intake:possible-causes-rendered'));

  panel = documentRef.querySelector(`[data-coaching-target-id="${targetId}"]`);
  assert.ok(panel);
  assert.match(panel.textContent, /Changed since review/);
  assert.equal(panel.closest('.cause-card').dataset.causeId, cause.id);
  controller.destroy();
});
