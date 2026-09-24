import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { resetTestCompanyData, seedUser } from '../../apps/api/src/db/seed.ts';
import { seedPortoSeguroSmall, SMALL_FIXTURE_RELATORIO_ID } from '../../apps/api/src/db/test-fixtures.ts';
import { TEST_SEED } from './merged-fixtures.ts';

/** The relatório the Export specs drive: the small Porto Seguro fixture. */
export const EXPORT_RELATORIO_ID = SMALL_FIXTURE_RELATORIO_ID;

/** Empresa B reset, its user seeded again, and the small fixture applied onto it as the server would (Story 4.8 specs). */
export async function resetEmpresaBWithFixture(): Promise<void> {
  const b = TEST_SEED.companies[1];
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await resetTestCompanyData(db, [b.companyId]);
    await seedUser(
      db,
      createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) }),
      {
        companyId: b.companyId,
        companyName: b.companyName,
        email: b.email,
        password: TEST_SEED.password,
        name: b.name,
        council: b.council,
        registrationNumber: b.registrationNumber,
        userId: b.userId,
      },
    );
    await seedPortoSeguroSmall(db, b.companyId, { responsibleUserId: b.userId });
  } finally {
    await sql.end();
  }
}
