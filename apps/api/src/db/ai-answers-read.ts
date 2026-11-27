import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { AI_ANSWER_USES, aiAnswerSeverity, uuidV7Schema, type AiAnswerUse, type AiReportRow } from '@app/domain';
import { and, asc, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { Db } from './client.ts';
import { aiAnswers } from './schema.ts';

/*
 * Story 32.2 (Matheus, 2026-11-27): the read of the AI answer records the quality report counts
 * (`aiQualityReport`, the kernel's rubric), and the examples mode's worst cases. Read-only: every
 * query runs in a `read only` transaction, as the production reads do. The report rows carry the
 * values the rubric compares (what was shown, what was left) only so the kernel can count them; the
 * CLI prints counts and shares. Only the examples read returns texts, for a file outside the
 * repository (`ai-answers-read-cli.ts`).
 */

export interface AiAnswersPeriod {
  /** One company, or every company when absent. */
  companyId?: string;
  /** Inclusive lower bound of `created_at`, canonical ISO. */
  from: string;
  /** Exclusive upper bound of `created_at`, canonical ISO. */
  to: string;
}

function where(period: AiAnswersPeriod, use?: AiAnswerUse): SQL | undefined {
  return and(
    gte(aiAnswers.created_at, period.from),
    lt(aiAnswers.created_at, period.to),
    period.companyId === undefined ? undefined : eq(aiAnswers.company_id, period.companyId),
    use === undefined ? undefined : eq(aiAnswers.use, use),
  );
}

/** The rows the report counts, in creation order. */
export async function readAiReportRows(db: Db, period: AiAnswersPeriod): Promise<AiReportRow[]> {
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select({
          use: aiAnswers.use,
          model: aiAnswers.model,
          prompt_version: aiAnswers.prompt_version,
          run_id: aiAnswers.run_id,
          run_usd: aiAnswers.run_usd,
          outcome: aiAnswers.outcome,
          action: aiAnswers.action,
          shown: aiAnswers.shown,
          final_value: aiAnswers.final_value,
          shown_reason: aiAnswers.shown_reason,
        })
        .from(aiAnswers)
        .where(where(period))
        .orderBy(asc(aiAnswers.created_at), asc(aiAnswers.id));
      return rows.map((row) => ({ ...row, shown: row.shown ?? null, final_value: row.final_value ?? null }) as AiReportRow);
    },
    { accessMode: 'read only' },
  );
}

/** One worst case as the examples file holds it: the record's texts, for a person to read. */
export interface AiAnswerExample {
  id: string;
  relatorio_id: string;
  use: string;
  model: string | null;
  prompt_version: string | null;
  item_key: string | null;
  target_path: string | null;
  input_text: string | null;
  input_file_id: string | null;
  answer: unknown;
  shown: unknown;
  shown_reason: string | null;
  outcome: string | null;
  action: string | null;
  final_value: unknown;
  severity: number;
  created_at: string;
}

/** The worst `limit` answers of one AI use of one company in the period, worst first (`aiAnswerSeverity`); kept and open ones are never examples. */
export async function readAiAnswerExamples(db: Db, period: AiAnswersPeriod & { companyId: string }, use: AiAnswerUse, limit: number): Promise<AiAnswerExample[]> {
  const rows = await db.transaction(async (tx) => tx.select().from(aiAnswers).where(where(period, use)).orderBy(asc(aiAnswers.created_at), asc(aiAnswers.id)), { accessMode: 'read only' });
  return rows
    .map((row) => ({
      id: row.id,
      relatorio_id: row.relatorio_id,
      use: row.use,
      model: row.model,
      prompt_version: row.prompt_version,
      item_key: row.item_key,
      target_path: row.target_path,
      input_text: row.input_text,
      input_file_id: row.input_file_id,
      answer: row.answer ?? null,
      shown: row.shown ?? null,
      shown_reason: row.shown_reason,
      outcome: row.outcome,
      action: row.action,
      final_value: row.final_value ?? null,
      severity: aiAnswerSeverity({ ...row, shown: row.shown ?? null, final_value: row.final_value ?? null } as AiReportRow),
      created_at: row.created_at,
    }))
    .filter((row) => row.severity > 0)
    .sort((a, b) => b.severity - a.severity || a.created_at.localeCompare(b.created_at))
    .slice(0, limit);
}

// --- the flags of the CLI (`ai-answers-read-cli.ts`) ---------------------------------------------

/** A refusal of the flags; its message names the expected shape, never a value (stderr is a log group in production). */
export class AiReadUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiReadUsageError';
  }
}

export interface AiReadArgs {
  companyId: string | undefined;
  from: string;
  to: string;
  examples: { use: AiAnswerUse; out: string; limit: number } | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

function dayStart(value: string, flag: string): string {
  if (!DAY.test(value)) throw new AiReadUsageError(`${flag} must be a day: ${flag} YYYY-MM-DD`);
  const at = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== value) throw new AiReadUsageError(`${flag} must be a day: ${flag} YYYY-MM-DD`);
  return at.toISOString();
}

/** The repository the CLI runs from (the folder holding `pnpm-workspace.yaml`), else the api package. */
export function repositoryRoot(start: string = import.meta.dirname): string {
  let at = resolve(start);
  for (;;) {
    if (existsSync(join(at, 'pnpm-workspace.yaml'))) return at;
    const up = dirname(at);
    if (up === at) return resolve(import.meta.dirname, '../..');
    at = up;
  }
}

/** Whether `path` lies inside `root` (or is it). */
export function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Parses the flags; refuses before the configuration and the database open. Every refusal names the expected shape, never a value. */
export function parseAiReadArgs(argv: readonly string[], now: Date = new Date(), root: string = repositoryRoot()): AiReadArgs {
  const seen = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    if (!['--company', '--from', '--to', '--examples', '--out', '--limit'].includes(flag)) throw new AiReadUsageError('unknown argument: the flags are --company, --from, --to, --examples, --out and --limit');
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new AiReadUsageError(`${flag} needs a value`);
    if (seen.has(flag)) throw new AiReadUsageError(`${flag} given twice`);
    seen.set(flag, value);
    i++;
  }
  const companyId = seen.get('--company');
  if (companyId !== undefined && !uuidV7Schema.safeParse(companyId).success) throw new AiReadUsageError('--company must be a uuidv7');
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const to = seen.has('--to') ? dayStart(seen.get('--to')!, '--to') : tomorrow.toISOString();
  const from = seen.has('--from') ? dayStart(seen.get('--from')!, '--from') : new Date(Date.parse(to) - 30 * 86_400_000).toISOString();
  if (Date.parse(from) >= Date.parse(to)) throw new AiReadUsageError('--from must be before --to');

  const use = seen.get('--examples');
  const out = seen.get('--out');
  const limit = seen.get('--limit');
  if (use === undefined) {
    if (out !== undefined || limit !== undefined) throw new AiReadUsageError('--out and --limit belong to the examples mode, which needs --examples <use>');
    return { companyId, from, to, examples: null };
  }
  if (!(AI_ANSWER_USES as readonly string[]).includes(use)) throw new AiReadUsageError(`--examples must be one of ${AI_ANSWER_USES.join(', ')}`);
  if (companyId === undefined) throw new AiReadUsageError('--examples needs --company <uuidv7>: the examples are one company\'s');
  if (out === undefined) throw new AiReadUsageError('--examples needs --out <path> outside the repository');
  const path = resolve(out);
  if (isInside(root, path)) throw new AiReadUsageError('--out must be outside the repository: the examples hold client text');
  if (existsSync(path)) throw new AiReadUsageError('--out names a file that exists; give a new path');
  const count = limit === undefined ? DEFAULT_LIMIT : Number(limit);
  if (!Number.isInteger(count) || count < 1 || count > MAX_LIMIT) throw new AiReadUsageError(`--limit must be a whole number from 1 to ${MAX_LIMIT}`);
  return { companyId, from, to, examples: { use: use as AiAnswerUse, out: path, limit: count } };
}

