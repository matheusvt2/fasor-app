import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // F-GATE-1: apps/api had no vitest config at all, so its `*.integration.test.ts` suite
    // ran at vitest's 5 s default. Those tests do real Postgres round trips and flaked under
    // load the same way the root and web projects did; 15 s gives headroom without masking a
    // real hang. Mirrors vitest.config.ts (root) and apps/web/vite.config.ts.
    testTimeout: 15_000,
    // `apps/api/src/db/seed.ts`'s own doc comment on `resetTestCompanyData` warns it must
    // never run while other `*.integration.test.ts` files are seeding the same TEST_SEED
    // companies in their own `beforeAll`, "since a reset there would wipe rows a neighbouring
    // file had just written." The new `test-reset.integration.test.ts` (A6, F-DUP-3) calls it
    // directly from inside this same suite, so file-level parallelism has to be off here, or
    // that exact race becomes live. The whole suite runs in under 10s, so serializing costs
    // nothing against the 15-minute gate budget.
    fileParallelism: false,
  },
});
