import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.ts';

/**
 * A-3 (review 2026-09-30): connections of the api's pool. The company pull runs five
 * queries at once and the relatório pull four; with five connections one pull could hold
 * the whole pool while a push transaction waited behind it.
 */
export const DB_POOL_MAX = 10;

export function createDb(url: string) {
  // Postgres NOTICEs (for example drizzle's CREATE ... IF NOT EXISTS) are not part of the structured log.
  const sql = postgres(url, { max: DB_POOL_MAX, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export type Db = ReturnType<typeof createDb>['db'];
