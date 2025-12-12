import { AppError } from '../../../common/app_error';

class JobNotFoundError extends AppError {
  constructor(jobId: string, details?: Record<string, unknown>) {
    super({
      message: `Job with id ${jobId} not found`,
      status: 404,
      code: 'APPLICATION_ERROR',
    });
  }
}

export { JobNotFoundError };
