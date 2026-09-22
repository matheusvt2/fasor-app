import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb, createSql } from '../../apps/api/src/db/client.ts';
import { seedTestCompanies } from '../../apps/api/src/db/seed.ts';

/** Seeds the two test companies so the suite needs no manual step (TC-9). */
export default async function globalSetup(): Promise<void> {
  const config = loadConfig();
  const sql = createSql(config.DATABASE_URL);
  const db = createDb(sql);
  try {
    await seedTestCompanies(
      db,
      createAuth({
        db,
        secret: config.SESSION_SECRET,
        trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
      }),
    );
  } finally {
    await sql.end();
  }
}
