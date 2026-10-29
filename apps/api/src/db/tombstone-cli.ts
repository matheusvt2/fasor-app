import { uuidV7Schema } from '@app/domain';
import { now } from '../clock.ts';
import { loadConfigOrExit } from '../config.ts';
import { newId } from '../ids.ts';
import { log, logError } from '../log.ts';
import { createDb } from './client.ts';
import { applyTombstone, findTombstoneCandidates, planTombstone, TombstoneRefused, type TombstoneInput } from './tombstone.ts';

/**
 * Fix batch fxrm (2026-10-29): the one-shot removal of test data from a company
 * (`tombstone.ts`). Three steps, always in this order, with Matheus's word before the third:
 *
 *   --find "<text>"                  lists live clients and projects whose name contains the
 *                                    text, and live relatórios whose local or atividade does or
 *                                    whose project matched, in every company (read-only).
 *   --company <id> [--relatorio <id>] [--project <id>] [--client <id>]
 *                                    the dry run: prints the plan and every check; writes nothing.
 *   the same plus --apply            writes the ops in one server batch (actor system:cleanup).
 *
 * Ids are checked as UUIDv7 before the database opens. Exits 0 on a find, a passing dry run or
 * an apply; 1 on a bad argument, a failed check or any failure, with nothing written.
 *
 * Locally, against the compose database:
 *
 *   podman compose --profile tools run --rm tools \
 *     pnpm exec tsx apps/api/src/db/tombstone-cli.ts --find "TESTE v0.2.0"
 *
 * In production, as a command override on the migrate task (`infra/README.md`, runbook
 * "Remove test data from a company"; its output lands in the log group /fasor/production/migrate):
 *
 *   infra/bin/aws ecs run-task --cluster fasor-production --launch-type EC2 \
 *     --task-definition fasor-production-migrate --overrides \
 *     '{"containerOverrides":[{"name":"migrate","command":["./node_modules/.bin/tsx","src/db/tombstone-cli.ts","--find","TESTE v0.2.0"]}]}'
 */

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

type Parsed = { mode: 'find'; text: string } | { mode: 'plan'; input: TombstoneInput; apply: boolean };

const ID_FLAGS = { '--company': 'companyId', '--relatorio': 'relatorioId', '--project': 'projectId', '--client': 'clientId' } as const;

function parseArgs(argv: readonly string[]): Parsed {
  let find: string | undefined;
  let apply = false;
  const ids: Partial<Record<(typeof ID_FLAGS)[keyof typeof ID_FLAGS], string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    const value = argv[i + 1];
    if (flag !== '--find' && !(flag in ID_FLAGS)) throw new UsageError(`unknown argument ${JSON.stringify(flag)}`);
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    i++;
    if (flag === '--find') {
      if (value.trim() === '') throw new UsageError('--find needs a non-empty text');
      find = value;
      continue;
    }
    if (!uuidV7Schema.safeParse(value).success) throw new UsageError(`${flag} must be a uuidv7, got ${JSON.stringify(value)}`);
    const key = ID_FLAGS[flag as keyof typeof ID_FLAGS];
    if (ids[key] !== undefined) throw new UsageError(`${flag} given twice`);
    ids[key] = value;
  }
  if (find !== undefined) {
    if (apply || Object.keys(ids).length > 0) throw new UsageError('--find takes no other argument');
    return { mode: 'find', text: find };
  }
  if (ids.companyId === undefined) throw new UsageError('--company is required (or --find)');
  if (ids.relatorioId === undefined && ids.projectId === undefined && ids.clientId === undefined) {
    throw new UsageError('give at least one of --relatorio, --project, --client');
  }
  return { mode: 'plan', input: { companyId: ids.companyId, relatorioId: ids.relatorioId, projectId: ids.projectId, clientId: ids.clientId }, apply };
}

async function run(): Promise<void> {
  // Before the configuration and the database: a bad argument opens nothing.
  const parsed = parseArgs(process.argv.slice(2));
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  const deps = { now, newId };
  try {
    if (parsed.mode === 'find') {
      const found = await findTombstoneCandidates(db, parsed.text);
      if (found.length === 0) {
        log('no match', { text: parsed.text });
        return;
      }
      for (const row of found) log('match', { ...row });
      return;
    }
    const plan = await planTombstone(db, parsed.input, deps);
    for (const check of plan.checks) log(check.ok ? 'check passed' : 'check failed', { company_id: parsed.input.companyId, check: check.name, detail: check.detail });
    if (!plan.ok) throw new TombstoneRefused(plan.reason, plan.checks);
    plan.ops.forEach((op, index) =>
      log('planned op', { company_id: op.company_id, relatorio_id: op.relatorio_id ?? null, order: index + 1, kind: op.kind, scope: op.scope, path: op.path, value: op.value }),
    );
    if (!parsed.apply) {
      log('dry run: nothing written; add --apply to write these ops', { company_id: parsed.input.companyId });
      return;
    }
    const result = await applyTombstone(db, parsed.input, deps);
    log('applied', { company_id: parsed.input.companyId, batch_id: result.batchId, applied: result.applied });
  } finally {
    await sql.end();
  }
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError || error instanceof TombstoneRefused) logError(`refused: ${message}`, {});
    else logError('tombstone failed', { error: message });
    process.exit(1);
  },
);
