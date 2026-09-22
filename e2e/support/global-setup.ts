import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { resetTestCompanyData, seedTestCompanies } from '../../apps/api/src/db/seed.ts';

/**
 * Empties the two test companies' data and seeds them, so the suite needs no manual step
 * (TC-9) and starts from a known state on a volume that outlives the run: the Home status
 * board counts every relatório of the company. The reset goes first because it empties
 * the log, and the seed then projects each user back into it as its `user/{id}` create
 * with the seeded registration.
 */
export default async function globalSetup(): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await resetTestCompanyData(db);
    await seedTestCompanies(
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
