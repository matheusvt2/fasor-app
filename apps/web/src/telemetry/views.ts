import type { Screen } from '@app/domain';
import { track } from './track.ts';

/*
 * Story 18.4: the one view tracker behind `screen_view`. A view opens when a screen is shown
 * and its `screen_view` is written when it is left (another screen shown, the tab hidden, the
 * page left), carrying how long it stayed open (`duration_ms`, monotonic clock) and the
 * screen shown before it (`from`, absent on the first view of a load). The routes
 * (`TelemetryRoutes`) and the full-surface states (`useScreenView`) enter through here; the
 * document listeners (`instrument.ts`) leave on hidden and `pagehide` and resume on visible.
 */

export interface ViewIds {
  relatorio_id?: string;
  block_id?: string;
}

interface View {
  screen: Screen;
  ids: ViewIds;
  openedAt: number;
  from: Screen | null;
}

/** The view open now; null before the first screen and while the tab is hidden. */
let open: View | null = null;
/** The view left by `leaveScreen`, opened again by `resumeScreen`. */
let left: { screen: Screen; ids: ViewIds } | null = null;
/** The route's own view, which a full-surface state hands back to when it goes. */
let route: { screen: Screen; ids: ViewIds } | null = null;

function clock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function write(view: View, at: number): void {
  track({
    name: 'screen_view',
    screen: view.screen,
    duration_ms: Math.max(0, Math.round(at - view.openedAt)),
    ...(view.from === null ? {} : { from: view.from }),
    ...(view.ids.relatorio_id === undefined ? {} : { relatorio_id: view.ids.relatorio_id }),
    ...(view.ids.block_id === undefined ? {} : { block_id: view.ids.block_id }),
  });
}

/**
 * Shows `screen`: the open view's `screen_view` is written and a view of `screen` opens, its
 * `from` the screen just left (or the one the hidden tab left). `kind: 'route'` (the default)
 * also records it as the route's view, the one `enterRouteScreen` goes back to.
 */
export function enterScreen(screen: Screen, ids: ViewIds = {}, kind: 'route' | 'surface' = 'route'): void {
  try {
    const at = clock();
    const before = open?.screen ?? left?.screen ?? null;
    if (open !== null) write(open, at);
    open = { screen, ids, openedAt: at, from: before };
    left = null;
    if (kind === 'route') route = { screen, ids };
  } catch {
    // An event is never worth a failure.
  }
}

/** A full-surface state went: the route's screen shows again (nothing when no route was entered). */
export function enterRouteScreen(): void {
  if (route !== null) enterScreen(route.screen, route.ids);
}

/** The tab is hidden or the page left: the open view is written and remembered. */
export function leaveScreen(): void {
  try {
    if (open === null) return;
    write(open, clock());
    left = { screen: open.screen, ids: open.ids };
    open = null;
  } catch {
    // An event is never worth a failure.
  }
}

/** The tab is shown again: a view of the screen left opens, its `from` that same screen. */
export function resumeScreen(): void {
  if (open !== null || left === null) return;
  open = { screen: left.screen, ids: left.ids, openedAt: clock(), from: left.screen };
  left = null;
}

/** Forgets every view (tests). */
export function resetViewsForTests(): void {
  open = null;
  left = null;
  route = null;
}
