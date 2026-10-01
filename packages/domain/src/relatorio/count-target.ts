import type { BlockRow, SuggestionRow } from '../schemas/entities.ts';
import { ncCount } from './progress.ts';
import { blocksWithPendingSuggestions, livePendingSuggestions } from './suggestions.ts';
import type { TreeLocationNode } from './tree.ts';

/*
 * F-24 (review 2026-09-30; EXPERIENCE.md › IA › Sumário: "each count tapping through to its
 * list"): a Sumário header count takes the engineer to the first sheet it counts, in the
 * order section 9's tree draws them. The same rules as `progress`, so the row a tap lands
 * on is one the count counted.
 */

/** The three header counts that name sheets: "N de M fichas concluídas", "N NC abertos", "N não ensaiadas". */
export type SumarioCountKind = 'concluded' | 'nc_open' | 'not_tested';

/**
 * The block id of the first sheet in tree order (a location's equipment, then its
 * sub-locations, cabine by cabine) that `kind` counts, or null when none does. `pending`:
 * the device's pending suggestion rows; a sheet holding one is not counted as concluded.
 */
export function firstCountedBlock(
  tree: readonly TreeLocationNode[],
  blocks: readonly BlockRow[],
  kind: SumarioCountKind,
  pending: readonly SuggestionRow[] = [],
): string | null {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const held = blocksWithPendingSuggestions(livePendingSuggestions(blocks, pending));
  const counts = (blockId: string, state: string): boolean => {
    if (kind === 'not_tested') return state === 'nao_ensaiada';
    if (kind === 'concluded') return (state === 'concluida' || state === 'nao_ensaiada') && !held.has(blockId);
    const block = byId.get(blockId);
    return block !== undefined && ncCount(block) > 0;
  };
  const walk = (node: TreeLocationNode): string | null => {
    for (const row of node.equipment) if (counts(row.blockId, row.state)) return row.blockId;
    for (const child of node.locations) {
      const found = walk(child);
      if (found !== null) return found;
    }
    return null;
  };
  for (const node of tree) {
    const found = walk(node);
    if (found !== null) return found;
  }
  return null;
}
