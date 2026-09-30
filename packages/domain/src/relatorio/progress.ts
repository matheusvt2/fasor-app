import type { BlockRow, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { plural } from '../text/plural.ts';
import { enabledCells, isCellFilled, isEquipmentBlock, sheetState } from './sheet-state.ts';
import { blocksWithPendingSuggestions, livePendingSuggestions } from './suggestions.ts';

/*
 * Story 4.3: the counts the Sumário header, the Project row and the Home card read, computed
 * once from the snapshot (AD-2). Everything goes through `sheetState`, so Epic 5's sheet
 * edits change nothing here. "Não ensaiada counts as concluded" (EXPERIENCE.md › Export
 * dialog): a sheet marked not tested is done with, and is counted apart as well.
 */

export interface Progress {
  sheets_concluded: number;
  sheets_total: number;
  /** Checklist items answered NC on live sheets. Epic 6's points of attention close them. */
  nc_open: number;
  not_tested: number;
  /**
   * Pending suggestions: the device's suggestion rows passed as `pending` (Story 8.1,
   * coordinator conflict 3); without them, the pending ones the snapshot carries (none: a
   * snapshot holds only the suggestions a cell references).
   */
  suggestions_pending: number;
}

/** The value of a checklist "result" cell that names a non-conformity. */
const NC = 'NC';

function ncCount(block: BlockRow): number {
  const cells = new Set(enabledCells(block));
  let n = 0;
  for (const item of Object.values(block.sheet.checklist)) {
    if (item.result !== undefined && cells.has(item.result) && isCellFilled(item.result) && item.result.value === NC) n += 1;
  }
  return n;
}

/**
 * `held`: the blocks holding a pending suggestion (Story 8.1). A sheet with a value still
 * waiting for a tap is never counted as concluded, whatever its own state says.
 */
function over(blocks: readonly BlockRow[], suggestionsPending: number, held: ReadonlySet<string> = new Set()): Progress {
  const progress: Progress = { sheets_concluded: 0, sheets_total: 0, nc_open: 0, not_tested: 0, suggestions_pending: suggestionsPending };
  for (const block of blocks) {
    if (block.removed_at !== null || !isEquipmentBlock(block)) continue;
    progress.sheets_total += 1;
    const state = sheetState(block);
    if ((state === 'concluida' || state === 'nao_ensaiada') && !held.has(block.id)) progress.sheets_concluded += 1;
    if (state === 'nao_ensaiada') progress.not_tested += 1;
    progress.nc_open += ncCount(block);
  }
  return progress;
}

/**
 * The whole relatório's progress over its live equipment blocks. `pending` is the device's
 * pending suggestion rows of the relatório (`pendingSuggestions(suggestionRowsOf(...))`):
 * `suggestions_pending` is the number of those waiting on a live block, and a block holding
 * any is not concluded.
 */
export function progress(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'suggestions'>, pending?: readonly SuggestionRow[]): Progress {
  if (pending === undefined) return over(snapshot.blocks, snapshot.suggestions.filter((s) => s.status === 'pending').length);
  return over(snapshot.blocks, ...scoped(snapshot.blocks, pending));
}

/** The pending rows waiting on a live block of `blocks` (`livePendingSuggestions`), and those blocks' ids. */
function scoped(blocks: readonly BlockRow[], pending: readonly SuggestionRow[] | undefined): [number, ReadonlySet<string>] {
  if (pending === undefined) return [0, new Set()];
  const own = livePendingSuggestions(blocks, pending);
  return [own.length, blocksWithPendingSuggestions(own)];
}

/** The location ids of a cabine and the colunas under it. */
export function cabineLocationIds(locations: readonly Pick<LocationRow, 'id' | 'parent_id'>[], cabineId: string): Set<string> {
  const ids = new Set([cabineId]);
  for (const location of locations) if (location.parent_id === cabineId) ids.add(location.id);
  return ids;
}

/**
 * The location ids of a node and every location under it, at any depth (Story 4.4: a
 * block may attach to any node, and the tree's coluna counters count what hangs below).
 */
export function descendantLocationIds(locations: readonly Pick<LocationRow, 'id' | 'parent_id'>[], locationId: string): Set<string> {
  const ids = new Set([locationId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const location of locations) {
      if (location.parent_id !== null && ids.has(location.parent_id) && !ids.has(location.id)) {
        ids.add(location.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** One location's progress: the blocks on it and on every location under it (the tree's coluna counter). */
export function locationProgress(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations'>, locationId: string, pending?: readonly SuggestionRow[]): Progress {
  const ids = descendantLocationIds(snapshot.locations, locationId);
  const blocks = snapshot.blocks.filter((block) => block.location_id !== null && ids.has(block.location_id));
  return over(blocks, ...scoped(blocks, pending));
}

/**
 * K-16 (full review 2026-09-30): `locationProgress` for every location of one input at once.
 * The blocks are bucketed by `location_id` and the locations by `parent_id` once; each
 * location's progress is the sum of its subtree's buckets (every count of `Progress` adds up
 * over disjoint sets of blocks, and a pending suggestion names one block), with the subtree
 * read exactly as `descendantLocationIds` reads it (every location of the input, removed ones
 * included). The answer for an id equals `locationProgress(snapshot, id, pending)`.
 */
export function locationProgressIndex(
  snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations'>,
  pending?: readonly SuggestionRow[],
): (locationId: string) => Progress {
  const blocksAt = new Map<string, BlockRow[]>();
  for (const block of snapshot.blocks) {
    if (block.location_id === null) continue;
    const bucket = blocksAt.get(block.location_id);
    if (bucket === undefined) blocksAt.set(block.location_id, [block]);
    else bucket.push(block);
  }
  const childrenOf = new Map<string, string[]>();
  for (const location of snapshot.locations) {
    if (location.parent_id === null) continue;
    const bucket = childrenOf.get(location.parent_id);
    if (bucket === undefined) childrenOf.set(location.parent_id, [location.id]);
    else bucket.push(location.id);
  }
  const own = new Map<string, Progress>();
  const ownProgress = (id: string): Progress => {
    let out = own.get(id);
    if (out === undefined) {
      const blocks = blocksAt.get(id) ?? [];
      out = over(blocks, ...scoped(blocks, pending));
      own.set(id, out);
    }
    return out;
  };
  return (locationId) => {
    const total: Progress = { sheets_concluded: 0, sheets_total: 0, nc_open: 0, not_tested: 0, suggestions_pending: 0 };
    const seen = new Set([locationId]);
    const stack = [locationId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const p = ownProgress(id);
      total.sheets_concluded += p.sheets_concluded;
      total.sheets_total += p.sheets_total;
      total.nc_open += p.nc_open;
      total.not_tested += p.not_tested;
      total.suggestions_pending += p.suggestions_pending;
      for (const child of childrenOf.get(id) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        stack.push(child);
      }
    }
    return total;
  };
}

// --- the texts -------------------------------------------------------------------------

/** `.progress-counter`: "42 de 94" (the section 9 cabine rows). */
export function progressCounterText(p: Pick<Progress, 'sheets_concluded' | 'sheets_total'>): string {
  return `${p.sheets_concluded} de ${p.sheets_total}`;
}

/** `.progress-counter[data-state]`: complete once every sheet is concluded (a relatório with no sheet is never complete). */
export function progressCounterState(p: Pick<Progress, 'sheets_concluded' | 'sheets_total'>): 'complete' | 'pending' {
  return p.sheets_total > 0 && p.sheets_concluded >= p.sheets_total ? 'complete' : 'pending';
}

/** The Project row's counter: "42 de 94 fichas" (`30-project.html`). */
export function fichasCountText(p: Pick<Progress, 'sheets_concluded' | 'sheets_total'>): string {
  return `${progressCounterText(p)} fichas`;
}

/** The header's first count: "42 de 94 fichas concluídas" (`40-relatorio-overview.html`). */
export function fichasConcluidasText(p: Pick<Progress, 'sheets_concluded' | 'sheets_total'>): string {
  return `${progressCounterText(p)} fichas concluídas`;
}

/** "2 NC abertos", "1 NC aberto", "0 NC abertos". */
export function ncAbertosText(n: number): string {
  return plural(n, 'NC aberto', 'NC abertos');
}

/** "1 não ensaiada", "3 não ensaiadas". */
export function naoEnsaiadasText(n: number): string {
  return plural(n, 'não ensaiada', 'não ensaiadas');
}

/** "12 sugestões por confirmar", "1 sugestão por confirmar". */
export function sugestoesText(n: number): string {
  return plural(n, 'sugestão por confirmar', 'sugestões por confirmar');
}
