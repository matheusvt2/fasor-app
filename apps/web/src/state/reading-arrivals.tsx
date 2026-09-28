import {
  arrivedReadingsCount,
  buildSnapshot,
  firstSheetWithPendingSuggestions,
  leiturasProntasText,
  pendingSuggestions,
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
import { useToast } from './toast.tsx';

/*
 * Story 8.2 (EXPERIENCE.md › Reading arrived): while the app is open, suggestions a pull
 * brings in announce themselves once: "3 leituras prontas para confirmar — Ver" (n is the
 * readings, the distinct reading runs of the new rows, `arrivedReadingsCount`). "Ver" opens
 * the first sheet in tree order holding a pending suggestion of the relatório the newest
 * arrival belongs to (`firstSheetWithPendingSuggestions`), the Sumário when none is left.
 * The rows the device already held when this first looked never announce themselves: only
 * what arrives while it watches does.
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

/**
 * One observation of the pending rows: the ones never seen before are the arrivals, except on
 * the first observation (`seen` null), which only records what is already there.
 */
export function arrivalStep(seen: ReadonlySet<string> | null, rows: readonly SuggestionRow[]): { seen: Set<string>; arrived: SuggestionRow[] } {
  const next = new Set(seen ?? []);
  const arrived: SuggestionRow[] = [];
  for (const row of rows) {
    if (next.has(row.id)) continue;
    next.add(row.id);
    if (seen !== null) arrived.push(row);
  }
  return { seen: next, arrived };
}

/** Where "Ver" goes: the first sheet with a pending suggestion of the relatório, else its Sumário. */
export async function arrivalTarget(db: AppDatabase, relatorioId: string): Promise<string> {
  const state = await relatorioState(db, relatorioId);
  if (state === null) return `/relatorio/${relatorioId}`;
  const snapshot = buildSnapshot(state, relatorioId);
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
  // What this device's store held when first looked at, per database (a sign-in starts over).
  const seen = useRef<{ db: AppDatabase; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (db === null || observed === null || observed.db !== db) return;
    const step = arrivalStep(seen.current?.db === db ? seen.current.ids : null, observed.rows);
    seen.current = { db, ids: step.seen };
    if (step.arrived.length === 0) return;
    const newest = step.arrived.reduce((a, b) => (a.id > b.id ? a : b));
    showToast(leiturasProntasText(arrivedReadingsCount(step.arrived)), {
      action: {
        label: ui.readingArrival.open,
        onPress: () => {
          void arrivalTarget(db, newest.relatorio_id)
            .then((to) => navigate(to))
            .catch(() => undefined);
        },
      },
    });
  }, [db, observed, navigate, showToast]);

  return null;
}
