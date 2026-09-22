import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { seedTestCompanies } from '../../apps/api/src/db/seed.ts';

/** Seeds the two test companies so the suite needs no manual step (TC-9). */
export default async function globalSetup(): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
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
