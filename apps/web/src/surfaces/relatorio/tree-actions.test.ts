import { locationTree, newEquipmentBlock, treeNodes, type LocationRow, type TreeEquipmentNode } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { restoreSheetOps } from './tree-actions.ts';

/*
 * 4.5 matrix row "Desfazer / Restaurar": a sheet whose TAG a live row took meanwhile is
 * restored anyway (never refused), and the duplicate line then marks both rows.
 */

const id = (n: number) => `019966c1-0040-7000-8000-${n.toString(16).padStart(12, '0')}`;
const author = { id: id(900), companyId: id(901) };
const relatorioId = id(100);
const projectId = id(101);
const coluna: LocationRow = { id: id(1), relatorio_id: relatorioId, parent_id: null, kind: 'coluna', name: 'Coluna 5', order_key: 'a0', removed_at: null };

const pair = (n: number, tag: string, orderKey: string) =>
  newEquipmentBlock({ blockId: id(10 + n), equipmentId: id(20 + n), relatorioId, projectId, locationId: coluna.id, type: 'chave_seccionadora', tag, seedVersion: 'v1', orderKey });

describe('4.5 restoreSheetOps', () => {
  it('restores the block and its equipment in one batch even when a live row took its TAG, and the tree then marks the duplicate', () => {
    const removedAt = '2026-09-24T10:00:00.000Z';
    const old = pair(1, 'SEC-C05', 'a0');
    const taker = pair(2, 'SEC-C05', 'a1');
    const blocks = [{ ...old.block, removed_at: removedAt }, taker.block];

    const ops = restoreSheetOps(author, relatorioId, projectId, blocks, old.block.id, old.equipment.id);
    expect(ops?.map((op) => [op.kind, op.path, op.value, op.scope])).toEqual([
      ['put', `block/${old.block.id}/removed_at`, null, 'relatorio'],
      ['put', `equipment/${old.equipment.id}/removed_at`, null, 'project'],
    ]);

    // Once applied, both live rows carry "SEC-C05": each is marked a duplicate.
    const equipment = [old.equipment, taker.equipment];
    const tree = locationTree({ locations: [coluna], blocks: [old.block, taker.block], equipment }, equipment);
    const rows = treeNodes(tree).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
    expect(rows.map((row) => [row.tag, row.duplicate])).toEqual([
      ['SEC-C05', true],
      ['SEC-C05', true],
    ]);
  });

  it('writes nothing for a block that is already live', () => {
    const live = pair(3, 'SEC-C07', 'a0');
    expect(restoreSheetOps(author, relatorioId, projectId, [live.block], live.block.id, live.equipment.id)).toBeNull();
  });
});
