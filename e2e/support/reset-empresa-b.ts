import { STANDARD_TEMPLATE_NAME } from '@app/domain';
import { createAuth } from '../../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb, type Db } from '../../apps/api/src/db/client.ts';
import { resetTestCompanyData, seedAccount } from '../../apps/api/src/db/seed.ts';
import { SEED_PASSWORD, timed, type SeedAccount } from './merged-fixtures.ts';

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

/** How many times `resetEmpresaB` empties the company before it reports the stray write. */
const RESET_ATTEMPTS = 3;

/** The live template names of a company, as the reset leaves them. */
async function liveTemplateNames(db: Db, companyId: string): Promise<string[]> {
  const rows = await db.query.entities.findMany({
    columns: { row: true },
    where: (t, { and, eq, isNull }) => and(eq(t.company_id, companyId), eq(t.entity, 'template'), isNull(t.removed_at)),
  });
  return rows.map(({ row }) => String((row as { name?: unknown }).name));
}

/**
 * Empties this worker's Empresa B (`seed.companies[1]`; the test-company reset refuses any
 * company that is not a test or e2e-worker one), seeds its user again and, when asked, the
 * standard template, so a spec that writes is re-runnable on its own. Safe mid-run because
 * the company belongs to this worker alone (E6-Q7) and no later spec needs data it held
 * before.
 *
 * The company is this worker's alone, but not this test's alone: the previous test on the
 * same worker can still have a push in flight when its page closes (a reload's launch cycle
 * pushes the outbox), and the server applies it whenever it gets to it. One that lands
 * between the reset and the seed leaves a template the seed then takes for the standard one
 * (`seedStandardTemplate` counts any live template with a `seed_version`, and "Novo template"
 * has one), so the company ends without it (wave-1 gate, 2026-10-08: 3.4-E2E-003 found only
 * "Novo template", 3.4-E2E-001's). So the reset checks that the company holds exactly the
 * templates it seeded, and empties it again when it does not.
 */
export function resetEmpresaB(b: SeedAccount, { standard = false }: { standard?: boolean } = {}): Promise<void> {
  const expected = standard ? [STANDARD_TEMPLATE_NAME] : [];
  return timed('resetEmpresaB', () =>
    withSeedDb(async (db, auth) => {
      for (let attempt = 1; ; attempt += 1) {
        await resetTestCompanyData(db, [b.companyId]);
        await seedAccount(db, auth, b, SEED_PASSWORD, { standardTemplate: standard });
        const names = await liveTemplateNames(db, b.companyId);
        if (names.length === expected.length && names.every((name, i) => name === expected[i])) return;
        if (attempt === RESET_ATTEMPTS) {
          throw new Error(
            `resetEmpresaB: after ${RESET_ATTEMPTS} resets Empresa B holds the templates ${JSON.stringify(names)}, not ${JSON.stringify(expected)}: something keeps writing into it`,
          );
        }
        // Let the rest of a stray push land before emptying the company again.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }),
  );
}
