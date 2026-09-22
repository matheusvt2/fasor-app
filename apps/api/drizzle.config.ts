import { defineConfig } from 'drizzle-kit';

/**
 * Read only by drizzle-kit to generate SQL: `docker compose run --rm tools pnpm db:generate`.
 * Migrations are applied at api boot by `src/db/migrate.ts`, never by drizzle-kit push.
 */

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app',
  },
});
