import { AppError } from '../../../common/app_error';

class JobInProgressError extends AppError {
  constructor(jobId: string, details?: Record<string, unknown>) {
    super({
      message: `Job with id ${jobId} is in progress`,
      status: 400,
      code: 'APPLICATION_ERROR',
    });
  }
}

export { JobInProgressError };
