import { writeErrorKind } from '@app/domain';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { copy } from '../copy/pt-br.ts';
import { useToast } from '../state/toast.tsx';
import { createFieldCommitter, type FieldCommitter, type Timers } from './field-commit.ts';

/*
 * AD-8, FR-54: "the app shows an error toast rather than silently refusing a write".
 *
 * `createFieldCommitter` is a pure controller with injected timers: it re-queues the
 * value and rethrows on a *synchronous* throw, but the commit it drives is asynchronous,
 * so a rejected Dexie write (a refused quota, a closed database) reached nobody and was
 * an unobserved promise rejection. This hook is the seam. It awaits the caller's
 * promise, catches the rejection, asks the kernel what kind of failure it was and raises
 * the toast, keeping the refused value pending so the next blur, Enter or flush commits
 * it again — a retry the user asks for, never a timer that retries forever.
 *
 * This is the only place the refused-write toast is raised.
 */

export interface UseFieldCommitOptions<T> {
  commit: (value: T) => void | Promise<void>;
  idleMs?: number;
  timers?: Timers;
}

export function useFieldCommit<T>(options: UseFieldCommitOptions<T>): FieldCommitter<T> {
  const { showToast } = useToast();
  const { idleMs, timers } = options;
  // The caller's closure changes on every render; the controller must not, or its
  // pending value and idle timer would be thrown away mid-typing.
  const latest = useRef(options.commit);
  latest.current = options.commit;
  /** The value a refused write left behind, waiting for the next blur, Enter or flush. */
  const refused = useRef<{ value: T } | null>(null);

  const report = useCallback(
    (error: unknown) => {
      const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
      const kind = writeErrorKind(typeof name === 'string' ? name : null);
      showToast(kind === 'quota' ? copy.write.quotaError : copy.write.unknownError);
    },
    [showToast],
  );

  const committer = useMemo<FieldCommitter<T>>(() => {
    /** Every attempt is numbered, so a slow rejection cannot speak for a newer value. */
    let attempt = 0;
    const inner = createFieldCommitter<T>({
      ...(idleMs === undefined ? {} : { idleMs }),
      ...(timers === undefined ? {} : { timers }),
      commit: (value) => {
        const id = ++attempt;
        refused.current = null;
        let result: void | Promise<void>;
        try {
          result = latest.current(value);
        } catch (error) {
          // A synchronous throw. `settle()` re-queues the value and rethrows by itself,
          // but `immediate()` does not, so the value is held here too: a tri-state or a
          // cell whose write was refused must not vanish.
          refused.current = { value };
          report(error);
          throw error;
        }
        if (result instanceof Promise) {
          void result.catch((error: unknown) => {
            // A newer commit has already been made: it owns the field now. Re-queueing
            // this value would put the stale text back over the one that succeeded, and
            // naming a failure the user has already moved past is noise.
            if (id !== attempt) return;
            refused.current = { value };
            report(error);
          });
        }
      },
    });

    // Commit whatever is queued, then retry a refused value if nothing newer replaced it.
    const settle = (run: () => void) => () => {
      run();
      const taken = refused.current;
      if (taken !== null && !inner.pending) {
        refused.current = null;
        inner.immediate(taken.value);
      }
    };

    return {
      change(value) {
        refused.current = null;
        inner.change(value);
      },
      blur: settle(inner.blur),
      enter: settle(inner.enter),
      flush: settle(inner.flush),
      immediate(value) {
        refused.current = null;
        inner.immediate(value);
      },
      dispose() {
        refused.current = null;
        inner.dispose();
      },
      get pending() {
        return inner.pending || refused.current !== null;
      },
    };
  }, [idleMs, timers, report]);

  // A surface that leaves mid-typing drops its timer rather than committing behind the
  // user's back; the draft store is what keeps the value (FR-61).
  useEffect(() => () => committer.dispose(), [committer]);

  return committer;
}
