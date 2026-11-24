import { useEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/*
 * Fix batch e28w (S2 and N2 of the hands-on pass of 2026-11-23; Story 29.2, third criterion): a step back to the
 * Sumário shows what it showed.
 *
 * - The Sumário keeps its view (section 9 open or not, and each local the person opened or closed) by the router
 *   key of its history entry (`keepSumarioView`), and a pop onto that entry draws it again (`keptSumarioView`), in
 *   every status; with the same rows open the page has the same height, so `useScrollRestoration` puts the scroll
 *   where it was. Kept in memory only: a reload draws the Sumário as it opens (its status's rule).
 * - Each entry the router pushes remembers the address it was pushed from (`useEntryOrigins`, kept over a replace),
 *   so a screen's in-app "Voltar" whose destination is that address steps back in history (`returnToOrigin`)
 *   instead of pushing a new entry, which a later device back would have reopened. The arrival state the push would
 *   have carried (section 9 open, the row to focus, Stories 12.2 and 15.4) is handed to the screen it lands on
 *   (`returnArrival`) for that one arrival.
 *
 * Nothing here touches `overlay-history.ts`: a released overlay entry between the two screens is skipped by the
 * pop as it is for the device's back.
 */

/** How many entries each map keeps: a long session never grows them without bound. */
const LIMIT = 64;

function keep<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > LIMIT) map.delete(map.keys().next().value as string);
}

/** The Sumário's view of one history entry. */
export interface SumarioView {
  /** Section 9 (the tree) open. */
  section9: boolean;
  /** Each local the person opened (true) or closed (false); a local not named opens by its level's default. */
  locals: ReadonlyMap<string, boolean>;
}

const views = new Map<string, SumarioView>();
const viewKey = (entryKey: string, relatorioId: string) => `${relatorioId}\u0000${entryKey}`;

/**
 * React Router's key of an entry it did not create (the tab's first page, a memory router's start): shared by every
 * such entry, so it names no one entry and nothing is kept under it.
 */
const UNKEYED = 'default';

export function keepSumarioView(entryKey: string, relatorioId: string, view: SumarioView): void {
  if (entryKey === UNKEYED) return;
  keep(views, viewKey(entryKey, relatorioId), { section9: view.section9, locals: new Map(view.locals) });
}

/** The view the Sumário had on this entry, or null when this tab never drew it there. */
export function keptSumarioView(entryKey: string, relatorioId: string): SumarioView | null {
  if (entryKey === UNKEYED) return null;
  return views.get(viewKey(entryKey, relatorioId)) ?? null;
}

const origins = new Map<string, string>();
let shown: { key: string; address: string } | null = null;
let returning: { to: string; state: unknown } | null = null;

/**
 * Mounted once, in the App shell: records the address each pushed entry was pushed from, and ends a pending
 * return arrival once the screen it was for has rendered (a child's render reads it before this effect runs).
 */
export function useEntryOrigins(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    const address = `${location.pathname}${location.search}`;
    if (shown !== null && shown.key !== location.key) {
      if (navigationType === NavigationType.Push) keep(origins, location.key, shown.address);
      else if (navigationType === NavigationType.Replace) {
        const from = origins.get(shown.key);
        if (from !== undefined) keep(origins, location.key, from);
      }
      returning = null;
    }
    shown = { key: location.key, address };
  }, [location.key, location.pathname, location.search, navigationType]);
}

/**
 * Whether the in-app "Voltar" of the entry `entryKey` should step back in history: the entry was pushed from
 * `to` itself. When it should, `state` is kept for the screen the step lands on (`returnArrival`).
 */
export function returnToOrigin(entryKey: string, to: string, state: unknown): boolean {
  if (origins.get(entryKey) !== to) return false;
  returning = { to, state };
  return true;
}

/** The arrival state of a "Voltar" that stepped back to `pathname`, or null. Pure: a render may read it twice. */
export function returnArrival(pathname: string): unknown {
  return returning !== null && returning.to === pathname ? returning.state : null;
}
