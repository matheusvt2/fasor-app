import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.ts';

export const migrationsFolder = resolve(import.meta.dirname, 'migrations');

/**
 * Applies every committed migration that has not run yet, in order. Forward-only:
 * there is no down migration (Consistency Conventions > Versioning). Called at api
 * boot so `docker compose up` stays one command.
 */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}
