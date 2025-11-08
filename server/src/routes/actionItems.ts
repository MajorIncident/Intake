import { Router } from 'express';
import { ActionItemService } from '../services/actionItemService';

export function createActionItemsRouter(service: ActionItemService): Router {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res, next) => {
    try {
      const { analysisId } = req.params as { analysisId: string };
      const items = service.list(analysisId);
      res.json(items);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const { analysisId } = req.params as { analysisId: string };
      const created = service.create(analysisId, req.body);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:actionId', (req, res, next) => {
    try {
      const { analysisId, actionId } = req.params as { analysisId: string; actionId: string };
      const updated = service.update(analysisId, actionId, req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:actionId', (req, res, next) => {
    try {
      const { analysisId, actionId } = req.params as { analysisId: string; actionId: string };
      service.delete(analysisId, actionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
