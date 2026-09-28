import {
  confirmSuggestionOps,
  livePendingSuggestions,
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
 * issued relatório. A row whose commit throws is logged and left pending (the next sweep
 * takes it again); the rows after it are still swept. Returns the ids it confirmed.
 */
export async function autoConfirmPending(db: AppDatabase, author: Author, deps: CommitDeps): Promise<string[]> {
  const confirmed: string[] = [];
  for (const candidate of await pendingRows(db)) {
    try {
      if (await sweepOne(db, candidate.id, author, deps)) confirmed.push(candidate.id);
    } catch (error) {
      console.error('suggestion auto-confirm failed', { id: candidate.id, error });
    }
  }
  return confirmed;
}

/** One row of the sweep; true when it was confirmed. */
async function sweepOne(db: AppDatabase, id: string, author: Author, deps: CommitDeps): Promise<boolean> {
  // Read again: an earlier confirm of this sweep may have changed the row or its block.
  const record = await db.entities.get(['suggestion', id]);
  const parsed = record === undefined ? null : suggestionRowSchema.safeParse(record.row);
  if (parsed === null || !parsed.success || parsed.data.status !== 'pending') return false;
  const suggestion = parsed.data;
  const target = safeParsePath(suggestion.target_path);
  if (target === null || target.family !== 'sheet/nameplate') return false;
  const blockRecord = await db.entities.get(['block', target.block_id]);
  if (blockRecord === undefined) return false;
  const block = blockRecord.row as BlockRow;
  if (block.removed_at !== null) return false;
  // An issued relatório is never moved back to Em revisão by a write nobody tapped.
  const relatorio = await db.entities.get(['relatorio', suggestion.relatorio_id]);
  if ((relatorio?.row as RelatorioRow | undefined)?.status === 'emitido') return false;
  const field = suggestionFieldDef(block, suggestion);
  const cell = block.sheet.nameplate[target.field_key];
  if (cell === undefined || suggestionView(cell, suggestion, field) !== 'none') return false;
  // The engineer's own value is written back as it is; only its provenance changes.
  await commitBatch(db, confirmSuggestionOps(author, suggestion, { auto: true, value: cell.value }), deps);
  return true;
}

/** What `syncCounts` reads besides the outbox (Story 8.2): the suggestion statuses and the live photos' readings. */
export interface ReadingCountRows {
  suggestions: { status: string }[];
  photos: { reading_status: string | null }[];
}

/**
 * The device's pending suggestions on live blocks (the Sumário's own filter,
 * `livePendingSuggestions`) and its live photos' readings, for Sync status "Leituras".
 */
export async function readingCountRows(db: AppDatabase): Promise<ReadingCountRows> {
  const [pending, blocks, files] = await Promise.all([
    pendingRows(db),
    db.entities.where('entity').equals('block').toArray(),
    db.entities.where('entity').equals('file').toArray(),
  ]);
  const live = livePendingSuggestions(
    blocks.map((record) => record.row as BlockRow),
    pending,
  );
  return {
    suggestions: live.map((row) => ({ status: row.status })),
    photos: files
      .filter((record) => record.removed_at === null && (record.row as { removed_at?: unknown }).removed_at == null && (record.row as { kind?: unknown }).kind === 'photo')
      .map((record) => {
        const status = (record.row as { reading_status?: unknown }).reading_status;
        return { reading_status: typeof status === 'string' ? status : null };
      }),
  };
}

/** E78-Q8: whether this device holds a live photo whose reading is `running` (the sync engine then polls sooner). */
export async function hasRunningReading(db: AppDatabase): Promise<boolean> {
  const files = await db.entities.where('entity').equals('file').toArray();
  return files.some((record) => {
    const row = record.row as { kind?: unknown; removed_at?: unknown; reading_status?: unknown };
    return record.removed_at === null && row.removed_at == null && row.kind === 'photo' && row.reading_status === 'running';
  });
}
