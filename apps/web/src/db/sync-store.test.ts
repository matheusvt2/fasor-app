import 'fake-indexeddb/auto';
import {
  buildSnapshot,
  entityKey,
  makeOp,
  materializeEntity,
  replay,
  serializeSnapshot,
  type BlockRow,
  type EquipmentRow,
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
  notTestedSynced,
  resendDead,
  takePending,
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
    expect(await resendDead(db)).toBe(1);
    expect(await db.outbox.get(x.op_id)).toMatchObject({ status: 'pending', error_code: null });
    expect((await block(db)).sheet.nameplate.fabricacao?.value).toBe('DE-NOVO');
    expect(await resendDead(db)).toBe(0);
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
    expect(await db.entities.get(['equipment', EQUIPMENT_1_ID])).toEqual(once);
    expect((once.row as EquipmentRow).project_id).toBe(PROJECT_ID);
    db.close();
  });
});

describe('convergence after the pull-back (replaces the 1.4 first_edited_at pin)', () => {
  it('the device row equals the server replay of the pushed (coalesced) log once pulled back', async () => {
    const db = await freshDb();
    const dead = new Set(replaySmall.deadOpIds);
    const live = replaySmall.log.filter((op) => !dead.has(op.op_id));
    await commitOps(db, live);

    const outbox = await takePending(db);
    expect(live).toHaveLength(64);
    expect(outbox).toHaveLength(63);
    // Before the pull-back the device shows the first op it applied; the server only saw the merged one.
    const pushed: Op[] = outbox.map((row, index) => ({ ...opOf(row), seq: index + 1 }));
    const server = replay(pushed);
    const before = await block(db);
    expect(before.first_edited_at).not.toBe((server.get(entityKey('block', BLOCK_1_ID)) as BlockRow).first_edited_at);

    // The server acks every op and the device pulls them back with their seqs.
    await markSent(db, outbox.map((r) => r.op_id));
    await markAcked(db, pushed.map((op) => ({ op_id: op.op_id, seq: op.seq! })));
    await applyPulled(db, pushed);

    const after = await block(db);
    expect(after.first_edited_at).toBe((server.get(entityKey('block', BLOCK_1_ID)) as BlockRow).first_edited_at);
    expect(serializeSnapshot(await toSnapshot(db, RELATORIO_ID))).toBe(
      serializeSnapshot(buildSnapshot(server, RELATORIO_ID)),
    );
    expect((await db.outbox.where('status').equals('acked').count())).toBe(63);
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
