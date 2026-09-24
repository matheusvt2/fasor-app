import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { asCompanyId } from '../../apps/api/src/db/repositories/company-id.ts';
import { resetTestCompanyData, seedStandardTemplate, seedUser } from '../../apps/api/src/db/seed.ts';
import { TEST_SEED } from './merged-fixtures.ts';

/**
 * Empties Empresa B (the test-company reset, only ever Empresa B), seeds its user again and,
 * when asked, the standard template, so a spec that writes is re-runnable on its own. Safe
 * mid-run only because the suite runs with `workers: 1` and no later spec needs data
 * Empresa B held before.
 */
export async function resetEmpresaB({ standard = false }: { standard?: boolean } = {}): Promise<void> {
  const b = TEST_SEED.companies[1];
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await resetTestCompanyData(db, [b.companyId]);
    await seedUser(
      db,
      createAuth({
        db,
        secret: config.SESSION_SECRET,
        baseURL: config.AUTH_BASE_URL,
        trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
      }),
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
    if (standard) await seedStandardTemplate(db, asCompanyId(b.companyId));
  } finally {
    await sql.end();
  }
}
