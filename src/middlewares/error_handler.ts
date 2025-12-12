import { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/app_error';
import { Logger } from '../common/logger';

const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const appErr: AppError =
    err instanceof AppError
      ? err
      : new AppError({ message: err?.message || 'Internal Server Error' });
  Logger.error({
    message: 'Request failed',
    error_stack: err?.stack,
    status_code: appErr.status,
  });
  res.status(appErr.status).json({
    error: {
      message: appErr.message,
      code: appErr.code,
      details: appErr.details,
    },
  });
};

export { errorHandler };
