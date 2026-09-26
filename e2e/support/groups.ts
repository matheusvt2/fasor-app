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

/** The default worker count of the parallel group; `--workers=N` on the command line overrides it. */
export const PARALLEL_WORKERS = 3;

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
