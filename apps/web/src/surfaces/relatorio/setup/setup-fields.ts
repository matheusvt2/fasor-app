import { useRef, useState } from 'react';
import { useFieldCommit } from '../../../input/use-field-commit.ts';

/*
 * The setup page's field hooks and write signatures (E4-A7): every Etapa band commits
 * through the page's `writeFields` queue (`setup-surface.tsx`), one `relatorio/setup/{field}`
 * put per field, several in one batch when they belong together.
 */

/** One `relatorio/setup/{field}` put. */
export type CommitField = (field: string, value: unknown) => Promise<void>;
/** Several `relatorio/setup/{field}` puts in the same batch. */
export type CommitFields = (fields: ReadonlyArray<readonly [string, unknown]>) => Promise<void>;
/** Registers an Etapa band so `?etapa=n` can scroll to it and focus its heading. */
export type BandRef = (el: HTMLElement | null) => void;

/** A content key for `setup.exclusions` (null vs. an array, and the array's own values), so a resync compares what changed, not which object it lives in. */
export function exclusionsKey(value: readonly string[] | null): string {
  return value === null ? '\u0000' : JSON.stringify(value);
}

/** A locally-echoed, debounced text field committing through `useFieldCommit` (empresa-tab's pattern). */
export function useTextField(value: string, commit: (value: string) => void | Promise<void>) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const committer = useFieldCommit<string>({ commit });
  if (value !== committed.current) {
    committed.current = value;
    if (value !== text) setText(value);
  }
  return {
    text,
    change: (next: string) => {
      setText(next);
      committer.change(next);
    },
    blur: () => committer.blur(),
  };
}

/**
 * A locally-echoed, debounced `DateField` (the same `useTextField` shape, for a single
 * ISO date): the segment buffer React Aria types into lives in local state, resynced from
 * the committed value only when it actually changed (a real external write, not this
 * field's own round trip through Dexie's live query), so a live-query re-render mid-typing
 * never resets the segments a keystroke is still building (review finding 1).
 */
export function useDateField(value: string | null, commit: (value: string | null) => void | Promise<void>) {
  const [date, setDate] = useState(value);
  const committed = useRef(value);
  const committer = useFieldCommit<string | null>({ commit });
  if (value !== committed.current) {
    committed.current = value;
    if (value !== date) setDate(value);
  }
  return {
    date,
    change: (next: string | null) => {
      setDate(next);
      committer.change(next);
    },
    // Focus leaving the field settles the pending commit now, matching `useTextField`'s own
    // blur wiring: without it, a debounced date typed right before the user navigates away
    // (e.g. "Concluir dados do relatório" then "Voltar") can still be mid-idle-wait when the
    // page unmounts, and `useFieldCommit`'s own unmount cleanup drops a pending commit rather
    // than writing behind the user's back -- losing the very last thing typed.
    blur: () => committer.blur(),
  };
}

/**
 * Etapa 1's two dates, local-echoed like `useDateField`, with "end follows start" (ported
 * from `new-relatorio-dialog.tsx`) and one debounced batch of both fields when it does.
 */
export function useServicePeriod(serviceStart: string | null, serviceEnd: string | null, onCommitFields: CommitFields) {
  const [start, setStart] = useState(serviceStart);
  const [end, setEnd] = useState(serviceEnd);
  const committedStart = useRef(serviceStart);
  const committedEnd = useRef(serviceEnd);
  if (serviceStart !== committedStart.current) {
    committedStart.current = serviceStart;
    if (serviceStart !== start) setStart(serviceStart);
  }
  if (serviceEnd !== committedEnd.current) {
    committedEnd.current = serviceEnd;
    if (serviceEnd !== end) setEnd(serviceEnd);
  }
  const committer = useFieldCommit<ReadonlyArray<readonly [string, unknown]>>({ commit: onCommitFields });

  return {
    start,
    end,
    onStartChange: (next: string | null) => {
      const followsEnd = end === null || end === start;
      const nextEnd = followsEnd ? next : end;
      setStart(next);
      if (followsEnd) setEnd(nextEnd);
      committer.change(followsEnd ? [['service_start', next], ['service_end', nextEnd]] : [['service_start', next]]);
    },
    onEndChange: (next: string | null) => {
      setEnd(next);
      committer.change([['service_end', next]]);
    },
    // See `useDateField`'s own comment: flush a pending debounced commit when focus leaves
    // either date, so navigating away right after typing never drops the last one typed.
    blur: () => committer.blur(),
  };
}
