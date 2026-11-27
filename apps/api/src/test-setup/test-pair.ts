/*
 * Chore T4 (2026-11-26): the setup file of the api suite's parallel lane (`apps/api/vitest.config.ts`,
 * project `api`). It runs in each worker before the test file is imported, and names the worker's
 * test pair after Vitest's worker slot (`VITEST_POOL_ID`, 1 to the lane's worker count): slot `k`
 * gets pair `k + 1`, so `TEST_SEED` (`db/test-seed.ts`) is that worker's own two companies. No two
 * files running at once share a company, a user or a session, and no parallel worker uses the fixed
 * pair (pair 1), which the `api-serial`, `api-print` and `api-solo` lanes use beside and after it.
 * A process a test spawns inherits the variable and so seeds the same pair.
 *
 * It imports nothing: `db/test-seed.ts` computes `TEST_SEED` when first imported, and an import
 * here would evaluate it (and cache it for the test file) before the variable is set. The name
 * is `TEST_PAIR_ENV` of that module, which `scripts/api-suite.test.ts` pins.
 */
const slot = Number(process.env.VITEST_POOL_ID);
if (!Number.isInteger(slot) || slot < 1) throw new Error('VITEST_POOL_ID is unset: this setup file runs only inside a Vitest worker');
process.env.API_TEST_PAIR = String(slot + 1);
