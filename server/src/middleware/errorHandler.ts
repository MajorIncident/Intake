import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isHttpError } from '../utils/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(422).json({
      message: 'Validation error',
      issues: err.issues
    });
    return;
  }

  if (isHttpError(err)) {
    res.status(err.status).json({
      message: err.message
    });
    return;
  }

  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}
