import { useEffect, useRef, type FocusEvent, type RefObject } from 'react';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';

/*
 * Story 14.10 lane B (production finding of 2026-10-15): after a one-shot "Fotografar placa"
 * the opener is gone (the plate row replaces the tile), so the camera's focus return had no
 * target and the focus fell on `<body>`. The plate's return target is its row's reading line
 * (the pending shot's row first, then the stored row's), else the stored row's tile, else the
 * plate crop once the reading is ready. Every watch here is `if-lost`: a focus the user moved
 * is never taken back.
 */

/** The waiting line of a plate row that may take the focus (`tabIndex={-1}`, never in the tab order). */
const READING_LINE = '.reading-line[tabindex="-1"], .queued-banner[tabindex="-1"]';

/** Where the focus goes inside the nameplate section `scope` while the plate shot is being read. */
export function plateFocusTarget(scope: ParentNode | null): HTMLElement | null {
  if (scope === null) return null;
  const rows = [...scope.querySelectorAll<HTMLElement>('.ficha-np-photo')];
  const row = rows.find((candidate) => candidate.hasAttribute('data-pending-shot')) ?? rows[0];
  if (row !== undefined) {
    const line = row.querySelector<HTMLElement>(READING_LINE) ?? row.querySelector<HTMLElement>('button.photo-tile');
    if (line !== null) return line;
  }
  return scope.querySelector<HTMLElement>('.plate-crop-open');
}

/** The nameplate section around `element` (its row's own parent outside a sheet, as in a unit test). */
export function plateScopeOf(element: Element | null): HTMLElement | null {
  if (element === null) return null;
  return element.closest<HTMLElement>('#ficha-nameplate') ?? element.parentElement?.closest<HTMLElement>('section') ?? element.parentElement;
}

/** Watches the focus onto the plate's return target for `LIST_FOCUS_WATCH_FRAMES`, only while it is lost. */
export function watchPlateFocus(scope: ParentNode | null): void {
  if (scope === null) return;
  restoreFocus(() => plateFocusTarget(scope), { mode: 'if-lost', frames: LIST_FOCUS_WATCH_FRAMES, preventScroll: true });
}

/**
 * A plate row that leaves the sheet while it holds the focus (the pending shot's row replaced
 * by the stored one, the stored row replaced by the crop once the reading is ready), or redraws
 * the line that held it, hands the focus on to the next target, so it never lands on `<body>` while the reading settles. The
 * row tracks whether it holds the focus with its own focus events: a focus moved to another
 * control clears it, so a row leaving later takes nothing back.
 */
export function usePlateRowFocusHandoff(row: RefObject<HTMLElement | null>): { onFocus: (event: FocusEvent) => void; onBlur: (event: FocusEvent) => void } {
  const holds = useRef(false);
  const scope = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      if (holds.current) watchPlateFocus(scope.current);
    },
    [],
  );
  // The row stays but redraws its line ("Lendo…" giving way to the queued words when the upload
  // fails or the signal goes): the focused line left with it, so the focus moves on too.
  useEffect(() => {
    if (!holds.current) return;
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) watchPlateFocus(scope.current);
  });
  return {
    onFocus: () => {
      holds.current = true;
      scope.current = plateScopeOf(row.current);
    },
    onBlur: (event) => {
      // A focus moved to another control on purpose; a removal (no related target) keeps the hand-off.
      if (event.relatedTarget !== null && !(row.current?.contains(event.relatedTarget as Node) ?? false)) holds.current = false;
    },
  };
}
