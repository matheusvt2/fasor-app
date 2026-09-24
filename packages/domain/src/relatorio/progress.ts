import type { BlockRow, LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { plural } from '../text/plural.ts';
import { enabledCells, isCellFilled, isEquipmentBlock, sheetState } from './sheet-state.ts';

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
  /** Pending suggestions the snapshot knows of (Epic 8 fills them in). */
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

function over(blocks: readonly BlockRow[], suggestionsPending: number): Progress {
  const progress: Progress = { sheets_concluded: 0, sheets_total: 0, nc_open: 0, not_tested: 0, suggestions_pending: suggestionsPending };
  for (const block of blocks) {
    if (block.removed_at !== null || !isEquipmentBlock(block)) continue;
    progress.sheets_total += 1;
    const state = sheetState(block);
    if (state === 'concluida' || state === 'nao_ensaiada') progress.sheets_concluded += 1;
    if (state === 'nao_ensaiada') progress.not_tested += 1;
    progress.nc_open += ncCount(block);
  }
  return progress;
}

/** The whole relatório's progress over its live equipment blocks. */
export function progress(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'suggestions'>): Progress {
  return over(snapshot.blocks, snapshot.suggestions.filter((s) => s.status === 'pending').length);
}

/** The location ids of a cabine and the colunas under it. */
export function cabineLocationIds(locations: readonly Pick<LocationRow, 'id' | 'parent_id'>[], cabineId: string): Set<string> {
  const ids = new Set([cabineId]);
  for (const location of locations) if (location.parent_id === cabineId) ids.add(location.id);
  return ids;
}

/** One cabine's progress: the blocks on it and on its colunas. */
export function cabineProgress(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations' | 'suggestions'>, cabineId: string): Progress {
  const ids = cabineLocationIds(snapshot.locations, cabineId);
  return over(
    snapshot.blocks.filter((block) => block.location_id !== null && ids.has(block.location_id)),
    0,
  );
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
export function locationProgress(snapshot: Pick<RelatorioSnapshot, 'blocks' | 'locations'>, locationId: string): Progress {
  const ids = descendantLocationIds(snapshot.locations, locationId);
  return over(
    snapshot.blocks.filter((block) => block.location_id !== null && ids.has(block.location_id)),
    0,
  );
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
