import { useCallback, useRef, useState } from 'react';
import type { FieldCommitter } from '../../../input/field-commit.ts';
import { useFieldCommit } from '../../../input/use-field-commit.ts';

/** A date's content key for `useStoredEcho` (null apart from every ISO date). */
const dateKey = (value: string | null): string => (value === null ? '\u0000' : value);

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

/** How many of a field's own commits are remembered while their echoes are on the way. */
const SENT_KEPT = 16;

/**
 * Story 30.1 B (L3626): when a stored value that changed resyncs a field's local copy. Not when it
 * is the echo of one of this field's own commits (an older echo can land after a newer commit went
 * out), and not while a keystroke of the field waits to commit (`pending`): either way the field
 * already holds what it typed, and resyncing would drop the keys typed after that commit. A real
 * write from elsewhere (another device, an undo) while the field is idle still resyncs it. Called
 * during render with the stored value's content key; returns the function each commit calls with
 * the key of the value it writes.
 */
export function useStoredEcho(storedKey: string, pending: () => boolean, resync: () => void): (sentKey: string) => void {
  const seen = useRef(storedKey);
  const sent = useRef<string[]>([]);
  if (storedKey !== seen.current) {
    seen.current = storedKey;
    const own = sent.current.indexOf(storedKey);
    if (own >= 0) {
      sent.current = sent.current.slice(own + 1);
    } else if (!pending()) {
      sent.current = [];
      resync();
    }
  }
  return useCallback((sentKey: string) => {
    sent.current.push(sentKey);
    if (sent.current.length > SENT_KEPT) sent.current.shift();
  }, []);
}

/** A locally-echoed, debounced text field committing through `useFieldCommit` (empresa-tab's pattern). */
export function useTextField(value: string, commit: (value: string) => void | Promise<void>) {
  const [text, setText] = useState(value);
  const committerRef = useRef<FieldCommitter<string> | null>(null);
  const noteSent = useStoredEcho(
    value,
    () => committerRef.current?.pending ?? false,
    () => {
      if (value !== text) setText(value);
    },
  );
  const committer = useFieldCommit<string>({
    commit: (next) => {
      noteSent(next);
      return commit(next);
    },
  });
  committerRef.current = committer;
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
  // Story 30.1 B: the same echo guard as `useTextField` (its test showed the same loss).
  const committerRef = useRef<FieldCommitter<string | null> | null>(null);
  const noteSent = useStoredEcho(
    dateKey(value),
    () => committerRef.current?.pending ?? false,
    () => {
      if (value !== date) setDate(value);
    },
  );
  const committer = useFieldCommit<string | null>({
    commit: (next) => {
      noteSent(dateKey(next));
      return commit(next);
    },
  });
  committerRef.current = committer;
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
