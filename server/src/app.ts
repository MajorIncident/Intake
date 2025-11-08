import express from 'express';
import type { DB } from './db';
import { createDatabase } from './db';
import { ActionItemRepository } from './repositories/actionItemRepository';
import { ActionItemService } from './services/actionItemService';
import { createActionItemsRouter } from './routes/actionItems';
import { errorHandler } from './middleware/errorHandler';

export interface AppOptions {
  db?: DB;
}

export function buildApp(options: AppOptions = {}) {
  const db = options.db ?? createDatabase();
  const repository = new ActionItemRepository(db);
  const service = new ActionItemService(repository);

  const app = express();
  app.use(express.json());

  app.use('/analyses/:analysisId/actions', createActionItemsRouter(service));

  app.use(errorHandler);

  return { app, db };
}
