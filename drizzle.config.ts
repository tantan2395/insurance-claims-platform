import { defineConfig } from 'drizzle-kit';
import env from './src/config';

export default defineConfig({
  schema: './src/models/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});