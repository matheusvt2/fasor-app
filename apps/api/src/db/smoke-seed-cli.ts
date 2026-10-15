import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { readSmokeSeedEnv, resetAndSeedSmokeCompany, SmokeSeedRefused } from './smoke-seed.ts';

/**
 * Story 14.10 part 6: the one-shot `smoke-seed` task of the production smoke
 * (`infra/production/smoke.tf`, run by `infra/bin/deploy` before and after the suite under
 * `e2e/production/`). Reads `SMOKE_COMPANY_ID`, `SMOKE_COMPANY_NAME`, `SMOKE_USER_EMAIL`,
 * `SMOKE_USER_NAME` and `SMOKE_USER_PASSWORD` (the last from the task definition's `secrets`,
 * never a command argument or an override), checks them before the database is opened, then
 * empties the smoke company and seeds it again (`smoke-seed.ts`). Logs the ids, never the
 * password. Exits 0 when seeded, 1 on a refused input or company, or any failure.
 *
 * Locally, against the compose database:
 *
 *   docker compose --profile tools run --rm -e SMOKE_COMPANY_ID=<uuidv7> -e SMOKE_COMPANY_NAME=... \
 *     -e SMOKE_USER_EMAIL=... -e SMOKE_USER_NAME=... -e SMOKE_USER_PASSWORD tools \
 *     pnpm exec tsx apps/api/src/db/smoke-seed-cli.ts
 */
async function run(): Promise<void> {
  // Before the configuration and the database: a refused input writes nothing.
  const input = readSmokeSeedEnv(process.env);
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const auth = createAuth({
      db,
      secret: config.SESSION_SECRET,
      baseURL: config.AUTH_BASE_URL,
      trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
    });
    const result = await resetAndSeedSmokeCompany(db, auth, input);
    log('smoke company reset and seeded', {
      company_id: result.companyId,
      relatorio_id: result.relatorioId,
      user_id: result.userId,
      email: result.email,
      template_id: result.templateId,
      removed: result.removed,
    });
  } finally {
    await sql.end();
  }
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logError(error instanceof SmokeSeedRefused ? message : 'smoke seed failed', error instanceof SmokeSeedRefused ? {} : { error: message });
    process.exit(1);
  },
);
