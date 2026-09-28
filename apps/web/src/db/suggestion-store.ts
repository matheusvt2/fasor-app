import {
  confirmSuggestionOps,
  safeParsePath,
  suggestionFieldDef,
  suggestionRowSchema,
  suggestionView,
  type Author,
  type BlockRow,
  type RelatorioRow,
  type SuggestionRow,
} from '@app/domain';
import { commitBatch, type CommitDeps } from './commit.ts';
import type { AppDatabase } from './schema.ts';

/*
 * Story 8.1 (AD-12, "device-side comparison") and Story 8.2 (the sweep): after each pull,
 * every pending suggestion on this device whose nameplate target already holds an equal
 * value -- however it got there: typed before the reading, a copy chip, another device's
 * put -- is confirmed on the device, as the signed-in user, with `meta.auto = true`, writing
 * the engineer's value back as it is: the cell gains its provenance and the field its
 * confirmed glyph, and nothing asks for a tap the engineer already made. A different value
 * stays pending (the sheet shows the replace line); an empty target stays pending (the
 * sheet shows the fill). The rule and the ops are the kernel's (`suggestionView`,
 * `confirmSuggestionOps`); this only reads the local rows. Scanning every pending row, not
 * only the pulled creates, is what retries a confirm that failed on an earlier pull.
 */

async function pendingRows(db: AppDatabase): Promise<SuggestionRow[]> {
  const records = await db.entities.where('entity').equals('suggestion').toArray();
  const rows: SuggestionRow[] = [];
  for (const record of records) {
    const parsed = suggestionRowSchema.safeParse(record.row);
    if (parsed.success && parsed.data.status === 'pending') rows.push(parsed.data);
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Auto-confirms each local pending suggestion whose nameplate target holds an equal value.
 * Skipped: a row no longer pending (confirmed or discarded before), a removed block, an
 * issued relatório. A commit that throws stops the sweep with the error (the engine logs
 * it); the rows left pending are taken again by the next sweep. Returns the ids it confirmed.
 */
export async function autoConfirmPending(db: AppDatabase, author: Author, deps: CommitDeps): Promise<string[]> {
  const confirmed: string[] = [];
  for (const candidate of await pendingRows(db)) {
    // Read again: an earlier confirm of this sweep may have changed the row or its block.
    const record = await db.entities.get(['suggestion', candidate.id]);
    const parsed = record === undefined ? null : suggestionRowSchema.safeParse(record.row);
    if (parsed === null || !parsed.success || parsed.data.status !== 'pending') continue;
    const suggestion = parsed.data;
    const target = safeParsePath(suggestion.target_path);
    if (target === null || target.family !== 'sheet/nameplate') continue;
    const blockRecord = await db.entities.get(['block', target.block_id]);
    if (blockRecord === undefined) continue;
    const block = blockRecord.row as BlockRow;
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

/** What `syncCounts` reads besides the outbox (Story 8.2): the suggestion statuses and the live photos' readings. */
export interface ReadingCountRows {
  suggestions: { status: string }[];
  photos: { reading_status: string | null }[];
}

/** The device's suggestion statuses and live photo readings, for Sync status "Leituras". */
export async function readingCountRows(db: AppDatabase): Promise<ReadingCountRows> {
  const [suggestions, files] = await Promise.all([db.entities.where('entity').equals('suggestion').toArray(), db.entities.where('entity').equals('file').toArray()]);
  return {
    suggestions: suggestions.map((record) => ({ status: (record.row as { status?: unknown }).status === 'pending' ? 'pending' : 'other' })),
    photos: files
      .filter((record) => record.removed_at === null && (record.row as { removed_at?: unknown }).removed_at == null && (record.row as { kind?: unknown }).kind === 'photo')
      .map((record) => {
        const status = (record.row as { reading_status?: unknown }).reading_status;
        return { reading_status: typeof status === 'string' ? status : null };
      }),
  };
}
