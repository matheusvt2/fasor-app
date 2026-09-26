import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb, type Db } from '../../apps/api/src/db/client.ts';
import { resetTestCompanyData, seedAccount } from '../../apps/api/src/db/seed.ts';
import { SEED_PASSWORD, type SeedAccount } from './merged-fixtures.ts';

/**
 * Opens the compose Postgres, runs `work` with a database and an auth instance, and closes
 * the connection whatever happens.
 */
export async function withSeedDb<T>(work: (db: Db, auth: ReturnType<typeof createAuth>) => Promise<T>): Promise<T> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    return await work(
      db,
      createAuth({
        db,
        secret: config.SESSION_SECRET,
        baseURL: config.AUTH_BASE_URL,
        trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
      }),
    );
  } finally {
    await sql.end();
  }
}

/**
 * Empties this worker's Empresa B (`seed.companies[1]`; the test-company reset refuses any
 * company that is not a test or e2e-worker one), seeds its user again and, when asked, the
 * standard template, so a spec that writes is re-runnable on its own. Safe mid-run because
 * the company belongs to this worker alone (E6-Q7) and no later spec needs data it held
 * before.
 */
export async function resetEmpresaB(b: SeedAccount, { standard = false }: { standard?: boolean } = {}): Promise<void> {
  await withSeedDb(async (db, auth) => {
    await resetTestCompanyData(db, [b.companyId]);
    await seedAccount(db, auth, b, SEED_PASSWORD, { standardTemplate: standard });
  });
}
