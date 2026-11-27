import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { aiQualityReport } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { AiReadUsageError, parseAiReadArgs, readAiAnswerExamples, readAiReportRows } from './ai-answers-read.ts';
import { createDb } from './client.ts';
import { aiAnswers } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';

/*
 * Story 32.2 (Matheus, 2026-11-27): the report of the AI answer records, against the compose
 * Postgres, on rows a throwaway company holds as the `fake` providers write them (model `fake`).
 * A neighbour company's rows are never counted for the company. Every text carries a marker the
 * report's output must never repeat; only the examples file, written outside the repository behind
 * its flag, holds them.
 */

const root = resolve(import.meta.dirname, '../../../..');
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const companyId = newId();
const neighbourId = newId();
const relatorioId = newId();
const tag = companyId.slice(-12);
const SECRET = `SECRET-TEXT-${tag}`;
const AT = '2026-11-20T12:00:00.000Z';
const outDir = mkdtempSync(join(tmpdir(), 'ai-quality-'));

type Row = typeof aiAnswers.$inferInsert;

function row(over: Partial<Row>): Row {
  return {
    id: newId(),
    company_id: companyId,
    relatorio_id: relatorioId,
    use: 'plate',
    run_table: 'reading_runs',
    run_id: newId(),
    target: null,
    target_path: null,
    item_key: 'fabricacao',
    suggestion_id: null,
    watch_paths: null,
    input_text: null,
    input_file_id: newId(),
    answer: `${SECRET}-answer`,
    shown: `${SECRET}-shown`,
    shown_reason: null,
    confidence: 0.9,
    model: 'fake',
    prompt_version: 'fake-1',
    run_usd: 0,
    created_at: AT,
    outcome: 'kept',
    action: 'confirm',
    final_value: `${SECRET}-shown`,
    settled_by: 'user',
    settled_at: AT,
    closed_at: null,
    ...over,
  };
}

const run = newId();

beforeAll(async () => {
  await db.insert(aiAnswers).values([
    row({ run_id: run }),
    row({ run_id: run, outcome: 'changed', action: 'edit', shown: { raw: '15', unit: 'kV', state: 'measured' }, final_value: { raw: '13', unit: 'kV', state: 'measured' } }),
    row({ run_id: run, outcome: 'refused', action: 'discard', final_value: null }),
    row({ run_id: run, outcome: 'refused', action: 'withheld', shown: null, final_value: null, shown_reason: 'dropped: unknown_token', closed_at: AT }),
    row({ run_id: run, outcome: 'unanswered', action: null, final_value: null, closed_at: AT }),
    row({ use: 'ai_write', run_table: 'transcription_runs', input_text: `${SECRET}-input`, item_key: null, outcome: 'changed', action: 'edit', shown: `${SECRET} um dois tres`, final_value: `${SECRET} um dois quatro` }),
    row({ use: 'ai_write', run_table: 'transcription_runs', input_text: `${SECRET}-input`, item_key: null, outcome: 'refused', action: 'withheld', shown: null, final_value: null, shown_reason: 'guard: added number 3', closed_at: AT }),
    row({ use: 'audit_finding', run_table: 'audit_run', input_text: `${SECRET}-audit`, item_key: 'conclusion_vs_nc', outcome: 'unanswered', action: null, final_value: null, closed_at: AT }),
    // Outside the period: never counted.
    row({ created_at: '2026-10-01T12:00:00.000Z' }),
    // The neighbour's: never counted for the company.
    row({ company_id: neighbourId }),
  ]);
}, 60_000);

afterAll(async () => {
  await dropCompany(db, companyId);
  await dropCompany(db, neighbourId);
  rmSync(outDir, { recursive: true, force: true });
  await sql.end();
}, 60_000);

const period = { companyId, from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' };

describe('32.2-API-001 the report reads the period of one company, in counts and shares', () => {
  it('one line per use, model and prompt version: kept, changed, refused, withheld, unanswered, the kinds of error and the cost', async () => {
    const lines = aiQualityReport(await readAiReportRows(db, period));
    expect(lines.map((line) => [line.use, line.answers])).toEqual([
      ['plate', 5],
      ['ai_write', 2],
      ['audit_finding', 1],
    ]);
    expect(lines[0]).toMatchObject({ kept: 1, changed: 1, refused: 1, withheld: 1, unanswered: 1, share_kept: 0.2, runs: 1, usd: 0, usd_per_kept: 0 });
    expect(lines[0]!.errors).toMatchObject({ wrong_digit: 1, invented: 1 });
    expect(lines[1]).toMatchObject({ changed: 1, withheld: 1, words_changed_mean: 0.25 });
    expect(lines[1]!.guard_refusals).toMatchObject({ number: 1 });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it('the worst cases of one use, worst first, with their texts; kept answers are never examples', async () => {
    const examples = await readAiAnswerExamples(db, period, 'plate', 10);
    expect(examples.map((example) => example.outcome)).toEqual(['changed', 'refused', 'refused', 'unanswered']);
    expect(examples[0]!.severity).toBeGreaterThan(examples[1]!.severity);
  });
});

describe('32.2-API-002 the CLI', () => {
  const cli = (args: string[]) => spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/db/ai-answers-read-cli.ts', ...args], { cwd: root, encoding: 'utf8' });

  it('prints counts and shares as JSON lines, never a text', () => {
    const done = cli(['--company', companyId, '--from', '2026-11-01', '--to', '2026-12-01']);
    expect(done.status, `${done.stdout}\n${done.stderr}`).toBe(0);
    expect(done.stdout).not.toContain(SECRET);
    const lines = done.stdout.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.filter((line) => line.msg === 'ai quality').map((line) => line.use)).toEqual(['plate', 'ai_write', 'audit_finding']);
    expect(lines.find((line) => line.msg === 'ai quality total')).toMatchObject({ company_id: companyId, answers: 8 });
  });

  it('the examples mode only with its flag, its company and a new file outside the repository', () => {
    const out = join(outDir, 'plate.jsonl');
    expect(cli(['--company', companyId, '--out', out]).status).toBe(1);
    expect(cli(['--examples', 'plate', '--out', out]).status).toBe(1);
    expect(cli(['--company', companyId, '--examples', 'plate']).status).toBe(1);
    const inside = cli(['--company', companyId, '--examples', 'plate', '--out', join(root, 'examples.jsonl')]);
    expect(inside.status).toBe(1);
    expect(inside.stderr).toContain('outside the repository');
    const done = cli(['--company', companyId, '--from', '2026-11-01', '--to', '2026-12-01', '--examples', 'plate', '--out', out]);
    expect(done.status, `${done.stdout}\n${done.stderr}`).toBe(0);
    expect(done.stdout).not.toContain(SECRET);
    expect(JSON.parse(done.stdout.trim())).toMatchObject({ msg: 'ai quality examples', use: 'plate', written: 4 });
    expect(readFileSync(out, 'utf8')).toContain(SECRET);
    // A second run never writes over the file.
    expect(cli(['--company', companyId, '--examples', 'plate', '--out', out]).status).toBe(1);
  });

  it('the flags are checked before the database opens', () => {
    const now = new Date('2026-11-27T10:00:00.000Z');
    expect(parseAiReadArgs([], now, root)).toEqual({ companyId: undefined, from: '2026-10-29T00:00:00.000Z', to: '2026-11-28T00:00:00.000Z', examples: null });
    expect(() => parseAiReadArgs(['--from', '2026-13-01'], now, root)).toThrow(AiReadUsageError);
    expect(() => parseAiReadArgs(['--company', 'x'], now, root)).toThrow(AiReadUsageError);
    expect(() => parseAiReadArgs(['--from', '2026-12-01', '--to', '2026-11-01'], now, root)).toThrow(AiReadUsageError);
    expect(() => parseAiReadArgs(['--examples', 'nope', '--company', companyId, '--out', join(outDir, 'x')], now, root)).toThrow(AiReadUsageError);
  });
});
