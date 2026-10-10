// @vitest-environment node
import 'fake-indexeddb/auto';
import { SERVER_DEVICE_ID, type Op, type OpDraft, type RelatorioStatus, type RevisionRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBatch } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { markSentNow } from './use-mark-sent.ts';

/*
 * Status flow 2026-10-10, decision 2: "Marcar como enviado ao cliente" checks and writes in one
 * transaction. The check refuses with an edit held after the revision's snapshot, outside Em
 * revisão and with no revision; the allowed case writes one `issue` op, and two presses one.
 */

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const AUTHOR = { id: USER, companyId: COMPANY };
const SNAPSHOT_SEQ = 90_000;

let database: AppDatabase | null = null;
let counter = 0;

async function seeded(status: RelatorioStatus, withRevision: boolean): Promise<AppDatabase> {
  const user = `019966c1-0053-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const stale = openDatabase(user);
  await stale.delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const record = await db.entities.get(['relatorio', REL]);
  await db.entities.put({ ...record!, row: { ...(record!.row as object), status } as never });
  if (withRevision) {
    const row: RevisionRow = { id: newId(), relatorio_id: REL, number: 1, snapshot_seq: SNAPSHOT_SEQ, created_by: USER, docx_file_id: newId(), pdf_file_id: newId(), created_at: '2026-09-23T12:00:30.000Z' };
    const op: Op = {
      op_id: newId(),
      kind: 'create',
      scope: 'relatorio',
      company_id: COMPANY,
      project_id: null,
      relatorio_id: REL,
      path: `revision/${row.id}`,
      value: row as unknown as Op['value'],
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: 'system:generate',
      device_id: SERVER_DEVICE_ID,
      client_ts: row.created_at,
      seq: SNAPSHOT_SEQ + 1,
    };
    await applyPulled(db, [op]);
  }
  database = db;
  return db;
}

const setupEdit = (): OpDraft => ({
  kind: 'put',
  scope: 'relatorio',
  company_id: COMPANY,
  project_id: null,
  relatorio_id: REL,
  path: 'relatorio/setup/local',
  value: 'Outro local',
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: USER,
});

const statusOps = async (db: AppDatabase) => (await db.outbox.where('path').equals('relatorio/status').toArray()).map((row) => row.value);
const statusOf = async (db: AppDatabase) => ((await db.entities.get(['relatorio', REL]))!.row as { status: string }).status;

afterEach(() => {
  database?.close();
  database = null;
});

describe('markSentNow', () => {
  it('Em revisão, a revision and nothing edited since it: writes exactly one issue op', async () => {
    const db = await seeded('em_revisao', true);
    expect(await markSentNow(db, AUTHOR, REL)).toBe(true);
    expect(await statusOps(db)).toEqual(['emitido']);
    expect(await statusOf(db)).toBe('emitido');
    // Pressed again once Emitido: refused, nothing more written.
    expect(await markSentNow(db, AUTHOR, REL)).toBe(false);
    expect(await statusOps(db)).toEqual(['emitido']);
  });

  it('refuses with an edit held on this device after the revision\'s snapshot', async () => {
    const db = await seeded('em_revisao', true);
    await commitBatch(db, [setupEdit()], { newId, now: () => new Date() });
    expect(await markSentNow(db, AUTHOR, REL)).toBe(false);
    expect(await statusOps(db)).toEqual([]);
    expect(await statusOf(db)).toBe('em_revisao');
  });

  it('refuses outside Em revisão (Em campo) and with no revision', async () => {
    const emCampo = await seeded('em_campo', true);
    expect(await markSentNow(emCampo, AUTHOR, REL)).toBe(false);
    expect(await statusOps(emCampo)).toEqual([]);
    emCampo.close();
    const none = await seeded('em_revisao', false);
    expect(await markSentNow(none, AUTHOR, REL)).toBe(false);
    expect(await statusOps(none)).toEqual([]);
  });

  it('two concurrent presses write one issue op', async () => {
    const db = await seeded('em_revisao', true);
    const results = await Promise.all([markSentNow(db, AUTHOR, REL), markSentNow(db, AUTHOR, REL)]);
    expect(results.sort()).toEqual([false, true]);
    expect(await statusOps(db)).toEqual(['emitido']);
  });

  it('an edit committed while the press is on its way is seen by the check: no issue', async () => {
    const db = await seeded('em_revisao', true);
    const [, sent] = await Promise.all([commitBatch(db, [setupEdit()], { newId, now: () => new Date() }), markSentNow(db, AUTHOR, REL)]);
    expect(sent).toBe(false);
    expect(await statusOps(db)).toEqual([]);
  });
});
