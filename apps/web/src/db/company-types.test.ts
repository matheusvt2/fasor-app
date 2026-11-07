// @vitest-environment node
import 'fake-indexeddb/auto';
import { buildSnapshot, definitionContext, replay, serializeSnapshot, type EquipmentTypeRow, type Op } from '@app/domain';
import { BLOCK_1_ID, companyTypes, DEFINITION_2, RELATORIO_ID, TYPE_1_ID, TYPE_2_ID, VERSION_1_ID, VERSION_2_ID } from '@app/domain/fixtures/company-types';
import { describe, expect, it } from 'vitest';
import { commitOps } from './commit.ts';
import { relatorioState } from './home-store.ts';
import { relatorioSnapshotOf } from './relatorio-snapshot.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { applyPulled, markDead } from './sync-store.ts';
import { toSnapshot } from './snapshot.ts';
import { deviceDefinitionContext, equipmentTypeRows } from './type-store.ts';

/*
 * Story 14.6 (AD-3 note of 2026-11-06, "Replay"; AD-15's): the AD-3 log with company types on
 * the Dexie layer. Committed by this device or pulled from the server, a company block folds with
 * its type's published versions beside its rows, and the snapshot (`toSnapshot`, and the surfaces'
 * `relatorioState`) carries the versions its blocks reference, byte-equal to the pure replay.
 */

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019a5c00-000a-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const pure = serializeSnapshot(buildSnapshot(replay(companyTypes.log), RELATORIO_ID));

describe('Story 14.6: company types on the Dexie layer', () => {
  it('replays the log committed by this device byte-equal to the pure replay', async () => {
    const db = await freshDb();
    await commitOps(db, companyTypes.log.map((op) => ({ ...op, seq: undefined })));
    expect(serializeSnapshot(await toSnapshot(db, RELATORIO_ID))).toBe(pure);
    db.close();
  });

  it('replays the log pulled from the server (company stream first) byte-equal to the pure replay', async () => {
    const db = await freshDb();
    const company = companyTypes.log.filter((op) => op.scope === 'company');
    const relatorio = companyTypes.log.filter((op) => op.scope !== 'company');
    await applyPulled(db, company);
    await applyPulled(db, relatorio);
    expect(serializeSnapshot(await toSnapshot(db, RELATORIO_ID))).toBe(pure);
    // The surfaces' state carries the version rows too, so their snapshot names the same versions.
    const state = await relatorioState(db, RELATORIO_ID);
    expect(relatorioSnapshotOf(state!, RELATORIO_ID).equipment_types?.map((row) => row.id)).toEqual([VERSION_1_ID, VERSION_2_ID, expect.any(String)]);
    db.close();
  });

  it('builds the device context from its versions and type rows, the same object until one is written', async () => {
    const db = await freshDb();
    await applyPulled(db, companyTypes.log.filter((op) => op.scope === 'company'));
    const first = await equipmentTypeRows(db);
    expect(first.versions).toHaveLength(3);
    expect(first.types.map((row) => row.id).sort()).toEqual([TYPE_1_ID, TYPE_2_ID].sort());
    expect(await equipmentTypeRows(db)).toBe(first);
    const ctx = await deviceDefinitionContext(db);
    expect(ctx).toBe(definitionContext(first.versions, first.types));
    expect(ctx.versions.get(`${TYPE_1_ID}@2`)?.definition.label).toBe(DEFINITION_2.label);
    db.close();
  });

  it('a publish refused for its number goes dead and leaves the type at the version the server holds', async () => {
    const db = await freshDb();
    const company = companyTypes.log.filter((op) => op.scope === 'company');
    // This device holds v1 only, and publishes its own v2 offline.
    const upToV1 = company.findIndex((op) => op.path === `equipment_type_version/${VERSION_1_ID}`);
    await applyPulled(db, company.slice(0, upToV1 + 1));
    const ownId = '019a5c00-0000-7000-8000-00000000ab01';
    const own = (await commitOps(db, [
      {
        ...company[upToV1]!,
        op_id: '019a5c00-0001-7000-8000-00000000ab01',
        path: `equipment_type_version/${ownId}`,
        value: { ...(company[upToV1]!.value as object), id: ownId, version: 2 },
        seq: undefined,
      } as Op,
    ]))[0]!;
    expect(((await db.entities.get(['equipment_type', TYPE_1_ID]))!.row as EquipmentTypeRow).latest_version).toBe(2);
    // Another device's v2 arrives first: the local one is left out of the fold, then refused.
    await applyPulled(db, company.slice(upToV1 + 1));
    await markDead(db, [{ op_id: own.op_id, code: 'op_invalid' }]);
    expect(await db.entities.get(['equipment_type_version', ownId])).toBeUndefined();
    expect(((await db.entities.get(['equipment_type', TYPE_1_ID]))!.row as EquipmentTypeRow).latest_version).toBe(2);
    expect((await db.entities.get(['equipment_type_version', VERSION_2_ID]))?.row).toBeDefined();
    db.close();
  });

  it('refuses at commit a block naming a version this device does not hold', async () => {
    const db = await freshDb();
    const blockCreate = companyTypes.log.find((op) => op.path === `block/${BLOCK_1_ID}`)!;
    const relatorio = companyTypes.log.filter((op) => op.scope !== 'company' && op.path !== `block/${BLOCK_1_ID}` && !op.path.startsWith('block/') && !op.path.startsWith('sheet/'));
    await applyPulled(db, relatorio);
    await expect(commitOps(db, [{ ...blockCreate, seq: undefined } as Op])).rejects.toThrow();
    expect(await db.entities.get(['block', BLOCK_1_ID])).toBeUndefined();
    db.close();
  });
});
