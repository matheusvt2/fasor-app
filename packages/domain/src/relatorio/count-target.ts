import type { BlockRow, SuggestionRow } from '../schemas/entities.ts';
import { ncCount } from './progress.ts';
import { blocksWithPendingSuggestions, livePendingSuggestions } from './suggestions.ts';
import type { TreeLocationNode } from './tree.ts';

/*
 * F-24 (review 2026-09-30; EXPERIENCE.md › IA › Sumário: "each count tapping through to its
 * list"): a Sumário header count takes the engineer to the first item it counts, in the
 * order section 9's tree draws them. The same rules as `progress`, so the row a tap lands
 * on is one the count counted. 2026-10-14 (Bruno): "NC abertos" counts a local's NC site
 * items too, so its target can be a local's "Verificações do local" row.
 */

/** The three header counts that name sheets: "N de M fichas concluídas", "N NC abertos", "N não ensaiadas". */
export type SumarioCountKind = 'concluded' | 'nc_open' | 'not_tested';

/** Where a header count lands: a sheet's row, or (NC only) a local's site row. */
export type CountTarget = { kind: 'block'; blockId: string } | { kind: 'site'; locationId: string };

/**
 * The first item in tree order that `kind` counts, or null when none does. Tree order: a
 * location's site row (a local's `.s9-verif`, in its header row), then its equipment, then
 * its sub-locations, local by local. Only `nc_open` reaches a site row. `pending`: the
 * device's pending suggestion rows; a sheet holding one is not counted as concluded.
 */
export function firstCountedTarget(
  tree: readonly TreeLocationNode[],
  blocks: readonly BlockRow[],
  kind: SumarioCountKind,
  pending: readonly SuggestionRow[] = [],
): CountTarget | null {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const held = blocksWithPendingSuggestions(livePendingSuggestions(blocks, pending));
  const counts = (blockId: string, state: string): boolean => {
    if (kind === 'not_tested') return state === 'nao_ensaiada';
    if (kind === 'concluded') return (state === 'concluida' || state === 'nao_ensaiada') && !held.has(blockId);
    const block = byId.get(blockId);
    return block !== undefined && ncCount(block) > 0;
  };
  const walk = (node: TreeLocationNode): CountTarget | null => {
    if (kind === 'nc_open' && node.site !== null && node.site.nc > 0) return { kind: 'site', locationId: node.id };
    for (const row of node.equipment) if (counts(row.blockId, row.state)) return { kind: 'block', blockId: row.blockId };
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
