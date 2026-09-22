import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.ts';

export type SqlClient = ReturnType<typeof createSql>;
export type Database = ReturnType<typeof createDb>;

/**
 * Notices the migrator provokes on every boot by design: its own bookkeeping table and
 * schema are created with IF NOT EXISTS, so Postgres reports "already exists, skipping".
 */
const EXPECTED_NOTICE_CODES = new Set(['42P06', '42P07']);

/** Raw postgres.js client; kept for the `select 1` health probe and for migrations. */
export function createSql(url: string) {
  return postgres(url, {
    max: 5,
    onnotice: (notice) => {
      if (EXPECTED_NOTICE_CODES.has(String(notice.code))) return;
      console.warn(JSON.stringify({ msg: 'postgres notice', notice: notice.message }));
    },
  });
}

/** Drizzle handle over the raw client. */
export function createDb(sql: SqlClient) {
  return drizzle(sql, { schema });
}
