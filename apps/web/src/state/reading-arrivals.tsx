import {
  arrivedReadingsCount,
  firstSheetWithPendingSuggestions,
  leiturasProntasText,
  panelPhotosAwaiting,
  panelSuggestionOf,
  pendingSuggestions,
  photoFileRowSchema,
  suggestionRowSchema,
  suggestionRowsOf,
  type EquipmentRow,
  type SuggestionRow,
} from '@app/domain';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ui } from '../copy/ui.ts';
import { relatorioState } from '../db/home-store.ts';
import { useLiveQuery } from '../db/live.ts';
import type { AppDatabase } from '../db/schema.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast } from './toast.tsx';
import { relatorioSnapshotOf } from '../db/relatorio-snapshot.ts';

/*
 * Story 8.2 (EXPERIENCE.md › Reading arrived): while the app is open, suggestions a pull
 * brings in announce themselves once: "3 leituras prontas para confirmar — Ver" (n is the
 * readings, the distinct reading runs of the new rows, `arrivedReadingsCount`). "Ver" opens
 * the first sheet in tree order holding a pending suggestion of the relatório the newest
 * arrival belongs to (`firstSheetWithPendingSuggestions`), the Sumário when none is left.
 * The rows the device already held when this first looked never announce themselves, nor do
 * the rows a device that never finished a sync pulls in its first cycle (the backlog of a
 * fresh sign-in): only what arrives afterwards does. New rows seen while a cycle runs wait
 * for its end, so the post-pull sweep has auto-confirmed what the engineer had already typed
 * and only the rows still pending then are announced.
 */

/** The device's pending suggestion rows (every relatório). */
async function pendingRows(db: AppDatabase): Promise<SuggestionRow[]> {
  const records = await db.entities.where('entity').equals('suggestion').toArray();
  const rows: SuggestionRow[] = [];
  for (const record of records) {
    const parsed = suggestionRowSchema.safeParse(record.row);
    if (parsed.success && parsed.data.status === 'pending') rows.push(parsed.data);
  }
  return rows;
}

/** What the watcher remembers: every id it has seen, and the new ones waiting for the cycle to end. */
export interface ArrivalState {
  seen: ReadonlySet<string>;
  waiting: ReadonlySet<string>;
}

/**
 * One observation of the pending rows. A row never seen before is baseline (recorded, never
 * announced) on the first observation (`state` null) or while the device has not finished a
 * sync before (`synced` false); otherwise it waits. Once no cycle runs, the waiting rows still
 * pending are the arrivals (a row the sweep confirmed meanwhile is gone from `rows`).
 */
export function arrivalStep(
  state: ArrivalState | null,
  rows: readonly SuggestionRow[],
  sync: { running: boolean; synced: boolean },
): { state: ArrivalState; arrived: SuggestionRow[] } {
  const seen = new Set(state?.seen ?? []);
  const waiting = new Set(state?.waiting ?? []);
  const baseline = state === null || !sync.synced;
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!baseline) waiting.add(row.id);
  }
  if (sync.running || waiting.size === 0) return { state: { seen, waiting }, arrived: [] };
  return { state: { seen, waiting: new Set() }, arrived: rows.filter((row) => waiting.has(row.id)) };
}

/**
 * Where "Ver" goes: the first sheet with a pending suggestion of the relatório, else its
 * Sumário. Story 13.5 (WAIT-3): when the newest arrival is the panel suggestion of a photo whose
 * result dialog still waits (live, `reading_kind: 'panel'`), the Sumário with `?panel={photo}`,
 * which reopens that dialog on the proposal.
 */
export async function arrivalTarget(db: AppDatabase, relatorioId: string, newest?: SuggestionRow): Promise<string> {
  const state = await relatorioState(db, relatorioId);
  if (state === null) return `/relatorio/${relatorioId}`;
  if (newest !== undefined) {
    const photo = photoFileRowSchema.safeParse(state.get(`file:${newest.source.photo_id}`));
    if (photo.success && panelSuggestionOf([newest], photo.data.id) !== null) {
      const target = photo.data.reading_target as { location_id?: unknown } | null;
      const locationId = target !== null && typeof target === 'object' && typeof target.location_id === 'string' ? target.location_id : null;
      if (locationId !== null && panelPhotosAwaiting([photo.data], locationId).length > 0) return `/relatorio/${relatorioId}?panel=${photo.data.id}`;
    }
  }
  const snapshot = relatorioSnapshotOf(state, relatorioId);
  const equipment = [...state.entries()].filter(([key]) => key.startsWith('equipment:')).map(([, row]) => row as EquipmentRow);
  const blockId = firstSheetWithPendingSuggestions({ ...snapshot, equipment }, pendingSuggestions(suggestionRowsOf(state, relatorioId)));
  return blockId === null ? `/relatorio/${relatorioId}` : `/relatorio/${relatorioId}/ficha/${blockId}`;
}

/** Mounted once in the shell (router and toast available); renders nothing. */
export function ReadingArrivals() {
  const db = useSession().database;
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Tagged with its database, so an answer of the previous session is never read as this one's.
  const observed = useLiveQuery(async () => (db === null ? null : { db, rows: await pendingRows(db) }), [db], null);
  const { running, lastSyncAt } = useSync();
  // Whether a sync had finished before the cycle now running began (read at its start), so
  // the first cycle of a fresh device stays baseline even once it stamps `lastSyncAt`.
  const syncedAtStart = useRef(false);
  const hadSynced = lastSyncAt !== null;
  useEffect(() => {
    // Declared before the watcher's effect, so it runs first in the commit that starts a cycle.
    if (running) syncedAtStart.current = hadSynced;
  }, [running]);
  // What this device's store held when first looked at, per database (a sign-in starts over).
  const memory = useRef<{ db: AppDatabase; state: ArrivalState } | null>(null);

  useEffect(() => {
    if (db === null || observed === null || observed.db !== db) return;
    const synced = running ? syncedAtStart.current : hadSynced;
    const step = arrivalStep(memory.current?.db === db ? memory.current.state : null, observed.rows, { running, synced });
    memory.current = { db, state: step.state };
    if (step.arrived.length === 0) return;
    const newest = step.arrived.reduce((a, b) => (a.id > b.id ? a : b));
    showToast(leiturasProntasText(arrivedReadingsCount(step.arrived)), {
      action: {
        label: ui.readingArrival.open,
        onPress: () => {
          void arrivalTarget(db, newest.relatorio_id, newest)
            .then((to) => navigate(to))
            .catch(() => undefined);
        },
      },
      // Not a press's answer: it waits behind a job outcome on screen (Q-1, R-1).
      arrival: true,
    });
  }, [db, observed, running, hadSynced, navigate, showToast]);

  return null;
}
