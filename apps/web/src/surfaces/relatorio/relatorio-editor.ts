import type { BlockRow, EntityState, EquipmentRow, LocationRow, OpDraft } from '@app/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { blockRowsOf, equipmentRows, locationRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../templates/template-ops.ts';
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
}

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
  const { showToast, dismissToast, toast } = useToast();
  const [announcement, setAnnouncement] = useState('');
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const undoToast = useRef<string | null>(null);
  const shownToast = useRef(toast);
  shownToast.current = toast;
  const dismissRef = useRef(dismissToast);
  dismissRef.current = dismissToast;
  useEffect(
    () => () => {
      if (undoToast.current !== null && shownToast.current?.text === undoToast.current) dismissRef.current();
    },
    [],
  );

  const author = useMemo<Author | null>(() => (user === null ? null : { id: user.id, companyId: user.companyId }), [user]);

  const edit = useCallback(
    (build: Build): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        if (db === null || author === null) return null;
        const [blocks, locations, equipment] = await Promise.all([blockRowsOf(db, relatorioId), locationRows(db, relatorioId), equipmentRows(db, projectId)]);
        let drafts: OpDraft[] | null;
        try {
          drafts = build(blocks, author, { blocks, locations, equipment });
        } catch (error) {
          if (error instanceof RangeError) return null;
          showToast(writeErrorText(error));
          throw error;
        }
        if (drafts === null || drafts.length === 0) return null;
        let batchId: string;
        try {
          batchId = (await commitBatch(db, drafts, { newId, now })).batch_id;
        } catch (error) {
          showToast(writeErrorText(error));
          throw error;
        }
        if (undoToast.current !== null && shownToast.current?.text === undoToast.current) dismissToast();
        undoToast.current = null;
        return batchId;
      };
      const next = queue.current.then(run, run);
      queue.current = next.catch(() => undefined);
      return next;
    },
    [db, author, relatorioId, projectId, showToast, dismissToast],
  );

  const announce = useCallback((text: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const undoable = useCallback(
    (text: string, batchId: string | null, focus?: () => HTMLElement | null, onUndo?: () => void) => {
      if (batchId === null || db === null) return;
      undoToast.current = text;
      showToast(text, {
        action: {
          label: copy.sumario.undo,
          onPress: () => {
            undoToast.current = null;
            onUndo?.();
            if (focus !== undefined) focusWhenRendered(focus);
            const run = () => undoBatch(db, batchId, { newId, now });
            const next = queue.current.then(run, run);
            queue.current = next.catch(() => undefined);
            next.catch((error: unknown) => showToast(writeErrorText(error)));
          },
        },
      });
    },
    [db, showToast],
  );

  // One object while its members hold, so the tree's context and its action callbacks keep
  // their identity between renders.
  return useMemo(() => ({ author, edit, announce, announcement, undoable }), [author, edit, announce, announcement, undoable]);
}
