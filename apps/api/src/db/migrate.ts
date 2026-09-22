import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';

/**
 * One-shot forward-only migration runner (the `migrate` compose service).
 * `apps/api/drizzle/` is empty today -- an empty migration set is a valid,
 * successful run that exits 0. Later stories add `.sql` files there.
 */

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function run(): Promise<void> {
  const config = loadConfigOrExit();
  const sql = postgres(config.DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder });
    log('migrations applied', { migrations_folder: migrationsFolder });
  } finally {
    await sql.end();
  }
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    logError('migration failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  },
);
