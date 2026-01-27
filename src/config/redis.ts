import Redis from 'ioredis';
import env from '.';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

export async function setupRedis() {
  try {
    // Test connection
    await redis.ping();
    logger.info('Redis connection test passed');
    return redis;
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    throw error;
  }
}