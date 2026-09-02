import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isTest } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * Single pooled connection for the process. postgres-js handles pooling; the
 * pool is deliberately small in test so vitest workers do not exhaust Postgres.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: isTest ? 2 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Disable when fronted by PgBouncer in transaction pooling mode.
  prepare: true,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema, logger: env.LOG_LEVEL === 'trace' });

export type Db = typeof db;
export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export { schema };
