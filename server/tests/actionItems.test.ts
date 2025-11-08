import request from 'supertest';
import { buildApp } from '../src/app';
import { createDatabase } from '../src/db';
import type { DB } from '../src/db';

function createTestServer() {
  const db = createDatabase({ memory: true });
  const { app } = buildApp({ db });
  return { app, db };
}

describe('Action Items API', () => {
  let db: DB | undefined;

  afterEach(() => {
    if (db) {
      db.close();
      db = undefined;
    }
  });

  test('Create → happy path and CRUD lifecycle', async () => {
    const { app, db: database } = createTestServer();
    db = database;
    const analysisId = 'analysis-123';

    const createResponse = await request(app)
      .post(`/analyses/${analysisId}/actions`)
      .send({
        summary: 'Restart API gateway in zone A',
        createdBy: 'user-123'
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      analysisId,
      summary: 'Restart API gateway in zone A',
      status: 'Planned',
      priority: 'P2',
      changeControl: { required: false },
      verification: { required: false }
    });

    const listResponse = await request(app)
      .get(`/analyses/${analysisId}/actions`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);

    const actionId = createResponse.body.id;

    await request(app)
      .delete(`/analyses/${analysisId}/actions/${actionId}`)
      .expect(204);

    const listAfterDelete = await request(app)
      .get(`/analyses/${analysisId}/actions`)
      .expect(200);

    expect(listAfterDelete.body).toHaveLength(0);
  });

  test('Transition guard: Plan→In-Progress blocked when rollback missing', async () => {
    const { app, db: database } = createTestServer();
    db = database;
    const analysisId = 'analysis-guard-1';

    const createResponse = await request(app)
      .post(`/analyses/${analysisId}/actions`)
      .send({
        summary: 'Deploy hotfix package',
        createdBy: 'user-123',
        changeControl: { required: true },
        verification: { required: false }
      })
      .expect(201);

    const actionId = createResponse.body.id;

    await request(app)
      .patch(`/analyses/${analysisId}/actions/${actionId}`)
      .send({ status: 'In-Progress' })
      .expect(422);
  });

  test('Done blocked when verification required but missing', async () => {
    const { app, db: database } = createTestServer();
    db = database;
    const analysisId = 'analysis-guard-2';

    const createResponse = await request(app)
      .post(`/analyses/${analysisId}/actions`)
      .send({
        summary: 'Failover to standby DB cluster',
        createdBy: 'user-123',
        verification: { required: true },
        changeControl: { required: false }
      })
      .expect(201);

    const actionId = createResponse.body.id;

    await request(app)
      .patch(`/analyses/${analysisId}/actions/${actionId}`)
      .send({ status: 'Done' })
      .expect(422);
  });

  test('Verification records set by PATCH allow completion', async () => {
    const { app, db: database } = createTestServer();
    db = database;
    const analysisId = 'analysis-guard-3';

    const createResponse = await request(app)
      .post(`/analyses/${analysisId}/actions`)
      .send({
        summary: 'Switch traffic to new gateway',
        createdBy: 'user-123',
        verification: { required: true },
        changeControl: { required: false }
      })
      .expect(201);

    const actionId = createResponse.body.id;

    const verificationTimestamp = new Date().toISOString();

    const verificationResponse = await request(app)
      .patch(`/analyses/${analysisId}/actions/${actionId}`)
      .send({
        verification: {
          result: 'Pass',
          checkedBy: 'qa-1',
          checkedAt: verificationTimestamp
        }
      })
      .expect(200);

    expect(verificationResponse.body.verification).toMatchObject({
      required: true,
      result: 'Pass',
      checkedBy: 'qa-1',
      checkedAt: verificationTimestamp
    });

    const completionResponse = await request(app)
      .patch(`/analyses/${analysisId}/actions/${actionId}`)
      .send({ status: 'Done' })
      .expect(200);

    expect(completionResponse.body.status).toBe('Done');
    expect(completionResponse.body.completedAt).toBeTruthy();
  });
});
