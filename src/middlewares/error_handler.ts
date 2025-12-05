import { NextFunction, Request, Response } from 'express';
import { Logger } from '../common/logger';

export function errorHandler(
  err: any,
  request: Request,
  response: Response,
  next: NextFunction,
) {
  Logger.error({
    error_stack: err,
  });
  const status = err.code === 'NOT_FOUND' ? 404 : err.status || 500;
  response.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL',
    },
  });
}
