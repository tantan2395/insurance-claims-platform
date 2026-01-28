import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../models/schema';
import env from '.';
import { logger } from '../utils/logger';

// PostgreSQL connection
const client = postgres(env.DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle instance
export const db = drizzle(client, { schema, logger: env.NODE_ENV === 'development' });

export async function setupDatabase() {
  try {
    // Test connection
    await client`SELECT 1`;
    logger.info('Database connected successfully');
    
    return db;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

export type Database = typeof db;