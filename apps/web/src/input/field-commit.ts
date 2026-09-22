/*
 * AD-1 field commit granularity: one op per field commit, on blur, Enter or
 * 500 ms idle, whichever first; tri-state, chips, pickers and cells commit
 * immediately. Pure controller: the first screen story binds it to a hook.
 */

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface FieldCommitterOptions<T> {
  commit: (value: T) => void;
  idleMs?: number;
  timers?: Timers;
}

export interface FieldCommitter<T> {
  /** The field's text changed; commits after `idleMs` of quiet unless blur or Enter comes first. */
  change(value: T): void;
  /** Focus left the field: commits the pending value now, if any. */
  blur(): void;
  /** Enter pressed: commits the pending value now, if any. */
  enter(): void;
  /** A discrete control (tri-state, chip, picker, cell) changed: commits at once. */
  immediate(value: T): void;
  /** Commits the pending value now, if any (for a surface leaving the screen). */
  flush(): void;
  /** Drops the pending value and the timer without committing. */
  dispose(): void;
  /** True while a change is waiting for its commit. */
  readonly pending: boolean;
}

export const FIELD_COMMIT_IDLE_MS = 500;

const globalTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export function createFieldCommitter<T>(options: FieldCommitterOptions<T>): FieldCommitter<T> {
  const { commit, idleMs = FIELD_COMMIT_IDLE_MS, timers = globalTimers } = options;
  let handle: unknown = null;
  let pending: { value: T } | null = null;

  const clear = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };

  const settle = () => {
    clear();
    if (!pending) return;
    const taken = pending;
    pending = null;
    try {
      commit(taken.value);
    } catch (error) {
      // The value is not lost: it stays pending for the next blur, Enter or flush.
      if (pending === null) pending = taken;
      throw error;
    }
  };

  return {
    change(value) {
      clear();
      pending = { value };
      handle = timers.setTimeout(settle, idleMs);
    },
    blur: settle,
    enter: settle,
    flush: settle,
    immediate(value) {
      clear();
      pending = null;
      commit(value);
    },
    dispose() {
      clear();
      pending = null;
    },
    get pending() {
      return pending !== null;
    },
  };
}
