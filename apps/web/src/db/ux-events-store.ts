import type { UxEvent } from '@app/domain';
import type { AppDatabase, UxEventRow } from './schema.ts';

/*
 * Epic 18 (AD-28): the device's usage-event queue, `ux_events`. Its own table, outside the
 * op log: nothing here touches `outbox`, `remote_ops` or `entities`, and no status or count
 * of the app reads it. `src/telemetry` fills and drains it only through these functions.
 */

/** The most events the queue holds; past it the oldest go (Story 18.1). */
export const UX_EVENTS_CAP = 5000;

/** A queued row as read back: its key is always there. */
export type QueuedUxEvent = UxEvent & { id: number };

/** Appends events and drops the oldest past `cap`, in one transaction. */
export async function appendUxEvents(db: AppDatabase, events: readonly UxEvent[], cap: number = UX_EVENTS_CAP): Promise<void> {
  if (events.length === 0) return;
  await db.transaction('rw', db.ux_events, async () => {
    await db.ux_events.bulkAdd(events.map((event): UxEventRow => ({ ...event })));
    const count = await db.ux_events.count();
    if (count <= cap) return;
    const oldest = await db.ux_events.limit(count - cap).primaryKeys();
    await db.ux_events.bulkDelete(oldest);
  });
}

/** The oldest `limit` queued events whose ids are not in `skip` (a batch already in flight). */
export async function oldestUxEvents(db: AppDatabase, limit: number, skip: ReadonlySet<number> = new Set()): Promise<QueuedUxEvent[]> {
  const rows = await db.ux_events
    .filter((row) => row.id !== undefined && !skip.has(row.id))
    .limit(limit)
    .toArray();
  return rows as QueuedUxEvent[];
}

export async function deleteUxEvents(db: AppDatabase, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.ux_events.bulkDelete([...ids]);
}

/** Every queued event, oldest first (tests and the e2e read the table directly). */
export async function queuedUxEvents(db: AppDatabase): Promise<QueuedUxEvent[]> {
  return (await db.ux_events.toArray()) as QueuedUxEvent[];
}

/** What the reading watcher needs of one photo whose reading the device follows. */
export interface PhotoReadingState {
  id: string;
  kind: 'plate' | 'display' | 'caption' | 'panel' | 'nc_obs';
  status: 'none' | 'queued' | 'running' | 'done' | 'failed';
  captured_at: string;
  relatorio_id: string | null;
  block_id: string | null;
}

/** Every live photo with a reading kind, as stored (read once per finished sync cycle, never live). */
export async function photoReadingStates(db: AppDatabase): Promise<PhotoReadingState[]> {
  const files = await db.entities.where('entity').equals('file').toArray();
  const states: PhotoReadingState[] = [];
  for (const record of files) {
    const row = record.row as Partial<Record<string, unknown>>;
    if (record.removed_at !== null || row.removed_at != null || row.kind !== 'photo') continue;
    if (typeof row.reading_kind !== 'string' || typeof row.reading_status !== 'string' || typeof row.captured_at !== 'string') continue;
    states.push({
      id: record.id,
      kind: row.reading_kind as PhotoReadingState['kind'],
      status: row.reading_status as PhotoReadingState['status'],
      captured_at: row.captured_at,
      relatorio_id: record.relatorio_id ?? null,
      block_id: typeof row.block_id === 'string' ? row.block_id : null,
    });
  }
  return states;
}
