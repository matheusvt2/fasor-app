import { describeE2eLeaks, findE2eLeaks, type E2eLeak } from '../../apps/api/src/db/e2e-leak-check.ts';

/**
 * E6-Q7 leak check: after every run, nothing a worker's user wrote may sit outside that
 * worker's own pair of companies (another worker's, an api-suite test company, any other). A leak
 * fails the run with the offending rows.
 */
export async function assertNoLeaks(find: () => Promise<E2eLeak[]>): Promise<void> {
  const leaks = await find();
  if (leaks.length > 0) throw new Error(describeE2eLeaks(leaks));
}

export default async function globalTeardown(): Promise<void> {
  // Loaded here, so importing this module (the tooling test does) opens no database.
  const { withSeedDb } = await import('./reset-empresa-b.ts');
  await assertNoLeaks(() => withSeedDb((db) => findE2eLeaks(db)));
}
