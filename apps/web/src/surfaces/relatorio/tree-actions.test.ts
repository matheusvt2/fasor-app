import { locationTree, newEquipmentBlock, treeNodes, type LocationRow, type TreeEquipmentNode } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { removeSheetOps, restoreSheetOps } from './tree-actions.ts';

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

    const ops = restoreSheetOps(author, relatorioId, projectId, blocks, old.block.id, old.equipment.id, [{ ...old.equipment, removed_at: removedAt }]);
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
    expect(restoreSheetOps(author, relatorioId, projectId, [live.block], live.block.id, live.equipment.id, [live.equipment])).toBeNull();
  });

  it('Q4: restores only the block when its equipment stayed live (another relatório holds it)', () => {
    const removed = pair(4, 'SEC-C05', 'a0');
    const blocks = [{ ...removed.block, removed_at: '2026-09-24T10:00:00.000Z' }];
    const ops = restoreSheetOps(author, relatorioId, projectId, blocks, removed.block.id, removed.equipment.id, [removed.equipment]);
    expect(ops?.map((op) => op.path)).toEqual([`block/${removed.block.id}/removed_at`]);
  });
});

describe('Epic 4 QA Q4 removeSheetOps', () => {
  const OTHER_RELATORIO = id(102);

  it('tombstones the block and its equipment when no other live block references it', () => {
    const only = pair(5, 'SEC-C05', 'a0');
    const removedElsewhere = { ...pair(6, 'SEC-C05', 'a0').block, relatorio_id: OTHER_RELATORIO, equipment_id: only.equipment.id, removed_at: '2026-09-24T10:00:00.000Z' };
    const ops = removeSheetOps(author, relatorioId, projectId, [only.block, removedElsewhere], only.block);
    expect(ops.map((op) => [op.kind, op.path, op.scope])).toEqual([
      ['remove', `block/${only.block.id}/removed_at`, 'relatorio'],
      ['remove', `equipment/${only.equipment.id}/removed_at`, 'project'],
    ]);
  });

  it('keeps the equipment live when a live block of another relatório of the obra references it', () => {
    const mine = pair(7, 'SEC-C05', 'a0');
    const theirs = { ...pair(8, 'SEC-C05', 'a0').block, relatorio_id: OTHER_RELATORIO, equipment_id: mine.equipment.id };
    const ops = removeSheetOps(author, relatorioId, projectId, [mine.block, theirs], mine.block);
    expect(ops.map((op) => op.path)).toEqual([`block/${mine.block.id}/removed_at`]);
  });
});
