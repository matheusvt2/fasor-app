import {
  backwardMoveConsequenceText,
  backwardMoveLabel,
  buildSnapshot,
  defaultBlockConfig,
  emptySheet,
  fichasConcluidasText,
  generateReason,
  issuedBannerText,
  latestRevision,
  moveAnnouncement,
  naoEnsaiadasText,
  ncAbertosText,
  orderKeyAfter,
  orderKeyForMove,
  preIssue,
  progress,
  restorableBlocks,
  sectionBlocks,
  sectionMovedText,
  sugestoesText,
  sumarioMetaText,
  sumarioOpensExpanded,
  sumarioReadingMode,
  sumarioRows,
  sumarioTitle,
  type BlockRow,
  type EntityState,
  type EquipmentRow,
  type OpDraft,
  type RelatorioSnapshot,
  type RestorableBlock,
  type RevisionRow,
  type SectionBlockType,
  type SumarioRow,
  type TemplateRow,
  type UserRow,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, StatusPill, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch, undoBatch } from '../../db/commit.ts';
import { blockRowsOf, relatorioState, templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useBackTarget } from '../../state/back-target.tsx';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../templates/template-ops.ts';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../templates/use-reorder.ts';
import { AddSectionDialog } from './add-section-dialog.tsx';
import { GenerateAction } from './generate-action.tsx';
import { createBlockOp, putBlockOp, putRelatorioStatusOp, removeBlockOp, type Author } from './relatorio-ops.ts';
import { RestoreDialog } from './restore-dialog.tsx';
import { Section9Tree } from './section-9.tsx';
import { FixedRow, NumberedRow, Section9Row, type RowActions } from './sumario-row.tsx';
import './relatorio.css';

const NO_TEMPLATES: TemplateRow[] = [];
const NO_USERS: UserRow[] = [];

/**
 * `/relatorio/:id` (`40-relatorio-overview.html`, Story 4.3): the Sumário of the relatório
 * the address names, or, when this device holds no such row, one pull of its stream
 * (AD-8, "pulled on open") and then either the not-found sentence or, for a relatório the
 * company summary lists, the download sentence with "Tentar de novo".
 */
export function SumarioSurface() {
  const { id = '' } = useParams();
  const session = useSession();
  const sync = useSync();
  const db = session.database;
  const state = useLiveQuery(() => (db === null ? undefined : relatorioState(db, id)), [db, id]);
  // The pull is per address: Back or Forward to another absent relatório starts its own.
  // `attempt` makes a retry a state of its own, so an answer that lands in the same render
  // as the start (React batches both) still re-runs the effect.
  const [pull, setPull] = useState<{ id: string; phase: 'idle' | 'running' | 'done'; attempt: number }>({ id, phase: 'idle', attempt: 0 });
  const { phase, attempt } = pull.id === id ? pull : { phase: 'idle' as const, attempt: 0 };
  useEffect(() => {
    // A cycle already running (Home's absent-online tap starts one just before navigating)
    // answers `busy` without pulling: wait for it to end, then pull once.
    if (state !== null || phase !== 'idle' || sync.running) return;
    const next = attempt + 1;
    setPull({ id, phase: 'running', attempt: next });
    void sync.syncRelatorio(id).then(
      (result) => setPull({ id, phase: result === 'busy' ? 'idle' : 'done', attempt: next }),
      () => setPull({ id, phase: 'done', attempt: next }),
    );
  }, [state, phase, attempt, sync, id]);

  return (
    <main className="screen" data-route="/relatorio/:id">
      {state === undefined || (state === null && phase !== 'done') ? (
        <div className="overview-content">
          <p className="section-note" role="status">
            {state === null ? copy.sumario.loading : copy.common.loading}
          </p>
        </div>
      ) : state === null ? (
        <div className="overview-content">
          {sync.summaryRelatorios.some((row) => row.id === id) ? (
            // The company knows the relatório but the pull left no row here (a page this
            // device could not apply, an interrupted download): say so and offer the pull again.
            <>
              <p className="section-note">{copy.sumario.downloadFailed}</p>
              <p>
                <Button variant="secondary" onPress={() => setPull({ id, phase: 'idle', attempt })}>
                  {copy.sumario.retry}
                </Button>
              </p>
            </>
          ) : (
            <p className="section-note">{copy.sumario.notFound}</p>
          )}
          <Link to="/">{copy.sumario.backHome}</Link>
        </div>
      ) : (
        <Sumario key={id} relatorioId={id} state={state} />
      )}
    </main>
  );
}

/** The `li` of a numbered row, and the control the focus goes to on it. */
const rowFocusTarget = (li: Element | null | undefined): HTMLElement | null =>
  li?.querySelector<HTMLElement>('.sum-ctrls .overflow-trigger') ?? null;

/**
 * Where the focus goes once a row `li` has left the list (E3-A8): the row now at its
 * place, else the one before it, else the list's heading. Called with the row as drawn
 * before the removal was written.
 */
function focusAfterRemoval(li: HTMLElement | null, fallback: HTMLElement | null): void {
  const list = li?.parentElement ?? null;
  if (li === null || list === null) return;
  const count = list.children.length;
  const index = [...list.children].indexOf(li);
  restoreFocus(
    () => {
      const rows = list.isConnected ? [...list.children] : [];
      if (list.isConnected && rows.length >= count) return null;
      return rowFocusTarget(rows[index]) ?? rowFocusTarget(rows[index - 1]) ?? fallback;
    },
    { frames: LIST_FOCUS_WATCH_FRAMES, once: true },
  );
}

/**
 * Gives the focus to `target()` once it is rendered and no dialog is open, whatever holds
 * the focus then (E3-A8: after "Restaurar" and "Desfazer" the row that came back takes
 * it, although the dialog or the toast returned the focus to a live control).
 */
function focusWhenRendered(target: () => HTMLElement | null, frames = LIST_FOCUS_WATCH_FRAMES): void {
  let watched = 0;
  const tick = () => {
    const element = target();
    if (element !== null && element.isConnected && document.querySelector('.dialog-scrim') === null) {
      element.focus();
      return;
    }
    if (++watched < frames) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function Sumario({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const navigate = useNavigate();
  const { showToast, dismissToast, toast } = useToast();
  const t = copy.sumario;

  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const allBlocks = useMemo(() => [...state.values()].filter((row): row is BlockRow => 'sheet' in row && (row as BlockRow).relatorio_id === relatorioId), [state, relatorioId]);
  // Every equipment row of the project, removed sheets' included: the snapshot keeps only
  // the equipment of live blocks, and "Restaurar ficha removida" names a sheet by its TAG.
  const equipment = useMemo(() => [...state.entries()].filter(([key]) => key.startsWith('equipment:')).map(([, row]) => row as EquipmentRow), [state]);
  // Story 4.6: revisions read straight off `EntityState`, the same way `equipment` is
  // above -- `RelatorioSnapshot` is not extended by this batch (batch D/4.8 owns it).
  const revisions = useMemo(() => [...state.entries()].filter(([key]) => key.startsWith('revision:')).map(([, row]) => row as RevisionRow), [state]);
  const templates = useLiveQuery(() => (db === null ? Promise.resolve(NO_TEMPLATES) : templateRows(db)), [db], NO_TEMPLATES);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const lastSheet = useLiveQuery(() => (db === null ? Promise.resolve(null) : readLastSheet(db, relatorioId)), [db, relatorioId], null);

  const computed = useMemo(() => progress(snapshot), [snapshot]);
  const issues = useMemo(() => preIssue(snapshot, computed), [snapshot, computed]);
  const rows = useMemo(() => sumarioRows(snapshot, issues, computed), [snapshot, issues, computed]);
  const removable = useMemo(() => restorableBlocks(allBlocks, equipment), [allBlocks, equipment]);
  const relatorio = snapshot.relatorio;
  const templateName = templates.find((row) => row.id === relatorio.template_id)?.name ?? null;
  const responsibleName = users.find((row) => row.id === relatorio.setup.responsible_user_id)?.name ?? null;

  useBackTarget(`/project/${relatorio.project_id}`);

  // Section 9 opens expanded on an Em campo relatório, collapsed otherwise (EXPERIENCE.md).
  const [expanded, setExpanded] = useState(() => sumarioOpensExpanded(relatorio.status));
  const chevron = useRef<HTMLButtonElement | null>(null);
  const [adding, setAdding] = useState<SumarioRow | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmingBack, setConfirmingBack] = useState(false);
  const banner = useMemo(() => issuedBannerText(latestRevision(revisions)), [revisions]);
  const backMove = useMemo(() => backwardMoveLabel(relatorio.status), [relatorio.status]);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headerSide = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // The live undo toast, by its text: any later edit retires it (a stale undo would put an
  // old order back over the newer change), and leaving the Sumário takes it away.
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

  // AC 3: a Sumário that opened expanded is scrolled to the last sheet's cabine, once; the
  // last-sheet pref is its own live query, so the row is waited for rather than read at mount.
  const scrollToCurrent = useRef(expanded);
  useEffect(() => {
    if (!scrollToCurrent.current || !expanded || lastSheet === null) return;
    const current = listRef.current?.querySelector<HTMLElement>('.s9-cabine.is-current') ?? null;
    if (current === null) return;
    scrollToCurrent.current = false;
    // jsdom draws no layout and has no `scrollIntoView`.
    current.scrollIntoView?.({ block: 'center' });
  }, [expanded, lastSheet]);

  const author = useMemo<Author | null>(() => (user === null ? null : { id: user.id, companyId: user.companyId }), [user]);

  /**
   * Runs one edit: reads the relatório's blocks as this device holds them now, asks
   * `build` for the ops and commits them as one batch. Null when nothing was written (the
   * row the edit names is gone); a refused write is toasted and rejects.
   */
  const edit = useCallback(
    (build: (fresh: BlockRow[], author: Author) => OpDraft[] | null): Promise<string | null> => {
      const run = async (): Promise<string | null> => {
        if (db === null || author === null) return null;
        const fresh = await blockRowsOf(db, relatorioId);
        let drafts: OpDraft[] | null;
        try {
          drafts = build(fresh, author);
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
    [db, author, relatorioId, showToast, dismissToast],
  );

  const announce = useCallback((text: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  /** A toast with "Desfazer"; `focus` names where the focus goes once the undo has landed. */
  const undoable = useCallback(
    (text: string, batchId: string | null, focus?: () => HTMLElement | null) => {
      if (batchId === null || db === null) return;
      undoToast.current = text;
      showToast(text, {
        action: {
          label: t.undo,
          onPress: () => {
            undoToast.current = null;
            if (focus !== undefined) focusWhenRendered(focus);
            const run = () => undoBatch(db, batchId, { newId, now });
            const next = queue.current.then(run, run);
            queue.current = next.catch(() => undefined);
            next.catch((error: unknown) => showToast(writeErrorText(error)));
          },
        },
      });
    },
    [db, showToast, t.undo],
  );

  const rowLi = (blockId: string | null): HTMLElement | null =>
    blockId === null ? null : (listRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`) ?? null);

  /**
   * A new section block right under `after`, as one create op; `spec` names its type and
   * config from the row `after` as this device holds it now (a duplicate copies the current
   * config, not the one drawn when the menu opened).
   */
  const insertBelow = (after: SumarioRow, spec: (source: BlockRow) => { type: string; config: unknown }, toastText: string) => {
    void edit((fresh, by) => {
      const siblings = sectionBlocks(fresh);
      const source = siblings.find((block) => block.id === after.blockId);
      if (source === undefined) return null;
      const order_key = orderKeyAfter(siblings, source.id);
      const { type, config } = spec(source);
      const row: BlockRow = {
        id: newId(),
        relatorio_id: relatorioId,
        location_id: null,
        equipment_id: null,
        block_type: type,
        config: config as BlockRow['config'],
        seed_version: relatorio.seed_version,
        order_key,
        feeds_block_id: null,
        not_tested: null,
        concluded_by: null,
        sheet: emptySheet(),
        created_by: null,
        first_edited_at: null,
        last_modified_by: null,
        last_modified_at: null,
        removed_at: null,
      };
      return [createBlockOp(by, relatorioId, row)];
    })
      .then((batch) => {
        if (batch === null) showToast(t.gone);
        else undoable(toastText, batch);
      })
      .catch(() => undefined);
  };

  const actions: RowActions = {
    onMove: async (row, toIndex) => {
      if (row.blockId === null) return;
      const blockId = row.blockId;
      // Where the row sits now, so "Desfazer" can hand the focus back once it is there again.
      const li = rowLi(blockId);
      const fromIndex = li === null || li.parentElement === null ? -1 : [...li.parentElement.children].indexOf(li);
      let present = true;
      const batch = await edit((fresh, by) => {
        const siblings = sectionBlocks(fresh);
        if (!siblings.some((block) => block.id === blockId)) {
          present = false;
          return null;
        }
        const key = orderKeyForMove(siblings, blockId, toIndex);
        return key === null ? null : [putBlockOp(by, relatorioId, blockId, 'order_key', key)];
      }).catch(() => null);
      if (batch === null) {
        // A same-slot move is nothing to say; a row another device removed is.
        if (!present) showToast(t.gone);
        return;
      }
      announce(moveAnnouncement('section', String(row.number), toIndex + 1, row.siblings));
      undoable(sectionMovedText(row.title), batch, () => {
        const back = rowLi(blockId);
        const list = back?.parentElement ?? null;
        if (back === null || list === null || [...list.children].indexOf(back) !== fromIndex) return null;
        return back.querySelector<HTMLElement>('.pos-box');
      });
    },
    onOpen: (row) => {
      if (row.kind === 'setup') void navigate(`/relatorio/${relatorioId}/setup?etapa=2`);
      else if (row.kind === 'text' && row.blockId !== null) void navigate(`/relatorio/${relatorioId}/secao/${row.blockId}`);
      else if (row.rowKey === 'capa') void navigate(`/relatorio/${relatorioId}/setup?etapa=1`);
    },
    onAddBelow: (row) => setAdding(row),
    onDuplicate: (row) => {
      if (row.blockId === null) return;
      insertBelow(row, (source) => ({ type: source.block_type, config: structuredClone(source.config) }), t.duplicated);
    },
    onRemove: (row) => {
      if (row.blockId === null) return;
      const li = rowLi(row.blockId);
      const blockId = row.blockId;
      void edit((fresh, by) => (fresh.some((block) => block.id === blockId && block.removed_at === null) ? [removeBlockOp(by, relatorioId, blockId)] : null))
        .then((batch) => {
          if (batch === null) {
            showToast(t.gone);
            return;
          }
          focusAfterRemoval(li, headingRef.current);
          undoable(t.removed, batch, () => rowFocusTarget(rowLi(blockId)));
        })
        .catch(() => undefined);
    },
  };

  function onPickSection(type: SectionBlockType): void {
    const below = adding;
    setAdding(null);
    if (below === null) return;
    insertBelow(below, () => ({ type, config: { ...defaultBlockConfig(relatorio.seed_version, type), section_text: null } }), t.added);
  }

  function onRestore(block: RestorableBlock): void {
    setRestoring(false);
    void edit((fresh, by) => (fresh.some((row) => row.id === block.id && row.removed_at !== null) ? [putBlockOp(by, relatorioId, block.id, 'removed_at', null)] : null))
      .then((batch) => {
        if (batch === null) {
          showToast(t.gone);
          return;
        }
        focusWhenRendered(() => rowFocusTarget(rowLi(block.id)));
        undoable(t.restored, batch);
      })
      .catch(() => undefined);
  }

  /** A header count: opens section 9 and moves the focus to its row. */
  function openSection9(): void {
    setExpanded(true);
    requestAnimationFrame(() => chevron.current?.focus());
  }

  /** The header Overflow's backward-move Confirm: one `relatorio/status` put, focus back on the trigger. */
  function onConfirmBack(): void {
    if (backMove === null) return;
    const to = backMove.to;
    void edit((_fresh, by) => [putRelatorioStatusOp(by, relatorioId, to)])
      .then((batch) => {
        if (batch === null) return;
        focusWhenRendered(() => headerSide.current?.querySelector<HTMLElement>('.overflow-trigger') ?? null);
      })
      .catch(() => undefined);
  }

  const blocked = rows.some((row) => row.blocking);
  const openable = (row: SumarioRow) => row.kind === 'setup' || row.kind === 'text';

  return (
    <>
      <div className="sheet-header">
        <div>
          <h2 className="sheet-title">{sumarioTitle(snapshot.client, snapshot.project)}</h2>
          <p className="sheet-meta">
            <StatusPill status={relatorio.status} />{' '}
            {sumarioMetaText({ start: relatorio.setup.service_start, end: relatorio.setup.service_end, templateName, responsibleName })}
          </p>
          {banner === null ? null : <p className="section-note">{banner}</p>}
          <p className="sum-summary" role="group" aria-label={t.summaryLabel}>
            <TextButton onPress={openSection9}>{fichasConcluidasText(computed)}</TextButton>
            <TextButton onPress={openSection9}>{ncAbertosText(computed.nc_open)}</TextButton>
            <TextButton onPress={openSection9}>{naoEnsaiadasText(computed.not_tested)}</TextButton>
            <TextButton onPress={openSection9}>{sugestoesText(computed.suggestions_pending)}</TextButton>
          </p>
        </div>
        <div className="header-side" ref={headerSide}>
          <OverflowMenu
            name=""
            label={t.headerMenu}
            items={[
              { id: 'restore', label: t.restore, onAction: () => setRestoring(true) },
              ...(backMove === null ? [] : [{ id: 'back', label: backMove.label, onAction: () => setConfirmingBack(true) }]),
            ]}
          />
        </div>
      </div>

      <div className="overview-content">
        {/* tabIndex -1: the focus lands here when a removal empties the numbered rows. */}
        <h2 className="visually-hidden" tabIndex={-1} ref={headingRef}>
          {t.listLabel}
        </h2>
        <ol
          className={['sumario', sumarioReadingMode(relatorio.status)].filter(Boolean).join(' ')}
          aria-label={t.listLabel}
          data-status={relatorio.status}
          ref={listRef}
        >
          {rows.map((row) =>
            row.number === null ? (
              <FixedRow key={row.key} row={row} onOpen={row.rowKey === 'capa' ? actions.onOpen : undefined} />
            ) : row.expandable ? (
              <Section9Row
                key={row.key}
                row={row}
                actions={actions}
                expanded={expanded}
                onToggle={() => setExpanded((open) => !open)}
                chevronRef={(element) => {
                  chevron.current = element;
                }}
              >
                {(treeId) => <Section9Tree snapshot={snapshot} lastSheetId={lastSheet} id={treeId} />}
              </Section9Row>
            ) : (
              <NumberedRow key={row.key} row={row} actions={actions} openable={openable(row)} />
            ),
          )}
        </ol>
      </div>

      <div className="sticky-action-bar">
        <span className="btn-reason" id={reasonId}>
          {generateReason(rows)}
        </span>
        <div className="bar-buttons">
          <Button variant="secondary" isDisabled disabledReason={t.previewReason}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-doc" />
            </svg>
            {t.preview}
          </Button>
          <GenerateAction reasonId={reasonId} blocked={blocked} />
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="sumario-announcer">
        {announcement}
      </p>

      {adding === null ? null : <AddSectionDialog below={adding.title} onPick={onPickSection} onClose={() => setAdding(null)} />}
      {restoring ? <RestoreDialog blocks={removable} onRestore={onRestore} onClose={() => setRestoring(false)} /> : null}
      {backMove === null ? null : (
        <ConfirmDialog
          isOpen={confirmingBack}
          onOpenChange={setConfirmingBack}
          title={backMove.label}
          description={backwardMoveConsequenceText(relatorio.status, backMove.to)}
          confirmLabel={backMove.label}
          onConfirm={onConfirmBack}
        />
      )}
    </>
  );
}
