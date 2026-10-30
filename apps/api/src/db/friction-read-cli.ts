import { uuidV7Schema } from '@app/domain';
import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { readFriction, totalsOf } from './friction-read.ts';

/**
 * Story 18.3: the op-log friction read of one company (`friction-read.ts`). Read-only: it runs
 * SELECTs and prints JSON lines carrying ids, closed keys and numbers only, never an op value,
 * a caption, a name, a TAG, a local or an atividade:
 *
 *   friction sheet      one per live block of a live relatório (span, device ops, re-edits,
 *                       cells typed after a failed display reading)
 *   friction relatorio  one per live relatório (its status and the totals of its sheets)
 *   friction company    one, the totals of the company
 *
 * The id is checked as UUIDv7 before the database opens. Exits 0 on a read, 1 on a bad
 * argument or any failure.
 *
 * Locally, against the compose database:
 *
 *   podman compose --profile tools run --rm tools \
 *     pnpm exec tsx apps/api/src/db/friction-read-cli.ts --company <company id>
 *
 * In production, as a command override on the migrate task (`infra/README.md`, runbook
 * "Read the op-log friction of a company"; its output lands in the log group
 * /fasor/production/migrate):
 *
 *   infra/bin/aws ecs run-task --cluster fasor-production --launch-type EC2 \
 *     --task-definition fasor-production-migrate --overrides \
 *     '{"containerOverrides":[{"name":"migrate","command":["./node_modules/.bin/tsx","src/db/friction-read-cli.ts","--company","<company id>"]}]}'
 */

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv: readonly string[]): { companyId: string } {
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
  if (companyId === undefined) throw new UsageError('--company is required');
  return { companyId };
}

async function run(): Promise<void> {
  // Before the configuration and the database: a bad argument opens nothing.
  const { companyId } = parseArgs(process.argv.slice(2));
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const report = await readFriction(db, companyId);
    for (const relatorio of report.relatorios) {
      for (const sheet of relatorio.sheets) log('friction sheet', { company_id: companyId, relatorio_id: relatorio.relatorio_id, ...sheet });
    }
    for (const relatorio of report.relatorios) {
      log('friction relatorio', { company_id: companyId, relatorio_id: relatorio.relatorio_id, status: relatorio.status, ...totalsOf(relatorio.sheets) });
    }
    log('friction company', { company_id: companyId, ...report.company });
  } finally {
    await sql.end();
  }
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) logError(`refused: ${message}`, {});
    else logError('friction read failed', { error: message });
    process.exit(1);
  },
);
