import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { readFriction, type FrictionReport } from './friction-read.ts';
import { company, entities, ops } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';

/*
 * Story 18.3: the op-log friction read, against the compose Postgres. A company holds two live
 * relatórios and a removed one; its blocks cover a worked sheet (a field put three times, a
 * typed cell after a failed display reading, a late server op that must not stretch the span),
 * a block only the server touched, a removed block and a block whose failure was never
 * followed by a put. A neighbour company holds ops of its own that must never be read. Every
 * value carries a marker string the CLI output must never repeat.
 */

const root = resolve(import.meta.dirname, '../../../..');
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const companyId = newId();
const neighbourId = newId();
const created = [companyId, neighbourId];
const tag = companyId.slice(-12);
const markers = [`SECRET-VALUE-${tag}`, `TAG-${tag}`, `CAPTION-${tag}`, `NAME-${tag}`, `LOCAL-${tag}`, `ATIVIDADE-${tag}`];

const r1 = newId(); // live, em_campo
const r2 = newId(); // live, rascunho
const r3 = newId(); // removed
const b1 = newId(); // worked sheet in r1
const b2 = newId(); // server-only block in r1
const b3 = newId(); // removed block in r1
const b4 = newId(); // r2: put before the failure, failure never followed by a put
const b5 = newId(); // block of the removed relatório r3
const p1 = newId(); // display photo for b1
const p2 = newId(); // display photo for b4
const p3 = newId(); // plate photo for b4: never counted
const p4 = newId(); // display photo for b4, re-kinded before its failure
const p5 = newId(); // display photo for b4, re-targeted after its failure
const p6 = newId(); // display photo for b4, re-read to done after its failure
const p7 = newId(); // display photo for b4, removed after its failure
const nr = newId(); // neighbour relatório
const nb = newId(); // neighbour block

const DEVICE = { actor_id: 'user-friction', device_id: 'device-friction' };
const OTHER_DEVICE = { actor_id: 'user-friction-2', device_id: 'device-friction-2' };
const SERVER = { actor_id: 'system:reading', device_id: 'server' };

const t0 = Date.parse('2026-10-20T12:00:00.000Z');
const at = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();

type Actor = { actor_id: string; device_id: string };
const op = (owner: string, relatorioId: string | null, actor: Actor, kind: string, path: string, value: unknown, offsetMs: number) => ({
  op_id: newId(),
  company_id: owner,
  scope: relatorioId === null ? 'company' : 'relatorio',
  project_id: null,
  relatorio_id: relatorioId,
  kind,
  path,
  value,
  prev_op_id: null,
  batch_id: null,
  meta: null,
  ...actor,
  client_ts: at(offsetMs),
  received_at: at(offsetMs + 500),
});

const relatorioRow = (id: string, status: string, removedAt: string | null) => ({
  id,
  project_id: newId(),
  status,
  setup: { local: `LOCAL-${tag}`, atividade: `ATIVIDADE-${tag}` },
  removed_at: removedAt,
});
const blockRow = (id: string, relatorioId: string, blockType: string, removedAt: string | null) => ({
  id,
  relatorio_id: relatorioId,
  block_type: blockType,
  order_key: 'a0',
  removed_at: removedAt,
});
const entity = (owner: string, kind: 'relatorio' | 'block', id: string, relatorioId: string, row: Record<string, unknown>, removedAt: string | null) => ({
  company_id: owner,
  entity: kind,
  id,
  relatorio_id: relatorioId,
  project_id: null,
  row: row as never,
  removed_at: removedAt,
  updated_seq: 1,
});

const cellTarget = (blockId: string, blockType: string, row: number, col: number) => ({
  block_id: blockId,
  block_type: blockType,
  table_key: 'resistencia_isolamento',
  start_cell: { row, col },
});

let report: FrictionReport;

beforeAll(async () => {
  await db.insert(company).values([
    { id: companyId, name: `NAME-${tag}` },
    { id: neighbourId, name: `NAME-${tag} vizinha` },
  ]);
  const removed = at(-1000);
  await db.insert(entities).values([
    entity(companyId, 'relatorio', r1, r1, relatorioRow(r1, 'em_campo', null), null),
    entity(companyId, 'relatorio', r2, r2, relatorioRow(r2, 'rascunho', null), null),
    entity(companyId, 'relatorio', r3, r3, relatorioRow(r3, 'rascunho', removed), removed),
    entity(companyId, 'block', b1, r1, blockRow(b1, r1, 'transformador', null), null),
    entity(companyId, 'block', b2, r1, blockRow(b2, r1, 'disjuntor', null), null),
    entity(companyId, 'block', b3, r1, blockRow(b3, r1, 'disjuntor', removed), removed),
    entity(companyId, 'block', b4, r2, blockRow(b4, r2, 'transformador', null), null),
    entity(companyId, 'block', b5, r3, blockRow(b5, r3, 'transformador', null), null),
    entity(neighbourId, 'relatorio', nr, nr, relatorioRow(nr, 'em_campo', null), null),
    entity(neighbourId, 'block', nb, nr, blockRow(nb, nr, 'transformador', null), null),
  ]);

  const rows = [
    // b1: the worked sheet.
    op(companyId, r1, DEVICE, 'create', `block/${b1}`, { id: b1, note: `SECRET-VALUE-${tag}` }, 0),
    op(companyId, r1, DEVICE, 'put', `sheet/${b1}/nameplate/tag`, `TAG-${tag}`, 1_000),
    op(companyId, r1, DEVICE, 'put', `sheet/${b1}/nameplate/tag`, `TAG-${tag}-2`, 2_000),
    op(companyId, r1, OTHER_DEVICE, 'put', `sheet/${b1}/nameplate/tag`, `TAG-${tag}-3`, 3_000),
    op(companyId, r1, DEVICE, 'put', `sheet/${b1}/checklist/item_a/result`, 'C', 4_000),
    op(companyId, r1, DEVICE, 'create', `file/${p1}`, { id: p1, caption: `CAPTION-${tag}`, reading_kind: 'display', reading_target: cellTarget(b1, 'transformador', 2, 1) }, 5_000),
    op(companyId, r1, SERVER, 'put', `file/${p1}/reading_status`, 'running', 6_000),
    op(companyId, r1, SERVER, 'put', `file/${p1}/reading_status`, 'failed', 7_000),
    op(companyId, r1, DEVICE, 'put', `sheet/${b1}/test/resistencia_isolamento/cell/2/1`, `SECRET-VALUE-${tag}`, 60_000),
    // A late server op on b1: never part of the span nor of the device count.
    op(companyId, r1, SERVER, 'put', `sheet/${b1}/conclusion/text`, `SECRET-VALUE-${tag}`, 999_000),
    // b2: created by the server only.
    op(companyId, r1, SERVER, 'create', `block/${b2}`, { id: b2 }, 0),
    // b3: removed; its ops are never printed nor counted.
    op(companyId, r1, DEVICE, 'create', `block/${b3}`, { id: b3 }, 0),
    op(companyId, r1, DEVICE, 'put', `sheet/${b3}/nameplate/tag`, `TAG-${tag}`, 1_000),
    op(companyId, r1, DEVICE, 'put', `sheet/${b3}/nameplate/tag`, `TAG-${tag}`, 2_000),
    // b4: the put lands before the failure, and the failure is never followed by a put.
    op(companyId, r2, DEVICE, 'create', `block/${b4}`, { id: b4 }, 10_000),
    op(companyId, r2, DEVICE, 'create', `file/${p2}`, { id: p2, caption: `CAPTION-${tag}`, reading_kind: 'display', reading_target: cellTarget(b4, 'transformador', 0, 0) }, 11_000),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/0/0`, `SECRET-VALUE-${tag}`, 12_000),
    op(companyId, r2, SERVER, 'put', `file/${p2}/reading_status`, 'failed', 13_000),
    // (a) a put on another cell of the same table after p2's failure: not its start cell.
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/0/1`, `SECRET-VALUE-${tag}`, 14_000),
    // (b) a plate photo that fails, then a put on the cell its target would name.
    op(companyId, r2, DEVICE, 'create', `file/${p3}`, { id: p3, reading_kind: 'plate', reading_target: cellTarget(b4, 'transformador', 1, 0) }, 15_000),
    op(companyId, r2, SERVER, 'put', `file/${p3}/reading_status`, 'failed', 15_100),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/1/0`, `SECRET-VALUE-${tag}`, 15_200),
    // (c) a display photo whose reading_kind is put null before its failure.
    op(companyId, r2, DEVICE, 'create', `file/${p4}`, { id: p4, reading_kind: 'display', reading_target: cellTarget(b4, 'transformador', 2, 0) }, 16_000),
    op(companyId, r2, DEVICE, 'put', `file/${p4}/reading_kind`, null, 16_100),
    op(companyId, r2, SERVER, 'put', `file/${p4}/reading_status`, 'failed', 16_200),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/2/0`, `SECRET-VALUE-${tag}`, 16_300),
    // (c') a display photo re-targeted to another cell after its failure, then a put on the original cell.
    op(companyId, r2, DEVICE, 'create', `file/${p5}`, { id: p5, reading_kind: 'display', reading_target: cellTarget(b4, 'transformador', 3, 0) }, 17_000),
    op(companyId, r2, SERVER, 'put', `file/${p5}/reading_status`, 'failed', 17_100),
    op(companyId, r2, DEVICE, 'put', `file/${p5}/reading_target`, cellTarget(b4, 'transformador', 4, 0), 17_200),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/3/0`, `SECRET-VALUE-${tag}`, 17_300),
    // (d) a display photo that fails, is re-read to done, then a put on its start cell.
    op(companyId, r2, DEVICE, 'create', `file/${p6}`, { id: p6, reading_kind: 'display', reading_target: cellTarget(b4, 'transformador', 5, 0) }, 18_000),
    op(companyId, r2, SERVER, 'put', `file/${p6}/reading_status`, 'failed', 18_100),
    op(companyId, r2, SERVER, 'put', `file/${p6}/reading_status`, 'queued', 18_200),
    op(companyId, r2, SERVER, 'put', `file/${p6}/reading_status`, 'done', 18_300),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/5/0`, `SECRET-VALUE-${tag}`, 18_400),
    // (e) a display photo that fails, is removed, then a put on its start cell.
    op(companyId, r2, DEVICE, 'create', `file/${p7}`, { id: p7, reading_kind: 'display', reading_target: cellTarget(b4, 'transformador', 6, 0) }, 19_000),
    op(companyId, r2, SERVER, 'put', `file/${p7}/reading_status`, 'failed', 19_100),
    op(companyId, r2, DEVICE, 'put', `file/${p7}/removed_at`, at(19_200), 19_200),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/test/resistencia_isolamento/cell/6/0`, `SECRET-VALUE-${tag}`, 19_300),
    op(companyId, r2, DEVICE, 'put', `sheet/${b4}/observations`, `SECRET-VALUE-${tag}`, 40_000),
    // b5: a block of the removed relatório.
    op(companyId, r3, DEVICE, 'create', `block/${b5}`, { id: b5 }, 0),
    // A path that does not parse: skipped.
    op(companyId, r1, DEVICE, 'put', `sheet/${b1}/not-a-family`, `SECRET-VALUE-${tag}`, 2_000_000),
    // The neighbour's ops.
    op(neighbourId, nr, DEVICE, 'create', `block/${nb}`, { id: nb }, 0),
    op(neighbourId, nr, DEVICE, 'put', `sheet/${nb}/nameplate/tag`, `TAG-${tag}`, 1_000),
    op(neighbourId, nr, DEVICE, 'put', `sheet/${nb}/nameplate/tag`, `TAG-${tag}`, 2_000),
  ];
  // One by one, so `seq` follows the array order.
  for (const row of rows) await db.insert(ops).values(row);

  report = await readFriction(db, companyId);
}, 60_000);

afterAll(async () => {
  for (const id of created) await dropCompany(db, id);
  await sql.end();
});

const sheetOf = (blockId: string) => report.relatorios.flatMap((r) => r.sheets).find((s) => s.block_id === blockId);

describe('readFriction', () => {
  it('lists only the live relatórios of the company, with their live blocks', () => {
    expect(report.relatorios.map((r) => r.relatorio_id).sort()).toEqual([r1, r2].sort());
    const one = report.relatorios.find((r) => r.relatorio_id === r1)!;
    expect(one.status).toBe('em_campo');
    expect(one.sheets.map((s) => s.block_id).sort()).toEqual([b1, b2].sort());
    expect(report.relatorios.find((r) => r.relatorio_id === r2)!.sheets.map((s) => s.block_id)).toEqual([b4]);
    expect(sheetOf(b3)).toBeUndefined();
    expect(sheetOf(b5)).toBeUndefined();
    expect(sheetOf(nb)).toBeUndefined();
  });

  it('spans a worked sheet over its device ops only, counts the re-edited field and the cell typed after the failed reading', () => {
    expect(sheetOf(b1)).toEqual({
      block_id: b1,
      block_type: 'transformador',
      first_op_at: at(0),
      last_op_at: at(60_000),
      span_ms: 60_000,
      device_op_count: 6,
      fields_reedited: 1,
      typed_after_failed_reading: 1,
    });
  });

  it('prints a server-only block with no device op as nulls and zeros', () => {
    expect(sheetOf(b2)).toEqual({
      block_id: b2,
      block_type: 'disjuntor',
      first_op_at: null,
      last_op_at: null,
      span_ms: null,
      device_op_count: 0,
      fields_reedited: 0,
      typed_after_failed_reading: 0,
    });
  });

  it('counts no put before the failure, on another cell, after a plate failure, after a re-kind, a re-target, a successful re-read or a removal', () => {
    expect(sheetOf(b4)).toMatchObject({ span_ms: 30_000, device_op_count: 9, fields_reedited: 0, typed_after_failed_reading: 0 });
  });

  it('totals the company', () => {
    expect(report.company).toEqual({
      relatorio_count: 2,
      sheet_count: 3,
      span_ms_total: 90_000,
      device_op_count: 15,
      fields_reedited: 1,
      typed_after_failed_reading: 1,
    });
  });

  it('reads an empty company as totals of zero', async () => {
    const empty = await readFriction(db, newId());
    expect(empty).toEqual({
      company: { relatorio_count: 0, sheet_count: 0, span_ms_total: 0, device_op_count: 0, fields_reedited: 0, typed_after_failed_reading: 0 },
      relatorios: [],
    });
  });
});

describe('friction-read-cli', () => {
  const cli = (args: string[]) => spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/db/friction-read-cli.ts', ...args], { cwd: root, encoding: 'utf8' });

  it('prints one JSON line per sheet, per relatório and for the company, with no seeded text', () => {
    const run = cli(['--company', companyId]);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const lines = run.stdout.trim().split('\n');
    const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const line of lines) for (const marker of markers) expect(line).not.toContain(marker);
    expect(parsed.filter((l) => l.msg === 'friction sheet')).toHaveLength(3);
    expect(parsed.filter((l) => l.msg === 'friction relatorio')).toHaveLength(2);
    const sheet = parsed.find((l) => l.msg === 'friction sheet' && l.block_id === b1)!;
    expect(sheet).toMatchObject({ company_id: companyId, relatorio_id: r1, span_ms: 60_000, fields_reedited: 1, typed_after_failed_reading: 1 });
    const rel = parsed.find((l) => l.msg === 'friction relatorio' && l.relatorio_id === r1)!;
    expect(rel).toMatchObject({ status: 'em_campo', sheet_count: 2, span_ms_total: 60_000, fields_reedited: 1, typed_after_failed_reading: 1 });
    const total = parsed.filter((l) => l.msg === 'friction company');
    expect(total).toHaveLength(1);
    expect(total[0]).toMatchObject({ company_id: companyId, relatorio_count: 2, sheet_count: 3, span_ms_total: 90_000 });
    expect(JSON.stringify(parsed)).not.toContain(nb);
  }, 60_000);

  it('refuses a bad id, a missing --company and an unknown flag, with nothing on stdout', () => {
    for (const args of [['--company', 'not-a-uuid'], [], ['--company', companyId, '--apply']]) {
      const run = cli(args);
      expect(run.status, `${args.join(' ')}: ${run.stdout}\n${run.stderr}`).toBe(1);
      expect(run.stdout).toBe('');
      expect(run.stderr).toContain('refused');
    }
  }, 60_000);
});
