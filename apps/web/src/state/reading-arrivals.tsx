import {
  arrivalServed,
  arrivalsToAnnounce,
  arrivedReadingsCount,
  cabineOf,
  firstSheetWithPendingSuggestions,
  legendasSugeridasText,
  leiturasProntasText,
  panelPhotosAwaiting,
  panelSuggestionOf,
  pendingSuggestions,
  photoFileRowSchema,
  suggestionRowSchema,
  suggestionRowsOf,
  type ArrivalScreen,
  type EquipmentRow,
  type SuggestionRow,
} from '@app/domain';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
 *
 * Review fixes 2026-10-08 (DC-4, merging DB-5, DE-5, DG-3; H-7): arrivals the screen already
 * draws announce nothing (the open ficha's own suggestions and its cabine's environment fields;
 * the gallery's captions, `arrivalsToAnnounce`). Caption rows are their own arrival, "N legendas
 * sugeridas", whose "Ver" opens the gallery; they never count as "leituras". An announcement is
 * withdrawn once served (`arrivalServed`: nothing it named is pending off screen any more), so it
 * never sits over the fields it announced. "Ver" on the address already shown scrolls to and
 * focuses the first pending suggestion of the page instead of a navigation that does nothing.
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
export async function arrivalTarget(db: AppDatabase, relatorioId: string, newest?: SuggestionRow, announced?: ReadonlySet<string>): Promise<string> {
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
  const pending = pendingSuggestions(suggestionRowsOf(state, relatorioId));
  const sheets = { ...snapshot, equipment };
  // Review fixes 2026-10-08 (DC-4): the sheet the toast announced first (its rows still pending),
  // so older suggestions of a sheet earlier in tree order never keep "Ver" away from it.
  const own = announced === undefined ? null : firstSheetWithPendingSuggestions(sheets, pending.filter((row) => announced.has(row.id)));
  const blockId = own ?? firstSheetWithPendingSuggestions(sheets, pending);
  return blockId === null ? `/relatorio/${relatorioId}` : `/relatorio/${relatorioId}/ficha/${blockId}`;
}

/** The route the arrival rules read: an equipment ficha, a gallery, or anything else. */
export function arrivalRoute(pathname: string): { kind: 'ficha'; relatorioId: string; blockId: string } | { kind: 'gallery'; relatorioId: string } | { kind: 'other' } {
  const ficha = /^\/relatorio\/([^/]+)\/ficha\/([^/]+)\/?$/.exec(pathname);
  if (ficha !== null) return { kind: 'ficha', relatorioId: ficha[1]!, blockId: ficha[2]! };
  const gallery = /^\/relatorio\/([^/]+)\/fotos\/?$/.exec(pathname);
  if (gallery !== null) return { kind: 'gallery', relatorioId: gallery[1]! };
  return { kind: 'other' };
}

/** What the screen at `pathname` draws, for the arrival rules: a ficha with its block's cabine. */
export async function arrivalScreen(db: AppDatabase, pathname: string): Promise<ArrivalScreen> {
  const route = arrivalRoute(pathname);
  if (route.kind !== 'ficha') return route;
  const state = await relatorioState(db, route.relatorioId);
  if (state === null) return { ...route, cabineId: null };
  const snapshot = relatorioSnapshotOf(state, route.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === route.blockId);
  return { ...route, cabineId: cabineOf(snapshot.locations, block?.location_id ?? null)?.id ?? null };
}

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** "Ver" on the screen it leads to: the first pending suggestion of the page, scrolled to and focused. */
export function focusFirstSuggestion(): void {
  // A nameplate cell already confirmed keeps its `data-suggestion-id`: it is not pending.
  const first = document.querySelector<HTMLElement>('[data-suggestion-id]:not([data-state="confirmed"]), .suggestion-field[data-state="suggested"]');
  if (first === null) return;
  const target = first.matches(FOCUSABLE) ? first : (first.querySelector<HTMLElement>(FOCUSABLE) ?? first);
  first.scrollIntoView({ block: 'center' });
  if (target === first && !first.hasAttribute('tabindex')) first.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Whether `to` is the address already shown (a navigation to it would do nothing). */
function isShown(to: string, where: { pathname: string; search: string }): boolean {
  const url = new URL(to, 'http://app.local');
  return url.pathname === where.pathname && url.search === where.search;
}

/** Mounted once in the shell (router and toast available); renders nothing. */
export function ReadingArrivals() {
  const db = useSession().database;
  const navigate = useNavigate();
  const location = useLocation();
  const where = useRef(location);
  where.current = location;
  const { showToast, withdrawToast } = useToast();
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
  /** The announcements on screen or queued, by text: the rows each named (withdrawn once served). */
  const announced = useRef<{ db: AppDatabase; byText: Map<string, Set<string>> } | null>(null);

  /** "Ver": the place `to`, or, when it is the address already shown, the first suggestion on it. */
  const open = useCallback(
    (to: string) => {
      if (isShown(to, where.current)) focusFirstSuggestion();
      else void navigate(to);
    },
    [navigate],
  );

  /** Withdraws every announcement the screen now shown has served; then announces `arrived`. */
  const review = useCallback(
    async (database: AppDatabase, rows: readonly SuggestionRow[], arrived: readonly SuggestionRow[]) => {
      // A failed read never drops arrivals already taken out of `waiting`: they are announced as off screen.
      const screen = await arrivalScreen(database, where.current.pathname).catch((): ArrivalScreen => ({ kind: 'other' }));
      if (announced.current?.db !== database) announced.current = { db: database, byText: new Map() };
      const held = announced.current.byText;
      for (const [text, ids] of held) {
        if (!arrivalServed(ids, rows, screen)) continue;
        held.delete(text);
        withdrawToast(text);
      }
      if (arrived.length === 0) return;
      const { readings, captions } = arrivalsToAnnounce(arrived, screen);
      const say = (text: string, rowsSaid: readonly SuggestionRow[], onPress: () => void) => {
        // The toast of this text now names these rows only (it replaces any earlier one of the same text).
        const ids = new Set(rowsSaid.map((row) => row.id));
        held.set(text, ids);
        // Not a press's answer: it waits behind a job outcome on screen (Q-1, R-1).
        showToast(text, {
          action: { label: ui.readingArrival.open, onPress },
          arrival: true,
          onDismiss: () => {
            if (held.get(text) === ids) held.delete(text);
          },
        });
      };
      if (readings.length > 0) {
        const newest = readings.reduce((a, b) => (a.id > b.id ? a : b));
        const announcedIds = new Set(readings.map((row) => row.id));
        say(leiturasProntasText(arrivedReadingsCount(readings)), readings, () => {
          void arrivalTarget(database, newest.relatorio_id, newest, announcedIds)
            .then(open)
            .catch(() => undefined);
        });
      } else if (captions.length > 0) {
        // One toast at a time: with readings in the same pull, the gallery's own line names the captions.
        const relatorioId = captions[0]!.relatorio_id;
        say(legendasSugeridasText(captions.length), captions, () => open(`/relatorio/${relatorioId}/fotos`));
      }
    },
    [open, showToast, withdrawToast],
  );

  useEffect(() => {
    if (db === null || observed === null || observed.db !== db) return;
    const synced = running ? syncedAtStart.current : hadSynced;
    const step = arrivalStep(memory.current?.db === db ? memory.current.state : null, observed.rows, { running, synced });
    memory.current = { db, state: step.state };
    if (step.arrived.length === 0 && (announced.current === null || announced.current.byText.size === 0)) return;
    void review(db, observed.rows, step.arrived).catch(() => undefined);
  }, [db, observed, running, hadSynced, review]);

  // A move to the screen an announcement leads to serves it.
  const pathname = location.pathname;
  useEffect(() => {
    if (db === null || observed === null || observed.db !== db || announced.current === null || announced.current.byText.size === 0) return;
    void review(db, observed.rows, []).catch(() => undefined);
    // Only the address re-runs this; the rows' own changes run the watcher above.
  }, [pathname]);

  return null;
}
