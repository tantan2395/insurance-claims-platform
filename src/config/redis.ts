import Redis from 'ioredis';
import env from '.';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ workers
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
  enableReadyCheck: false, // Recommended for BullMQ
  maxLoadingRetryTime: 10000,
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('ready', () => {
  logger.info('Redis is ready');
});

redis.on('reconnecting', () => {
  logger.warn('Redis is reconnecting');
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