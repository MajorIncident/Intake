/**
 * Feature coverage for the Instructor "Case Study for workspaces" panel (#343):
 * selection rendering, the live mode password, first loads, the explicit
 * replace-confirmation round trip, and declining it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  INSTRUCTOR_CASE_ASSIGN_ENDPOINT,
  createInstructorCaseAssignmentController
} from '../src/classroomCaseAssignment.js';
import { templateModePassword } from '../src/templateModes.js';

const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TOKEN = 'i'.repeat(43);
const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const CATALOG = [
  { id: 'paytrix', name: 'Paytrix', supportedModes: ['intake', 'is-is-not', 'dc', 'full'] },
  { id: 'cabinets', name: 'Microcomputer Cabinets', supportedModes: ['intake', 'full'] }
];
const WORKSPACES = [
  { id: W1, label: 'Team Red', kind: 'group' },
  { id: W2, label: 'Ana', kind: 'individual' }
];

let dom = null;
let controller = null;

afterEach(() => {
  controller?.destroy();
  controller = null;
  dom?.window.close();
  dom = null;
});

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * Builds the panel over the real index.html with scripted server replies.
 * @param {object} [options] - Overrides.
 * @returns {{document: Document, requests: Array<object>, loaded: Array<number>, confirms: Array<string>}} Handles.
 */
function setup({ replies = [], confirmAnswer = true, now = () => new Date(2026, 10, 19, 9, 7).getTime() } = {}) {
  dom = new JSDOM(INDEX_HTML, { url: 'https://intake.example/' });
  const requests = [];
  const loaded = [];
  const confirms = [];
  const queue = [...replies];
  controller = createInstructorCaseAssignmentController({
    documentRef: dom.window.document,
    windowRef: dom.window,
    getCatalog: () => CATALOG,
    fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
      const next = queue.shift();
      if (!next) throw new Error('No scripted reply');
      return response(next.status, next.body);
    },
    confirmImpl: message => { confirms.push(message); return confirmAnswer; },
    now,
    onLoaded: () => loaded.push(1),
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {}
  });
  controller.init();
  return { document: dom.window.document, requests, loaded, confirms };
}

test('panel stays disabled until connected with a catalog and workspaces, then shows the live mode password', () => {
  const { document } = setup();
  assert.equal(document.getElementById('instructorCaseAssignmentBtn').disabled, true);
  assert.equal(document.getElementById('instructorCaseAssignmentPassword').hidden, true);

  controller.connectInstructor(TOKEN);
  controller.setWorkspaces(WORKSPACES);
  const caseSelect = document.getElementById('instructorCaseAssignmentCase');
  assert.deepEqual([...caseSelect.options].map(option => option.textContent), ['Select a Case Study', 'Paytrix', 'Microcomputer Cabinets']);
  assert.deepEqual(
    [...document.getElementById('instructorCaseAssignmentTarget').options].map(option => option.textContent),
    ['All workspaces', 'Team · Team Red', 'Individual · Ana']
  );

  caseSelect.value = 'cabinets';
  caseSelect.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual([...document.getElementById('instructorCaseAssignmentMode').options].map(option => option.value), ['intake', 'full']);
  assert.equal(document.getElementById('instructorCaseAssignmentBtn').disabled, false);
  assert.equal(document.getElementById('instructorCaseAssignmentPassword').hidden, false);
  assert.equal(document.getElementById('instructorCaseAssignmentPasswordValue').textContent, 'intake07');
  assert.equal(document.getElementById('instructorCaseAssignmentPasswordMode').textContent, 'Intake');

  const modeSelect = document.getElementById('instructorCaseAssignmentMode');
  modeSelect.value = 'full';
  modeSelect.dispatchEvent(new dom.window.Event('change'));
  assert.equal(document.getElementById('instructorCaseAssignmentPasswordValue').textContent, 'full07');
  assert.equal(templateModePassword('is-is-not', new Date(2026, 10, 19, 9, 7)), 'isisnot07', 'same rule as the Student drawer');

  controller.disconnect();
  assert.equal(document.getElementById('instructorCaseAssignmentBtn').disabled, true);
});

test('loads into all workspaces with the Instructor capability and reports the outcome', async () => {
  const { document, requests, loaded, confirms } = setup({
    replies: [{
      status: 200,
      body: {
        caseStudy: { id: 'paytrix', name: 'Paytrix' },
        mode: 'is-is-not',
        results: [
          { workspaceId: W1, label: 'Team Red', status: 'loaded', revision: 2 },
          { workspaceId: W2, label: 'Ana', status: 'loaded', revision: 2 }
        ]
      }
    }]
  });
  controller.connectInstructor(TOKEN);
  controller.setWorkspaces(WORKSPACES);
  const outcome = await controller.loadCaseStudy({ caseStudyId: 'paytrix', mode: 'is-is-not', target: 'all' });

  assert.deepEqual(outcome, { loaded: 2, kept: 0, changed: 0, missing: 0 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, INSTRUCTOR_CASE_ASSIGN_ENDPOINT);
  assert.equal(requests[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(requests[0].body, { caseStudyId: 'paytrix', mode: 'is-is-not', targets: 'all' });
  assert.equal(confirms.length, 0, 'untouched workspaces need no confirmation');
  assert.equal(loaded.length, 1, 'roster refresh requested');
  assert.equal(document.getElementById('instructorCaseAssignmentStatus').textContent, 'Loaded Paytrix (IS / IS NOT) into 2 workspaces.');
});

test('workspaces with Student work are replaced only after confirmation, with the revision the Instructor saw', async () => {
  const { document, requests, confirms } = setup({
    replies: [
      {
        status: 200,
        body: {
          results: [
            { workspaceId: W1, label: 'Team Red', status: 'has-work', revision: 5 },
            { workspaceId: W2, label: 'Ana', status: 'loaded', revision: 2 }
          ]
        }
      },
      {
        status: 200,
        body: { results: [{ workspaceId: W1, label: 'Team Red', status: 'loaded', revision: 6 }] }
      }
    ]
  });
  controller.connectInstructor(TOKEN);
  controller.setWorkspaces(WORKSPACES);
  const outcome = await controller.loadCaseStudy({ caseStudyId: 'paytrix', mode: 'full', target: 'all' });

  assert.equal(confirms.length, 1);
  assert.match(confirms[0], /^Team Red already has Student work\. Replace it with Paytrix \(Full\)\?/);
  assert.deepEqual(requests[1].body, {
    caseStudyId: 'paytrix',
    mode: 'full',
    replaceExisting: true,
    targets: [{ workspaceId: W1, expectedRevision: 5 }]
  });
  assert.deepEqual(outcome, { loaded: 2, kept: 0, changed: 0, missing: 0 });
  assert.equal(document.getElementById('instructorCaseAssignmentStatus').textContent, 'Loaded Paytrix (Full) into 2 workspaces.');
});

test('declining keeps Student work; a workspace that changed meanwhile is reported, not replaced', async () => {
  const declined = setup({
    confirmAnswer: false,
    replies: [{
      status: 200,
      body: { results: [{ workspaceId: W1, label: 'Team Red', status: 'has-work', revision: 5 }] }
    }]
  });
  controller.connectInstructor(TOKEN);
  controller.setWorkspaces(WORKSPACES);
  const kept = await controller.loadCaseStudy({ caseStudyId: 'paytrix', mode: 'intake', target: W1 });
  assert.deepEqual(declined.requests[0].body.targets, [{ workspaceId: W1 }]);
  assert.equal(declined.requests.length, 1, 'nothing is replaced after Cancel');
  assert.deepEqual(kept, { loaded: 0, kept: 1, changed: 0, missing: 0 });
  assert.equal(declined.loaded.length, 0);
  assert.equal(
    declined.document.getElementById('instructorCaseAssignmentStatus').textContent,
    'Paytrix (Intake) was not loaded into any workspace. Team Red kept its work.'
  );
  controller.destroy();
  dom.window.close();

  const raced = setup({
    replies: [
      { status: 200, body: { results: [{ workspaceId: W1, label: 'Team Red', status: 'has-work', revision: 5 }] } },
      { status: 200, body: { results: [{ workspaceId: W1, label: 'Team Red', status: 'changed', revision: 6 }] } }
    ]
  });
  controller.connectInstructor(TOKEN);
  controller.setWorkspaces(WORKSPACES);
  const outcome = await controller.loadCaseStudy({ caseStudyId: 'paytrix', mode: 'intake', target: W1 });
  assert.deepEqual(outcome, { loaded: 0, kept: 0, changed: 1, missing: 0 });
  assert.match(raced.document.getElementById('instructorCaseAssignmentStatus').textContent, /Team Red changed while you were deciding, so it was not replaced\./);
});

test('server refusals are shown as-is and nothing is sent without workspaces', async () => {
  const { document, requests } = setup({
    replies: [{
      status: 409,
      body: { error: 'Complete the current staged exercise before loading a Case Study into workspaces.', code: 'exercise-active' }
    }]
  });
  controller.connectInstructor(TOKEN);
  assert.equal(await controller.loadCaseStudy({ caseStudyId: 'paytrix', mode: 'intake', target: 'all' }), null);
  assert.equal(requests.length, 0);
  assert.equal(document.getElementById('instructorCaseAssignmentStatus').textContent, 'Create a workspace first.');

  controller.setWorkspaces(WORKSPACES);
  assert.equal(await controller.loadCaseStudy(), null);
  assert.equal(
    document.getElementById('instructorCaseAssignmentStatus').textContent,
    'Complete the current staged exercise before loading a Case Study into workspaces.'
  );
  assert.equal(document.getElementById('instructorCaseAssignmentBtn').disabled, false, 'ready to retry');
});
