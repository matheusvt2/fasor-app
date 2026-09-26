import { useEffect, useMemo, useRef } from 'react';
import { createFieldCommitter, type Timers } from '../input/field-commit.ts';

/*
 * E6-R1 (FR-61): a surface whose typing can be lost to a plain reload (no page-hide event
 * first, so `DraftProvider`'s hide listeners never run) also writes its draft while the
 * person types: once the input has been quiet for `idleMs`. The write is the source's own
 * `useDraftSource` save, so a value equal to the stored one drops the row exactly as the
 * hide-time write does. The hide-time write stays.
 */

export const DRAFT_AUTOSAVE_IDLE_MS = 300;

export interface DraftAutosave {
  /** The input changed: the draft is written after `idleMs` of quiet. */
  changed(): void;
  /** Writes the draft now if a change is waiting. */
  flush(): void;
}

export function useDraftAutosave(save: () => Promise<void>, options: { idleMs?: number; timers?: Timers } = {}): DraftAutosave {
  const latest = useRef(save);
  latest.current = save;
  const { idleMs = DRAFT_AUTOSAVE_IDLE_MS, timers } = options;
  const committer = useMemo(
    () =>
      createFieldCommitter<null>({
        idleMs,
        ...(timers === undefined ? {} : { timers }),
        commit: () => void latest.current(),
      }),
    [idleMs, timers],
  );
  // Leaving the screen writes what is waiting; the save reads the latest values.
  useEffect(() => () => committer.flush(), [committer]);
  return useMemo(() => ({ changed: () => committer.change(null), flush: () => committer.flush() }), [committer]);
}
