import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { firstCountedBlock } from './count-target.ts';
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

describe('F-24 firstCountedBlock', () => {
  const tree = locationTree(snapshot);
  const order = treeOrder(tree);
  const byId = new Map(snapshot.blocks.map((block) => [block.id, block]));

  it('"não ensaiadas" and "concluídas" land on the first sheet in tree order the count counts', () => {
    const notTested = order.find((id) => sheetState(byId.get(id)!) === 'nao_ensaiada');
    expect(notTested).toBeDefined();
    expect(firstCountedBlock(tree, snapshot.blocks, 'not_tested')).toBe(notTested);
    // The fixture's concluded sheets are its three not-tested ones.
    expect(firstCountedBlock(tree, snapshot.blocks, 'concluded')).toBe(notTested);
  });

  it('"NC abertos" lands on the first sheet holding an NC answer; none when no sheet holds one', () => {
    expect(firstCountedBlock(tree, snapshot.blocks, 'nc_open')).toBeNull();
    // A sheet of the type whose checklist has "limpeza" (the fixture's first block), past the first rows.
    const target = byId.get(order.find((id, i) => i > 3 && byId.get(id)!.block_type === snapshot.blocks[0]!.block_type)!)!;
    const cell: Cell = { value: 'NC', source_suggestion_id: null, op_id: '019966b0-0050-7000-8000-000000000001' };
    const withNc: BlockRow = { ...target, sheet: { ...emptySheet(), checklist: { limpeza: { result: cell } } } };
    const blocks = snapshot.blocks.map((block) => (block.id === target.id ? withNc : block));
    expect(firstCountedBlock(locationTree({ ...snapshot, blocks }), blocks, 'nc_open')).toBe(target.id);
  });
});
