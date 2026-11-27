import { configDefaults, defineConfig } from 'vitest/config';
import { PARALLEL_SETUP_FILE, PARALLEL_WORKERS, PRINT_FILES, SERIAL_FILES, SOLO_FILES } from './src/test-lanes.ts';

const serial = SERIAL_FILES.map((entry) => entry.file);
const print = PRINT_FILES.map((entry) => entry.file);
const solo = SOLO_FILES.map((entry) => entry.file);
/** `API_PARALLEL_WORKERS=N` sizes the parallel lane for one run (measurements, a loaded machine); unset, PARALLEL_WORKERS. */
const parallelWorkers = Number(process.env.API_PARALLEL_WORKERS) || PARALLEL_WORKERS;

export default defineConfig({
  test: {
    // F-GATE-1: apps/api had no vitest config at all, so its `*.integration.test.ts` suite
    // ran at vitest's 5 s default. Those tests do real Postgres round trips and flaked under
    // load the same way the root and web projects did; 15 s gives headroom without masking a
    // real hang. Mirrors vitest.config.ts (root) and apps/web/vite.config.ts.
    testTimeout: 15_000,
    // Chore T4 (2026-11-26): the suite used to run one file at a time (`fileParallelism: false`),
    // because the files shared the two TEST_SEED companies and `resetTestCompanyData` or a re-seed
    // in one file wiped rows or revoked sessions another file was using. It had grown to 678 s
    // (166 files, gate of batch e31d). It now runs in four lanes (`src/test-lanes.ts`), started by
    // `scripts/api-suite.ts`: first `api-solo` alone; then `api` on PARALLEL_WORKERS workers, each
    // worker on its own TEST_SEED pair (the setup file below), so a reset or a re-seed in one worker
    // never reaches another's companies, and beside it, in a second Vitest run, `api-serial` then
    // `api-print`, one file at a time on the fixed pair, for the files that share the api's document
    // queue or a fixed-id fixture. The group orders keep the lanes apart when one Vitest run is given
    // several of them (a plain `vitest run`, or `--project api-serial --project api-print`).
    // TST-V1 (review 2026-10-08): a focused `it.only` fails the run (Vitest allows it
    // outside CI by default).
    allowOnly: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...serial, ...print, ...solo],
          setupFiles: [PARALLEL_SETUP_FILE],
          maxWorkers: parallelWorkers,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'api-serial',
          include: serial,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'api-print',
          include: print,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
      {
        extends: true,
        test: {
          name: 'api-solo',
          include: solo,
          fileParallelism: false,
          sequence: { groupOrder: 3 },
        },
      },
    ],
  },
});
