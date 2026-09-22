/**
 * Drizzle schema root.
 *
 * No tables exist yet -- the operation log and its tables land with Story
 * 1.4+. `drizzle.config.ts` points `drizzle-kit` at this file, and
 * `src/db/migrate.ts` runs whatever is under `apps/api/drizzle/` (empty for
 * now) forward-only. An empty schema module is a valid, zero-table state.
 */
export {};
