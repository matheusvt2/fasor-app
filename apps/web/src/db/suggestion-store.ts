import {
  cancelledReadingSuggestions,
  captionSuggestions,
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
  suggestionTarget,
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
import { readAllReadingCancelled } from './prefs.ts';
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

/**
 * Story 13.5 (WAIT-1): discards each local pending suggestion read from a photo whose reading
 * this device cancelled (`reading_cancelled:{photo_id}`, `cancelledReadingSuggestions`), one
 * batch per row through `discardSuggestionOp`; the photo is kept. Skipped on an issued
 * relatório and for a row confirmed or discarded meanwhile (E9-Q13's re-read). A row whose
 * commit throws is logged and left pending (the next sweep takes it again). Runs after every
 * pull, so a reading that lands long after the tap is discarded before anyone is told of it.
 * With `only`, that one photo's rows (the tap itself discards what is already here, at once).
 * Returns the ids it discarded.
 */
export async function discardCancelledReadings(db: AppDatabase, author: Author, deps: CommitDeps, only?: string): Promise<string[]> {
  const cancelled = only === undefined ? await readAllReadingCancelled(db) : [only];
  if (cancelled.length === 0) return [];
  const discarded: string[] = [];
  for (const suggestion of cancelledReadingSuggestions(await pendingRows(db), cancelled)) {
    try {
      if (await issued(db, suggestion)) continue;
      if ((await commitBatchIf(db, () => stillPending(db, suggestion.id), [discardSuggestionOp(author, suggestion)], deps)) === null) continue;
      discarded.push(suggestion.id);
    } catch (error) {
      console.error('cancelled reading discard failed', { id: suggestion.id, error });
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
  /** Story 10.4: each live photo with what its "Leituras" row names (`queuedReadingRows`). */
  photos: { id: string; caption: string | null; captured_at: string | null; reading_status: string | null }[];
}

/**
 * The device's pending suggestions on live blocks (the Sumário's own filter,
 * `livePendingSuggestions`), on live cabines (Story 9.1, the thermo-hygrometer) and on live
 * photos' captions (ledger 1137: the ones the gallery shows, `captionSuggestions`), and its
 * live photos' readings, for Sync status "Leituras".
 */
export async function readingCountRows(db: AppDatabase): Promise<ReadingCountRows> {
  const [pending, files] = await Promise.all([pendingRows(db), db.entities.where('entity').equals('file').toArray()]);
  // W-6 (full review 2026-09-30): only the blocks and cabines the pending rows name are read
  // (`livePendingSuggestions` asks nothing else of them), never every block with its sheet.
  const blockIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const row of pending) {
    const target = suggestionTarget(row.target_path);
    if (target?.kind === 'block') blockIds.add(target.block_id);
    else if (target?.kind === 'location') locationIds.add(target.location_id);
  }
  const [blockRecords, locationRecords] = await Promise.all([
    db.entities.bulkGet([...blockIds].map((id) => ['block', id] as ['block', string])),
    db.entities.bulkGet([...locationIds].map((id) => ['location', id] as ['location', string])),
  ]);
  const live = livePendingSuggestions(
    blockRecords.flatMap((record) => (record === undefined ? [] : [record.row as BlockRow])),
    pending,
    locationRecords.flatMap((record) => (record === undefined ? [] : [record.row as LocationRow])),
  );
  const photos = files
    .filter((record) => record.removed_at === null && (record.row as { removed_at?: unknown }).removed_at == null && (record.row as { kind?: unknown }).kind === 'photo')
    .map((record) => record.row as PhotoFileRow);
  const captions = captionSuggestions(photos, pending);
  return {
    suggestions: [...live, ...captions.values()].map((row) => ({ status: row.status })),
    photos: photos.map((row) => ({
      id: row.id,
      caption: typeof row.caption === 'string' ? row.caption : null,
      captured_at: typeof row.captured_at === 'string' ? row.captured_at : null,
      reading_status: typeof row.reading_status === 'string' ? row.reading_status : null,
    })),
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
