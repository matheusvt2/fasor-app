import { defineConfig } from 'drizzle-kit';

/**
 * Only drizzle-kit reads this file, and only to generate SQL:
 * `docker compose run --rm tools pnpm db:generate`. Migrations are applied at api
 * boot by `src/db/migrate.ts`, never by drizzle-kit push.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
