import { isAxiosError } from 'axios';
import { AppError } from './app_error';
import { Logger } from './logger';

const MAX_BACKOFF_CAP_MS = 2000;

const MONGO_ERROR_NAMES = [
  'MongoNetworkError',
  'MongoServerError',
  'MongoTimeoutError',
  'MongoNetworkTimeoutError',
  'MongoWriteConcernError',
];

const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
];

const REDIS_ERROR_PATTERNS = [
  'Redis connection',
  'NOAUTH',
  'LOADING',
  'READONLY',
  'CLUSTERDOWN',
];

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxJitterMs: number;
  operationName: string;
  context?: Record<string, string>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const calculateBackoffDelay = (
  attempt: number,
  baseDelayMs: number,
  maxJitterMs: number,
): number => {
  const baseDelay = Math.min(baseDelayMs * 2 ** attempt, MAX_BACKOFF_CAP_MS);
  const jitter = Math.floor(Math.random() * maxJitterMs);
  return baseDelay + jitter;
};

const isMongoError = (name: string): boolean => {
  return MONGO_ERROR_NAMES.includes(name);
};

const isNetworkError = (code: string, message: string): boolean => {
  if (NETWORK_ERROR_CODES.includes(code)) return true;
  return NETWORK_ERROR_CODES.slice(0, 3).some((c) => message.includes(c));
};

const isRedisError = (message: string): boolean => {
  return REDIS_ERROR_PATTERNS.some((p) => message.includes(p));
};

const isSqsError = (name: string): boolean => {
  return name.includes('ServiceException') || name.includes('SQS');
};

const isRetryableError = (err: unknown): boolean => {
  if (err instanceof AppError) return false;
  if (isAxiosError(err)) return false;
  if (err instanceof Error) {
    const name = err.name || '';
    const message = err.message || '';
    const code = (err as any).code || '';
    return (
      isMongoError(name) ||
      isNetworkError(code, message) ||
      isRedisError(message) ||
      isSqsError(name)
    );
  }
  return false;
};

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const { maxRetries, baseDelayMs, maxJitterMs, operationName, context } =
    options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isRetryableError(err)) {
        throw err;
      }
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt, baseDelayMs, maxJitterMs);
        Logger.warning({
          message: `${operationName} retrying after infrastructure error`,
          key1: 'attempt',
          key1_value: String(attempt + 1),
          key2: 'delayMs',
          key2_value: String(delay),
          key3: 'context',
          key3_value: context ? JSON.stringify(context) : undefined,
          error_message: errorMessage,
        });
        await sleep(delay);
      }
    }
  }
  const finalErrorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  Logger.error({
    message: `${operationName} failed after exhausting all retries`,
    key1: 'maxRetries',
    key1_value: String(maxRetries),
    key2: 'context',
    key2_value: context ? JSON.stringify(context) : undefined,
    error_message: finalErrorMessage,
    error_stack: lastError instanceof Error ? lastError.stack : undefined,
  });
  throw lastError;
};

export {
  RetryOptions,
  calculateBackoffDelay,
  isRetryableError,
  retryWithBackoff,
  sleep,
};
