/**
 * Client contract tests for authorized Classroom Case Study delivery.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INSTRUCTOR_CASE_STUDIES_ENDPOINT,
  STUDENT_CASE_STUDIES_ENDPOINT,
  createClassroomCaseStudiesController
} from '../src/classroomCaseStudies.js';

const STUDENT = 's'.repeat(43);
const INSTRUCTOR = 'i'.repeat(43);

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test('Student connection loads protected metadata with bearer auth and persists no credential state', async () => {
  const requests = [];
  const controller = createClassroomCaseStudiesController({
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      return response(200, {
        caseStudies: [{
          id: 'case-a',
          name: 'Case A',
          description: 'Protected',
          templateKind: 'case-study',
          supportedModes: ['intake', 'full']
        }]
      });
    }
  });

  assert.equal(await controller.connectStudent(STUDENT), true);
  assert.deepEqual(controller.getCatalog().map(item => item.id), ['case-a']);
  assert.equal(requests[0][0], STUDENT_CASE_STUDIES_ENDPOINT);
  assert.equal(requests[0][1].headers.Authorization, `Bearer ${STUDENT}`);
  assert.deepEqual(controller.getState(), {
    role: 'student',
    connected: true,
    loading: false,
    lastError: '',
    catalogCount: 1
  });
  assert.equal(JSON.stringify(controller.getState()).includes(STUDENT), false);
});

test('Case Study payload uses POST body and is discarded when classroom context changes', async () => {
  const requests = [];
  let resolvePayload;
  const controller = createClassroomCaseStudiesController({
    fetchImpl: async (url, options) => {
      requests.push([url, options]);
      if (options.method === 'GET') return response(200, { caseStudies: [] });
      return new Promise(resolve => { resolvePayload = resolve; });
    }
  });

  await controller.connectStudent(STUDENT);
  const payloadPromise = controller.getPayload('case-a');
  assert.equal(requests.at(-1)[0], STUDENT_CASE_STUDIES_ENDPOINT);
  assert.equal(requests.at(-1)[1].body, JSON.stringify({ caseStudyId: 'case-a' }));
  assert.equal(String(requests.at(-1)[0]).includes('case-a'), false);

  controller.disconnect();
  resolvePayload(response(200, {
    caseStudy: {
      id: 'case-a',
      name: 'Case A',
      description: 'Protected',
      templateKind: 'case-study',
      supportedModes: ['full'],
      state: { secret: 'answer' }
    }
  }));
  assert.equal(await payloadPromise, null, 'late protected payload must not survive disconnect');
});

test('Instructor connection uses the Instructor route and disconnect clears metadata', async () => {
  const controller = createClassroomCaseStudiesController({
    fetchImpl: async (url, options) => {
      assert.equal(url, INSTRUCTOR_CASE_STUDIES_ENDPOINT);
      assert.equal(options.headers.Authorization, `Bearer ${INSTRUCTOR}`);
      return response(200, {
        caseStudies: [{
          id: 'case-b',
          name: 'Case B',
          description: 'Teaching resource',
          templateKind: 'case-study',
          supportedModes: ['full']
        }]
      });
    }
  });

  assert.equal(await controller.connectInstructor(INSTRUCTOR), true);
  assert.equal(controller.getCatalog().length, 1);
  controller.disconnect();
  assert.equal(controller.getCatalog().length, 0);
  assert.equal(controller.getState().connected, false);
});
