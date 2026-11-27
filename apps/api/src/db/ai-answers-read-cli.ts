import { writeFileSync } from 'node:fs';
import { aiQualityReport } from '@app/domain';
import { loadConfigOrExit } from '../config.ts';
import { log, logError } from '../log.ts';
import { AiReadUsageError, parseAiReadArgs, readAiAnswerExamples, readAiReportRows } from './ai-answers-read.ts';
import { createDb } from './client.ts';
import { readThenEnd } from './cli-run.ts';

/**
 * Story 32.2 (Matheus, 2026-11-27): the report of the AI answer records against the rubric
 * (`docs/ai-quality-rubric.md`). Read-only (SELECTs in `read only` transactions). By default it
 * prints counts and shares only, never a text, as JSON lines:
 *
 *   ai quality        one per AI use, model and prompt version (answers, the share kept, changed,
 *                     refused, withheld and unanswered, the kinds of error, the share of words
 *                     changed, the guard's refusals by kind, the cost per kept answer)
 *   ai quality total  one, the period and the number of answers
 *
 * Flags: `--from YYYY-MM-DD` (inclusive) and `--to YYYY-MM-DD` (exclusive), by default the 30 days
 * up to tomorrow; `--company <uuidv7>` for one company, else every company.
 *
 * The examples mode writes the worst cases of ONE AI use of ONE company, with their texts, to a
 * local file for a person to read. It runs only with the explicit `--examples <use>` and an
 * `--out <path>` outside the repository (a path inside it is refused, and so is a file that already
 * exists), and `--company`; `--limit N` (default 20). It is meant for a run on a machine whose disk
 * the operator reads; stdout says how many were written, never what.
 *
 * Locally, against the compose database:
 *
 *   podman compose --profile tools run --rm tools \
 *     pnpm exec tsx apps/api/src/db/ai-answers-read-cli.ts --from 2026-11-01 --to 2026-12-01
 *
 * In production, as a command override on the migrate task (`infra/README.md`, runbook "Read the
 * AI answer records"; the output lands in the log group /fasor/production/migrate):
 *
 *   infra/bin/aws ecs run-task --cluster fasor-production --launch-type EC2 \
 *     --task-definition fasor-production-migrate --overrides \
 *     '{"containerOverrides":[{"name":"migrate","command":["./node_modules/.bin/tsx","src/db/ai-answers-read-cli.ts","--from","2026-11-01"]}]}'
 */

async function run(): Promise<void> {
  // Before the configuration and the database: a bad argument opens nothing.
  const args = parseAiReadArgs(process.argv.slice(2));
  const config = loadConfigOrExit();
  const { sql, db } = createDb(config.DATABASE_URL);
  const scope = { company_id: args.companyId ?? null, from: args.from, to: args.to };
  await readThenEnd(async () => {
    if (args.examples !== null) {
      const examples = await readAiAnswerExamples(db, { companyId: args.companyId!, from: args.from, to: args.to }, args.examples.use, args.examples.limit);
      // `wx`: never over a file that appeared meanwhile.
      writeFileSync(args.examples.out, examples.map((example) => JSON.stringify(example)).join('\n') + (examples.length === 0 ? '' : '\n'), { flag: 'wx', mode: 0o600 });
      log('ai quality examples', { ...scope, use: args.examples.use, written: examples.length });
      return;
    }
    const rows = await readAiReportRows(db, { ...(args.companyId === undefined ? {} : { companyId: args.companyId }), from: args.from, to: args.to });
    for (const line of aiQualityReport(rows)) log('ai quality', { ...scope, ...line });
    log('ai quality total', { ...scope, answers: rows.length });
  }, () => sql.end());
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiReadUsageError) logError(`refused: ${message}`, {});
    else logError('ai quality read failed', { error: error instanceof Error ? error.name : 'unknown' });
    process.exit(1);
  },
);
