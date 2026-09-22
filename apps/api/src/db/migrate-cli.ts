import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { migrate, migrationsFolder } from './migrate.ts';

/**
 * One-shot forward-only migration runner (the `migrate` compose service, `prod`
 * profile). Exits 0 once every migration under `apps/api/drizzle/` is applied.
 */
async function run(): Promise<void> {
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await migrate(db);
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
