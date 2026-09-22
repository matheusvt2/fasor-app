import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.ts';

export function createDb(url: string) {
  // Postgres NOTICEs (for example drizzle's CREATE ... IF NOT EXISTS) are not part of the structured log.
  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export type Db = ReturnType<typeof createDb>['db'];
