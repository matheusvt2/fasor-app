import { LIST_FOCUS_WATCH_FRAMES } from '../templates/use-reorder.ts';

/*
 * E3-A8: where the focus goes after a destructive action on the Sumário and its location
 * tree (Remover, Desfazer, Restaurar), never left to fall on `<body>`. Shared by the
 * Sumário's section rows (Story 4.3) and the tree's rows (Stories 4.4, 4.5).
 */

/**
 * Gives the focus to `target()` once it is rendered and no dialog is open, whatever holds
 * the focus then (after "Restaurar" and "Desfazer" the row that came back takes it,
 * although the dialog or the toast returned the focus to a live control). `target()` may
 * return null until the change it waits for has rendered.
 */
export function focusWhenRendered(target: () => HTMLElement | null, frames = LIST_FOCUS_WATCH_FRAMES): void {
  let watched = 0;
  const tick = () => {
    const element = target();
    if (element !== null && element.isConnected && document.querySelector('.dialog-scrim') === null) {
      element.focus();
      return;
    }
    if (++watched < frames) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Where the focus goes once the row `li` has left its list: the row now at its place,
 * else the one before it, else `fallback()`. `rows(list)` names the rows that count (the
 * tree's equipment rows share a list with nothing else, the Sumário's rows likewise) and
 * `focusOf(row)` the control inside one. Called with the row as drawn before the removal
 * was written; the focus moves once the row is gone and no dialog is open.
 */
export function focusAfterRemoval(
  li: HTMLElement | null,
  rows: (list: HTMLElement) => HTMLElement[],
  focusOf: (row: HTMLElement | undefined) => HTMLElement | null,
  fallback: () => HTMLElement | null,
): void {
  const list = li?.parentElement ?? null;
  if (li === null || list === null) return;
  const index = rows(list).indexOf(li);
  focusWhenRendered(() => {
    if (li.isConnected) return null;
    const now = list.isConnected ? rows(list) : [];
    return focusOf(now[index]) ?? focusOf(now[index - 1]) ?? fallback();
  });
}
