import { resetTestCompanyData, seedAccount } from '../../apps/api/src/db/seed.ts';
import { seedPortoSeguroSmall, smallFixtureCopy, type SmallFixtureCopy } from '../../apps/api/src/db/test-fixtures.ts';
import { SEED_PASSWORD, timed, type SeedAccount } from './merged-fixtures.ts';
import { withSeedDb } from './reset-empresa-b.ts';

export type { SmallFixtureCopy } from '../../apps/api/src/db/test-fixtures.ts';

/**
 * This worker's Empresa B reset, its user seeded again, and its own copy of the small fixture
 * applied onto it as the server would (Story 4.8 specs). Chore T3 (2026-11-09): the copy's ids
 * are derived from the company (`smallFixtureCopy`), so two workers of the `queue` lane can
 * each hold their copy at once; a spec takes every fixture id (relatório, block, cabine,
 * equipment) from the copy this returns, never from the fixture's own constants.
 */
export function resetEmpresaBWithFixture(b: SeedAccount): Promise<SmallFixtureCopy> {
  return timed('resetEmpresaBWithFixture', () =>
    withSeedDb(async (db, auth) => {
      await resetTestCompanyData(db, [b.companyId]);
      await seedAccount(db, auth, b, SEED_PASSWORD, { standardTemplate: false });
      await seedPortoSeguroSmall(db, b.companyId, { responsibleUserId: b.userId, copy: true });
      return smallFixtureCopy(b.companyId);
    }),
  );
}
