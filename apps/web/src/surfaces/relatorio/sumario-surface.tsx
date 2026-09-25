import {
  backwardMoveConsequenceText,
  backwardMoveLabel,
  buildSnapshot,
  fichasConcluidasText,
  generateReason,
  issuedBannerText,
  latestRevision,
  naoEnsaiadasText,
  ncAbertosText,
  preIssue,
  progress,
  restorableBlocks,
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
import { useLocation, useParams } from 'react-router';
import { Button, ConfirmDialog, OverflowMenu, StatusPill, TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { templateRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { readLastSheet } from '../../db/prefs.ts';
import { localUsers } from '../../db/sync-store.ts';
import { useForgetArrivalState } from '../../state/arrival-state.ts';
import { useBackTarget } from '../../state/back-target.tsx';
import { useExtraBanner } from '../../state/extra-banner.tsx';
import { usePageTitle } from '../../state/page-title.tsx';
import { useSession } from '../../state/session.tsx';
import { AddSectionDialog } from './add-section-dialog.tsx';
import { GenerateAction } from './generate-action.tsx';
import { useProjectEquipment, useRelatorioEditor } from './relatorio-editor.ts';
import { RelatorioGate } from './relatorio-gate.tsx';
import { RelatorioTree, type RelatorioTreeHandle } from './relatorio-tree.tsx';
import { RestoreDialog } from './restore-dialog.tsx';
import { useSumarioActions } from './sumario-actions.ts';
import { FixedRow, NumberedRow, Section9Row } from './sumario-row.tsx';
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

/** The navigation state the Sumário is opened with (setup "Concluir", a sheet's "Voltar"). */
function arrivalOf(state: unknown): { openSection9: boolean; focusBlockId: string | null } {
  if (typeof state !== 'object' || state === null) return { openSection9: false, focusBlockId: null };
  const raw = state as Record<string, unknown>;
  return { openSection9: raw.openSection9 === true, focusBlockId: typeof raw.focusBlockId === 'string' ? raw.focusBlockId : null };
}

function Sumario({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const session = useSession();
  const db = session.database;
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
  // Story 12.5 (J-17): inside a relatório the App bar names it, never the surface; the
  // route's "Sumário" stays only as the fallback while the gate loads.
  usePageTitle(sumarioTitle(snapshot.client, snapshot.project));

  // Section 9 opens expanded on an Em campo relatório, collapsed otherwise (EXPERIENCE.md);
  // opened that way, the tree opens the path to the last sheet and scrolls it into view.
  // Story 12.2: arriving from setup's "Concluir" or from a sheet's "Voltar" opens it
  // whatever the status, and a sheet left by "Voltar" gets its row focused.
  const location = useLocation();
  const [arrival] = useState(() => arrivalOf(location.state));
  // History keeps no arrival state: a reload or a browser back onto the Sumário opens it plain.
  useForgetArrivalState();
  const [expanded, setExpanded] = useState(() => arrival.openSection9 || sumarioOpensExpanded(relatorio.status));
  const [openedByStatus] = useState(expanded);
  const chevron = useRef<HTMLButtonElement | null>(null);
  const treeRef = useRef<RelatorioTreeHandle>(null);
  const [adding, setAdding] = useState<SumarioRow | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmingBack, setConfirmingBack] = useState(false);
  const bannerText = useMemo(() => issuedBannerText(relatorio.status, latestRevision(revisions)), [relatorio.status, revisions]);
  const banner = useMemo(
    () => (bannerText === null ? null : { kind: 'relatorio-exported' as const, variant: 'warning' as const, role: 'region' as const, text: bannerText }),
    [bannerText],
  );
  useExtraBanner(banner);
  const backMove = useMemo(() => backwardMoveLabel(relatorio.status), [relatorio.status]);
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();

  // One write path for the rows and the tree: the serialised edit queue, the announcer and
  // the undo toast that any later edit or leaving the Sumário retires.
  const editor = useRelatorioEditor(relatorioId, relatorio.project_id);
  const { announcement } = editor;
  const treeContext = useMemo(
    () => ({ relatorioId, projectId: relatorio.project_id, seedVersion: relatorio.seed_version, editor }),
    [relatorioId, relatorio.project_id, relatorio.seed_version, editor],
  );

  const { rows: actions, addSection, restore, moveBack } = useSumarioActions(
    { relatorioId, projectId: relatorio.project_id, seedVersion: relatorio.seed_version, editor, allBlocks },
    {
      list: () => listRef.current,
      heading: () => headingRef.current,
      headerMenu: () => headerMenuRef.current,
      tree: () => treeRef.current,
      expandSection9: () => setExpanded(true),
      pickBelow: setAdding,
    },
  );

  function onPickSection(type: SectionBlockType): void {
    const below = adding;
    setAdding(null);
    if (below === null) return;
    addSection(below, type);
  }

  function onRestore(block: RestorableBlock): void {
    setRestoring(false);
    restore(block);
  }

  /** A header count: opens section 9 and moves the focus to its row. */
  function openSection9(): void {
    setExpanded(true);
    requestAnimationFrame(() => chevron.current?.focus());
  }

  /** The header Overflow's backward-move Confirm: one `relatorio/status` put, focus back on the trigger. */
  function onConfirmBack(): void {
    if (backMove === null) return;
    moveBack(backMove.to);
  }

  const blocked = rows.some((row) => row.blocking);
  // Story 6.6: row 8 opens the Points surface (`/relatorio/:id/pontos`).
  const openable = (row: SumarioRow) => row.kind === 'setup' || row.kind === 'text' || row.rowKey === 'section_8';

  return (
    <>
      <div className="sheet-header">
        <div>
          <h2 className="sheet-title">{sumarioTitle(snapshot.client, snapshot.project)}</h2>
          <p className="sheet-meta">
            <StatusPill status={relatorio.status} />{' '}
            {sumarioMetaText({ start: relatorio.setup.service_start, end: relatorio.setup.service_end, templateName, responsibleName })}
          </p>
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
                    focusBlockId={arrival.focusBlockId}
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
