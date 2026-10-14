import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { migrate, migrationsFolder } from './migrate.ts';
import { upgradeTemplateSeeds } from './template-seed-upgrade.ts';

/**
 * One-shot forward-only migration runner (the `migrate` compose service, `prod`
 * profile). Exits 0 once every migration under `apps/api/drizzle/` is applied and the
 * templates were moved to the current seed version (`upgradeTemplateSeeds`, Story 14.3).
 */
async function run(): Promise<void> {
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await migrate(db);
    log('migrations applied', { migrations_folder: migrationsFolder });
    // Story 14.3 (AD-21): the data step that follows the migrations, as at the api's boot.
    log('template seeds upgraded', { moved: await upgradeTemplateSeeds(db) });
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
