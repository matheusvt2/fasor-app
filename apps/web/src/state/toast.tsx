import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast, type ToastAction, type ToastMessage } from '../components/toast.tsx';
import type { Timers } from '../input/field-commit.ts';

/*
 * UX-DR10, EXPERIENCE.md › Toast: one at a time, 6 s, or until dismissed when it
 * carries an action. The provider is rendered once in the shell, beside the banner
 * slot, so any surface can ask for a toast without owning a region of its own.
 */

export const TOAST_TIMEOUT_MS = 6_000;

export interface ShowToastOptions {
  action?: ToastAction;
  /** Called when the user dismisses this toast (close control or Esc). */
  onDismiss?: () => void;
}

export interface ToastState {
  toast: ToastMessage | null;
  /** Replaces whatever is showing: one toast at a time. */
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

export function ToastProvider({ children, timers = browserTimers }: { children: ReactNode; timers?: Timers }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);
  const handle = useRef<unknown>(null);
  /** Keys already shown, for this page session only: a reload starts over. */
  const shown = useRef<Set<string>>(new Set());

  const clearTimer = useCallback(() => {
    if (handle.current !== null) timers.clearTimeout(handle.current);
    handle.current = null;
  }, [timers]);

  const dismissToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (text: string, options: ShowToastOptions = {}) => {
      clearTimer();
      const id = ++nextId.current;
      setToast({ id, text, action: options.action, onDismiss: options.onDismiss });
      // A toast with an action is a thing to act on; only a plain one expires by itself.
      if (options.action === undefined) {
        handle.current = timers.setTimeout(() => {
          handle.current = null;
          setToast((current) => (current?.id === id ? null : current));
        }, TOAST_TIMEOUT_MS);
      }
    },
    [clearTimer, timers],
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
