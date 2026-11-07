// @vitest-environment node
import 'fake-indexeddb/auto';
import { blockDefinitionIn, companySubBlocksOf, snapshotDefinitionContext, typeVersionOf, type BlockRow, type CompanyTypeDefinition, type EquipmentTypeRow, type EquipmentTypeVersionRow, type Op } from '@app/domain';
import { BLOCK_1_ID, CABINE_ID, companyTypes, DEFINITION_1, EQUIPMENT_1_ID, RELATORIO_ID, TYPE_1, TYPE_1_ID, VERSION_1_ID, VERSION_2_ID } from '@app/domain/fixtures/company-types';
import { describe, expect, it } from 'vitest';
import { commitOps } from './commit.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { applyPulled, markDead, resendDead } from './sync-store.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * e22h S2 on the Dexie layer: this device publishes its own v2 of a type offline and places a
 * block on it; another device's v2 reaches the server first, so the server refuses this device's
 * version create and, since the block names that version row by id (`type_version_id`), the block
 * and its sheet write too, never binding them to the other device's definition. "Reenviar"
 * renumbers the version to 3 and the block follows it (`resendRenumberedVersions`): the block
 * comes back bound to this device's own row.
 */

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019a5d00-000a-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const OWN_VERSION_ID = '019a5d00-0000-7000-8000-00000000ab01';
/** This device's own v2: an item the other device's v2 does not have. */
const OWN_DEFINITION: CompanyTypeDefinition = {
  ...structuredClone(DEFINITION_1),
  checklist: [...DEFINITION_1.checklist!, { key: 'alarme_remoto', label: 'Alarme remoto', nc_phrases: ['Sem sinal', 'Contato oxidado', 'Fiação solta'] }],
};

/** One of this device's ops, shaped as a fixture op of the same scope (ids and stamps its own). */
function own(n: number, base: Op, path: string, kind: Op['kind'], value: unknown): Op {
  return { ...base, op_id: `019a5d00-0001-7000-8000-${n.toString(16).padStart(12, '0')}`, kind, path, value: value as Op['value'], client_ts: `2026-11-07T11:0${n}:00.000Z`, seq: undefined };
}

describe('e22h S2: "Reenviar" renumbers a refused publish, and its block resends bound to its own row', () => {
  it('a block created on an unconfirmed v2 comes back at v3, naming its own version row', async () => {
    const db = await freshDb();
    const company = companyTypes.log.filter((op) => op.scope === 'company');
    const upToV1 = company.findIndex((op) => op.path === `equipment_type_version/${VERSION_1_ID}`);
    // The relatório, its cabine and its equipment, but no block yet; the type at v1.
    const scaffold = companyTypes.log.filter((op) => (op.scope !== 'company' || op.path.startsWith('project/')) && !op.path.startsWith('block/') && !op.path.startsWith('sheet/'));
    await applyPulled(db, [...company.slice(0, upToV1 + 1), ...scaffold]);

    // Offline: this device publishes its own v2, places a block on it and fills an item only its version has.
    const versionBase = company[upToV1]!;
    const blockBase = companyTypes.log.find((op) => op.path === `block/${BLOCK_1_ID}`)!;
    const publish = own(1, versionBase, `equipment_type_version/${OWN_VERSION_ID}`, 'create', { ...(versionBase.value as object), id: OWN_VERSION_ID, version: 2, definition: OWN_DEFINITION });
    const subBlocks = Object.fromEntries(companySubBlocksOf(OWN_DEFINITION).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
    const place = own(2, blockBase, `block/${BLOCK_1_ID}`, 'create', {
      ...(blockBase.value as object),
      config: { block_type: TYPE_1, sub_blocks: subBlocks, na_defaults: [], type_version: 2, type_version_id: OWN_VERSION_ID },
    });
    const fill = own(3, blockBase, `sheet/${BLOCK_1_ID}/checklist/alarme_remoto/result`, 'put', 'NC');
    await commitOps(db, [publish, place, fill]);
    expect(((await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow).sheet.checklist).toHaveProperty('alarme_remoto');

    // Online: the other device's v2 is pulled, and the server refuses all three.
    await applyPulled(db, company.slice(upToV1 + 1));
    await markDead(db, [
      { op_id: publish.op_id, code: 'op_invalid' },
      { op_id: place.op_id, code: 'op_invalid' },
      { op_id: fill.op_id, code: 'op_target_missing' },
    ]);
    expect(await db.entities.get(['equipment_type_version', OWN_VERSION_ID])).toBeUndefined();
    expect(await db.entities.get(['block', BLOCK_1_ID])).toBeUndefined();

    expect(await resendDead(db, new Date('2026-11-07T12:00:00.000Z'))).toBe(3);
    // The outbox carries the renumbered version and the block following it, pending.
    const rows = await db.outbox.bulkGet([publish.op_id, place.op_id, fill.op_id]);
    expect(rows.map((row) => row?.status)).toEqual(['pending', 'pending', 'pending']);
    expect((rows[0]!.value as { version: number }).version).toBe(3);
    expect(typeVersionOf((rows[1]!.value as { config: unknown }).config)).toEqual({ version: 3, id: OWN_VERSION_ID });
    // The device's fold: its own row at 3, the type at 3, the other device's row still at 2.
    expect(((await db.entities.get(['equipment_type_version', OWN_VERSION_ID]))!.row as EquipmentTypeVersionRow).version).toBe(3);
    expect(((await db.entities.get(['equipment_type_version', VERSION_2_ID]))!.row as EquipmentTypeVersionRow).version).toBe(2);
    expect(((await db.entities.get(['equipment_type', TYPE_1_ID]))!.row as EquipmentTypeRow).latest_version).toBe(3);
    // The block is back with its reading, and resolves this device's own definition.
    const block = (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
    expect(block.location_id).toBe(CABINE_ID);
    expect(block.equipment_id).toBe(EQUIPMENT_1_ID);
    expect(block.sheet.checklist).toHaveProperty('alarme_remoto');
    const snapshot = await toSnapshot(db, RELATORIO_ID);
    expect(snapshot.equipment_types?.map((row) => row.id)).toContain(OWN_VERSION_ID);
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
    expect(definition?.type_version_id).toBe(OWN_VERSION_ID);
    expect(definition?.checklist?.map((item) => item.key)).toContain('alarme_remoto');
    db.close();
  });

  it('review e22h finding 1: a block create still sent when its version create came back dead follows the renumber', async () => {
    const db = await freshDb();
    const company = companyTypes.log.filter((op) => op.scope === 'company');
    const upToV1 = company.findIndex((op) => op.path === `equipment_type_version/${VERSION_1_ID}`);
    const scaffold = companyTypes.log.filter((op) => (op.scope !== 'company' || op.path.startsWith('project/')) && !op.path.startsWith('block/') && !op.path.startsWith('sheet/'));
    await applyPulled(db, [...company.slice(0, upToV1 + 1), ...scaffold]);
    const versionBase = company[upToV1]!;
    const blockBase = companyTypes.log.find((op) => op.path === `block/${BLOCK_1_ID}`)!;
    const publish = own(1, versionBase, `equipment_type_version/${OWN_VERSION_ID}`, 'create', { ...(versionBase.value as object), id: OWN_VERSION_ID, version: 2, definition: OWN_DEFINITION });
    const subBlocks = Object.fromEntries(companySubBlocksOf(OWN_DEFINITION).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
    const place = own(2, blockBase, `block/${BLOCK_1_ID}`, 'create', {
      ...(blockBase.value as object),
      config: { block_type: TYPE_1, sub_blocks: subBlocks, na_defaults: [], type_version: 2, type_version_id: OWN_VERSION_ID },
    });
    const fill = own(3, blockBase, `sheet/${BLOCK_1_ID}/checklist/alarme_remoto/result`, 'put', 'NC');
    await commitOps(db, [publish, place, fill]);

    // The push answered only the version create (refused); the block create and its fill are still in flight.
    await applyPulled(db, company.slice(upToV1 + 1));
    await db.outbox.update(place.op_id, { status: 'sent' });
    await markDead(db, [{ op_id: publish.op_id, code: 'op_invalid' }]);

    expect(await resendDead(db, new Date('2026-11-07T12:00:00.000Z'))).toBe(1);
    const rows = await db.outbox.bulkGet([publish.op_id, place.op_id, fill.op_id]);
    expect(rows.map((row) => row?.status)).toEqual(['pending', 'sent', 'pending']);
    expect((rows[0]!.value as { version: number }).version).toBe(3);
    // Before the fix the sent block create kept naming (2, own row) and was refused for good.
    expect(typeVersionOf((rows[1]!.value as { config: unknown }).config)).toEqual({ version: 3, id: OWN_VERSION_ID });
    expect(rows[1]!.client_ts).toBe(place.client_ts);
    const block = (await db.entities.get(['block', BLOCK_1_ID]))!.row as BlockRow;
    expect(typeVersionOf(block.config)).toEqual({ version: 3, id: OWN_VERSION_ID });
    expect(block.sheet.checklist).toHaveProperty('alarme_remoto');
    const definition = blockDefinitionIn(snapshotDefinitionContext(await toSnapshot(db, RELATORIO_ID)), block);
    expect(definition?.type_version_id).toBe(OWN_VERSION_ID);
    db.close();
  });
});
