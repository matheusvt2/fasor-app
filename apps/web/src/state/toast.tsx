import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast, type ToastAction, type ToastMessage } from '../components/toast.tsx';
import type { Timers } from '../input/field-commit.ts';

/*
 * UX-DR10, EXPERIENCE.md › Toast: one at a time, 6 s, or until dismissed when it
 * carries an action. The provider is rendered once in the shell, beside the banner
 * slot, so any surface can ask for a toast without owning a region of its own.
 *
 * Review F-03/F-04 (Q-1, Matheus 2026-10-08): a job outcome ("Revisão N pronta",
 * `outcome: true`) holds the slot for its full 6 s or until dismissed. A toast asked for
 * meanwhile waits in a FIFO queue (one text queued once) and shows after it. An outcome
 * arriving over an action toast (the reading arrival's "Ver") takes the slot, and the action
 * toast goes back to the head of the queue, its action kept. Plain toasts among themselves
 * still replace each other. One toast is visible at a time.
 */

export const TOAST_TIMEOUT_MS = 6_000;

export interface ShowToastOptions {
  action?: ToastAction;
  /** Called when the user dismisses this toast (close control or Esc). */
  onDismiss?: () => void;
  /** A job outcome: never replaced within its display time; what comes meanwhile queues behind it. */
  outcome?: boolean;
}

export interface ToastState {
  toast: ToastMessage | null;
  /** Replaces whatever is showing (one toast at a time), unless a job outcome holds the slot: then it queues. */
  showToast: (text: string, options?: ShowToastOptions) => void;
  /**
   * Shows a toast only the first time this `key` is asked for in this page session
   * (the cold-open "Sem conexão" line, which must not return on every navigation).
   */
  showOnce: (key: string, text: string, options?: ShowToastOptions) => void;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastState | null>(null);

const browserTimers: Timers = {
  setTimeout: (callback: () => void, ms: number) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** A toast asked for: its text and options, as it is shown now or later from the queue. */
interface ToastEntry {
  text: string;
  options: ShowToastOptions;
}

export function ToastProvider({ children, timers = browserTimers }: { children: ReactNode; timers?: Timers }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);
  const handle = useRef<unknown>(null);
  /** Keys already shown, for this page session only: a reload starts over. */
  const shown = useRef<Set<string>>(new Set());
  /** The toast on screen (its id and what it was asked with), read synchronously by every call. */
  const current = useRef<{ id: number; entry: ToastEntry } | null>(null);
  /** The toasts waiting behind a job outcome, first in first out. */
  const queue = useRef<ToastEntry[]>([]);

  const clearTimer = useCallback(() => {
    if (handle.current !== null) timers.clearTimeout(handle.current);
    handle.current = null;
  }, [timers]);

  // A plain toast's expiry never sets state after the provider unmounted (seen as "window is
  // not defined" after a test environment's teardown in the e11b gate, 2026-09-30). The timer
  // itself is left alone: StrictMode's mount, unmount and remount would otherwise clear the
  // expiry of a toast a child showed on mount, which then never left (1.6-E2E-003, integrated
  // Epic 11 gate, 2026-09-30).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `display` and `advance` call each other (an expiry shows the next queued toast).
  const slot = useMemo(() => {
    const display = (entry: ToastEntry): void => {
      clearTimer();
      const id = ++nextId.current;
      current.current = { id, entry };
      setToast({ id, text: entry.text, action: entry.options.action, onDismiss: entry.options.onDismiss });
      // A toast with an action is a thing to act on; only a plain one (or an outcome) expires by itself.
      if (entry.options.action === undefined) {
        handle.current = timers.setTimeout(() => {
          handle.current = null;
          if (!mounted.current || current.current?.id !== id) return;
          advance();
        }, TOAST_TIMEOUT_MS);
      }
    };
    /** The toast on screen is gone: the next queued one shows, or the slot empties. */
    const advance = (): void => {
      const next = queue.current.shift();
      if (next !== undefined) {
        display(next);
        return;
      }
      current.current = null;
      setToast(null);
    };
    return { display, advance };
  }, [clearTimer, timers]);

  const dismissToast = useCallback(() => {
    clearTimer();
    slot.advance();
  }, [clearTimer, slot]);

  const showToast = useCallback(
    (text: string, options: ShowToastOptions = {}) => {
      const entry: ToastEntry = { text, options };
      const on = current.current?.entry ?? null;
      if (on?.options.outcome === true) {
        // A job outcome holds the slot: this one waits, once per text.
        if (!queue.current.some((queued) => queued.text === text)) queue.current.push(entry);
        return;
      }
      if (options.outcome === true && on !== null && on.options.action !== undefined) {
        // The action toast is not replaced unseen: it goes back to the head of the queue.
        queue.current = [on, ...queue.current.filter((queued) => queued.text !== on.text)];
      }
      slot.display(entry);
    },
    [slot],
  );

  const showOnce = useCallback(
    (key: string, text: string, options?: ShowToastOptions) => {
      if (shown.current.has(key)) return;
      shown.current.add(key);
      showToast(text, options);
    },
    [showToast],
  );

  const value = useMemo<ToastState>(
    () => ({ toast, showToast, showOnce, dismissToast }),
    [toast, showToast, showOnce, dismissToast],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastState {
  const value = useContext(ToastContext);
  if (value === null) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

/** The one place a toast is drawn, rendered once by the app shell. */
export function ToastOutlet() {
  const { toast, dismissToast } = useToast();
  if (toast === null) return null;
  return (
    <Toast
      toast={toast}
      onClose={dismissToast}
      onDismiss={() => {
        toast.onDismiss?.();
        dismissToast();
      }}
    />
  );
}
