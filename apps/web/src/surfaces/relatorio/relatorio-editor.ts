import type { BlockRow, EntityState, EquipmentRow, LocationRow, OpDraft } from '@app/domain';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch } from '../../db/commit.ts';
import { blockRowsOf, equipmentRows, locationRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useUndoableEdits } from '../../state/use-undoable-edits.ts';
import { focusWhenRendered } from './relatorio-focus.ts';
import type { Author } from './relatorio-ops.ts';

/*
 * One relatório's write path (Stories 4.3-4.5): the Sumário and the tree both edit
 * through it. Every edit reads the rows as this device holds them at that moment, asks the
 * caller for its ops and commits them as one batch, one edit after the other; the live
 * undo toast is retired by any later edit (a stale undo would put an old state back over
 * the newer change) and by leaving the surface.
 */

/** The rows an edit's builder reads fresh: the relatório's blocks (removed ones included), its live locations and the project's equipment. */
export interface Fresh {
  blocks: BlockRow[];
  locations: LocationRow[];
  equipment: EquipmentRow[];
}

/** Builds one edit's ops, or null when there is nothing to write (the row it names is gone). */
export type Build = (blocks: BlockRow[], author: Author, fresh: Fresh) => OpDraft[] | null;

export interface RelatorioEditor {
  author: Author | null;
  /** Runs one edit; resolves to its batch id, or null when nothing was written. A refused write is toasted and rejects. */
  edit: (build: Build) => Promise<string | null>;
  /** Says `text` in the surface's `role="status"` region. */
  announce: (text: string) => void;
  announcement: string;
  /** A toast with "Desfazer"; `focus` names where the focus goes once the undo has landed, `onUndo` runs as it starts. */
  undoable: (text: string, batchId: string | null, focus?: () => HTMLElement | null, onUndo?: () => void) => void;
  /**
   * Says `text` (when given) and runs `then` in the render that draws the edit, the first
   * one where `drawn()` holds, so the announcement, the toast and the moved row reach the
   * screen in the same frame (Epic 4 QA Q7); after `SETTLE_TIMEOUT_MS` at the latest.
   */
  settle: (drawn: () => boolean, text: string | null, then?: () => void) => void;
  /**
   * Fires a pending `settle` whose edit is drawn now: for a component that draws edits in
   * renders of its own (the tree revealing a collapsed location), from its layout effect.
   */
  settleCheck: () => void;
}

/** How long `settle` waits for the edit to be drawn before it speaks anyway. */
export const SETTLE_TIMEOUT_MS = 1000;

/**
 * Every equipment row of the project, removed ones included, kept live on its own: the
 * relatório's state query does not re-run for an `equipment` write alone (a TAG rename),
 * and making it do so re-ran the whole snapshot on every equipment op a pull applies.
 * Until the first read lands, the rows the state already holds stand in.
 */
export function useProjectEquipment(state: EntityState, projectId: string): EquipmentRow[] {
  const db = useSession().database;
  const fromState = useMemo(() => [...state.entries()].filter(([key]) => key.startsWith('equipment:')).map(([, row]) => row as EquipmentRow), [state]);
  const live = useLiveQuery(() => (db === null ? undefined : equipmentRows(db, projectId)), [db, projectId]);
  return live ?? fromState;
}

export function useRelatorioEditor(relatorioId: string, projectId: string): RelatorioEditor {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const edits = useUndoableEdits();
  const [announcement, setAnnouncement] = useState('');

  const author = useMemo<Author | null>(() => (user === null ? null : { id: user.id, companyId: user.companyId }), [user]);

  const { write } = edits;
  const edit = useCallback(
    (build: Build): Promise<string | null> =>
      write(async () => {
        if (db === null || author === null) return null;
        const [blocks, locations, equipment] = await Promise.all([blockRowsOf(db, relatorioId), locationRows(db, relatorioId), equipmentRows(db, projectId)]);
        let drafts: OpDraft[] | null;
        try {
          drafts = build(blocks, author, { blocks, locations, equipment });
        } catch (error) {
          // The row the edit names is gone: nothing to write, nothing to say.
          if (error instanceof RangeError) return null;
          throw error;
        }
        if (drafts === null || drafts.length === 0) return null;
        return (await commitBatch(db, drafts, { newId, now })).batch_id;
      }),
    [write, db, author, relatorioId, projectId],
  );

  // `settle`: one edit waits to be drawn at a time; a newer one says the older at once.
  const pending = useRef<{ drawn: () => boolean; text: string | null; then?: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const fire = useCallback(() => {
    const due = pending.current;
    if (due === null) return;
    pending.current = null;
    clearTimeout(due.timer);
    if (due.text !== null) setAnnouncement(due.text);
    due.then?.();
  }, []);

  // A pending settle speaks first, so nothing it says or toasts lands after a newer edit's.
  const announce = useCallback((text: string) => {
    fire();
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, [fire]);

  const settle = useCallback(
    (drawn: () => boolean, text: string | null, then?: () => void) => {
      fire();
      // Emptied now, so the same sentence said twice is still a change the region announces.
      if (text !== null) setAnnouncement('');
      pending.current = { drawn, text, ...(then === undefined ? {} : { then }), timer: setTimeout(fire, SETTLE_TIMEOUT_MS) };
      // Already drawn and nothing to empty first: no render is coming to say it.
      if (text === null && drawn()) fire();
    },
    [fire],
  );
  const settleCheck = useCallback(() => {
    if (pending.current?.drawn() === true) fire();
  }, [fire]);
  // After every render of the surface, before the browser paints: the render that draws the
  // edit also says it (a state update here is flushed before paint).
  useLayoutEffect(() => settleCheck());
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current.timer);
      pending.current = null;
    },
    [],
  );

  const { undoable: showUndo } = edits;
  const undoable = useCallback(
    (text: string, batchId: string | null, focus?: () => HTMLElement | null, onUndo?: () => void) => {
      // An older move's pending toast first, so this one's "Desfazer" is the one left standing.
      fire();
      showUndo(text, batchId, {
        label: copy.sumario.undo,
        onUndo: () => {
          onUndo?.();
          if (focus !== undefined) focusWhenRendered(focus);
        },
      });
    },
    [showUndo, fire],
  );

  // One object while its members hold, so the tree's context and its action callbacks keep
  // their identity between renders.
  return useMemo(
    () => ({ author, edit, announce, announcement, undoable, settle, settleCheck }),
    [author, edit, announce, announcement, undoable, settle, settleCheck],
  );
}
