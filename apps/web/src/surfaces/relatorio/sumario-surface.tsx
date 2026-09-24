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
  type RelatorioSnapshot,
  type RestorableBlock,
  type RevisionRow,
  type SectionBlockType,
  type SumarioRow,
  type TemplateRow,
  type UserRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, StatusPill, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { useBackTarget } from '../../state/back-target.tsx';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { AddSectionDialog } from './add-section-dialog.tsx';
import { GenerateAction } from './generate-action.tsx';
import { useProjectEquipment, useRelatorioEditor } from './relatorio-editor.ts';
import { RelatorioGate } from './relatorio-gate.tsx';
import { focusAfterRemoval, focusWhenRendered } from './relatorio-focus.ts';
import { createBlockOp, putBlockOp, putRelatorioStatusOp, removeBlockOp } from './relatorio-ops.ts';
import { RelatorioTree, type RelatorioTreeHandle } from './relatorio-tree.tsx';
import { RestoreDialog } from './restore-dialog.tsx';
import { FixedRow, NumberedRow, Section9Row, type RowActions } from './sumario-row.tsx';
import { blockTrigger, restoreSheetOps } from './tree-actions.ts';
import './relatorio.css';

const NO_TEMPLATES: TemplateRow[] = [];
const NO_USERS: UserRow[] = [];

/**
 * `/relatorio/:id` (`40-relatorio-overview.html`, Story 4.3): the Sumário of the relatório
 * the address names, once `RelatorioGate` has it on this device.
 */
export function SumarioSurface() {
  const { id = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id">
      <RelatorioGate id={id}>{(state) => <Sumario key={id} relatorioId={id} state={state} />}</RelatorioGate>
    </main>
  );
}

/** The control the focus goes to on a numbered row `li`. */
const rowFocusTarget = (li: Element | null | undefined): HTMLElement | null =>
  li?.querySelector<HTMLElement>('.sum-ctrls .overflow-trigger') ?? null;

function Sumario({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const session = useSession();
  const db = session.database;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const t = copy.sumario;

  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const allBlocks = useMemo(() => [...state.values()].filter((row): row is BlockRow => 'sheet' in row && (row as BlockRow).relatorio_id === relatorioId), [state, relatorioId]);
  // Every equipment row of the project, removed sheets' included: the snapshot keeps only
  // the equipment of live blocks, and "Restaurar ficha removida" names a sheet by its TAG.
  const equipment = useProjectEquipment(state, snapshot.relatorio.project_id);
  // Story 4.6: revisions read straight off `EntityState`, the same way `equipment` was
  // before batch B's `useProjectEquipment` extraction -- `RelatorioSnapshot` is not
  // extended by this batch (batch D/4.8 owns it).
  const revisions = useMemo(() => [...state.entries()].filter(([key]) => key.startsWith('revision:')).map(([, row]) => row as RevisionRow), [state]);
  const templates = useLiveQuery(() => (db === null ? Promise.resolve(NO_TEMPLATES) : templateRows(db)), [db], NO_TEMPLATES);
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const lastSheet = useLiveQuery(() => (db === null ? Promise.resolve(null) : readLastSheet(db, relatorioId)), [db, relatorioId], null);

  const computed = useMemo(() => progress(snapshot), [snapshot]);
  const issues = useMemo(() => preIssue(snapshot, computed), [snapshot, computed]);
  const rows = useMemo(() => sumarioRows(snapshot, issues, computed), [snapshot, issues, computed]);
  const removable = useMemo(() => restorableBlocks(allBlocks, equipment, snapshot.locations), [allBlocks, equipment, snapshot.locations]);
  const relatorio = snapshot.relatorio;
  const templateName = templates.find((row) => row.id === relatorio.template_id)?.name ?? null;
  const responsibleName = users.find((row) => row.id === relatorio.setup.responsible_user_id)?.name ?? null;

  useBackTarget(`/project/${relatorio.project_id}`);

  // Section 9 opens expanded on an Em campo relatório, collapsed otherwise (EXPERIENCE.md);
  // opened that way, the tree opens the path to the last sheet and scrolls it into view.
  const [expanded, setExpanded] = useState(() => sumarioOpensExpanded(relatorio.status));
  const [openedByStatus] = useState(expanded);
  const chevron = useRef<HTMLButtonElement | null>(null);
  const treeRef = useRef<RelatorioTreeHandle>(null);
  const [adding, setAdding] = useState<SumarioRow | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmingBack, setConfirmingBack] = useState(false);
  const banner = useMemo(() => issuedBannerText(latestRevision(revisions)), [revisions]);
  const backMove = useMemo(() => backwardMoveLabel(relatorio.status), [relatorio.status]);
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();

  // One write path for the rows and the tree: the serialised edit queue, the announcer and
  // the undo toast that any later edit or leaving the Sumário retires.
  const editor = useRelatorioEditor(relatorioId, relatorio.project_id);
  const { edit, announce, announcement, undoable } = editor;
  const treeContext = useMemo(
    () => ({ relatorioId, projectId: relatorio.project_id, seedVersion: relatorio.seed_version, editor }),
    [relatorioId, relatorio.project_id, relatorio.seed_version, editor],
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
          focusAfterRemoval(li, (list) => [...list.children] as HTMLElement[], rowFocusTarget, () => headingRef.current);
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

  /**
   * "Desfazer" of a Restaurar tombstones the row again: the focus goes back to where the
   * restore came from, the header's "Mais opções do relatório", once the row is gone (E3-A8).
   */
  const undoneRestoreFocus = (blockId: string) => () =>
    listRef.current?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`) != null ? null : headerMenuRef.current?.querySelector<HTMLElement>('.overflow-trigger') ?? null;

  function onRestore(block: RestorableBlock): void {
    setRestoring(false);
    const locationId = allBlocks.find((row) => row.id === block.id)?.location_id ?? null;
    void edit((fresh, by) =>
      locationId === null
        ? fresh.some((row) => row.id === block.id && row.removed_at !== null)
          ? [putBlockOp(by, relatorioId, block.id, 'removed_at', null)]
          : null
        : restoreSheetOps(by, relatorioId, relatorio.project_id, fresh, block.id, block.equipmentId),
    )
      .then((batch) => {
        if (batch === null) {
          showToast(t.gone);
          return;
        }
        if (locationId !== null) {
          // An equipment sheet comes back in section 9: it opens, with the path down to the row.
          setExpanded(true);
          treeRef.current?.reveal(locationId);
          focusWhenRendered(() => blockTrigger(listRef.current?.querySelector(`li.s9-eq[data-block-id="${CSS.escape(block.id)}"]`)));
          undoable(t.tree.restored, batch, undoneRestoreFocus(block.id));
          return;
        }
        focusWhenRendered(() => rowFocusTarget(rowLi(block.id)));
        undoable(t.restored, batch, undoneRestoreFocus(block.id));
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
        focusWhenRendered(() => headerMenuRef.current?.querySelector<HTMLElement>('.overflow-trigger') ?? null);
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
        <div className="header-side" ref={headerMenuRef}>
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
                {(treeId) => (
                  <RelatorioTree
                    presentation="sumario"
                    snapshot={snapshot}
                    equipment={equipment}
                    lastSheetId={lastSheet}
                    id={treeId}
                    expandToLastSheet={openedByStatus}
                    context={treeContext}
                    ref={treeRef}
                  />
                )}
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
          <GenerateAction relatorioId={relatorioId} reasonId={reasonId} blocked={blocked} />
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
