import {
  buildSnapshot,
  captionSavedText,
  captionWordFor,
  contextCaptionParts,
  GALLERY_ALL,
  galleryCabineOptions,
  galleryCounterText,
  galleryFilterText,
  galleryHeadingText,
  isUncaptioned,
  numberPhotos,
  photoCabineId,
  photoRemovedText,
  photoStampShort,
  photoTileLabel,
  photoUploadState,
  type EntityState,
  type RelatorioSnapshot,
} from '@app/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Button, FilterChipGroup, PhotoRow } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { useSheetCamera } from '../ficha/photo-openers.tsx';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { CaptionComposer } from './caption-composer.tsx';
import { DropHint, PhotoCaptureSheet, useDropZone } from './capture-sheet.tsx';
import { removePhoto, restorePhoto, setPhotoCaption } from './photo-ops.ts';
import { PhotoViewer } from './photo-viewer.tsx';
import { useCaptionSources } from './use-caption-sources.ts';
import './photos.css';

/*
 * `/relatorio/:id/fotos` (Story 6.3; `70-fotos.html`, `key-photos.html`): every live photo of
 * the relatório in capture order with its provisional number, Photo stamp, caption and upload
 * pill -- the future section 7. Filter chips by cabine ("Todas" first), the Photo viewer on a
 * tile, "Legendar" on each row (Story 6.5), and the Sticky action bar with the Camera capture
 * button (a gallery shot is "Geral": no sheet, no caption) and "Adicionar fotos" (Story 6.4),
 * plus a drop zone on a computer. Numbers, counts, stamps and texts are the kernel's.
 */
export function GallerySurface() {
  const { id = '' } = useParams();
  return (
    <main className="screen" data-route="/relatorio/:id/fotos">
      <RelatorioGate id={id}>{(state) => <Gallery key={id} relatorioId={id} state={state} />}</RelatorioGate>
    </main>
  );
}

const GERAL_TARGET = { blockId: null, itemKey: null, caption: null };

/** A few frames after a dialog closes, the focus goes to the tile of `photoId` (else `fallback`). */
function focusTileSoon(photoId: string | null, fallback: HTMLElement | null) {
  let frames = 0;
  const tick = () => {
    if (++frames < 3) {
      requestAnimationFrame(tick);
      return;
    }
    if (document.querySelector('.photo-viewer, .caption-composer') !== null) return;
    const tile = photoId === null ? null : document.querySelector<HTMLElement>(`[data-photo-id="${photoId}"] .photo-tile`);
    (tile ?? fallback)?.focus();
  };
  requestAnimationFrame(tick);
}

function Gallery({ relatorioId, state }: { relatorioId: string; state: EntityState }) {
  const t = copy.gallery;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const { retryUpload } = useSync();
  const snapshot: RelatorioSnapshot = useMemo(() => buildSnapshot(state, relatorioId), [state, relatorioId]);
  const tiles = useRelatorioPhotoTiles(db, relatorioId);
  const all = tiles;
  const numbers = useMemo(() => numberPhotos(snapshot.files), [snapshot.files]);
  const sources = useCaptionSources(relatorioId, snapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  const surface = useRef<HTMLDivElement>(null);

  // --- the cabine filter --------------------------------------------------------------------
  const options = useMemo(() => galleryCabineOptions(snapshot, all), [snapshot, all]);
  const [picked, setPicked] = useState<string>(GALLERY_ALL);
  const filter = options.some((option) => option.id === picked) ? picked : GALLERY_ALL;
  const shown = useMemo(() => (filter === GALLERY_ALL ? all : all.filter((tile) => photoCabineId(tile, snapshot) === filter)), [all, filter, snapshot]);
  const cabineName = options.find((option) => option.id === filter && filter !== GALLERY_ALL)?.label ?? null;
  const filterText = galleryFilterText(shown.length, cabineName === null ? null : captionWordFor(cabineName, 'local', sources.locais, sources.registry));

  // --- the header counter -------------------------------------------------------------------
  const counter = galleryCounterText({
    pending: all.filter((tile) => photoUploadState({ uploaded_at: tile.uploaded_at, localError: tile.upload_error }) === 'pending').length,
    error: all.filter((tile) => photoUploadState({ uploaded_at: tile.uploaded_at, localError: tile.upload_error }) === 'error').length,
    uncaptioned: all.filter((tile) => isUncaptioned(tile.caption)).length,
  });

  // --- the viewer, the composer, the import ---------------------------------------------------
  const [viewing, setViewing] = useState<string | null>(null);
  const [captioning, setCaptioning] = useState<PhotoTile | null>(null);
  const [importing, setImporting] = useState<{ files: readonly File[] | null } | null>(null);
  const camera = useSheetCamera(relatorioId, () => GERAL_TARGET);
  const dragging = useDropZone(surface, useCallback((files: File[]) => setImporting({ files }), []));

  const closeViewer = () => {
    const id = viewing;
    setViewing(null);
    focusTileSoon(id, heading.current);
  };

  const remove = (tile: PhotoTile) => {
    if (db === null || user === null) return;
    const number = numbers.get(tile.id) ?? 0;
    const author = { id: user.id, companyId: user.companyId };
    const at = shown.findIndex((row) => row.id === tile.id);
    const neighbour = shown[at + 1] ?? shown[at - 1] ?? null;
    setViewing(null);
    void removePhoto(db, author, relatorioId, tile.id).then(() => {
      focusTileSoon(neighbour?.id ?? null, heading.current);
      showToast(photoRemovedText(number), {
        action: {
          label: copy.viewer.undo,
          onPress: () => {
            void restorePhoto(db, author, relatorioId, tile.id).then(() => focusTileSoon(tile.id, heading.current));
          },
        },
      });
    });
  };

  const saveCaption = (tile: PhotoTile, text: string | null) => {
    if (db === null || user === null) return;
    void setPhotoCaption(db, { id: user.id, companyId: user.companyId }, relatorioId, tile.id, text).then(() => showToast(captionSavedText(numbers.get(tile.id) ?? null)));
  };

  const composerMeta = { step: null, testKey: null, words: { atividades: sources.atividades, locais: sources.locais }, registry: sources.registry };

  return (
    <>
      <div className="content gallery-content" ref={surface} data-dropping={dragging ? '' : undefined}>
        <section className="section" aria-labelledby="fotos-heading">
          <div className="section-head">
            <h2 id="fotos-heading" ref={heading} tabIndex={-1}>
              {galleryHeadingText(all.length)}
            </h2>
            {counter === null ? null : (
              <span className="progress-counter" data-state="pending" role="status">
                <span className="dot" aria-hidden="true" />
                {counter}
              </span>
            )}
          </div>
          <p className="section-note">{t.note}</p>
          {options.length > 1 ? <FilterChipGroup aria-label={t.filterLabel} options={options} selectedId={filter} onChange={setPicked} /> : null}
          <p className="visually-hidden" role="status" data-testid="gallery-filter-status">
            {filterText}
          </p>
          {numbers.size === 0 && all.length === 0 ? <p className="section-note gallery-empty">{t.empty}</p> : null}
          <div className="gallery-grid" role="list" aria-label={t.listLabel}>
            {shown.map((tile) => {
              const number = numbers.get(tile.id) ?? 0;
              return (
                <div key={tile.id} role="listitem" className="gallery-item" data-photo-id={tile.id}>
                  <PhotoRow
                    label={photoTileLabel(number)}
                    number={number}
                    stamp={{ text: photoStampShort(tile.captured_at), gps: tile.coords !== null }}
                    caption={tile.caption}
                    thumb={tile.thumb}
                    state={photoUploadState({ uploaded_at: tile.uploaded_at, localError: tile.upload_error })}
                    onRetry={() => void retryUpload?.(tile.id)}
                    onOpen={() => setViewing(tile.id)}
                    onCaption={() => setCaptioning(tile)}
                  />
                </div>
              );
            })}
          </div>
        </section>
        <DropHint dragging={dragging} />
      </div>

      <div className="sticky-action-bar gallery-bar">
        <div className="bar-buttons has-camera">
          {camera.button}
          <span className="cam-reason">{t.camReason}</span>
          <Button variant="secondary" onPress={() => setImporting({ files: null })}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {copy.photos.addPhotos}
          </Button>
          <span className="btn-reason">{copy.photos.dragReason}</span>
        </div>
        {camera.note}
      </div>

      <PhotoViewer
        snapshot={snapshot}
        tiles={shown}
        numbers={numbers}
        photoId={viewing ?? ''}
        onNavigate={setViewing}
        onClose={closeViewer}
        onEditCaption={(tile) => setCaptioning(tile)}
        onRemove={remove}
      />
      {captioning === null ? null : (
        <CaptionComposer
          isOpen
          onClose={() => {
            const id = captioning.id;
            setCaptioning(null);
            if (viewing === null) focusTileSoon(id, heading.current);
          }}
          prefill={contextCaptionParts(captioning, snapshot, composerMeta)}
          stored={captioning.caption}
          sources={sources}
          onSave={(text) => saveCaption(captioning, text)}
        />
      )}
      <PhotoCaptureSheet
        relatorioId={relatorioId}
        isOpen={importing !== null}
        onClose={() => setImporting(null)}
        mode={{ kind: 'gallery', snapshot }}
        initialFiles={importing?.files ?? null}
      />
    </>
  );
}
