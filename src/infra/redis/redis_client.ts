import { isNil } from 'lodash';
import { createClient, type RedisClientType } from 'redis';
import { Logger } from '../../common/logger';

let client: RedisClientType;

const getClient = (): RedisClientType => {
  if (isNil(client)) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is not set');
    client = createClient({ url });
    client.on('error', (err) => {
      Logger.error({
        message: 'Redis client error',
        error_message: err?.message,
      });
    });
  }
  return client;
};

const connectRedis = async (): Promise<void> => {
  const redisClient = getClient();
  if (!redisClient.isOpen) await redisClient.connect();
  Logger.info({ message: 'Connected to Redis' });
};

const disconnectRedis = async (): Promise<void> => {
  if (client?.isOpen) await client.quit();
  Logger.info({ message: 'Disconnected from Redis' });
};

export const RedisClient = {
  connectRedis,
  disconnectRedis,
  getClient,
};
