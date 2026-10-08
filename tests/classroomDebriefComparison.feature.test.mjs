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

function stagedDebriefBody() {
  const body = debriefBody();
  body.exercise = {
    id: 'exercise-1',
    status: 'active',
    currentStageId: 'stage-1',
    stagePhase: 'debrief',
    recommendedTargetIds: ['problem.one-line', 'possible-cause']
  };
  body.recommendedTargetIds = ['problem.one-line', 'possible-cause'];
  body.workspaces[0].readiness = {
    readyForDebrief: true,
    workspaceRevision: 6,
    readyAt: '2026-10-07T17:55:00Z'
  };
  body.workspaces[1].readiness = {
    readyForDebrief: false,
    workspaceRevision: null,
    readyAt: null
  };
  body.workspaces[0].coaching = {
    reviewedTargetCount: 2,
    meetsStandardCount: 1,
    needsImprovementCount: 1,
    changedSinceReviewCount: 1,
    targets: [
      {
        targetId: 'problem.one-line',
        status: 'meets-standard',
        reviewedWorkspaceRevision: 5,
        feedbackRevision: 3,
        changedSinceReview: true,
        note: 'Private note must never render.'
      },
      {
        targetId: 'possible-cause.cause-alpha',
        status: 'needs-improvement',
        reviewedWorkspaceRevision: 7,
        feedbackRevision: 2,
        changedSinceReview: false
      }
    ]
  };
  body.workspaces[1].coaching = {
    reviewedTargetCount: 2,
    meetsStandardCount: 1,
    needsImprovementCount: 1,
    changedSinceReviewCount: 1,
    targets: [
      {
        targetId: 'problem.one-line',
        status: 'needs-improvement',
        reviewedWorkspaceRevision: 4,
        feedbackRevision: 1,
        changedSinceReview: false
      },
      {
        targetId: 'possible-cause.cause-beta',
        status: 'meets-standard',
        reviewedWorkspaceRevision: 3,
        feedbackRevision: 4,
        changedSinceReview: true
      }
    ]
  };
  body.workspaces[0].checkpoint = {
    workspaceRevision: 6,
    updatedAt: '2026-10-07T17:56:00Z',
    stageId: 'stage-1',
    capturedAt: '2026-10-07T17:56:00Z',
    targets: [
      {
        id: 'problem.one-line',
        label: 'Problem statement',
        section: 'Problem',
        kind: 'field',
        evidence: 'Alpha checkpoint problem',
        comparisonText: 'Alpha checkpoint problem',
        empty: false,
        fingerprint: 'v1-alpha-checkpoint'
      },
      {
        id: 'possible-cause.cause-alpha',
        familyId: 'possible-cause',
        instanceId: 'cause-alpha',
        label: 'Possible Cause · Earlier cache rule',
        section: 'Possible Causes',
        kind: 'dynamic-card',
        evidence: '{"suspect":"Earlier cache rule"}',
        comparisonText: 'Earlier cache rule',
        empty: false,
        fingerprint: 'v1-cause-alpha-checkpoint'
      }
    ]
  };
  return body;
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
  assert.equal(documentRef.getElementById('instructorDebriefEvidenceMode').hidden, true);
  assert.equal(documentRef.getElementById('instructorDebriefRecommendations').hidden, true);
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
    evidenceMode: 'current',
    checkpointAvailable: false,
    workspaceCount: 2,
    lastError: ''
  });

  controller.disconnect();
  assert.equal(documentRef.getElementById('instructorDebriefComparison').hidden, true);
  assert.equal(controller.getState().connected, false);
  controller.destroy();
});

test('staged comparison exposes advisory focus, Ready/Working, and honest checkpoint mode', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  dom.window.localStorage.setItem('sentinel', 'unchanged');
  const selected = [];
  const controller = createClassroomDebriefComparisonController({
    documentRef: dom.window.document,
    fetchImpl: async () => response(200, stagedDebriefBody()),
    onSelectWorkspace: workspaceId => selected.push(workspaceId),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });
  controller.init();
  controller.connectInstructor(TOKEN);
  await settle();

  const documentRef = dom.window.document;
  assert.equal(
    documentRef.getElementById('instructorDebriefProgressSummary').textContent,
    '2 workspaces · 1 ready · 1 working'
  );
  const progress = [...documentRef.querySelectorAll('.instructor-debrief-progress__state')]
    .map(node => node.textContent);
  assert.deepEqual(progress, ['Ready · Revision 6', 'Working · Revision 4']);

  const recommendations = documentRef.getElementById('instructorDebriefRecommendations');
  assert.equal(recommendations.hidden, false);
  assert.match(recommendations.textContent, /Problem statement/);
  assert.match(recommendations.textContent, /Possible Causes/);
  assert.equal(
    documentRef.querySelector('.instructor-debrief-recommendation[aria-pressed="true"]').textContent,
    'Problem statement'
  );

  const mode = documentRef.getElementById('instructorDebriefEvidenceMode');
  assert.equal(mode.hidden, false);
  assert.equal(documentRef.getElementById('instructorDebriefCurrentBtn').getAttribute('aria-pressed'), 'true');
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Alpha problem/);
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Beta problem/);
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Meets standard/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Changed since review/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent,
    /Needs improvement/
  );
  assert.equal(
    documentRef.getElementById('instructorDebriefMatrix').textContent.includes('Private note must never render.'),
    false
  );

  documentRef.getElementById('instructorDebriefCheckpointBtn').click();
  assert.equal(controller.getState().evidenceMode, 'checkpoint');
  assert.equal(controller.getState().checkpointAvailable, true);
  assert.equal(
    documentRef.getElementById('instructorDebriefEvidenceSourceLabel').textContent,
    'Immutable debrief checkpoint'
  );
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Alpha checkpoint problem/);
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Current coaching/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Meets standard/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Changed since review/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent,
    /Checkpoint unavailable for this workspace/
  );
  assert.equal(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent.includes('Beta problem'),
    false,
    'missing checkpoint evidence must not fall back to current live Intake'
  );

  documentRef.querySelector(`[data-debrief-workspace-id="${W1}"] .instructor-debrief-cell__observe`).click();
  assert.deepEqual(selected, [W1], 'checkpoint comparison still drills into the existing live observer');

  const causeFocus = [...documentRef.querySelectorAll('.instructor-debrief-recommendation')]
    .find(node => node.textContent === 'Possible Causes');
  causeFocus.click();
  assert.equal(documentRef.getElementById('instructorDebriefTargetSelect').value, 'possible-cause');
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Earlier cache rule/);
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Needs improvement/
  );
  assert.equal(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent.includes('DNS rule'),
    false
  );

  documentRef.getElementById('instructorDebriefCurrentBtn').click();
  assert.equal(controller.getState().evidenceMode, 'current');
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /Cache rule/);
  assert.match(documentRef.getElementById('instructorDebriefMatrix').textContent, /DNS rule/);
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W1}"]`).textContent,
    /Needs improvement/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent,
    /Meets standard/
  );
  assert.match(
    documentRef.querySelector(`[data-debrief-workspace-id="${W2}"]`).textContent,
    /Changed since review/
  );
  assert.equal(dom.window.localStorage.getItem('sentinel'), 'unchanged');

  controller.destroy();
});

test('checkpoint mode resets to current when a later refresh has no checkpoint evidence', async () => {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.test/' });
  let staged = true;
  const controller = createClassroomDebriefComparisonController({
    documentRef: dom.window.document,
    fetchImpl: async () => response(200, staged ? stagedDebriefBody() : debriefBody()),
    setTimeoutImpl: () => 1,
    clearTimeoutImpl: () => {}
  });
  controller.init();
  controller.connectInstructor(TOKEN);
  await settle();

  dom.window.document.getElementById('instructorDebriefCheckpointBtn').click();
  assert.equal(controller.getState().evidenceMode, 'checkpoint');

  staged = false;
  assert.equal(await controller.refresh(), true);
  assert.equal(controller.getState().evidenceMode, 'current');
  assert.equal(controller.getState().checkpointAvailable, false);
  assert.equal(dom.window.document.getElementById('instructorDebriefEvidenceMode').hidden, true);
  assert.match(dom.window.document.getElementById('instructorDebriefMatrix').textContent, /Alpha problem/);

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
