import { useEffect, useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react';
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

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * A plate row that held the focus left the tree in the commit running now. The plate target
 * mounted in the same commit (the stored row after the pending one, the crop after the stored
 * row) takes the focus in its layout effect, before the browser paints or runs any other task,
 * so the focus never sits on `<body>` in between. The flag lives for that commit only.
 */
let handoffPending = false;

function markHandoff(): void {
  handoffPending = true;
  queueMicrotask(() => {
    handoffPending = false;
  });
}

/** Takes a hand-off marked in this commit: the plate's return target in `from`'s section gets the focus, only while it is lost. */
function takeHandoff(from: HTMLElement | null): void {
  if (!handoffPending || from === null) return;
  if (!focusLost()) {
    // Someone holds the focus on purpose: nothing to take.
    handoffPending = false;
    return;
  }
  const target = plateFocusTarget(plateScopeOf(from));
  if (target === null) return;
  target.focus({ preventScroll: true });
  handoffPending = false;
}

/** A plate target that is not a row (the crop's `.plate-crop-open`): takes a hand-off marked in its mount's commit. */
export function usePlateFocusTarget(target: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    takeHandoff(target.current);
  }, [target]);
}

/**
 * A plate row that leaves the sheet while it holds the focus (the pending shot's row replaced
 * by the stored one, the stored row replaced by the crop once the reading is ready), or redraws
 * the line that held it, hands the focus on to the next target, so it never lands on `<body>`
 * while the reading settles: synchronously in the same commit (`takeHandoff`), with the
 * `if-lost` frame watch behind it. The row tracks whether it holds the focus with its own focus
 * events: a focus moved to another control clears it, so a row leaving later takes nothing back.
 */
export function usePlateRowFocusHandoff(row: RefObject<HTMLElement | null>): { onFocus: (event: FocusEvent) => void; onBlur: (event: FocusEvent) => void } {
  const holds = useRef(false);
  const scope = useRef<HTMLElement | null>(null);
  // Mount: a row that replaces the one holding the focus takes it now. Unmount: mark the hand-off
  // for the target mounted in the same commit.
  useLayoutEffect(() => {
    takeHandoff(row.current);
    return () => {
      if (holds.current) markHandoff();
    };
  }, [row]);
  useEffect(
    () => () => {
      if (holds.current) watchPlateFocus(scope.current);
    },
    [],
  );
  // The row stays but redraws its line ("Lendo…" giving way to the queued words when the upload
  // fails or the signal goes): the focused line left with it, so the focus moves on in this commit.
  useLayoutEffect(() => {
    if (!holds.current || !focusLost()) return;
    const target = plateFocusTarget(scope.current);
    if (target !== null) target.focus({ preventScroll: true });
    else watchPlateFocus(scope.current);
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
