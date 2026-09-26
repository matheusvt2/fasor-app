/**
 * E6-Q7: the two groups the e2e suite runs in. `scripts/e2e.ts` (behind `test:e2e`,
 * `test:e2e:full` and `test:e2e:matrix`) runs the parallel group, then the serial group,
 * as two Playwright runs one after the other, so no serial spec ever runs beside a
 * parallel worker; both always run and the command fails when either failed.
 *
 * The parallel group runs on `PARALLEL_WORKERS` workers, each on its own pair of
 * companies (`apps/api/src/db/e2e-worker-seed.ts`). The serial group runs on one worker:
 * the specs below share something no per-worker pair can separate. Each entry says why.
 */
export const SERIAL_SPECS: readonly { file: string; why: string }[] = [
  {
    file: 'export.spec.ts',
    why:
      'generates documents through the one pg-boss queue and the one LibreOffice of the api, and loads the small Porto Seguro fixture, whose ids are fixed and whose seed reclaims them from every company',
  },
  {
    file: 'export-visual.spec.ts',
    why: 'loads the same fixed-id Porto Seguro fixture and generates a revision through the shared queue and LibreOffice',
  },
];

/** The group a Playwright run is in: set by `scripts/e2e.ts`; absent for a bare `playwright test`. */
export type E2eGroup = 'parallel' | 'serial';

/**
 * The default worker count of the parallel group; `--workers=N` on the command line overrides it.
 *
 * One, not three (2026-09-26, validation rule (d) of `spec-e2e-parallel-workers.md`): three
 * `test:e2e:full` runs on one worker all passed, and one of three runs on three workers
 * failed 12.3-E2E-004 (a tap's effect late under load) with the same 195 tests executed.
 * The api's `POST /api/sync/ops` slows sharply when pushes of several workers overlap, so
 * a test that passes serially can fail in parallel; the gate stays on one worker until
 * that is fixed. `--workers=3` runs the isolated per-worker pairs in parallel on demand.
 *
 * Still one (2026-09-26, `spec-epic-8-carry-over.md`): a push is now one transaction and no
 * overlapping push took over 3 s, but each of three `test:e2e:full` runs on three workers
 * still failed one test the three serial runs passed (12.3-E2E-004 twice, a reading's
 * commit late on the device; 6.2-E2E-001 once, a retried upload past 60 s); both pass alone.
 */
export const PARALLEL_WORKERS = 1;

/** The fewest worker pairs the global setup seeds, whatever the worker count. */
export const MIN_WORKER_PAIRS = 3;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches the path of every serial-group spec (by file name, under `e2e/`). */
export const SERIAL_SPEC_PATTERN = new RegExp(`(^|[\\\\/])(${SERIAL_SPECS.map((spec) => escape(spec.file)).join('|')})$`);

export function readGroup(value: string | undefined): E2eGroup | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'parallel' || value === 'serial') return value;
  throw new Error(`E2E_GROUP must be "parallel" or "serial", got "${value}"`);
}

/** Matches the path of every spec that is not in the serial group. */
export const NON_SERIAL_SPEC_PATTERN = new RegExp(`^(?!.*[\\\\/](${SERIAL_SPECS.map((spec) => escape(spec.file)).join('|')})$)`);

/**
 * Refuses a run that would put the serial specs beside another worker: outside the
 * parallel group (a bare `playwright test`, or `E2E_GROUP=serial`) the run must have one
 * worker. The global setup calls it before anything is seeded.
 */
export function assertWorkersAllowed(group: E2eGroup | undefined, workers: number): void {
  if (group === 'parallel' || workers <= 1) return;
  const where = group === undefined ? 'a run without E2E_GROUP' : 'the serial group';
  throw new Error(
    `${where} holds the serial specs (${SERIAL_SPECS.map((spec) => spec.file).join(', ')}) and must run on one worker, got ${workers}. ` +
      'Run the suite with pnpm test:e2e, test:e2e:full or test:e2e:matrix, which run the parallel group and then the serial group.',
  );
}
