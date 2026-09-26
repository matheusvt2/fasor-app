import type { FullConfig } from '@playwright/test';
import { seedE2eWorkerPairs } from '../../apps/api/src/db/seed.ts';
import { MIN_WORKER_PAIRS } from './groups.ts';
import { withSeedDb } from './reset-empresa-b.ts';

/**
 * Empties and seeds one pair of companies per worker (E6-Q7), so the suite needs no manual
 * step (TC-9), starts from a known state on a volume that outlives the run (the Home status
 * board counts every relatório of the company), and no two workers ever share a company or
 * a user. The pairs are the ones `workerSeed(parallelIndex)` names, for every index this
 * run can hand out (`config.workers`, the `--workers` override included), and never fewer
 * than `MIN_WORKER_PAIRS`. The reset goes first because it empties the log, and the seed
 * then projects each user back into it as its `user/{id}` create with the seeded
 * registration. The api suite's own two test companies are not touched here.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const pairs = Math.max(config.workers, MIN_WORKER_PAIRS);
  await withSeedDb((db, auth) => seedE2eWorkerPairs(db, auth, pairs));
}
