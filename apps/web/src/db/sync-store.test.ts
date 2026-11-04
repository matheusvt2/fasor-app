// @vitest-environment node
import 'fake-indexeddb/auto';
import {
  buildSnapshot,
  entityKey,
  makeOp,
  materializeEntity,
  replay,
  serializeSnapshot,
  mergeInfoText,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type MergeInfo,
  type Op,
  type OpInput,
} from '@app/domain';
import {
  BLOCK_1_ID,
  COMPANY_ID,
  EQUIPMENT_1_ID,
  PROJECT_ID,
  RELATORIO_ID,
  replaySmall,
  USER_ID,
} from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitOps, opOf } from './commit.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { toSnapshot } from './snapshot.ts';
import {
  applyPulled,
  deviceId,
  markAcked,
  markDead,
  markSent,
  mergeTextContext,
  notTestedSynced,
  resendDead,
  takePending,
  unackedPhotoUploads,
} from './sync-store.ts';

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-000e-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function deps(prefix = '019966b0-000f-7000-8000-') {
  let n = 0;
  let t = Date.parse('2026-09-21T15:00:00.000Z');
  return {
    newId: () => `${prefix}${(++n).toString(16).padStart(12, '0')}`,
    now: () => new Date((t += 1000)),
  };
}

const FIELD = `sheet/${BLOCK_1_ID}/nameplate/fabricacao`;

function put(path: string, value: OpInput['value'], extra: Partial<OpInput> = {}): OpInput {
  return {
    kind: 'put',
    scope: 'relatorio',
    company_id: COMPANY_ID,
    relatorio_id: RELATORIO_ID,
    path,
    value,
    actor_id: USER_ID,
    device_id: 'tablet-a',
    ...extra,
  };
}

/** The fixture log up to and including the block creates, so sheet ops have a target. */
function seedLog(): Op[] {
  const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
  return replaySmall.log.slice(0, upTo + 1);
}

async function block(db: AppDatabase): Promise<BlockRow> {
  return (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
}

describe('device id', () => {
  it('is minted once and kept in local_prefs', async () => {
    const db = await freshDb();
    const d = deps();
    const first = await deviceId(db, d.newId);
    expect(await deviceId(db, d.newId)).toBe(first);
    expect(await db.local_prefs.get('device_id')).toMatchObject({ value: first });
    db.close();
  });
});

describe('1.5-UNIT-001 rebase', () => {
  it('a pending put survives a pull on its path, prev_op_id untouched; the pull-back converges', async () => {
    const db = await freshDb();
    const d = deps();
    // The relatorio and its blocks arrive from the server (pulled, with seqs).
    await applyPulled(db, seedLog());
    const seedSeq = seedLog().at(-1)!.seq!;

    const local = makeOp(put(FIELD, 'LOCAL', { prev_op_id: null }), { newId: d.newId, now: d.now() });
    await commitOps(db, [local]);
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('LOCAL');

    // Another device's put on the same path lands on the server first.
    const remote: Op = {
      ...local,
      op_id: '019966b0-0001-7000-8000-00000000aa01',
      device_id: 'tablet-b',
      value: 'REMOTE',
      seq: seedSeq + 1,
    };
    await applyPulled(db, [remote]);
    const rebased = await block(db);
    expect(rebased.sheet.nameplate.fabricacao?.value).toBe('LOCAL');
    expect(rebased.sheet.nameplate.fabricacao?.op_id).toBe(local.op_id);
    expect(await db.outbox.get(local.op_id)).toMatchObject({ status: 'pending', prev_op_id: null, value: 'LOCAL' });

    // Pushed and acked below the remote op's seq, then pulled back: the server order decides.
    await markSent(db, [local.op_id]);
    await markAcked(db, [{ op_id: local.op_id, seq: seedSeq + 2 }]);
    expect(await db.outbox.get(local.op_id)).toMatchObject({ status: 'acked', seq: seedSeq + 2 });
    const later: Op = { ...remote, op_id: '019966b0-0001-7000-8000-00000000aa02', value: 'REMOTE-2', seq: seedSeq + 3 };
    await applyPulled(db, [{ ...local, seq: seedSeq + 2 }, later]);
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('REMOTE-2');

    // The whole row equals the pure fold of the server log for that entity.
    const remoteOps = (await db.remote_ops.where('targets').equals(entityKey('block', BLOCK_1_ID)).toArray()).sort((a, b) => a.seq - b.seq);
    expect(await block(db)).toEqual(materializeEntity({ entity: 'block', id: BLOCK_1_ID }, remoteOps, []));
    db.close();
  });

  it('dead ops stay excluded through later pulls', async () => {
    const db = await freshDb();
    const d = deps();
    await applyPulled(db, seedLog());
    const dead = makeOp(put(FIELD, 'DEAD'), { newId: d.newId, now: d.now() });
    await commitOps(db, [dead]);
    await markDead(db, [{ op_id: dead.op_id, code: 'op_invalid' }]);
    expect((await block(db)).sheet.nameplate.fabricacao).toBeUndefined();
    const remote: Op = { ...dead, op_id: '019966b0-0001-7000-8000-00000000ab01', device_id: 'tablet-b', value: 'REMOTE', seq: 900 };
    await applyPulled(db, [remote]);
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('REMOTE');
    expect(await db.outbox.get(dead.op_id)).toMatchObject({ status: 'dead', error_code: 'op_invalid', value: 'DEAD' });
    db.close();
  });
});

describe('Story 20.7: a status op the server refused (op_status_transition)', () => {
  const relatorioStatus = async (db: AppDatabase) => ((await db.entities.get(['relatorio', RELATORIO_ID]))!.row as { status: string }).status;

  it('converges on the status the server holds at the next pull, and the edit of its batch stays', async () => {
    const db = await freshDb();
    const d = deps();
    await applyPulled(db, seedLog());
    const pulledStatus = await relatorioStatus(db);

    // The device's first field edit carries Em campo in its own batch (`advanceOnEdit`).
    const batchId = d.newId();
    const edit = makeOp(put(`sheet/${BLOCK_1_ID}/observations`, 'campo', { batch_id: batchId }), { newId: d.newId, now: d.now() });
    const status = makeOp(put('relatorio/status', 'em_campo', { batch_id: batchId, prev_op_id: null }), { newId: d.newId, now: d.now() });
    await commitOps(db, [edit, status]);
    expect(await relatorioStatus(db)).toBe('em_campo');

    // Another device moved the relatório to Em revisão first: the server applies the edit and refuses the status op alone.
    await markSent(db, [edit.op_id, status.op_id]);
    await markAcked(db, [{ op_id: edit.op_id, seq: 1001 }]);
    await markDead(db, [{ op_id: status.op_id, code: 'op_status_transition' }]);
    expect(await relatorioStatus(db)).toBe(pulledStatus);

    // The next pull brings the other device's status op and this device's edit back.
    const other: Op = { ...status, op_id: '019966b0-0001-7000-8000-00000000ac01', device_id: 'tablet-b', value: 'em_revisao', batch_id: null, seq: 1000 };
    await applyPulled(db, [other, { ...edit, seq: 1001 }]);
    expect(await relatorioStatus(db)).toBe('em_revisao');
    expect((await block(db)).sheet.observations?.value).toBe('campo');
    expect(await db.outbox.get(status.op_id)).toMatchObject({ status: 'dead', error_code: 'op_status_transition', value: 'em_campo' });
    db.close();
  });
});

describe('dead-op re-materialization (1.4 deferred settling test)', () => {
  it('a rejected op leaves the row, toSnapshot drops its effect, the value stays in the outbox', async () => {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    const keep = makeOp(put(`sheet/${BLOCK_1_ID}/observations`, 'fica'), { newId: d.newId, now: d.now() });
    const x = makeOp(put(FIELD, 'REJEITADO'), { newId: d.newId, now: d.now() });
    await commitOps(db, [keep, x]);
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('REJEITADO');

    await markDead(db, [{ op_id: x.op_id, code: 'op_server_only' }]);

    const row = await block(db);
    const key = entityKey('block', BLOCK_1_ID);
    const remote = (await db.remote_ops.where('targets').equals(key).toArray()).sort((a, b) => a.seq - b.seq);
    const local = (await db.outbox.where('targets').equals(key).toArray()).filter((r) => r.status !== 'dead').map(opOf);
    expect(row).toEqual(materializeEntity({ entity: 'block', id: BLOCK_1_ID }, remote, local));
    expect(row.sheet.nameplate.fabricacao).toBeUndefined();
    expect(row.sheet.observations?.value).toBe('fica');

    const snapshot = await toSnapshot(db, RELATORIO_ID);
    const b1 = snapshot.blocks.find((b) => b.id === BLOCK_1_ID)!;
    expect(b1.sheet.nameplate.fabricacao).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('REJEITADO');
    expect(await db.outbox.get(x.op_id)).toMatchObject({ status: 'dead', error_code: 'op_server_only', value: 'REJEITADO' });
    db.close();
  });

  it('takePending returns pending and sent rows in commit order and never dead or acked ones', async () => {
    const db = await freshDb();
    await commitOps(db, seedLog());
    const rows = await takePending(db);
    expect(rows.map((r) => r.op_id)).toEqual(seedLog().map((o) => o.op_id));
    await markSent(db, [rows[0]!.op_id]);
    await markAcked(db, [{ op_id: rows[1]!.op_id, seq: 1 }]);
    await markDead(db, [{ op_id: rows[2]!.op_id, code: 'op_invalid' }]);
    const again = await takePending(db);
    expect(again.map((r) => r.status)).not.toContain('acked');
    expect(again.map((r) => r.status)).not.toContain('dead');
    expect(again[0]).toMatchObject({ op_id: rows[0]!.op_id, status: 'sent' });
    expect(again).toHaveLength(rows.length - 2);
    db.close();
  });

  it('resendDead returns rows to pending, clears the code and restores the effect', async () => {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    const x = makeOp(put(FIELD, 'DE-NOVO'), { newId: d.newId, now: d.now() });
    await commitOps(db, [x]);
    await markDead(db, [{ op_id: x.op_id, code: 'op_invalid' }]);
    expect((await block(db)).sheet.nameplate.fabricacao).toBeUndefined();
    expect(await resendDead(db, d.now())).toBe(1);
    expect(await db.outbox.get(x.op_id)).toMatchObject({ status: 'pending', error_code: null });
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('DE-NOVO');
    expect(await resendDead(db, d.now())).toBe(0);
    db.close();
  });

  it('10.4 (ledger 160): "Reenviar" re-queues every dead op of a rejected batch in commit order; a later put the server acked stays acked and is not re-sent', async () => {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    const batchId = d.newId();
    const first = makeOp(put(FIELD, 'LOTE-1', { batch_id: batchId }), { newId: d.newId, now: d.now() });
    const second = makeOp(put(`sheet/${BLOCK_1_ID}/observations`, 'LOTE-2', { batch_id: batchId }), { newId: d.newId, now: d.now() });
    const later = makeOp(put(`sheet/${BLOCK_1_ID}/nameplate/tipo`, 'DEPOIS'), { newId: d.newId, now: d.now() });
    await commitOps(db, [first, second, later]);
    for (const row of await takePending(db)) if (![first.op_id, second.op_id, later.op_id].includes(row.op_id)) await markAcked(db, [{ op_id: row.op_id, seq: 1 }]);
    // Story 10.1 made a client batch atomic: the server rejects both ops of it together.
    await markDead(db, [
      { op_id: first.op_id, code: 'op_invalid' },
      { op_id: second.op_id, code: 'op_invalid' },
    ]);
    await markAcked(db, [{ op_id: later.op_id, seq: 99 }]);

    expect(await resendDead(db, d.now())).toBe(2);
    expect((await takePending(db)).map((row) => row.op_id)).toEqual([first.op_id, second.op_id]);
    expect(await db.outbox.get(later.op_id)).toMatchObject({ status: 'acked', seq: 99 });
    const row = await block(db);
    expect(row.sheet.nameplate.fabricacao?.value).toBe('LOTE-1');
    expect(row.sheet.observations?.value).toBe('LOTE-2');
    expect(row.sheet.nameplate.tipo?.value).toBe('DEPOIS');
    db.close();
  });

  it('e20f: "Reenviar" stamps the rows refused op_attribution again at now, in commit order; other dead rows keep their stamp', async () => {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    for (const row of await takePending(db)) await markAcked(db, [{ op_id: row.op_id, seq: 1 }]);
    // A clock 30 min fast: two ops, the second a removal whose instant came from the same clock.
    const fast = (ms: number) => new Date(Date.parse('2026-09-21T15:30:00.000Z') + ms);
    const first = makeOp(put(FIELD, 'RELOGIO-ADIANTADO'), { newId: d.newId, now: fast(0) });
    const second = makeOp(put(`block/${BLOCK_1_ID}/removed_at`, fast(500).toISOString()), { newId: d.newId, now: fast(1000) });
    const other = makeOp(put(`sheet/${BLOCK_1_ID}/observations`, 'OUTRO'), { newId: d.newId, now: fast(2000) });
    await commitOps(db, [first, second, other]);
    await markDead(db, [
      { op_id: first.op_id, code: 'op_attribution' },
      { op_id: second.op_id, code: 'op_attribution' },
      { op_id: other.op_id, code: 'op_invalid' },
    ]);
    const now = new Date('2026-09-21T15:00:00.000Z');
    // E20-A1 (R-2): the clock error the device learned (30 min fast) is passed in.
    expect(await resendDead(db, now, -30 * 60_000)).toBe(3);
    const rows = await takePending(db);
    expect(rows.map((row) => row.op_id)).toEqual([first.op_id, second.op_id, other.op_id]);
    expect(await db.outbox.get(first.op_id)).toMatchObject({ status: 'pending', error_code: null, client_ts: '2026-09-21T15:00:00.000Z' });
    // The removal instant moves by the clock error (15:00:00.500) and is then held at its own stamp.
    expect(await db.outbox.get(second.op_id)).toMatchObject({ client_ts: '2026-09-21T15:00:00.001Z', value: '2026-09-21T15:00:00.001Z' });
    expect(await db.outbox.get(other.op_id)).toMatchObject({ client_ts: other.client_ts, value: 'OUTRO' });
    db.close();
  });

  it('review: on a slow clock a refused create and its dependent refused op_target_missing are stamped again together, the create first', async () => {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    for (const row of await takePending(db)) await markAcked(db, [{ op_id: row.op_id, seq: 1 }]);
    // Three days slow: the create is refused op_attribution, and its edit, which names it, op_target_missing.
    const slow = (ms: number) => new Date(Date.parse('2026-09-18T15:00:00.000Z') + ms);
    const pointId = '019966b0-000f-7000-8000-0000000000aa';
    const row = { id: pointId, relatorio_id: RELATORIO_ID, text: 'Ponto novo', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null };
    const create = makeOp({ ...put(`point/${pointId}`, row), kind: 'create' }, { newId: d.newId, now: slow(0) });
    const edit = makeOp(put(`point/${pointId}/text`, 'Ponto editado'), { newId: d.newId, now: slow(1000) });
    await commitOps(db, [create, edit]);
    await markDead(db, [
      { op_id: create.op_id, code: 'op_attribution' },
      { op_id: edit.op_id, code: 'op_target_missing' },
    ]);
    const now = new Date('2026-09-21T15:00:00.000Z');
    expect(await resendDead(db, now)).toBe(2);
    expect((await takePending(db)).map((entry) => entry.op_id)).toEqual([create.op_id, edit.op_id]);
    expect(await db.outbox.get(create.op_id)).toMatchObject({ status: 'pending', client_ts: '2026-09-21T15:00:00.000Z' });
    expect(await db.outbox.get(edit.op_id)).toMatchObject({ status: 'pending', client_ts: '2026-09-21T15:00:00.001Z', value: 'Ponto editado' });
    db.close();
  });
});

describe('E20-A1 (R-2) "Reenviar" stamps again only what a wrong clock stamped, in commit order', () => {
  async function seeded() {
    const db = await freshDb();
    const d = deps();
    await commitOps(db, seedLog());
    for (const row of await takePending(db)) await markAcked(db, [{ op_id: row.op_id, seq: 1 }]);
    return { db, d };
  }
  const pointRow = (id: string) => ({ id, relatorio_id: RELATORIO_ID, text: 'Ponto novo', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null });

  it('a dead op_target_missing row with no create stamped again among its targets goes back pending with its stamps unchanged', async () => {
    const { db, d } = await seeded();
    const missing = '019966b0-000f-7000-8000-0000000000bb';
    const misdated = makeOp(put(FIELD, 'RELOGIO-ADIANTADO'), { newId: d.newId, now: new Date('2026-09-21T15:30:00.000Z') });
    const orphan = makeOp(put(`point/${missing}/text`, 'Ponto de outro aparelho'), { newId: d.newId, now: new Date('2026-09-21T14:00:00.000Z') });
    await commitOps(db, [misdated, orphan]);
    await markDead(db, [
      { op_id: misdated.op_id, code: 'op_attribution' },
      { op_id: orphan.op_id, code: 'op_target_missing' },
    ]);
    expect(await resendDead(db, new Date('2026-09-21T15:00:00.000Z'), -30 * 60_000)).toBe(2);
    expect(await db.outbox.get(misdated.op_id)).toMatchObject({ status: 'pending', client_ts: '2026-09-21T15:00:00.000Z' });
    expect(await db.outbox.get(orphan.op_id)).toMatchObject({ status: 'pending', error_code: null, client_ts: orphan.client_ts, value: 'Ponto de outro aparelho' });
    db.close();
  });

  it('a create and its dependent are stamped again in commit order (op_id), the create first, even when the clock moved back between them', async () => {
    const { db, d } = await seeded();
    const pointId = '019966b0-000f-7000-8000-0000000000ac';
    // Committed first at 15:30 on a fast clock, then the clock was set back: the edit says 15:10.
    const create = makeOp({ ...put(`point/${pointId}`, pointRow(pointId)), kind: 'create' }, { newId: d.newId, now: new Date('2026-09-21T15:30:00.000Z') });
    const edit = makeOp(put(`point/${pointId}/text`, 'Ponto editado'), { newId: d.newId, now: new Date('2026-09-21T15:10:00.000Z') });
    expect(create.op_id < edit.op_id).toBe(true);
    await commitOps(db, [create, edit]);
    await markDead(db, [
      { op_id: create.op_id, code: 'op_attribution' },
      { op_id: edit.op_id, code: 'op_target_missing' },
    ]);
    expect(await resendDead(db, new Date('2026-09-21T16:00:00.000Z'))).toBe(2);
    expect(await db.outbox.get(create.op_id)).toMatchObject({ client_ts: '2026-09-21T16:00:00.000Z' });
    expect(await db.outbox.get(edit.op_id)).toMatchObject({ client_ts: '2026-09-21T16:00:00.001Z', value: 'Ponto editado' });
    expect((await takePending(db)).map((row) => row.op_id)).toEqual([create.op_id, edit.op_id]);
    db.close();
  });

  it('a concluded_by.at stamped by a clock 30 minutes fast moves by the learned error, not to the resend time', async () => {
    const { db, d } = await seeded();
    const concluded = makeOp(put(`block/${BLOCK_1_ID}/concluded_by`, { actor_id: USER_ID, at: '2026-09-21T15:29:00.000Z' }), { newId: d.newId, now: new Date('2026-09-21T15:30:00.000Z') });
    await commitOps(db, [concluded]);
    await markDead(db, [{ op_id: concluded.op_id, code: 'op_attribution' }]);
    // Resent two hours later (real time 17:00), after the device learned it runs 30 minutes fast.
    expect(await resendDead(db, new Date('2026-09-21T17:00:00.000Z'), -30 * 60_000)).toBe(1);
    expect(await db.outbox.get(concluded.op_id)).toMatchObject({ client_ts: '2026-09-21T17:00:00.000Z', value: { actor_id: USER_ID, at: '2026-09-21T14:59:00.000Z' } });
    db.close();
  });
});

describe('cross-stream dedupe', () => {
  it('a project-scope op present in two relatorio streams is applied once', async () => {
    const db = await freshDb();
    const equipment = replaySmall.log.find((op) => op.path === `equipment/${EQUIPMENT_1_ID}`)!;
    const rename = replaySmall.log.find((op) => op.path === `equipment/${EQUIPMENT_1_ID}/tag`) ?? {
      ...equipment,
      op_id: '019966b0-0001-7000-8000-00000000ac01',
      kind: 'put' as const,
      path: `equipment/${EQUIPMENT_1_ID}/tag`,
      value: 'TR-01A',
      seq: 999,
    };
    await applyPulled(db, [equipment, rename]);
    const once = (await db.entities.get(['equipment', EQUIPMENT_1_ID]))!;
    await applyPulled(db, [equipment, rename]);
    await applyPulled(db, [rename]);
    expect(await db.remote_ops.count()).toBe(2);
    // The row is the one applied once; each write stamps a fresh `rev` (E7-A1/E8-A1), so it is left out.
    expect({ ...(await db.entities.get(['equipment', EQUIPMENT_1_ID]))!, rev: undefined }).toEqual({ ...once, rev: undefined });
    expect((once.row as EquipmentRow).project_id).toBe(PROJECT_ID);
    db.close();
  });
});

describe('convergence after the pull-back (replaces the 1.4 first_edited_at pin)', () => {
  it('the device row equals the server replay of the pushed log once pulled back', async () => {
    const db = await freshDb();
    const dead = new Set(replaySmall.deadOpIds);
    const live = replaySmall.log.filter((op) => !dead.has(op.op_id));
    await commitOps(db, live);

    const outbox = await takePending(db);
    expect(live).toHaveLength(64);
    // W-2: no coalescing in the store, so the server sees every op the device applied.
    expect(outbox).toHaveLength(64);
    const pushed: Op[] = outbox.map((row, index) => ({ ...opOf(row), seq: index + 1 }));
    const server = replay(pushed);

    // The server acks every op and the device pulls them back with their seqs.
    await markSent(db, outbox.map((r) => r.op_id));
    await markAcked(db, pushed.map((op) => ({ op_id: op.op_id, seq: op.seq! })));
    await applyPulled(db, pushed);

    const after = await block(db);
    expect(after.first_edited_at).toBe((server.get(entityKey('block', BLOCK_1_ID)) as BlockRow).first_edited_at);
    expect(serializeSnapshot(await toSnapshot(db, RELATORIO_ID))).toBe(
      serializeSnapshot(buildSnapshot(server, RELATORIO_ID)),
    );
    expect((await db.outbox.where('status').equals('acked').count())).toBe(64);
    db.close();
  });
});

describe('a server merge converges on the device that sent the merged ops (Epic 2 retro D-1)', () => {
  const SURVIVOR = '019966b0-00d1-7000-8000-000000000001';
  const GHOST = '019966b0-00d1-7000-8000-000000000002';

  function registryOp(input: Omit<OpInput, 'scope' | 'company_id' | 'actor_id' | 'device_id'>, n: number): Op {
    return makeOp(
      { scope: 'company', company_id: COMPANY_ID, actor_id: USER_ID, device_id: 'tablet-a', ...input },
      {
        newId: () => `019966b0-00d2-7000-8000-${n.toString(16).padStart(12, '0')}`,
        now: new Date(Date.parse('2026-09-22T10:00:00.000Z') + n * 1000),
      },
    );
  }

  function manufacturer(id: string, name: string) {
    return { id, kind: 'manufacturer', name, gender: null, number: null, removed_at: null } as const;
  }

  it('retires the merged-away row and lands its later edits on the survivor, across two cycles', async () => {
    const db = await freshDb();
    // The survivor is already on the server and pulled here.
    const survivorCreate = registryOp(
      { kind: 'create', path: `registry/manufacturer/${SURVIVOR}`, value: manufacturer(SURVIVOR, 'Schneider') },
      1,
    );
    await applyPulled(db, [{ ...survivorCreate, seq: 1 }]);

    // This device creates "SCHNEIDER " and gives it a gender, offline.
    const ghostCreate = registryOp(
      { kind: 'create', path: `registry/manufacturer/${GHOST}`, value: manufacturer(GHOST, 'SCHNEIDER ') },
      2,
    );
    const ghostGender = registryOp({ kind: 'put', path: `registry/manufacturer/${GHOST}/gender`, value: 'f' }, 3);
    await commitOps(db, [ghostCreate, ghostGender]);
    expect(await db.entities.get(['registry', GHOST])).toBeDefined();

    // Cycle 1: the server logged both ops on the survivor and retired the ghost id.
    await markAcked(db, [
      { op_id: ghostCreate.op_id, seq: 2 },
      { op_id: ghostGender.op_id, seq: 4 },
    ]);
    // Between the push and the pull the ghost is still on screen and gets one more edit.
    const ghostNumber = registryOp({ kind: 'put', path: `registry/manufacturer/${GHOST}/number`, value: 'singular' }, 5);
    await commitOps(db, [ghostNumber]);
    const retire: Op = {
      ...registryOp(
        { kind: 'remove', path: `registry/manufacturer/${GHOST}/removed_at`, value: null, meta: { merged_into: SURVIVOR } },
        4,
      ),
      actor_id: 'system:registry',
      device_id: 'server',
      seq: 3,
    };
    await applyPulled(db, [
      { ...ghostCreate, path: `registry/manufacturer/${SURVIVOR}`, value: manufacturer(SURVIVOR, 'SCHNEIDER '), seq: 2 },
      retire,
      { ...ghostGender, path: `registry/manufacturer/${SURVIVOR}/gender`, seq: 4 },
    ]);
    expect(await db.entities.get(['registry', GHOST])).toBeUndefined();
    expect((await db.entities.get(['registry', SURVIVOR]))!.row).toMatchObject({ name: 'Schneider', gender: 'f', number: null });

    // Cycle 2: the later edit is redirected by the persisted merge and pulled back on the survivor.
    await markAcked(db, [{ op_id: ghostNumber.op_id, seq: 5 }]);
    await applyPulled(db, [{ ...ghostNumber, path: `registry/manufacturer/${SURVIVOR}/number`, seq: 5 }]);
    expect(await db.entities.get(['registry', GHOST])).toBeUndefined();
    expect((await db.entities.get(['registry', SURVIVOR]))!.row).toMatchObject({
      name: 'Schneider',
      gender: 'f',
      number: 'singular',
    });
    db.close();
  });

  it('ledger 334: the pulled system:registry remove alone retires the minting device merged-away row, its create still pending (the push answer was lost)', async () => {
    const db = await freshDb();
    const survivorCreate = registryOp({ kind: 'create', path: `registry/manufacturer/${SURVIVOR}`, value: manufacturer(SURVIVOR, 'Schneider') }, 11);
    await applyPulled(db, [{ ...survivorCreate, seq: 1 }]);
    const ghostCreate = registryOp({ kind: 'create', path: `registry/manufacturer/${GHOST}`, value: manufacturer(GHOST, 'schneider') }, 12);
    await commitOps(db, [ghostCreate]);
    expect(await db.entities.get(['registry', GHOST])).toBeDefined();
    // No ack ever reached the device: the pull carries the create logged on the survivor
    // and the server's retirement of the minted id.
    const retire: Op = {
      ...registryOp({ kind: 'remove', path: `registry/manufacturer/${GHOST}/removed_at`, value: null, meta: { merged_into: SURVIVOR } }, 13),
      actor_id: 'system:registry',
      device_id: 'server',
      seq: 3,
    };
    await applyPulled(db, [{ ...ghostCreate, path: `registry/manufacturer/${SURVIVOR}`, value: manufacturer(SURVIVOR, 'schneider'), seq: 2 }, retire]);
    expect(await db.entities.get(['registry', GHOST])).toBeUndefined();
    expect((await db.entities.where('entity').equals('registry').toArray()).map((record) => record.id)).toEqual([SURVIVOR]);
    expect((await db.outbox.get(ghostCreate.op_id))?.status).toBe('acked');
    db.close();
  });
});

describe('5.9-UNIT notTestedSynced', () => {
  it('nothing local to wait on: an empty outbox reads synced', async () => {
    const db = await freshDb();
    await applyPulled(db, seedLog());
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(true);
    db.close();
  });

  it('one pending row reads unsynced; once acked it reads synced', async () => {
    const db = await freshDb();
    const d = deps();
    await applyPulled(db, seedLog());
    const mark = makeOp(put(`block/${BLOCK_1_ID}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: d.now().toISOString(), by: USER_ID }), { newId: d.newId, now: d.now() });
    await commitOps(db, [mark]);
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(false);
    await markSent(db, [mark.op_id]);
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(false);
    await markAcked(db, [{ op_id: mark.op_id, seq: 999 }]);
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(true);
    db.close();
  });

  it('the latest write wins: an older acked mark undone by a newer pending one reads unsynced', async () => {
    const db = await freshDb();
    const d = deps();
    await applyPulled(db, seedLog());
    const mark = makeOp(put(`block/${BLOCK_1_ID}/not_tested`, { reason: 'outro', text: 'x', at: d.now().toISOString(), by: USER_ID }), { newId: d.newId, now: d.now() });
    await commitOps(db, [mark]);
    await markAcked(db, [{ op_id: mark.op_id, seq: 998 }]);
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(true);
    const undo = makeOp(put(`block/${BLOCK_1_ID}/not_tested`, null), { newId: d.newId, now: d.now() });
    await commitOps(db, [undo]);
    expect(await notTestedSynced(db, BLOCK_1_ID)).toBe(false);
    db.close();
  });
});

describe('10.3-UNIT mergeTextContext for a block added elsewhere', () => {
  it('reads the block\'s location, so the row names where it was added ("… adicionou ⟨TAG⟩ em ⟨local⟩")', async () => {
    const db = await freshDb();
    await commitOps(db, seedLog(), deps());
    const added = await block(db);
    const location = (await db.entities.get(['location', added.location_id!]))!.row as LocationRow;
    const equipment = (await db.entities.get(['equipment', added.equipment_id!]))!.row as EquipmentRow;
    const create = replaySmall.log.find((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create')!;
    const info: MergeInfo = {
      op_id: create.op_id,
      over_op_id: null,
      relatorio_id: RELATORIO_ID,
      block_id: BLOCK_1_ID,
      path: create.path,
      rule: 'block_added',
      standing: { value: null, op_id: create.op_id, actor_id: USER_ID, client_ts: create.client_ts },
      overridden: null,
    };
    const context = await mergeTextContext(db, [info]);
    expect(context.locations).toEqual(expect.arrayContaining([expect.objectContaining({ id: location.id, name: location.name })]));
    expect(mergeInfoText(info, context)).toMatch(new RegExp(` adicionou ${equipment.tag} em ${location.name}$`));
    db.close();
  });
});

describe('10.4-UNIT unackedPhotoUploads', () => {
  it('lists the unacked originals of live photos the server does not hold, with the error flag from upload_error', async () => {
    const db = await freshDb();
    const id = (n: number) => `019966b0-00a4-7000-8000-${n.toString(16).padStart(12, '0')}`;
    const photoRow = (n: number, extra: Record<string, unknown> = {}) => ({
      id: id(n),
      kind: 'photo',
      relatorio_id: RELATORIO_ID,
      caption: `Foto ${n}`,
      captured_at: `2026-09-07T17:0${n}:00.000Z`,
      reading_status: 'none',
      removed_at: null,
      uploaded_at: null,
      ...extra,
    });
    const put = async (n: number, row: Record<string, unknown>, blob: { acked?: boolean; variant?: 'original' | 'thumb'; error?: boolean; details?: unknown } = {}) => {
      await db.entities.put({ entity: 'file', id: id(n), relatorio_id: RELATORIO_ID, project_id: null, removed_at: (row.removed_at as string | null) ?? null, row: row as never });
      await db.files.put({
        id: id(n),
        variant: blob.variant ?? 'original',
        blob: new Blob(['x']),
        acked: blob.acked ?? false,
        created_at: '2026-09-07T17:00:00.000Z',
        ...(blob.error
          ? { upload_error: { state: 'dead' as const, code: 'file_too_large', at: '2026-09-07T17:10:00.000Z', ...(blob.details === undefined ? {} : { details: blob.details }) } }
          : {}),
      });
    };
    await put(1, photoRow(1));
    await put(2, photoRow(2), { error: true });
    await put(3, photoRow(3, { removed_at: '2026-09-07T17:20:00.000Z' }));
    await put(4, photoRow(4, { uploaded_at: '2026-09-07T17:20:00.000Z' }));
    await put(5, photoRow(5), { acked: true });
    await put(6, { id: id(6), kind: 'certificate', relatorio_id: null, removed_at: null, uploaded_at: null });
    await put(7, photoRow(7), { variant: 'thumb' });
    await put(8, photoRow(8, { removed_at: undefined, uploaded_at: undefined }));
    // Story 20.12: the server's details of the refusal come back for the row's sentence.
    await put(9, photoRow(9), { error: true, details: { limit: 'pixels', max_pixels: 120_000_000 } });

    const rows = (await unackedPhotoUploads(db)).sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(rows).toEqual([
      { id: id(1), caption: 'Foto 1', captured_at: '2026-09-07T17:01:00.000Z', reading_status: 'none', error: false, error_code: null },
      { id: id(2), caption: 'Foto 2', captured_at: '2026-09-07T17:02:00.000Z', reading_status: 'none', error: true, error_code: 'file_too_large' },
      { id: id(8), caption: 'Foto 8', captured_at: '2026-09-07T17:08:00.000Z', reading_status: 'none', error: false, error_code: null },
      {
        id: id(9),
        caption: 'Foto 9',
        captured_at: '2026-09-07T17:09:00.000Z',
        reading_status: 'none',
        error: true,
        error_code: 'file_too_large',
        error_details: { limit: 'pixels', max_pixels: 120_000_000 },
      },
    ]);
    db.close();
  });
});
