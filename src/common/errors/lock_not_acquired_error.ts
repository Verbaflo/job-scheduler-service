import { AppError } from '../app_error';

class LockNotAcquiredError extends AppError {
  constructor(lockKey: string, details?: Record<string, unknown>) {
    super({
      message: `Failed to acquire lock for ${lockKey}`,
      status: 409,
      code: 'LOCK_NOT_ACQUIRED',
      details: { lockKey, ...details },
    });
  }
}

export { LockNotAcquiredError };
