import { createClient, type RedisClientType } from 'redis';
import { Logger } from '../../common/logger';

let client: RedisClientType | null = null;

const buildRedisClient = (): RedisClientType => {
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || '6379');
  const username = process.env.REDIS_USERNAME;
  const password = process.env.REDIS_PASSWORD;
  if (!host) throw new Error('REDIS_HOST is not set');
  if (Number.isNaN(port)) throw new Error('REDIS_PORT is invalid');
  return createClient({
    username,
    password,
    socket: {
      host,
      port,
    },
  });
};

const getClient = (): RedisClientType => {
  if (!client) {
    client = buildRedisClient();
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
  const c = getClient();
  if (!c.isOpen) await c.connect();
  Logger.info({ message: 'Connected to Redis' });
};

const disconnectRedis = async (): Promise<void> => {
  if (client?.isOpen) await client.quit();
  Logger.info({ message: 'Disconnected from Redis' });
};

export const RedisClient = {
  getClient,
  connectRedis,
  disconnectRedis,
};
