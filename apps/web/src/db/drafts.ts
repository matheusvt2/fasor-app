import { draftKey, type DraftTarget } from '@app/domain';
import type { AppDatabase, DraftRow } from './schema.ts';

/*
 * AD-1/AD-2, FR-61: the `drafts` table is the only store that holds something the user
 * has not committed. It is never read by the renderer and never becomes an op by itself:
 * a row is written when the tab goes away, offered back on reopen, and dropped the moment
 * the owning surface applies it (which then commits through the ordinary op path).
 */

/** Writes one draft row; an empty value drops the row instead, since nothing is uncommitted. */
export async function saveDraft(
  db: AppDatabase,
  target: DraftTarget,
  value: unknown,
  now: Date,
): Promise<void> {
  if (value === null || value === undefined || value === '') {
    await dropDraft(db, target);
    return;
  }
  const row: DraftRow = {
    key: draftKey(target),
    surface: target.surface,
    entity_id: target.entity_id,
    value,
    saved_at: now.toISOString(),
  };
  await db.drafts.put(row);
}

/** One target and the value its surface currently holds, for `saveDrafts`. */
export interface DraftWrite {
  target: DraftTarget;
  value: unknown;
}

/**
 * Every source of a tab-hide in one transaction (FR-61). A loop of awaited `saveDraft`
 * calls is one IndexedDB transaction per source: an iOS tab discarded after the first one
 * commits keeps the first draft and loses the rest, which is the exact failure this table
 * exists to prevent. Here the writes are all queued inside one `rw` transaction, so the
 * tab either takes them all or none.
 */
export async function saveDrafts(db: AppDatabase, writes: readonly DraftWrite[], now: Date): Promise<void> {
  if (writes.length === 0) return;
  await db.transaction('rw', db.drafts, async () => {
    await Promise.all(writes.map(({ target, value }) => saveDraft(db, target, value, now)));
  });
}

export async function readDraft(db: AppDatabase, target: DraftTarget): Promise<DraftRow | undefined> {
  return db.drafts.get(draftKey(target));
}

/** Every draft on this device, for the reopen offer. */
export async function listDrafts(db: AppDatabase): Promise<DraftRow[]> {
  return db.drafts.toArray();
}

export async function dropDraft(db: AppDatabase, target: DraftTarget): Promise<void> {
  await db.drafts.delete(draftKey(target));
}

export async function dropAllDrafts(db: AppDatabase): Promise<void> {
  await db.drafts.clear();
}
