import { fileURLToPath } from 'node:url';
import { migrate as runMigrations } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Forward-only migrations from `apps/api/drizzle`, run at boot before the queue starts. */
export async function migrate(db: Db): Promise<void> {
  await runMigrations(db, { migrationsFolder });
}
