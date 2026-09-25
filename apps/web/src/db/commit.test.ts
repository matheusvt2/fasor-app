// @vitest-environment node
import 'fake-indexeddb/auto';
import {
  buildSnapshot,
  emptySheet,
  makeOp,
  relatorioSnapshotSchema,
  replay,
  serializeSnapshot,
  type BlockRow,
  type Op,
  type OpInput,
} from '@app/domain';
import {
  BLOCK_1_ID,
  CABINE_ID,
  COMPANY_ID,
  EQUIPMENT_1_ID,
  fixedTs,
  PROJECT_ID,
  RELATORIO_ID,
  replaySmall,
  USER_ID,
} from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import { commitBatch, commitOps, oldestPendingClientTs, undoBatch } from './commit.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { applyPulled } from './sync-store.ts';
import { toSnapshot } from './snapshot.ts';

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-000a-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

/** Deterministic ids and a clock advancing one second per call. */
function deps(prefix = '019966b0-000b-7000-8000-') {
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

/** Commits the fixture log up to and including the block creates, so sheet ops have a target. */
async function seed(db: AppDatabase): Promise<void> {
  const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
  await commitOps(db, replaySmall.log.slice(0, upTo + 1));
}

describe('1.4-INT-001 Dexie replay', () => {
  it('replays the small fixture through commitOps into the golden snapshot', async () => {
    const db = await freshDb();
    const dead = new Set(replaySmall.deadOpIds);
    const live = replaySmall.log.filter((op) => !dead.has(op.op_id));
    await commitOps(db, live);
    const dexie = serializeSnapshot(await toSnapshot(db, replaySmall.relatorioId));
    const pure = serializeSnapshot(buildSnapshot(replay(replaySmall.log, { deadOpIds: dead }), replaySmall.relatorioId));
    expect(dexie).toBe(pure);
    expect(dexie).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(replaySmall.golden)));
    expect(await db.outbox.count()).toBeGreaterThan(0);
    db.close();
  });

  it('resolves the responsible from a pulled user row, byte-equal to the pure replay (Story 4.8)', async () => {
    const db = await freshDb();
    const dead = new Set(replaySmall.deadOpIds);
    const live = replaySmall.log.filter((op) => !dead.has(op.op_id));
    await commitOps(db, live);
    // Provisioning's projection of the fixture's user, as the company pull brings it. It
    // precedes every fixture op (`seq: 0`): the fixture's own `user/{id}/{field}` puts are
    // this device's outbox ops, applied after the pulled rows, so the pure replay lists
    // the create first too and the two orders agree.
    const userOp: Op = {
      op_id: '019966b0-0001-7000-8000-00000000f001',
      kind: 'create',
      scope: 'company',
      company_id: COMPANY_ID,
      project_id: null,
      relatorio_id: null,
      path: `user/${USER_ID}`,
      value: { id: USER_ID, name: 'Ana Alves', email: 'a@teste.local', council: 'crea', registration_number: '5063583141', title: 'Eng. Eletricista', photo_location_enabled: true },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: 'system:identity',
      device_id: 'server',
      client_ts: fixedTs(0),
      seq: 0,
    };
    await applyPulled(db, [userOp]);
    const snapshot = await toSnapshot(db, replaySmall.relatorioId);
    expect(snapshot.relatorio.setup.responsible_user_id).toBe(USER_ID);
    // The fixture's own registration puts landed on the projected row.
    expect(snapshot.responsible).toMatchObject({ id: USER_ID, name: 'Ana Alves', council: 'crea', title: 'Eng. Eletricista' });
    const pure = buildSnapshot(replay([userOp, ...replaySmall.log], { deadOpIds: dead }), replaySmall.relatorioId);
    expect(pure.responsible).not.toBeNull();
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(pure));
    db.close();
  });
});

describe('commitOps', () => {
  it('oldestPendingClientTs looks at the rows still on their way to the server', async () => {
    const db = await freshDb();
    const d = deps();
    const a = makeOp(put(`location/${CABINE_ID}/name`, 'a'), { newId: d.newId, now: d.now() });
    await commitOps(db, [a]);
    expect(await oldestPendingClientTs(db)).toBe(a.client_ts);
    // A request that was sent and never answered is still unsynced work (AD-8).
    await db.outbox.update(a.op_id, { status: 'sent' });
    expect(await oldestPendingClientTs(db)).toBe(a.client_ts);
    await db.outbox.update(a.op_id, { status: 'acked' });
    expect(await oldestPendingClientTs(db)).toBeNull();
    // A refused op is not waiting to be sent: it waits for "Reenviar".
    await db.outbox.update(a.op_id, { status: 'dead', error_code: 'op_server_only' });
    expect(await oldestPendingClientTs(db)).toBeNull();
    const b = makeOp(put(`location/${CABINE_ID}/name`, 'b'), { newId: d.newId, now: d.now() });
    await commitOps(db, [b]);
    expect(await oldestPendingClientTs(db)).toBe(b.client_ts);
    db.close();
  });

  it('writes the op to outbox and applies it in one transaction', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const op = makeOp(put(FIELD, 'WEG'), { newId: d.newId, now: d.now() });
    await commitOps(db, [op]);
    const row = await db.outbox.get(op.op_id);
    expect(row).toMatchObject({ status: 'pending', error_code: null, path: FIELD, value: 'WEG' });
    const block = (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
    expect(block.sheet.nameplate.fabricacao).toEqual({ value: 'WEG', source_suggestion_id: null, op_id: op.op_id });
    expect(block.last_modified_at).toBe(op.client_ts);
    expect(await oldestPendingClientTs(db)).toBe(replaySmall.log[0]!.client_ts);
    db.close();
  });

  it('leaves entities and outbox untouched when applyOp throws mid-batch', async () => {
    const db = await freshDb();
    await seed(db);
    const entitiesBefore = await db.entities.toArray();
    const outboxBefore = await db.outbox.toArray();
    const d = deps();
    const good = makeOp(put(FIELD, 'WEG'), { newId: d.newId, now: d.now() });
    const bad: Op = { ...makeOp(put(`block/${BLOCK_1_ID}/order_key`, 'a9'), { newId: d.newId, now: d.now() }), value: 42 };
    await expect(commitOps(db, [good, bad])).rejects.toThrow();
    expect(await db.entities.toArray()).toEqual(entitiesBefore);
    expect(await db.outbox.toArray()).toEqual(outboxBefore);
    db.close();
  });
});

describe('1.4-UNIT-003 outbox coalescing in the store', () => {
  it('merges two consecutive plain puts on one path from the same device into one row', async () => {
    const db = await freshDb();
    await seed(db);
    const before = await db.outbox.count();
    const d = deps();
    const first = makeOp(put(FIELD, 'W', { prev_op_id: replaySmall.log[0]!.op_id }), { newId: d.newId, now: d.now() });
    const second = makeOp(put(FIELD, 'WEG'), { newId: d.newId, now: d.now() });
    await commitOps(db, [first]);
    await commitOps(db, [second]);
    expect(await db.outbox.count()).toBe(before + 1);
    expect(await db.outbox.get(first.op_id)).toBeUndefined();
    const row = await db.outbox.get(second.op_id);
    expect(row).toMatchObject({ value: 'WEG', client_ts: second.client_ts, prev_op_id: first.prev_op_id, status: 'pending' });
    // prev_value is the value before the first put (the cell did not exist), so undo restores that.
    expect(row?.prev_value).toBeUndefined();
    const block = (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
    expect(block.sheet.nameplate.fabricacao?.op_id).toBe(second.op_id);
    db.close();
  });

  it('keeps two rows when either op has meta or batch_id, or another path intervenes', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const base = await db.outbox.count();
    const suggestion = '019966b0-000c-7000-8000-000000000001';

    await commitOps(db, [makeOp(put(FIELD, 'a'), { newId: d.newId, now: d.now() })]);
    await commitOps(db, [makeOp(put(FIELD, 'b', { meta: { source_suggestion_id: suggestion } }), { newId: d.newId, now: d.now() })]);
    expect(await db.outbox.count()).toBe(base + 2);

    await commitOps(db, [makeOp(put(FIELD, 'c'), { newId: d.newId, now: d.now() })]);
    expect(await db.outbox.count()).toBe(base + 3);
    await commitOps(db, [makeOp(put(FIELD, 'd', { batch_id: suggestion }), { newId: d.newId, now: d.now() })]);
    expect(await db.outbox.count()).toBe(base + 4);

    await commitOps(db, [makeOp(put(FIELD, 'e'), { newId: d.newId, now: d.now() })]);
    await commitOps(db, [makeOp(put(`location/${CABINE_ID}/name`, 'x'), { newId: d.newId, now: d.now() })]);
    await commitOps(db, [makeOp(put(FIELD, 'f'), { newId: d.newId, now: d.now() })]);
    expect(await db.outbox.count()).toBe(base + 7);
    db.close();
  });

  it('does not coalesce onto a row that is no longer pending', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const first = makeOp(put(FIELD, 'a'), { newId: d.newId, now: d.now() });
    await commitOps(db, [first]);
    await db.outbox.update(first.op_id, { status: 'acked' });
    const count = await db.outbox.count();
    await commitOps(db, [makeOp(put(FIELD, 'b'), { newId: d.newId, now: d.now() })]);
    expect(await db.outbox.count()).toBe(count + 1);
    expect(await db.outbox.get(first.op_id)).toMatchObject({ status: 'acked', value: 'a' });
    db.close();
  });
});

describe('batch and undo', () => {
  it('N changes share one batch_id and undoBatch writes N inverse ops in a new batch', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const NEW_BLOCK = '019966b0-000d-7000-8000-000000000001';
    const inputs: OpInput[] = [
      put(`block/${BLOCK_1_ID}/order_key`, 'a7'),
      put(FIELD, 'WEG'),
      { ...put(`block/${BLOCK_1_ID}/removed_at`, null), kind: 'remove' },
      {
        ...put(`block/${NEW_BLOCK}`, {
          id: NEW_BLOCK,
          relatorio_id: RELATORIO_ID,
          location_id: CABINE_ID,
          equipment_id: null,
          block_type: 'tp',
          config: {},
          seed_version: 'v1',
          order_key: 'a8',
          feeds_block_id: null,
          not_tested: null,
          concluded_by: null,
          sheet: emptySheet(),
          created_by: null,
          first_edited_at: null,
          last_modified_by: null,
          last_modified_at: null,
          removed_at: null,
        }),
        kind: 'create',
      },
    ];
    const outboxBefore = await db.outbox.count();
    const { batch_id, ops } = await commitBatch(db, inputs, d);
    expect(ops).toHaveLength(4);
    expect(ops.every((op) => op.batch_id === batch_id)).toBe(true);
    expect(await db.outbox.where('batch_id').equals(batch_id).count()).toBe(4);
    expect(await db.outbox.count()).toBe(outboxBefore + 4);
    let block = (await db.entities.get(['block', BLOCK_1_ID]))!;
    expect(block.removed_at).not.toBeNull();
    expect((block.row as BlockRow).order_key).toBe('a7');

    const inverses = await undoBatch(db, batch_id, d);
    expect(inverses).toHaveLength(4);
    const undoBatchId = inverses[0]!.batch_id!;
    expect(undoBatchId).not.toBe(batch_id);
    expect(inverses.every((op) => op.batch_id === undoBatchId)).toBe(true);
    expect(await db.outbox.where('batch_id').equals(undoBatchId).count()).toBe(4);
    expect(await db.outbox.count()).toBe(outboxBefore + 8);

    block = (await db.entities.get(['block', BLOCK_1_ID]))!;
    expect(block.removed_at).toBeNull();
    expect((block.row as BlockRow).order_key).toBe('a0');
    expect((block.row as BlockRow).sheet.nameplate.fabricacao?.value).toBeNull();
    const created = (await db.entities.get(['block', NEW_BLOCK]))!;
    expect(created.removed_at).not.toBeNull();
    db.close();
  });

  it("stamps this device's minted id on every op, whatever the caller passed (retro A4)", async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const { device_id: _ignored, ...withoutDevice } = put(FIELD, 'ABB');
    void _ignored;
    // A caller outside the type (JavaScript, a cast) that still sends a device id is overwritten.
    const spoofed = { ...put(`block/${BLOCK_1_ID}/order_key`, 'a9'), device_id: 'someone-else' };
    const first = await commitBatch(db, [withoutDevice, spoofed], d);
    const second = await commitBatch(db, [put(FIELD, 'WEG')], d);
    // commitOps, the lower write path, stamps too.
    const direct = makeOp(put(FIELD, 'Siemens', { device_id: 'hand-set' }), { newId: d.newId, now: d.now() });
    const third = await commitOps(db, [direct], d);
    const minted = (await db.local_prefs.get('device_id'))?.value;
    expect(typeof minted).toBe('string');
    for (const op of [...first.ops, ...second.ops, ...third]) expect(op.device_id).toBe(minted);
    expect((await db.outbox.get(direct.op_id))?.device_id).toBe(minted);
    const rows = await db.outbox.where('batch_id').anyOf([first.batch_id, second.batch_id]).toArray();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.device_id).toBe(minted);
    db.close();
  });

  it('fills prev_op_id with the last op this device applied on the path (AD-3)', async () => {
    const db = await freshDb();
    const d = deps();
    // Nothing on the path yet, then the earlier op of the same batch.
    const first = await commitBatch(db, [put(FIELD, 'a'), put(FIELD, 'b')], d);
    expect(first.ops[0]!.prev_op_id).toBeNull();
    expect(first.ops[1]!.prev_op_id).toBe(first.ops[0]!.op_id);
    // The device's own op the server has not sent back yet.
    const second = await commitBatch(db, [put(FIELD, 'c')], d);
    expect(second.ops[0]!.prev_op_id).toBe(first.ops[1]!.op_id);
    // A pulled op on a path this device never wrote.
    const ORDER = `block/${BLOCK_1_ID}/order_key`;
    const pulled = { ...makeOp({ ...put(ORDER, 'a5'), device_id: 'other-tablet' }, { newId: d.newId, now: d.now() }), seq: 7 };
    await applyPulled(db, [pulled]);
    const third = await commitBatch(db, [put(ORDER, 'a6')], d);
    expect(third.ops[0]!.prev_op_id).toBe(pulled.op_id);
    // A caller that sets it keeps its own value.
    const fourth = await commitBatch(db, [put(ORDER, 'a7', { prev_op_id: pulled.op_id })], d);
    expect(fourth.ops[0]!.prev_op_id).toBe(pulled.op_id);
    db.close();
  });

  it('skips dead rows of the batch: the server never applied them', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    const { batch_id, ops } = await commitBatch(db, [put(`block/${BLOCK_1_ID}/order_key`, 'a7'), put(FIELD, 'WEG')], d);
    await db.outbox.update(ops[1]!.op_id, { status: 'dead', error_code: 'op_invalid' });
    const inverses = await undoBatch(db, batch_id, d);
    expect(inverses).toHaveLength(1);
    expect(inverses[0]!.path).toBe(`block/${BLOCK_1_ID}/order_key`);
    db.close();
  });
});

describe('coalescing vs first_edited_at (option b: re-materialization on pull)', () => {
  // Until the block's own ops are acked and pulled back, the device shows the first op it applied
  // (AD-18) while the server only ever sees the merged op (AD-3 coalescing). Story 1.5 resolves the
  // divergence by re-materializing from the server log: see "convergence after the pull-back" in
  // sync-store.test.ts. This block keeps the coalescing assertions themselves.
  it('the device row carries the first applied client_ts until the pull-back', async () => {
    const db = await freshDb();
    const dead = new Set(replaySmall.deadOpIds);
    const live = replaySmall.log.filter((op) => !dead.has(op.op_id));
    await commitOps(db, live);

    const outbox = await db.outbox.orderBy('client_ts').toArray();
    expect(live).toHaveLength(64);
    expect(outbox).toHaveLength(63);
    const merged = outbox.find((row) => row.path === FIELD)!;
    expect(merged).toMatchObject({ value: 'WEG S.A.', client_ts: fixedTs(27), prev_op_id: null });

    const device = (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
    expect(device.first_edited_at).toBe(fixedTs(26));
    expect(device.sheet.nameplate.fabricacao?.op_id).toBe(merged.op_id);
    db.close();
  });
});

describe('4.6-INT advanceOnEdit wiring in buildBatch/commitBatch', () => {
  async function statusOf(db: AppDatabase): Promise<string> {
    const record = await db.entities.get(['relatorio', RELATORIO_ID]);
    return (record!.row as { status: string }).status;
  }

  it('an edit on an Emitido relatório gets the Em revisão transition appended, in the same batch', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    await commitOps(db, [makeOp(put('relatorio/status', 'emitido'), { newId: d.newId, now: d.now() })]);
    expect(await statusOf(db)).toBe('emitido');

    const { batch_id, ops } = await commitBatch(db, [put(`block/${BLOCK_1_ID}/order_key`, 'a7')], deps());
    expect(ops.map((op) => op.path)).toEqual([`block/${BLOCK_1_ID}/order_key`, 'relatorio/status']);
    expect(ops[1]!.value).toBe('em_revisao');
    expect(ops.every((op) => op.batch_id === batch_id)).toBe(true);
    expect(await statusOf(db)).toBe('em_revisao');
    db.close();
  });

  it('an edit on a relatório not Emitido gets no extra op', async () => {
    const db = await freshDb();
    await seed(db);
    expect(await statusOf(db)).toBe('em_campo');

    const { ops } = await commitBatch(db, [put(`block/${BLOCK_1_ID}/order_key`, 'a7')], deps());
    expect(ops).toHaveLength(1);
    expect(await statusOf(db)).toBe('em_campo');
    db.close();
  });

  it('a batch that already writes relatorio/status itself gets no second one', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    await commitOps(db, [makeOp(put('relatorio/status', 'emitido'), { newId: d.newId, now: d.now() })]);

    const { ops } = await commitBatch(
      db,
      [put(`block/${BLOCK_1_ID}/order_key`, 'a7'), put('relatorio/status', 'em_revisao')],
      deps(),
    );
    expect(ops).toHaveLength(2);
    expect(ops.filter((op) => op.path === 'relatorio/status')).toHaveLength(1);
    db.close();
  });

  it('E4 retro Q15: a TAG rename of an equipment the Emitido relatório references moves it to Em revisão in the same batch', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    await commitOps(db, [makeOp(put('relatorio/status', 'emitido'), { newId: d.newId, now: d.now() })]);
    const rename = put(`equipment/${EQUIPMENT_1_ID}/tag`, 'TR-01B', { scope: 'project', project_id: PROJECT_ID, relatorio_id: null });
    const { batch_id, ops } = await commitBatch(db, [rename], deps());
    expect(ops.map((op) => op.path)).toEqual([`equipment/${EQUIPMENT_1_ID}/tag`, 'relatorio/status']);
    expect(ops[1]).toMatchObject({ relatorio_id: RELATORIO_ID, value: 'em_revisao', batch_id });
    expect(await statusOf(db)).toBe('em_revisao');
    db.close();
  });

  it('E4 retro item 18: an equipment of the obra the relatório does not reference is no edit of it', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    await commitOps(db, [makeOp(put('relatorio/status', 'emitido'), { newId: d.newId, now: d.now() })]);
    const other = '019966b0-000c-7000-8000-000000000001';
    const create: OpInput = {
      ...put(`equipment/${other}`, { id: other, project_id: PROJECT_ID, tag: 'TR-99', type: 'transformador_forca', last_nameplate: null, removed_at: null }),
      kind: 'create',
      scope: 'project',
      project_id: PROJECT_ID,
      relatorio_id: null,
    };
    const { ops } = await commitBatch(db, [create], deps());
    expect(ops).toHaveLength(1);
    expect(await statusOf(db)).toBe('emitido');
    db.close();
  });

  it('a non-edit op (suggestion/status, export scheme) never triggers the transition', async () => {
    const db = await freshDb();
    await seed(db);
    const d = deps();
    await commitOps(db, [makeOp(put('relatorio/status', 'emitido'), { newId: d.newId, now: d.now() })]);

    const { ops } = await commitBatch(db, [put('relatorio/export/scheme', 'ordem_de_campo')], deps());
    expect(ops).toHaveLength(1);
    expect(await statusOf(db)).toBe('emitido');
    db.close();
  });
});
