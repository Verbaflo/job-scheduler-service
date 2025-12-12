import { RedisService } from '../infra';
import { LockNotAcquiredError } from './errors/lock_not_acquired_error';
import { Logger } from './logger';

const acquireLock = async (key: string, ttlInSeconds: number) => {
  const result = await RedisService.setValue({
    key,
    value: "true",
    ttlInSeconds,
    nx: true,
  });
  if (!result) {
    throw new LockNotAcquiredError(key);
  }
  Logger.info({
    message: 'successfully acquired lock',
    key1: 'lock_key',
    key1_value: key,
    num_key1: 'ttlInSeconds',
    num_key1_value: ttlInSeconds,
  });
};

const releaseLock = async (key: string) => {
  await RedisService.deleteKey(key);
};

export const LockUtils = { acquireLock, releaseLock };
