import type { Op } from '../ops/op.ts';
import { parsePath } from '../ops/path.ts';

/*
 * Story 7.5, SM-C1 (success metric: "confirmed cells later edited"): server-side
 * instrumentation over the ops table, logged per issue, never stored. A sheet cell counts
 * once when a put wrote it from a confirmed suggestion (`meta.source_suggestion_id`) and a
 * later plain put (no suggestion) overwrote it: the reading the engineer accepted and then
 * corrected by hand.
 */

const SHEET_FAMILIES: ReadonlySet<string> = new Set([
  'sheet/nameplate',
  'sheet/checklist',
  'sheet/test',
  'sheet/test/cell',
  'sheet/conclusion',
  'sheet/observations',
]);

export type SmC1Op = Pick<Op, 'kind' | 'path' | 'meta'> & { seq?: number | undefined };

function isSheetCell(path: string): boolean {
  try {
    return SHEET_FAMILIES.has(parsePath(path).family);
  } catch {
    return false;
  }
}

/** How many sheet cells were written from a confirmed suggestion and later overwritten by a plain put, in `seq` order. */
export function confirmedCellsLaterEdited(ops: readonly SmC1Op[]): number {
  const ordered = ops.map((op, index) => ({ op, index })).sort((a, b) => (a.op.seq ?? a.index) - (b.op.seq ?? b.index) || a.index - b.index);
  const fromSuggestion = new Set<string>();
  const edited = new Set<string>();
  for (const { op } of ordered) {
    if (op.kind !== 'put' || !isSheetCell(op.path)) continue;
    const suggested = typeof op.meta?.source_suggestion_id === 'string' && op.meta.source_suggestion_id !== '';
    if (suggested) fromSuggestion.add(op.path);
    else if (fromSuggestion.has(op.path)) {
      edited.add(op.path);
      fromSuggestion.delete(op.path);
    }
  }
  return edited.size;
}
