import { RedisClient } from './redis_client';
import { RedisSetKeyInput } from './types';

const getValue = async (key: string): Promise<any> => {
  return RedisClient.getClient().get(key);
};

const setValue = async (input: RedisSetKeyInput): Promise<boolean> => {
  const { key, value, ttlInSeconds, nx = false } = input;
  const client = RedisClient.getClient();
  const result = await client.set(key, value, {
    ...(nx ? { NX: true } : {}),
    ...{ EX: ttlInSeconds },
  });
  return result === 'OK';
};

const deleteKey = async (key: string): Promise<boolean> => {
  const deletedCount = await RedisClient.getClient().del(key);
  return deletedCount > 0;
};

export const RedisService = {
  getValue,
  setValue,
  deleteKey,
};
