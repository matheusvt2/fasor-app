import type { FullConfig } from '@playwright/test';
import { seedE2eWorkerPairs } from '../../apps/api/src/db/seed.ts';
import { assertWorkersAllowed, MIN_WORKER_PAIRS, readGroup } from './groups.ts';
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
 *
 * Before any of that, a run that asks for more workers than its group allows is refused
 * (chore T3, 2026-11-09): the `queue` lane on more than `QUEUE_WORKERS`, the `solo` lane or a
 * run without `E2E_GROUP` (which holds every serial spec) on more than one. So `--workers=N`
 * can never put a `queue` spec beside more than its lane's workers, or a `solo` spec beside
 * any other worker.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  assertWorkersAllowed(readGroup(process.env.E2E_GROUP), config.workers);
  const pairs = Math.max(config.workers, MIN_WORKER_PAIRS);
  await withSeedDb((db, auth) => seedE2eWorkerPairs(db, auth, pairs));
}
