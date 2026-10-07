/**
 * Feature coverage for the Instructor class debrief comparison presentation controller.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_DEBRIEF_ENDPOINT,
  createClassroomDebriefComparisonController,
  listDebriefTargetOptions
} from '../src/classroomDebriefComparison.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKEN = 'i'.repeat(43);
const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';

let dom = null;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function debriefBody() {
  return {
    class: {
      id: 'class-1',
      title: 'Problem Solving 101',
      expiresAt: '2099-01-01T00:00:00Z'
    },
    exercise: null,
    recommendedTargetIds: [],
    workspaces: [
      {
        id: W1,
        kind: 'group',
        label: 'Team Alpha',
        participantCount: 3,
        activeParticipantCount: 2,
        editingParticipantCount: 1,
        lastSeenAt: '2026-10-07T18:00:00Z',
        readiness: null,
        current: {
          workspaceRevision: 7,
          updatedAt: '2026-10-07T18:01:00Z',
          targets: [
            {
              id: 'problem.one-line',
              label: 'Problem statement',
              section: 'Problem',
              kind: 'field',
              evidence: 'Alpha problem',
              comparisonText: 'Alpha problem',
              empty: false,
              fingerprint: 'v1-alpha'
            },
            {
              id: 'possible-cause.cause-alpha',
              familyId: 'possible-cause',
              instanceId: 'cause-alpha',
              label: 'Possible Cause · Cache rule',
              section: 'Possible Causes',
              kind: 'dynamic-card',
              evidence: '{"suspect":"Cache rule"}',
              comparisonText: 'Cache rule',
              empty: false,
              fingerprint: 'v1-cause-alpha'
            }
          ]
        },
        checkpoint: null,
        coaching: {
          reviewedTargetCount: 0,
          meetsStandardCount: 0,
          needsImprovementCount: 0,
          changedSinceReviewCount: 0,
          targets: []
        }
      },
      {
        id: W2,
        kind: 'group',
        label: 'Team Beta',
        participantCount: 2,
        activeParticipantCount: 0,
        editingParticipantCount: 0,
        lastSeenAt: null,
        readiness: null,
        current: {
          workspaceRevision: 4,
          updatedAt: '2026-10-07T18:02:00Z',
          targets: [
            {
              id: 'problem.one-line',
              label: 'Problem statement',
              section: 'Problem',
              kind: 'field',
              evidence: 'Beta problem',
              comparisonText: 'Beta problem',
              empty: false,
              fingerprint: 'v1-beta'
            },
            {
              id: 'possible-cause.cause-beta',
              familyId: 'possible-cause',
              instanceId: 'cause-beta',
              label: 'Possible Cause · DNS rule',
              section: 'Possible Causes',
              kind: 'dynamic-card',
              evidence: '{"suspect":"DNS rule"}',
              comparisonText: 'DNS rule',
              empty: false,
              fingerprint: 'v1-cause-beta'
            }
          ]
        },
        checkpoint: null,
        coaching: {
          reviewedTargetCount: 0,
          meetsStandardCount: 0,
          needsImprovementCount: 0,
          changedSinceReviewCount: 0,
          targets: []
        }
      }
    ]
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

test('target options expose shared semantic static/KT/family IDs without runtime dynamic instances', () => {
  const options = listDebriefTargetOptions();
  assert.equal(options.some(option => option.id === 'problem.one-line'), true);
  assert.equal(options.some(option => option.id === 'possible-cause'), true);
  assert.equal(options.some(option => option.id.startsWith('possible-cause.')), false);
});

test('Instructor comparison fetches with class authority, renders progress/current evidence, and drills into existing observer', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  dom.window.localStorage.setItem('sentinel', 'unchanged');

  const requests = [];
  const selected = [];
  const timers = [];
  const controller = createClassroomDebriefComparisonController({
    documentRef: dom.window.document,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(200, debriefBody());
    },
    onSelectWorkspace: workspaceId => selected.push(workspaceId),
    setTimeoutImpl: fn => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeoutImpl: () => {}
  });
  controller.init();

  assert.equal(controller.connectInstructor(TOKEN), true);
  await settle();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, INSTRUCTOR_DEBRIEF_ENDPOINT);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${TOKEN}`);

  const documentRef = dom.window.document;
  assert.equal(documentRef.getElementById('instructorDebriefComparison').hidden, false);
  assert.equal(documentRef.getElementById('instructorDebriefTargetSelect').value, 'problem.one-line');
  assert.equal(documentRef.getElementById('instructorDebriefProgressSummary').textContent, '2 workspaces · 1 active · 1 editing');
  assert.equal(documentRef.querySelectorAll('.instructor-debrief-progress__row').length, 2);
  assert.equal(documentRef.querySelectorAll('.instructor-debrief-cell').length, 2);
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Alpha problem/);
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Beta problem/);

  documentRef.querySelector('.instructor-debrief-progress__row').click();
  assert.deepEqual(selected, [W1]);

  const target = documentRef.getElementById('instructorDebriefTargetSelect');
  target.value = 'possible-cause';
  target.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.equal(documentRef.getElementById('instructorDebriefComparisonTitle').textContent, 'Possible Causes');
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Cache rule/);
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /DNS rule/);
  assert.equal(
    documentRef.getElementById('instructorDebriefMatrix').textContent.includes('cause-alpha'),
    false,
    'runtime instance IDs stay internal to presentation metadata'
  );
  assert.equal(dom.window.localStorage.getItem('sentinel'), 'unchanged');
  assert.deepEqual(controller.getState(), {
    connected: true,
    loading: false,
    selectedTargetId: 'possible-cause',
    workspaceCount: 2,
    lastError: ''
  });

  controller.disconnect();
  assert.equal(documentRef.getElementById('instructorDebriefComparison').hidden, true);
  assert.equal(controller.getState().connected, false);
  controller.destroy();
});

test('comparison refresh failure stays read-only, visible, and retryable without storing authority', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  let attempt = 0;
  const timers = [];
  const controller = createClassroomDebriefComparisonController({
    documentRef: dom.window.document,
    fetchImpl: async () => {
      attempt += 1;
      return attempt === 1
        ? response(503, { error: 'Unavailable' })
        : response(200, debriefBody());
    },
    setTimeoutImpl: fn => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeoutImpl: () => {}
  });
  controller.init();
  controller.connectInstructor(TOKEN);
  await settle();

  assert.match(
    dom.window.document.getElementById('instructorDebriefStatus').textContent,
    /Could not refresh/
  );
  assert.equal(dom.window.document.getElementById('instructorDebriefComparison').hidden, false);
  assert.equal(
    dom.window.localStorage.getItem('kt-classroom-debrief-comparison'),
    null,
    'comparison controller has no persistence key'
  );

  assert.equal(await controller.refresh(), true);
  assert.equal(controller.getState().workspaceCount, 2);
  controller.destroy();
});
