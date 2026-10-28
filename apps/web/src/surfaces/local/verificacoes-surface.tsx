import {
  captionSavedText,
  contextCaption,
  filledByText,
  getSeed,
  itensMarcadosConformeText,
  ncRowPointPositions,
  ncRowPointsText,
  numberPhotos,
  photoToken,
  ncChipPhrases,
  recentSiteObservations,
  siteChecklistView,
  siteFirstUnanswered,
  siteMissingText,
  siteUnsetItems,
  type CabineLocation,
  type EntityState,
  type OpDraft,
  type RelatorioSnapshot,
  type SeedWord,
  type SiteChecklistView,
  type SiteRowView,
  type UserRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../components/index.ts';
import { useStickyBarScrollPadding } from '../../components/toast.tsx';
import { copy } from '../../copy/pt-br.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useLocalWordRows, useLocationPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { useRelatorioSnapshot } from '../../db/relatorio-snapshot.ts';
import { localUsers, opStamp } from '../../db/sync-store.ts';
import { useHeldWhilePressed } from '../../input/press-hold.ts';
import { pickBanner, type Banner } from '../../state/banner-slot.tsx';
import { useExtraBanner } from '../../state/extra-banner.tsx';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { CabineBlock } from '../ficha/cabine-block.tsx';
import { BulkActionBar, ChecklistRow, type ChecklistPhotos, type ChecklistRowApi, type ChecklistRowTarget } from '../ficha/checklist-section.tsx';
import type { LocalApi } from '../ficha/ficha-api.ts';
import { useLocalIssuedBanner } from '../ficha/issued-banner.ts';
import { useDirectPicker } from '../ficha/photo-openers.tsx';
import type { CaptureTarget } from '../ficha/use-photo-capture.ts';
import { usePhotoImport } from '../photos/capture-sheet.tsx';
import { PhotoCaptionDialog } from '../photos/photo-caption-dialog.tsx';
import { setPhotoCaption, toastPhotoWriteFailure } from '../photos/photo-ops.ts';
import { usePointDraftRecovery } from '../points/point-draft-recovery.ts';
import { useRelatorioEditor, type Build } from '../relatorio/relatorio-editor.ts';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { siteObservationOp, siteResultOp } from './local-ops.ts';
import './verificacoes.css';

/*
 * Story 14.3 (`61-verificacoes-local.html`): "Verificações do local", the site checklist of
 * one local, at `/relatorio/:id/local/:locationId/verificacoes` (the mock's
 * `/local/:id/verificacoes`). The header names the local and its Função; the intro holds the
 * one bulk action and the legend; then the seed's groups with their "N de M" and one
 * Checklist row per item; then the Sticky action bar. Every row is the sheet checklist's own
 * `ChecklistRow`, written through `location/{id}/checklist/{item}/{result|observation}`
 * (`local-ops.ts`); the photos of an NC item are `file` rows carrying this local
 * (`location_id`) and the item, and "Criar ponto de atenção" makes a point of this local.
 *
 * Everything shown is the kernel's (`siteChecklistView`: groups, counters, labels, phrases);
 * nothing here counts an item. A painel, a coluna, a relatório whose seed ships no site list
 * and an unknown id have no checklist: the surface says so. Nothing is stored for "concluded"
 * (the checklist is complete when every item is answered): "Concluir verificações" names what
 * is missing and goes to the first unanswered row, or returns to the tree. A local has no
 * read-only state of its own: the sheet's only one is "não ensaiado", which is a sheet's.
 *
 * Epic 14 QA Q-5: above the items, the local's "Do local" block (CARACTERÍSTICAS DA SE and
 * AMBIENTE DE ENSAIO, `CabineBlock`) expanded and editable as on the local's first sheet, so a
 * local with no equipment can fill what section 9 prints under its heading. Left out here: the
 * "Observações rápidas" chips (they write `sheet/{id}/observations`) and the thermo-hygrometer's
 * "Ler visor" (its photo is a sheet's: the shot is filed on the sheet open).
 */
export function VerificacoesSurface() {
  const { id = '', locationId = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id/local/:locationId/verificacoes">
      <RelatorioGate id={id}>{(state) => <Verificacoes key={locationId} relatorioId={id} locationId={locationId} state={state} />}</RelatorioGate>
    </main>
  );
}

function Verificacoes({ relatorioId, locationId, state: live }: { relatorioId: string; locationId: string; state: EntityState }) {
  // The rows as they were when a finger went down, until it comes up (`input/press-hold.ts`), as the sheet holds them.
  const state = useHeldWhilePressed(live);
  const snapshot: RelatorioSnapshot = useRelatorioSnapshot(state, relatorioId);
  const view = useMemo(() => siteChecklistView(snapshot, locationId), [snapshot, locationId]);
  const location = snapshot.locations.find((row): row is CabineLocation => row.id === locationId && row.kind === 'cabine') ?? null;
  if (view === null || location === null) {
    return (
      <div className="content">
        <p className="section-note">{copy.local.notFound}</p>
      </div>
    );
  }
  return <VerificacoesBody relatorioId={relatorioId} snapshot={snapshot} state={state} view={view} location={location} />;
}

const NO_USERS: UserRow[] = [];
const NO_SEED_WORDS: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] } = { atividades: [], locais: [] };

/** The target of one site item: its cells on the local, its ops on `location/{id}/checklist/…`, its points and recents by the local. */
function siteRowTarget(snapshot: RelatorioSnapshot, location: CabineLocation, row: SiteRowView): ChecklistRowTarget {
  const relatorioId = snapshot.relatorio.id;
  const observation = location.checklist?.[row.key]?.observation?.value;
  return {
    entityId: location.id,
    result: row.result,
    // A site item shows no default: what the row shows is the stored cell.
    committed: true,
    observation: typeof observation === 'string' ? observation : '',
    resultOp: (by, value) => siteResultOp(by, relatorioId, location.id, row.key, value),
    observationOp: (by, value) => siteObservationOp(by, relatorioId, location.id, row.key, value),
    // No photo-read draft on a site item (the batch spec's open question O4).
    ncDraft: null,
    pointSeed: (photoIds) => ({ text: photoIds.map((id) => photoToken(id)).join(' '), equipmentId: null, origin: 'manual', locationId: location.id }),
    pointMark: (photoIds) => ncRowPointsText(ncRowPointPositions(snapshot.points, { locationId: location.id }, photoIds)),
    // Story 14.12: a site item learns nothing and offers no learned phrase (answer 7 scopes them per equipment type).
    chips: ncChipPhrases({ seeded: row.nc_phrases, learned: [], blockType: null, itemKey: row.key, recents: recentSiteObservations(snapshot, row.key, row.nc_phrases, location.id) }),
  };
}

function VerificacoesBody({
  relatorioId,
  snapshot,
  state,
  view,
  location,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  state: EntityState;
  view: SiteChecklistView;
  location: CabineLocation;
}) {
  const t = copy.local;
  const locationId = location.id;
  const session = useSession();
  const db = session.database;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const sync = useSync();
  const relatorio = snapshot.relatorio;
  const editor = useRelatorioEditor(relatorioId, relatorio.project_id);
  useStickyBarScrollPadding();

  const api: ChecklistRowApi = useMemo(
    () => ({ relatorioId, author: editor.author, commit: (drafts: OpDraft[]) => editor.commit(drafts), edit: (build: Build) => editor.edit(build) }),
    [relatorioId, editor],
  );
  // Epic 14 QA Q-5: the "Do local" block writes through the same edit queue, with no sheet.
  const localApi: LocalApi = useMemo(
    () => ({
      relatorioId,
      projectId: relatorio.project_id,
      author: editor.author,
      commit: (drafts: OpDraft[]) => editor.commit(drafts),
      edit: (build: Build) => editor.edit(build),
      undoable: editor.undoable,
      announce: editor.announce,
    }),
    [relatorioId, relatorio.project_id, editor],
  );

  // --- the header's attribution line, as the sheet composes its own: who last wrote a cell, and when
  const users = useLiveQuery(() => (db === null ? Promise.resolve(NO_USERS) : localUsers(db)), [db], NO_USERS);
  const latestOpId = view.latestOpId;
  const stamp = useLiveQuery(() => (db === null || latestOpId === null ? Promise.resolve(null) : opStamp(db, latestOpId)), [db, latestOpId], null);
  const filledName = stamp === null ? null : (users.find((row) => row.id === stamp.actor_id)?.name ?? (session.user?.id === stamp.actor_id ? session.user.name : null));
  const filledBy = stamp === null || filledName === null ? null : filledByText(filledName, stamp.client_ts);

  // --- the bulk action: "Marcar os restantes como Conforme", N puts in one batch, undoable
  const unset = view.total - view.answered;
  const markRest = () => {
    let n = 0;
    void editor
      .edit((_blocks, by, fresh) => {
        const local = fresh.locations.find((row): row is CabineLocation => row.id === locationId && row.kind === 'cabine');
        if (local === undefined) return null;
        const keys = siteUnsetItems(local, relatorio.seed_version);
        n = keys.length;
        return keys.map((key) => siteResultOp(by, relatorioId, locationId, key, 'C'));
      })
      .then((batch) => editor.undoable(itensMarcadosConformeText(n), batch))
      .catch(() => undefined);
  };

  // --- the photos of the NC items: this local's, captioned from the item and the local
  const localWords = useLocalWordRows(db);
  const seedWords = useMemo(() => {
    try {
      const seed = getSeed(relatorio.seed_version, 'cabine_primaria');
      return { atividades: seed.atividades, locais: seed.locais };
    } catch {
      return NO_SEED_WORDS;
    }
  }, [relatorio.seed_version]);
  const tiles = useLocationPhotoTiles(db, relatorioId, locationId);
  const photoTarget = (itemKey: string): CaptureTarget => ({
    blockId: null,
    itemKey,
    locationId,
    caption: contextCaption({ block_id: null, item_key: itemKey, location_id: locationId }, snapshot, { step: null, testKey: null, words: seedWords, registry: localWords }),
    // No reading is asked of a site item's photo (the batch spec's open question O4).
    reading: null,
  });
  // Beside a denied camera: the system picker, the files saved on the item that opened it.
  const importFiles = usePhotoImport(relatorioId);
  const importKey = useRef<string | null>(null);
  const picker = useDirectPicker((files) => {
    const itemKey = importKey.current;
    if (itemKey !== null) void importFiles(files, photoTarget(itemKey));
  });
  const [captioning, setCaptioning] = useState<PhotoTile | null>(null);
  const { retryUpload } = sync;
  const photos: ChecklistPhotos = {
    tiles,
    target: photoTarget,
    retry: (fileId) => void retryUpload?.(fileId),
    addPhotos: (itemKey) => {
      importKey.current = itemKey;
      picker.open();
    },
    caption: (tile) => setCaptioning(tile),
  };
  const saveCaption = (tile: PhotoTile, text: string | null) => {
    if (db === null || editor.author === null) return;
    void setPhotoCaption(db, editor.author, relatorioId, tile.id, text)
      .then(() => showToast(captionSavedText(numberPhotos(snapshot).get(tile.id) ?? null)))
      .catch(toastPhotoWriteFailure(showToast));
  };
  // A point typed in an NC row's dialog before a reload is offered back here, as on a sheet.
  usePointDraftRecovery(relatorioId);

  // --- the one banner slot: on an Emitido relatório, editing reopens it
  const issued = useLocalIssuedBanner(state, relatorioId, relatorio.status);
  const banner = useMemo(() => pickBanner([issued].filter((row): row is Banner => row !== null)), [issued]);
  useExtraBanner(banner);

  // --- the Sticky action bar
  const goTree = () => void navigate(`/relatorio/${relatorioId}`, { state: { openSection9: true } });
  const content = useRef<HTMLDivElement>(null);
  const conclude = () => {
    const missing = siteMissingText(snapshot, locationId);
    const first = siteFirstUnanswered(snapshot, locationId);
    if (missing === null || first === null) {
      goTree();
      return;
    }
    showToast(missing);
    const row = content.current?.querySelector<HTMLElement>(`li.checklist-row[data-item-key="${CSS.escape(first.key)}"]`) ?? null;
    if (row === null) return;
    // jsdom draws no layout and has no `scrollIntoView`.
    row.scrollIntoView?.({ block: 'center' });
    (row.querySelector<HTMLElement>('.tri-state [role="radio"][tabindex="0"]') ?? row.querySelector<HTMLElement>('.tri-state [role="radio"]'))?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="sheet-header">
        <div>
          <h2 className="sheet-title">{view.title}</h2>
          {view.meta === null ? null : <p className="sheet-meta">{view.meta}</p>}
          <p className="sheet-summary">{t.summary}</p>
          {/* The attribution line keeps its height before the first answer, as the sheet's does (E6-Q1). */}
          {filledBy === null ? (
            <p className="sheet-meta" aria-hidden="true">
              {' '}
            </p>
          ) : (
            <p className="sheet-meta" data-testid="local-filled-by">
              {filledBy}
            </p>
          )}
        </div>
        <div className="vl-head-side">
          <div className="progress-counter" data-state={view.state} data-testid="local-progress">
            <span className="dot" aria-hidden="true" />
            {view.counterText}
          </div>
        </div>
      </div>

      <div className="content" ref={content}>
        <CabineBlock api={localApi} state={state} snapshot={snapshot} cabine={location} first siteLine={false} />
        <div className="vl-intro">
          {/* The mock's reason line under the bar is its prototype's toggle; the action's toast carries "Desfazer". */}
          <BulkActionBar bulk={{ unset, markRest }} single label={t.bulkLabel} />
          <p className="checklist-legend">{copy.ficha.checklist.legendText}</p>
        </div>
        {view.groups.map((group) => (
          <SiteGroup key={group.key} label={group.label} counterText={group.counterText}>
            {group.rows.map((row) => (
              <ChecklistRow
                key={row.key}
                api={api}
                target={siteRowTarget(snapshot, location, row)}
                item={row}
                label={row.label}
                number={row.number}
                readOnly={false}
                photos={photos}
                snapshot={snapshot}
                observationLine
              />
            ))}
          </SiteGroup>
        ))}
      </div>

      <div className="sticky-action-bar">
        <div className="bar-buttons">
          <Button variant="secondary" onPress={goTree}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-tree" />
            </svg>
            {t.verArvore}
          </Button>
          <Button variant="primary" onPress={conclude}>
            {t.concluir}
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-right" />
            </svg>
          </Button>
        </div>
      </div>

      <p className="visually-hidden" role="status" data-testid="local-announcer">
        {editor.announcement}
      </p>

      {picker.input}
      {captioning === null ? null : (
        <PhotoCaptionDialog relatorioId={relatorioId} snapshot={snapshot} photo={captioning} onClose={() => setCaptioning(null)} onSave={(text) => saveCaption(captioning, text)} />
      )}
    </>
  );
}

/** One group of the checklist: its heading (one step under the sheet's section title), its "N de M" and its rows. */
function SiteGroup({ label, counterText, children }: { label: string; counterText: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="section vl-group" aria-labelledby={headingId}>
      <div className="section-head">
        <h3 className="vl-group-title" id={headingId}>
          {label}
        </h3>
        <span className="btn-reason">{counterText}</span>
      </div>
      <ul className="checklist">{children}</ul>
    </section>
  );
}
