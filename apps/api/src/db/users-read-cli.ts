import { uuidV7Schema } from '@app/domain';
import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { readUsers } from './users-read.ts';

/**
 * E18-A2 (2026-10-30): the users behind the `user_id` values of the usage dashboard
 * (`users-read.ts`). Read-only: one SELECT, one JSON line per user (`users read`: company,
 * user id, name, e-mail, sessions, last sign-in) and one closing line with the count
 * (`users read done`). The events themselves never carry a name (AD-28); this output is the
 * administrator's account data, printed to the migrate log group kept 14 days.
 *
 *   --company <id>   one company (a UUIDv7, checked before the database opens); without it,
 *                    every company
 *
 * Exits 0 on a read, 1 on a bad argument or any failure.
 *
 * Locally, against the compose database:
 *
 *   podman compose --profile tools run --rm tools \
 *     pnpm exec tsx apps/api/src/db/users-read-cli.ts [--company <company id>]
 *
 * In production, as a command override on the migrate task (`infra/README.md`, runbook
 * "Map the user ids of the usage dashboard to people"; its output lands in the log group
 * /fasor/production/migrate):
 *
 *   infra/bin/aws ecs run-task --cluster fasor-production --launch-type EC2 \
 *     --task-definition fasor-production-migrate --overrides \
 *     '{"containerOverrides":[{"name":"migrate","command":["./node_modules/.bin/tsx","src/db/users-read-cli.ts"]}]}'
 */

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv: readonly string[]): { companyId: string | undefined } {
  let companyId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag !== '--company') throw new UsageError(`unknown argument ${JSON.stringify(flag)}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    i++;
    if (companyId !== undefined) throw new UsageError('--company given twice');
    if (!uuidV7Schema.safeParse(value).success) throw new UsageError(`--company must be a uuidv7, got ${JSON.stringify(value)}`);
    companyId = value;
  }
  return { companyId };
}

async function run(): Promise<void> {
  // Before the configuration and the database: a bad argument opens nothing.
  const { companyId } = parseArgs(process.argv.slice(2));
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const rows = await readUsers(db, companyId);
    for (const row of rows) log('users read', { ...row });
    log('users read done', { users: rows.length, ...(companyId === undefined ? {} : { company_id: companyId }) });
  } finally {
    await sql.end();
  }
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) logError(`refused: ${message}`, {});
    else logError('users read failed', { error: message });
    process.exit(1);
  },
);
