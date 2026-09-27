import {
  confirmSuggestionOps,
  safeParsePath,
  suggestionFieldDef,
  suggestionRowSchema,
  suggestionView,
  type Author,
  type BlockRow,
  type Op,
  type RelatorioRow,
  type SuggestionRow,
} from '@app/domain';
import { commitBatch, type CommitDeps } from './commit.ts';
import type { AppDatabase } from './schema.ts';

/*
 * Story 8.1 (AD-12, "device-side comparison"): after a pull, a `suggestion/{id}` create
 * whose target the engineer already filled with the same value is confirmed on the device,
 * as the signed-in user, with `meta.auto = true`, writing the engineer's value back as it is: the cell gains its provenance and the
 * field its confirmed glyph, and nothing asks for a tap the engineer already made. A
 * different value stays pending (the sheet shows the replace line); an empty target stays
 * pending (the sheet shows the fill). The rule and the ops are the kernel's
 * (`suggestionView`, `confirmSuggestionOps`); this only reads the local rows.
 */

async function localSuggestion(db: AppDatabase, id: string): Promise<SuggestionRow | null> {
  const record = await db.entities.get(['suggestion', id]);
  if (record === undefined) return null;
  const parsed = suggestionRowSchema.safeParse(record.row);
  return parsed.success ? parsed.data : null;
}

/**
 * Auto-confirms each pulled suggestion create whose local row is still pending and whose
 * nameplate target holds an equal value. Runs once per suggestion: a row the device
 * already confirmed or discarded is skipped. Returns the ids it confirmed.
 */
export async function autoConfirmPulled(db: AppDatabase, pulled: readonly Op[], author: Author, deps: CommitDeps): Promise<string[]> {
  const confirmed: string[] = [];
  for (const op of pulled) {
    if (op.kind !== 'create' || op.company_id !== author.companyId) continue;
    const path = safeParsePath(op.path);
    if (path === null || path.family !== 'suggestion') continue;
    const suggestion = await localSuggestion(db, path.id);
    if (suggestion === null || suggestion.status !== 'pending') continue;
    const target = safeParsePath(suggestion.target_path);
    if (target === null || target.family !== 'sheet/nameplate') continue;
    const record = await db.entities.get(['block', target.block_id]);
    if (record === undefined) continue;
    const block = record.row as BlockRow;
    if (block.removed_at !== null) continue;
    // An issued relatório is never moved back to Em revisão by a write nobody tapped.
    const relatorio = await db.entities.get(['relatorio', suggestion.relatorio_id]);
    if ((relatorio?.row as RelatorioRow | undefined)?.status === 'emitido') continue;
    const field = suggestionFieldDef(block, suggestion);
    const cell = block.sheet.nameplate[target.field_key];
    if (cell === undefined || suggestionView(cell, suggestion, field) !== 'none') continue;
    // The engineer's own value is written back as it is; only its provenance changes.
    await commitBatch(db, confirmSuggestionOps(author, suggestion, { auto: true, value: cell.value }), deps);
    confirmed.push(suggestion.id);
  }
  return confirmed;
}
