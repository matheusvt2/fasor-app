import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { TEST_USER } from '../test-support.ts';
import { firstCountedTarget } from './count-target.ts';
import { sheetState } from './sheet-state.ts';
import { locationTree, type TreeLocationNode } from './tree.ts';

const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

/** Every sheet of the tree in the order it draws them. */
function treeOrder(tree: readonly TreeLocationNode[]): string[] {
  const out: string[] = [];
  const walk = (node: TreeLocationNode) => {
    for (const row of node.equipment) out.push(row.blockId);
    node.locations.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

describe('F-24 firstCountedTarget', () => {
  const tree = locationTree(snapshot);
  const order = treeOrder(tree);
  const byId = new Map(snapshot.blocks.map((block) => [block.id, block]));

  it('"não ensaiadas" and "concluídas" land on the first sheet in tree order the count counts', () => {
    const notTested = order.find((id) => sheetState(byId.get(id)!) === 'nao_ensaiada');
    expect(notTested).toBeDefined();
    expect(firstCountedTarget(tree, snapshot.blocks, 'not_tested')).toEqual({ kind: 'block', blockId: notTested });
    // Fix batch fxpw G5: a not-tested sheet is never concluded; the fixture concludes none.
    expect(firstCountedTarget(tree, snapshot.blocks, 'concluded')).toBeNull();
    // Concluding a sheet after the first not-tested one in tree order: "concluídas" lands on it.
    const later = order[order.indexOf(notTested!) + 1]!;
    expect(sheetState(byId.get(later)!)).not.toBe('nao_ensaiada');
    const blocks = snapshot.blocks.map((block) => (block.id === later ? { ...block, concluded_by: { actor_id: TEST_USER, at: '2026-09-07T10:00:00.000Z' } } : block));
    expect(firstCountedTarget(locationTree({ ...snapshot, blocks }), blocks, 'concluded')).toEqual({ kind: 'block', blockId: later });
  });

  it('"NC abertos" lands on the first sheet holding an NC answer; none when no sheet holds one', () => {
    expect(firstCountedTarget(tree, snapshot.blocks, 'nc_open')).toBeNull();
    // A sheet of the type whose checklist has "limpeza" (the fixture's first block), past the first rows.
    const target = byId.get(order.find((id, i) => i > 3 && byId.get(id)!.block_type === snapshot.blocks[0]!.block_type)!)!;
    const cell: Cell = { value: 'NC', source_suggestion_id: null, op_id: '019966b0-0050-7000-8000-000000000001' };
    const withNc: BlockRow = { ...target, sheet: { ...emptySheet(), checklist: { limpeza: { result: cell } } } };
    const blocks = snapshot.blocks.map((block) => (block.id === target.id ? withNc : block));
    expect(firstCountedTarget(locationTree({ ...snapshot, blocks }), blocks, 'nc_open')).toEqual({ kind: 'block', blockId: target.id });
  });
});
