// @vitest-environment node
import 'fake-indexeddb/auto';
import {
  locationChoices,
  locationTree,
  moveTargets,
  newEquipmentBlock,
  paletteLocationFor,
  progress,
  restorableEntries,
  treeNodes,
  type EquipmentRow,
  type LocationRow,
} from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { describe, expect, it } from 'vitest';
import { toRecord } from './commit.ts';
import { allLocationRows, blockRowsOf, equipmentRows, locationRows, relatorioState } from './home-store.ts';
import { relatorioSnapshotOf } from './relatorio-snapshot.ts';
import { openDatabase, type AppDatabase } from './schema.ts';
import { toSnapshot } from './snapshot.ts';
import { applyPulled } from './sync-store.ts';

/*
 * Story 14.2, second pass (rules 1 and 6): `relatorioState` keeps the removed location rows,
 * so the kernel's one liveness rule sees a removed ancestor, and nothing a surface reads
 * shows a removed location or what hangs under it: the snapshot, the tree, the counters and
 * the move and palette targets. Only the restore list, read with `allLocationRows`, does.
 *
 * The fixture is the small Porto Seguro relatório (the local "Cabine de Testes" with three
 * sheets) plus a painel removed at T: its "Coluna 6" left with it, and its "Coluna 5" is
 * still a live row holding a live sheet, as another device leaves one it wrote under the
 * painel meanwhile. A live "Painel B" with its "Coluna 1" stands beside it.
 */

const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;
const id = (n: number) => `019966c1-0172-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const PAINEL = id(1);
const COLUNA_5 = id(2);
const COLUNA_6 = id(3);
const PAINEL_B = id(4);
const COLUNA_B1 = id(5);
const STRAY = id(6);
const STRAY_EQUIPMENT = id(7);
const GONE = id(8);
const GONE_EQUIPMENT = id(9);
const T = '2026-10-12T10:00:00.000Z';
const HIDDEN = [PAINEL, COLUNA_5, COLUNA_6];

let counter = 0;
async function seeded(): Promise<AppDatabase> {
  const user = `019966c1-0173-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const base = { relatorio_id: RELATORIO };
  const locations: LocationRow[] = [
    { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0', removed_at: T },
    // Its own row is live: only the painel above it says it is out.
    { ...base, id: COLUNA_5, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0', removed_at: null },
    { ...base, id: COLUNA_6, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 6', order_key: 'a1', removed_at: T },
    { ...base, id: PAINEL_B, parent_id: LOCAL, kind: 'painel', name: 'Painel B', order_key: 'a1', removed_at: null },
    { ...base, id: COLUNA_B1, parent_id: PAINEL_B, kind: 'coluna', name: 'Coluna 1', order_key: 'a0', removed_at: null },
  ];
  const stray = newEquipmentBlock({ blockId: STRAY, equipmentId: STRAY_EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_5, type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
  const gone = newEquipmentBlock({ blockId: GONE, equipmentId: GONE_EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_6, type: 'disjuntor_mt', tag: 'DJ-C06', seedVersion: 'v1', orderKey: 'a0' });
  await db.entities.bulkPut([
    ...locations.map((row) => toRecord(`location:${row.id}`, row)),
    toRecord(`equipment:${stray.equipment.id}`, stray.equipment),
    toRecord(`block:${stray.block.id}`, stray.block),
    toRecord(`equipment:${gone.equipment.id}`, { ...gone.equipment, removed_at: T } as EquipmentRow),
    toRecord(`block:${gone.block.id}`, { ...gone.block, removed_at: T }),
  ]);
  return db;
}

describe('14.2 second pass: removed locations in the device state', () => {
  it('the state keeps the removed rows and the snapshot drops them with everything under them, as the full device read does', async () => {
    const db = await seeded();
    const state = (await relatorioState(db, RELATORIO))!;
    // The removed painel is in the state: without it the kernel could not tell that the live
    // "Coluna 5" row and its sheet are out.
    expect((state.get(`location:${PAINEL}`) as LocationRow).removed_at).toBe(T);
    expect((state.get(`location:${COLUNA_6}`) as LocationRow).removed_at).toBe(T);

    const snapshot = relatorioSnapshotOf(state, RELATORIO);
    expect(snapshot.locations.map((row) => row.id).sort()).toEqual([LOCAL, PAINEL_B, COLUNA_B1].sort());
    expect(snapshot.blocks.some((block) => block.id === STRAY || block.id === GONE)).toBe(false);
    expect(snapshot.equipment.some((row) => row.id === STRAY_EQUIPMENT)).toBe(false);
    // The incremental builder and the export path agree on it.
    const full = await toSnapshot(db, RELATORIO);
    expect(full.locations.map((row) => row.id).sort()).toEqual(snapshot.locations.map((row) => row.id).sort());
    expect(full.blocks.map((row) => row.id).sort()).toEqual(snapshot.blocks.map((row) => row.id).sort());
    db.close();
  });

  it('the tree, the counters and the move and palette targets show nothing of the removed painel; the restore list does', async () => {
    const db = await seeded();
    const state = (await relatorioState(db, RELATORIO))!;
    const snapshot = relatorioSnapshotOf(state, RELATORIO);
    const equipment = await equipmentRows(db, PROJECT);

    // The tree: one local, the live painel and its coluna, the three sheets of the fixture.
    const nodes = treeNodes(locationTree(snapshot, equipment));
    const drawn = nodes.map((node) => (node.kind === 'equipment' ? node.blockId : node.id));
    for (const hidden of [...HIDDEN, STRAY, GONE]) expect(drawn).not.toContain(hidden);
    expect(nodes.filter((node) => node.kind !== 'equipment').map((node) => node.name)).toEqual(['Cabine de Testes', 'Painel B', 'Coluna 1']);
    const local = nodes.find((node) => node.kind === 'cabine')!;
    expect(local.kind === 'cabine' && local.counterText).toBe('1 de 3');

    // The counters: the sheet under the removed painel is not counted.
    expect(progress(snapshot).sheets_total).toBe(3);

    // "Mover para…" and the office palette's "Local": no removed location, none under one.
    const targets = moveTargets(snapshot.locations, { location_id: LOCAL }).map((choice) => choice.id);
    expect(targets).toEqual([COLUNA_B1]);
    expect(locationChoices(snapshot.locations).map((choice) => choice.id)).toEqual([LOCAL, COLUNA_B1]);
    // The palette opened on the removed painel, or on the coluna under it, has nowhere to go.
    for (const hidden of HIDDEN) expect(paletteLocationFor(snapshot, hidden, STRAY)).toBeNull();

    // The restore list reads every location row, removed ones included, and offers the painel.
    const everyLocation = await allLocationRows(db, RELATORIO);
    expect(everyLocation.map((row) => row.id).sort()).toEqual([LOCAL, ...HIDDEN, PAINEL_B, COLUNA_B1].sort());
    // The live loader keeps its meaning (the row's own tombstone), which is why no surface lists from it.
    expect((await locationRows(db, RELATORIO)).map((row) => row.id).sort()).toEqual([LOCAL, COLUNA_5, PAINEL_B, COLUNA_B1].sort());
    const entries = restorableEntries({ blocks: await blockRowsOf(db, RELATORIO), equipment, locations: everyLocation, since: null });
    expect(entries.map((entry) => [entry.kind, entry.id, entry.name, entry.detail])).toEqual([
      ['location', PAINEL, 'Painel de média tensão de Cabine de Testes', 'Painel · 2 colunas · 2 fichas'],
    ]);
    db.close();
  });
});
