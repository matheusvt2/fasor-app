/*
 * E3-A8, E4-A7(6): the one place that hands the focus to a control after a write re-renders
 * it (a move, a removal, a restore, a "Desfazer"), never leaving it to fall on `<body>`.
 * Replaces the Templates' `restoreFocus` (`use-reorder.ts`), the relatório's
 * `focusWhenRendered` and the two `focusAfterRemoval` copies.
 */

/** How many frames the focus is watched for after a move lands (the live query re-renders late). */
export const FOCUS_WATCH_FRAMES = 30;

/**
 * How many frames a focus target is watched for after a write that re-renders a list: a
 * removal or an undo lands only after the Confirm dialog or the toast has closed and the
 * live query has re-read the rows, which on a loaded device takes more than half a second.
 */
export const LIST_FOCUS_WATCH_FRAMES = 180;

/**
 * - `if-lost`: the target takes the focus only when the focus was lost (it sits on `<body>`
 *   or on an element a re-render removed); a control that holds it on purpose keeps it.
 * - `settled`: the target takes the focus whatever holds it, once no dialog is open (after
 *   "Restaurar" and "Desfazer" the row that came back takes it, although the dialog or the
 *   toast returned the focus to a live control). The watch ends once the target took it.
 */
export type FocusMode = 'if-lost' | 'settled';

export interface RestoreFocusOptions {
  mode?: FocusMode;
  /** How long to watch; `LIST_FOCUS_WATCH_FRAMES` in `settled` mode, `FOCUS_WATCH_FRAMES` otherwise. */
  frames?: number;
  /**
   * `if-lost` only: the watch ends as soon as the target is there -- it took the focus now,
   * or it already held it (a Position box committed with Enter), or something else holds it
   * on purpose. A watch that outlived its move once stole the focus from the next removal's
   * own target (batch A real-browser pass, 2026-09-24).
   */
  once?: boolean;
}

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * Gives the focus to `target()` once it is rendered, watching a few frames because the live
 * query re-renders after the write. `target()` may return null until the change it waits
 * for has rendered.
 */
export function restoreFocus(target: () => HTMLElement | null, { mode = 'if-lost', frames, once = false }: RestoreFocusOptions = {}): void {
  const limit = frames ?? (mode === 'settled' ? LIST_FOCUS_WATCH_FRAMES : FOCUS_WATCH_FRAMES);
  let watched = 0;
  const tick = () => {
    const element = target();
    if (element !== null && element.isConnected) {
      if (mode === 'settled') {
        if (document.querySelector('.dialog-scrim') === null) {
          element.focus();
          return;
        }
      } else {
        if (focusLost()) element.focus();
        if (once) return;
      }
    }
    if (++watched < limit) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface FocusAfterRemovalOptions extends RestoreFocusOptions {
  /** The rows that count in the list (default: every child). */
  rows?: (list: HTMLElement) => HTMLElement[];
  /** The control inside a row that takes the focus. */
  focusOf: (row: HTMLElement | undefined) => HTMLElement | null;
  /** Where the focus goes when no row is left (the list's heading, a parent control). */
  fallback: () => HTMLElement | null;
}

const allChildren = (list: HTMLElement): HTMLElement[] => [...list.children] as HTMLElement[];

/**
 * Where the focus goes once the row `li` has left its list: the row now at its place, else
 * the one before it, else `fallback()`. Called with the row as drawn before the removal was
 * written. The row has left once it is detached, or once its list counts fewer rows (a list
 * keyed by position keeps the element and drops its last one).
 */
export function focusAfterRemoval(li: HTMLElement | null, { rows = allChildren, focusOf, fallback, ...options }: FocusAfterRemovalOptions): void {
  const list = li?.parentElement ?? null;
  if (li === null || list === null) return;
  const before = rows(list);
  const count = before.length;
  const index = before.indexOf(li);
  restoreFocus(() => {
    const now = list.isConnected ? rows(list) : [];
    // Not re-rendered yet: the row is still there and still counted in its list.
    if (li.isConnected && list.isConnected && now.length >= count) return null;
    return focusOf(now[index]) ?? focusOf(now[index - 1]) ?? fallback();
  }, options);
}
