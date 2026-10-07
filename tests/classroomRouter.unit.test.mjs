/**
 * Classroom single-function dispatcher coverage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLASSROOM_ROUTE_IDS,
  CLASSROOM_ROUTE_PARAM,
  createClassroomRouteDispatcher
} from '../api/_classroomRouter.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('Classroom dispatcher delegates every public route marker without changing the request', async () => {
  const calls = [];
  const handlers = Object.fromEntries(CLASSROOM_ROUTE_IDS.map(route => [
    route,
    async (req, res) => {
      calls.push({ route, req });
      return res.status(200).json({ route });
    }
  ]));
  const dispatch = createClassroomRouteDispatcher({ handlers });

  for (const route of CLASSROOM_ROUTE_IDS) {
    const req = {
      method: 'GET',
      query: {
        [CLASSROOM_ROUTE_PARAM]: route,
        workspaceId: 'workspace-1'
      },
      body: { keep: true }
    };
    const res = response();
    await dispatch(req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { route });
    assert.equal(calls.at(-1).req, req);
    assert.equal(calls.at(-1).req.query.workspaceId, 'workspace-1');
    assert.deepEqual(calls.at(-1).req.body, { keep: true });
  }

  assert.deepEqual(calls.map(item => item.route), CLASSROOM_ROUTE_IDS);
});

test('Classroom dispatcher rejects unknown, missing, or duplicated route markers', async () => {
  const dispatch = createClassroomRouteDispatcher({
    handlers: {
      root: async (_req, res) => res.status(200).json({ ok: true })
    }
  });

  for (const value of [undefined, 'unknown', ['root', 'exercise']]) {
    const res = response();
    await dispatch({
      method: 'GET',
      query: value === undefined ? {} : { [CLASSROOM_ROUTE_PARAM]: value }
    }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Classroom route not found.' });
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
  }
});
