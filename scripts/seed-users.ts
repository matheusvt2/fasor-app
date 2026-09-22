import { pathToFileURL } from 'node:url';
import { councilSchema } from '@app/domain';
import { parseTrustedOrigins } from '../apps/api/src/auth/trusted-origins.ts';
import { createAuth } from '../apps/api/src/auth/auth.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb, createSql } from '../apps/api/src/db/client.ts';
import { runMigrations } from '../apps/api/src/db/migrate.ts';
import { seedTestCompanies, seedUser, TEST_SEED } from '../apps/api/src/db/seed.ts';
import { assertInCompose } from './test-reset.ts';

/**
 * Provisions users. There is no signup route and no outbound e-mail (FR-6), so this CLI
 * is how an account is created and how a password is reset. Runs only inside
 * docker-compose, like `test-reset.ts`.
 *
 * The node image's entrypoint turns a bare `tsx` into `node tsx`, so the command goes
 * through pnpm:
 *
 *   docker compose run --rm tools pnpm exec tsx scripts/seed-users.ts --test
 *   docker compose run --rm tools pnpm exec tsx scripts/seed-users.ts \
 *     --company-id acme --company "Acme Engenharia" --email a@acme.com \
 *     --password "..." --name "Ana Alves" --council crea --number "SP 1234" [--title "..."]
 */

const USAGE = `usage:
  seed-users --test
  seed-users --company-id <id> --company <name> --email <email> --password <password> \\
             --name <full name> --council <crea|crt> --number <registration number> [--title <printed title>]`;

export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined || !token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function required(args: Record<string, string | true>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`missing --${key}\n${USAGE}`);
  }
  return value;
}

async function main(): Promise<void> {
  try {
    assertInCompose(process.env, undefined, 'pnpm exec tsx scripts/seed-users.ts --test');
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const sql = createSql(config.DATABASE_URL);
  const db = createDb(sql);
  try {
    await runMigrations(db);
    const auth = createAuth({
      db,
      secret: config.SESSION_SECRET,
      trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
    });

    if (args.test === true) {
      const results = await seedTestCompanies(db, auth);
      for (const result of results) {
        console.log(
          `seeded ${result.email} in company ${result.companyId} (password ${TEST_SEED.password})`,
        );
      }
      return;
    }

    const title = args.title;
    const result = await seedUser(db, auth, {
      companyId: required(args, 'company-id'),
      companyName: required(args, 'company'),
      email: required(args, 'email'),
      password: required(args, 'password'),
      name: required(args, 'name'),
      council: councilSchema.parse(required(args, 'council')),
      registrationNumber: required(args, 'number'),
      title: typeof title === 'string' ? title : undefined,
    });
    console.log(`seeded ${result.email} in company ${result.companyId}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
