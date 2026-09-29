import {
  confirmSuggestionOps,
  discardSuggestionOp,
  envSuggestions,
  livePendingSuggestions,
  measurementSuggestions,
  safeParsePath,
  staleProseSuggestions,
  storedTestCell,
  suggestionFieldDef,
  suggestionRowSchema,
  suggestionView,
  type Author,
  type BlockRow,
  type JsonValue,
  type LocationRow,
  type PhotoFileRow,
  type RelatorioRow,
  type SuggestionRow,
} from '@app/domain';
import { commitBatchIf, type CommitDeps } from './commit.ts';
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
 *
 * Story 9.1: the same for a display reading on a Measurement cell (the typed value checked
 * by the photo: an equal one gains the crop silently) and on a cabine's temperature or
 * humidity, compared as numbers (`measurementSuggestions`, `envSuggestions`).
 *
 * Stories 9.3 and 9.5: the same sweep discards the prose suggestions nothing will show again
 * (`staleProseSuggestions`): a vision caption whose photo got a caption, a sheet, the people
 * mark or was removed; an NC draft whose row is no longer NC or whose observation was typed
 * before it arrived (a pending draft would hold the sheet as not concluded). Never on an
 * issued relatório.
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

/**
 * E9-Q13: the sweep reads a row and its target, decides, then commits; a confirm the engineer
 * tapped in between ("Confirmar todos" right after the launch pull, which fills the cell and
 * confirms this very suggestion) made the sweep see the row still pending and the cell already
 * equal, and confirm it a second time. The commit now re-reads, in its own transaction, that
 * the row is still pending and the target still holds the value the confirm writes back.
 */
function confirmIfUnchanged(db: AppDatabase, suggestion: SuggestionRow, target: () => Promise<unknown>, value: unknown, author: Author, deps: CommitDeps): Promise<boolean> {
  const same = JSON.stringify(value ?? null);
  return commitBatchIf(
    db,
    async () => (await stillPending(db, suggestion.id)) && JSON.stringify((await target()) ?? null) === same,
    confirmSuggestionOps(author, suggestion, { auto: true, value: value as JsonValue }),
    deps,
  ).then((batch) => batch !== null);
}

async function stillPending(db: AppDatabase, id: string): Promise<boolean> {
  const record = await db.entities.get(['suggestion', id]);
  return (record?.row as { status?: unknown } | undefined)?.status === 'pending';
}

async function blockOf(db: AppDatabase, id: string): Promise<BlockRow | null> {
  return ((await db.entities.get(['block', id]))?.row as BlockRow | undefined) ?? null;
}

/** One row of the sweep; true when it was confirmed. */
async function sweepOne(db: AppDatabase, id: string, author: Author, deps: CommitDeps): Promise<boolean> {
  // Read again: an earlier confirm of this sweep may have changed the row or its block.
  const record = await db.entities.get(['suggestion', id]);
  const parsed = record === undefined ? null : suggestionRowSchema.safeParse(record.row);
  if (parsed === null || !parsed.success || parsed.data.status !== 'pending') return false;
  const suggestion = parsed.data;
  const target = safeParsePath(suggestion.target_path);
  if (target === null) return false;
  if (target.family === 'location/env') {
    const value = await equalEnvValue(db, target.id, suggestion);
    if (value === undefined) return false;
    const field = target.field;
    return confirmIfUnchanged(db, suggestion, async () => ((await db.entities.get(['location', target.id]))?.row as { env?: Record<string, unknown> } | undefined)?.env?.[field], value, author, deps);
  }
  if (target.family !== 'sheet/nameplate' && target.family !== 'sheet/test/cell') return false;
  const blockRecord = await db.entities.get(['block', target.block_id]);
  if (blockRecord === undefined) return false;
  const block = blockRecord.row as BlockRow;
  if (block.removed_at !== null) return false;
  // An issued relatório is never moved back to Em revisão by a write nobody tapped.
  if (await issued(db, suggestion)) return false;
  if (target.family === 'sheet/test/cell') {
    const entry = measurementSuggestions(block, [suggestion])[0];
    const cell = entry === undefined ? null : storedTestCell(block, entry.address);
    if (entry === undefined || entry.view !== 'none' || cell === null) return false;
    const address = entry.address;
    return confirmIfUnchanged(db, suggestion, async () => {
      const again = await blockOf(db, target.block_id);
      return again === null ? undefined : storedTestCell(again, address)?.value;
    }, cell.value, author, deps);
  }
  const field = suggestionFieldDef(block, suggestion);
  const cell = block.sheet.nameplate[target.field_key];
  if (cell === undefined || suggestionView(cell, suggestion, field) !== 'none') return false;
  // The engineer's own value is written back as it is; only its provenance changes.
  const key = target.field_key;
  return confirmIfUnchanged(db, suggestion, async () => (await blockOf(db, target.block_id))?.sheet.nameplate[key]?.value, cell.value, author, deps);
}

/**
 * Stories 9.3 and 9.5: discards each local pending prose suggestion nothing will show again,
 * one batch per row; skipped on an issued relatório. A row whose commit throws is logged and
 * left pending (the next sweep takes it again). Returns the ids it discarded.
 */
export async function discardStaleProse(db: AppDatabase, author: Author, deps: CommitDeps): Promise<string[]> {
  const pending = await pendingRows(db);
  if (pending.length === 0) return [];
  const [blocks, files] = await Promise.all([db.entities.where('entity').equals('block').toArray(), db.entities.where('entity').equals('file').toArray()]);
  const photos = files
    .filter((record) => (record.row as { kind?: unknown }).kind === 'photo')
    .map((record) => {
      const row = record.row as PhotoFileRow;
      return { ...row, removed_at: record.removed_at ?? row.removed_at ?? null };
    });
  const stale = staleProseSuggestions({ photos, blocks: blocks.map((record) => record.row as BlockRow), pending });
  const discarded: string[] = [];
  for (const suggestion of stale) {
    try {
      if (await issued(db, suggestion)) continue;
      // E9-Q13: a row the engineer confirmed or discarded since the scan above is left alone.
      if ((await commitBatchIf(db, () => stillPending(db, suggestion.id), [discardSuggestionOp(author, suggestion)], deps)) === null) continue;
      discarded.push(suggestion.id);
    } catch (error) {
      console.error('stale suggestion discard failed', { id: suggestion.id, error });
    }
  }
  return discarded;
}

async function issued(db: AppDatabase, suggestion: SuggestionRow): Promise<boolean> {
  const relatorio = await db.entities.get(['relatorio', suggestion.relatorio_id]);
  return (relatorio?.row as RelatorioRow | undefined)?.status === 'emitido';
}

/** Story 9.1: the cabine's own value when it equals the thermo-hygrometer suggestion, else undefined. */
async function equalEnvValue(db: AppDatabase, locationId: string, suggestion: SuggestionRow): Promise<JsonValue | undefined> {
  const record = await db.entities.get(['location', locationId]);
  const location = record?.row as LocationRow | undefined;
  if (location === undefined || location.kind !== 'cabine' || location.removed_at !== null) return undefined;
  if (await issued(db, suggestion)) return undefined;
  const entry = envSuggestions(location, [suggestion])[0];
  if (entry === undefined || entry.view !== 'none') return undefined;
  return location.env[entry.field] as JsonValue;
}

/** What `syncCounts` reads besides the outbox (Story 8.2): the suggestion statuses and the live photos' readings. */
export interface ReadingCountRows {
  suggestions: { status: string }[];
  photos: { reading_status: string | null }[];
}

/**
 * The device's pending suggestions on live blocks (the Sumário's own filter,
 * `livePendingSuggestions`) and on live cabines (Story 9.1, the thermo-hygrometer), and its
 * live photos' readings, for Sync status "Leituras".
 */
export async function readingCountRows(db: AppDatabase): Promise<ReadingCountRows> {
  const [pending, blocks, locations, files] = await Promise.all([
    pendingRows(db),
    db.entities.where('entity').equals('block').toArray(),
    db.entities.where('entity').equals('location').toArray(),
    db.entities.where('entity').equals('file').toArray(),
  ]);
  const live = livePendingSuggestions(
    blocks.map((record) => record.row as BlockRow),
    pending,
    locations.map((record) => record.row as LocationRow),
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
