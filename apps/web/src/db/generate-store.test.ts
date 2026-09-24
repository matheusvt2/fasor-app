import 'fake-indexeddb/auto';
import { makeOp, SERVER_DEVICE_ID, type Op, type RevisionRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { describe, expect, it } from 'vitest';
import { commitBatch } from './commit.ts';
import { editedSinceSnapshot, lastOpIdFor, latestGenerationJob, relatorioRow, revisionRows } from './generate-store.ts';
import { newId } from '../ids.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { applyPulled, markDead } from './sync-store.ts';

/*
 * Story 4.8: the Export dialog's reads over a real device database seeded with the small
 * Porto Seguro fixture, and `lastOpIdFor`, the device's half of the generate barrier.
 */

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0048-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await applyPulled(fresh, portoSeguroSmall.log);
  return fresh;
}

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
let seq = 10_000;

function serverOp(input: { kind: Op['kind']; path: string; value: unknown; client_ts: string }): Op {
  return {
    op_id: newId(),
    kind: input.kind,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: REL,
    path: input.path,
    value: input.value as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
    client_ts: input.client_ts,
    seq: ++seq,
  };
}

function revisionCreate(number: number, created_at: string): { op: Op; row: RevisionRow } {
  const row: RevisionRow = {
    id: newId(),
    relatorio_id: REL,
    number,
    snapshot_seq: number * 10,
    created_by: USER,
    docx_file_id: newId(),
    pdf_file_id: newId(),
    created_at,
  };
  return { row, op: serverOp({ kind: 'create', path: `revision/${row.id}`, value: row, client_ts: created_at }) };
}

function jobCreate(status: 'queued' | 'running' | 'done' | 'failed', created_at: string): Op {
  const id = newId();
  return serverOp({
    kind: 'create',
    path: `generation_job/${id}`,
    value: { id, relatorio_id: REL, kind: 'issue', status, error: null, result_file_id: null, result: null, created_at },
    client_ts: created_at,
  });
}

describe('generate-store reads', () => {
  it('reads the relatório row, the revisions newest first and the newest job', async () => {
    const db = await freshDb();
    expect((await relatorioRow(db, REL))?.status).toBe('em_campo');
    expect(await revisionRows(db, REL)).toEqual([]);
    expect(await latestGenerationJob(db, REL)).toBeNull();

    const one = revisionCreate(1, '2026-09-09T12:00:00.000Z');
    const two = revisionCreate(2, '2026-09-10T12:00:00.000Z');
    await applyPulled(db, [one.op, two.op, jobCreate('done', '2026-09-09T11:00:00.000Z'), jobCreate('queued', '2026-09-10T11:00:00.000Z')]);
    expect((await revisionRows(db, REL)).map((r) => r.number)).toEqual([2, 1]);
    expect((await latestGenerationJob(db, REL))?.status).toBe('queued');
  });

  it('answers null for a relatório that is not on this device', async () => {
    const db = await freshDb();
    expect(await relatorioRow(db, newId())).toBeNull();
    expect(await lastOpIdFor(db, newId())).toBeNull();
  });
});

describe('E4 retro item 18: editedSinceSnapshot reads the relatório stream', () => {
  function projectOp(path: string, value: unknown, seqOf: number, kind: Op['kind'] = 'put'): Op {
    return {
      ...serverOp({ kind, path, value, client_ts: '2026-09-11T10:00:00.000Z' }),
      scope: 'project',
      project_id: portoSeguroSmall.projectId,
      relatorio_id: null,
      actor_id: USER,
      device_id: 'tablet-office',
      seq: seqOf,
    };
  }

  it('an equipment the relatório does not reference is no edit; a rename of one it references is', async () => {
    const db = await freshDb();
    const snapshot = 50_000;
    const other = newId();
    await applyPulled(db, [
      projectOp(`equipment/${other}`, { id: other, project_id: portoSeguroSmall.projectId, tag: 'SEC-R2', type: 'chave_seccionadora', last_nameplate: null, removed_at: null }, snapshot + 1, 'create'),
      projectOp(`equipment/${other}/tag`, 'SEC-R2-B', snapshot + 2),
    ]);
    expect(await editedSinceSnapshot(db, REL, snapshot)).toBe(false);

    const referenced = portoSeguroSmall.log.find((op) => op.path.startsWith('equipment/') && op.kind === 'create')!;
    await applyPulled(db, [projectOp(`equipment/${(referenced.value as { id: string }).id}/tag`, 'SEC-RENOMEADA', snapshot + 3)]);
    expect(await editedSinceSnapshot(db, REL, snapshot)).toBe(true);
  });
});

describe('lastOpIdFor', () => {
  it('is null when this device wrote nothing for the relatório', async () => {
    const db = await freshDb();
    expect(await lastOpIdFor(db, REL)).toBeNull();
  });

  it('is the newest non-dead outbox op of the relatório or of its project, by client_ts then op_id', async () => {
    const db = await freshDb();
    const draft = (path: string, value: unknown, extra: Partial<Op> = {}) => ({
      kind: 'put' as const,
      scope: 'relatorio' as const,
      company_id: COMPANY,
      project_id: null,
      relatorio_id: REL,
      path,
      value: value as Op['value'],
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: USER,
      ...extra,
    });
    const first = await commitBatch(db, [draft('relatorio/setup/local', 'Torre A')], { newId, now: () => new Date('2026-09-11T10:00:00.000Z') });
    const second = await commitBatch(db, [draft('relatorio/setup/atividade', 'Manutenção')], { newId, now: () => new Date('2026-09-11T10:05:00.000Z') });
    expect(await lastOpIdFor(db, REL)).toBe(second.ops[0]!.op_id);

    // A project-scope op of the relatório's project counts too.
    const equipment = portoSeguroSmall.log.find((op) => op.path.startsWith('equipment/') && op.kind === 'create')!;
    const tag = makeOp(
      {
        kind: 'put',
        scope: 'project',
        company_id: COMPANY,
        project_id: portoSeguroSmall.projectId,
        relatorio_id: null,
        path: `equipment/${(equipment.value as { id: string }).id}/tag`,
        value: 'SEC-NOVA',
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: USER,
        device_id: 'tablet-store',
      },
      { newId, now: new Date('2026-09-11T10:10:00.000Z') },
    );
    await db.outbox.put({ ...tag, status: 'pending', error_code: null, targets: [] });
    expect(await lastOpIdFor(db, REL)).toBe(tag.op_id);

    // A dead op never counts: the newest live one is answered.
    await markDead(db, [{ op_id: tag.op_id, code: 'op_invalid' }]);
    expect(await lastOpIdFor(db, REL)).toBe(second.ops[0]!.op_id);
    expect(first.ops[0]!.op_id).not.toBe(second.ops[0]!.op_id);
  });
});
