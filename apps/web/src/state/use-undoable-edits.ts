import { writeErrorKind } from '@app/domain';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { now } from '../clock.ts';
import { copy } from '../copy/pt-br.ts';
import { undoBatch } from '../db/commit.ts';
import { newId } from '../ids.ts';
import { useSession } from './session.tsx';
import { useToast, type ShowToastOptions } from './toast.tsx';

/*
 * Epic 4 retro items 5 and 21: the one edit queue and undo toast of a surface that writes
 * batches and offers "Desfazer" (the Sumário and its tree, the Template composer, the
 * Templates list, the section text editor, the setup page's exclusions).
 *
 * - Writes run one after the other, so two quick edits never build on the same stale row
 *   and an undo pressed while a write is queued runs after it.
 * - A refused write is toasted (`writeErrorText`, AD-8, FR-54) and rethrown, never swallowed.
 * - The live undo toast is retired by any later written batch (its "Desfazer" would put an
 *   old state back over the newer change) and when the surface leaves (the toast is the
 *   shell's and an action toast never expires, so it would act from another screen).
 */

/** The toast for a refused device write (AD-8, FR-54): the quota one or the generic one. */
export function writeErrorText(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  return writeErrorKind(typeof name === 'string' ? name : null) === 'quota' ? copy.write.quotaError : copy.write.unknownError;
}

export interface UndoOptions {
  /** The action's word ("Desfazer"), from the surface's copy. */
  label: string;
  /** Runs as "Desfazer" is pressed, before the undo is queued: where the focus goes, what the view shows. */
  onUndo?: () => void;
}

export interface UndoableEdits {
  /**
   * Runs `run` after every earlier write and undo of the surface. `run` resolves to the
   * batch id it wrote, or null when it wrote nothing. A written batch retires the live undo
   * toast; a rejection is toasted and rethrown. `quiet` leaves the toast to a caller that
   * raises it itself (a field autosaved through `useFieldCommit`, which also keeps the
   * refused value for the next blur), so one refusal is said once.
   */
  write: (run: () => Promise<string | null>, options?: { quiet?: boolean }) => Promise<string | null>;
  /**
   * Story 12.1: a typed field's commit on the same serial queue (no undo, no toast of its
   * own: `useFieldCommit` raises the refused-write toast and keeps the value, so a rejection
   * is only rethrown). A later edit therefore reads the typed value, and the commit retires
   * only an undo toast that was already standing when it began, never one an edit queued
   * before it raised meanwhile (the bulk action's fresh "Desfazer").
   */
  commit: (run: () => Promise<void>) => Promise<void>;
  /** Shows `text` with the undo action for `batchId` (nothing for a null batch). */
  undoable: (text: string, batchId: string | null, options: UndoOptions) => void;
  /** Takes the live undo toast away now (typing over what it would undo, before the autosave lands). */
  retire: () => void;
  /** Shows a plain toast the surface owns: it is taken away when the surface leaves. */
  notify: (text: string, options?: ShowToastOptions) => void;
}

export function useUndoableEdits(): UndoableEdits {
  const db = useSession().database;
  const { showToast, dismissToast, toast } = useToast();
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** The live undo toast (one object per toast, so two with the same text differ); null once retired or pressed. */
  const undoToast = useRef<{ text: string } | null>(null);
  /** The last toast this surface showed (undo or plain), by its text. */
  const ownToast = useRef<string | null>(null);
  const shownToast = useRef(toast);
  shownToast.current = toast;
  const dismissRef = useRef(dismissToast);
  dismissRef.current = dismissToast;
  useEffect(
    () => () => {
      if (ownToast.current !== null && shownToast.current?.text === ownToast.current) dismissRef.current();
    },
    [],
  );

  const enqueue = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const retire = useCallback(() => {
    if (undoToast.current !== null && shownToast.current?.text === undoToast.current.text) dismissRef.current();
    undoToast.current = null;
  }, []);

  const notify = useCallback(
    (text: string, options?: ShowToastOptions) => {
      ownToast.current = text;
      showToast(text, options);
    },
    [showToast],
  );

  const write = useCallback(
    (run: () => Promise<string | null>, options?: { quiet?: boolean }): Promise<string | null> =>
      enqueue(async () => {
        let batchId: string | null;
        try {
          batchId = await run();
        } catch (error) {
          if (options?.quiet !== true) notify(writeErrorText(error));
          throw error;
        }
        if (batchId !== null) retire();
        return batchId;
      }),
    [enqueue, retire, notify],
  );

  const commit = useCallback(
    (run: () => Promise<void>): Promise<void> =>
      enqueue(async () => {
        const standing = undoToast.current;
        await run();
        if (standing !== null && undoToast.current === standing) retire();
      }),
    [enqueue, retire],
  );

  const undoable = useCallback(
    (text: string, batchId: string | null, options: UndoOptions) => {
      if (batchId === null || db === null) return;
      undoToast.current = { text };
      notify(text, {
        action: {
          label: options.label,
          onPress: () => {
            undoToast.current = null;
            options.onUndo?.();
            enqueue(() => undoBatch(db, batchId, { newId, now })).catch((error: unknown) => notify(writeErrorText(error)));
          },
        },
      });
    },
    [db, enqueue, notify],
  );

  return useMemo(() => ({ write, commit, undoable, retire, notify }), [write, commit, undoable, retire, notify]);
}
