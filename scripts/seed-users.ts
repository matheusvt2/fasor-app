import { pathToFileURL } from 'node:url';
import { councilSchema, uuidV7Schema, type NewId } from '@app/domain';
import { parseTrustedOrigins } from '../apps/api/src/auth/trusted-origins.ts';
import { createAuth } from '../apps/api/src/auth/auth.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { migrate } from '../apps/api/src/db/migrate.ts';
import { seedTestCompanies, seedUser, TEST_SEED } from '../apps/api/src/db/seed.ts';
import { newId } from '../apps/api/src/ids.ts';
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
 *     --company-id 019966b0-5b6d-7e7f-9a0b-1c2d3e4f5a6b --company "Acme Engenharia" --email a@acme.com \
 *     --password "..." --name "Ana Alves" --council crea --number "SP 1234" [--title "..."]
 *
 * The company id is a uuidv7 (AD-4): every op carries it, and the op schema accepts no
 * other shape, so a company provisioned under a v4 id could never sync. Leave
 * `--company-id` out for a new company and the CLI mints one and prints it, to pass with
 * the company's next users; a supplied id that is not a uuidv7 is refused before the
 * database is touched, with a freshly minted example. User ids are always minted here
 * (uuidv7), never typed.
 *
 * The registration flags (`--council`, `--number`, `--title`) seed a new user's initial
 * values only. Re-running for an existing e-mail resets the password and updates the name,
 * never the registration: from then on it belongs to the user, who edits it in Account.
 */

const USAGE = `usage:
  seed-users --test
  seed-users [--company-id <uuidv7>] --company <name> --email <email> --password <password> \\
             --name <full name> --council <crea|crt> --number <registration number> [--title <printed title>]
  (the registration flags set a new user's initial values; a re-run resets the password and the name only)`;

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

/**
 * The `--company-id` value, or an error naming the rule and showing a v7 example. Runs
 * before the database is opened, so a refused id writes nothing.
 */
export function validateCompanyId(value: string, mint: NewId = newId): string {
  const trimmed = value.trim();
  if (uuidV7Schema.safeParse(trimmed).success) return trimmed;
  throw new Error(
    `--company-id must be a uuidv7 (AD-4), got "${value}". A uuid v4 or any other shape can never sync.\n` +
      `For a new company use a fresh one, for example: --company-id ${mint()}`,
  );
}

/**
 * The company id of a non-test run: the supplied one, validated, or a freshly minted
 * uuidv7 when `--company-id` is left out (a new company). `minted` says which.
 */
export function resolveCompanyId(
  args: Record<string, string | true>,
  mint: NewId = newId,
): { companyId: string; minted: boolean } {
  if (args['company-id'] === undefined) return { companyId: mint(), minted: true };
  return { companyId: validateCompanyId(required(args, 'company-id'), mint), minted: false };
}

async function main(): Promise<void> {
  try {
    assertInCompose(process.env, undefined, 'pnpm exec tsx scripts/seed-users.ts --test');
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  // Checked before the database is opened: a refused company id writes nothing.
  const company = args.test === true ? null : resolveCompanyId(args);
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await migrate(db);
    const auth = createAuth({
      db,
      secret: config.SESSION_SECRET,
      baseURL: config.AUTH_BASE_URL,
      trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
    });

    if (company === null) {
      const results = await seedTestCompanies(db, auth);
      for (const result of results) {
        console.log(
          `seeded ${result.email} as user ${result.userId} in company ${result.companyId} (password ${TEST_SEED.password})`,
        );
      }
      return;
    }

    const title = args.title;
    const result = await seedUser(db, auth, {
      companyId: company.companyId,
      companyName: required(args, 'company'),
      email: required(args, 'email'),
      password: required(args, 'password'),
      name: required(args, 'name'),
      council: councilSchema.parse(required(args, 'council')),
      registrationNumber: required(args, 'number'),
      title: typeof title === 'string' ? title : undefined,
    });
    console.log(`seeded ${result.email} as user ${result.userId} in company ${result.companyId}`);
    if (company.minted) {
      console.log(`new company id ${result.companyId}: pass --company-id ${result.companyId} to add its next users`);
    }
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
