import { resetTestCompanyData, seedAccount } from '../../apps/api/src/db/seed.ts';
import { seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from '../../apps/api/src/db/test-fixtures.ts';
import { SEED_PASSWORD, type SeedAccount } from './merged-fixtures.ts';
import { withSeedDb } from './reset-empresa-b.ts';

/** The relatório the Export specs drive: the small Porto Seguro fixture. */
export const EXPORT_RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;

/**
 * This worker's Empresa B reset, its user seeded again, and the small fixture applied onto
 * it as the server would (Story 4.8 specs). The fixture's ids are fixed and its seed
 * reclaims them from any company, so the specs that call this run in the serial group.
 */
export async function resetEmpresaBWithFixture(b: SeedAccount): Promise<void> {
  await withSeedDb(async (db, auth) => {
    await resetTestCompanyData(db, [b.companyId]);
    await seedAccount(db, auth, b, SEED_PASSWORD, { standardTemplate: false });
    await seedPortoSeguroSmall(db, b.companyId, { responsibleUserId: b.userId });
  });
}
