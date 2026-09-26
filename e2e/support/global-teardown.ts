import { describeE2eLeaks, findE2eLeaks } from '../../apps/api/src/db/e2e-leak-check.ts';
import { withSeedDb } from './reset-empresa-b.ts';

/**
 * E6-Q7 leak check: after every run, nothing a worker's user wrote may sit outside that
 * worker's own pair of companies (another worker's, an api-suite test company, any other). A leak
 * fails the run with the offending rows.
 */
export default async function globalTeardown(): Promise<void> {
  const leaks = await withSeedDb((db) => findE2eLeaks(db));
  if (leaks.length > 0) throw new Error(describeE2eLeaks(leaks));
}
