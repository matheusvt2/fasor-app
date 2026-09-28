import { liveQuery } from 'dexie';

/*
 * E7-A2 (tests only; Dexie stays inside `src/db`): a wait on the device store that follows
 * its change events instead of polling it, so it holds whatever the machine's load.
 */

/** The ceiling of a wait for something an async store read must land (a write plus a live-query round trip). */
export const STORE_READ_TIMEOUT_MS = 20_000;

/**
 * Resolves with `read()`'s value once `check` accepts it (returns without throwing),
 * re-reading only when the store changes (a Dexie live query over what `read` touches).
 * Rejects with the last failure after `STORE_READ_TIMEOUT_MS`.
 */
export function untilStored<T>(read: () => Promise<T>, check: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let last: unknown = new Error('the store was never read');
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      queueMicrotask(() => subscription.unsubscribe());
      settle();
    };
    const timer = setTimeout(() => finish(() => reject(last)), STORE_READ_TIMEOUT_MS);
    const subscription = liveQuery(read).subscribe({
      next: (value) => {
        try {
          check(value);
        } catch (error) {
          last = error;
          return;
        }
        finish(() => resolve(value));
      },
      error: (error: unknown) => finish(() => reject(error)),
    });
  });
}
