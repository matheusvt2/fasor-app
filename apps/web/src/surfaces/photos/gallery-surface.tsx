import {
  captionConfirmAnnouncement,
  captionSavedText,
  captionSuggestions,
  legendaConfirmadaText,
  legendasConfirmadasText,
  legendasSugeridasText,
  pendingSuggestions,
  suggestionRowsOf,
  captionWordFor,
  contextCaptionParts,
  GALLERY_ALL,
  galleryCabineOptions,
  galleryCounterText,
  galleryCounts,
  galleryFilterText,
  galleryHeadingText,
  latestRevision,
  numberPhotos,
  photoCabineId,
  photoNumbersProvisional,
  photoNumbersStatusText,
  photoRemovedText,
  photoStampShort,
  photoTileLabel,
  photoUploadState,
  skippedFilesText,
  type EntityState,
  type RelatorioSnapshot,
  type SuggestionRow,
} from '@app/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useParams } from 'react-router';
import { Button, Chip, FilterChipGroup, PhotoRow } from '../../components/index.ts';
import { SuggestionBlock } from '../../components/suggestion-field.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { useEditedSince, useRevisions } from '../../db/generate-store.ts';
import { useRelatorioPhotoTiles, type PhotoTile } from '../../db/photo-store.ts';
import { splitImportable } from '../../files/photo-import.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { useSheetCamera } from '../ficha/photo-openers.tsx';
import { RelatorioGate } from '../relatorio/relatorio-gate.tsx';
import { CaptionComposer } from './caption-composer.tsx';
import { DropHint, PhotoCaptureSheet, useDropZone } from './capture-sheet.tsx';
import { confirmAllCaptionSuggestions, confirmCaptionSuggestion, removePhoto, restorePhoto, setPeopleInPhoto, setPhotoCaption } from './photo-ops.ts';
import { PhotoViewer } from './photo-viewer.tsx';
import { useCaptionSources } from './use-caption-sources.ts';
import './photos.css';
import { useRelatorioSnapshot } from '../../db/relatorio-snapshot.ts';

/*
 * `/relatorio/:id/fotos` (Story 6.3; `70-fotos.html`, `key-photos.html`): every live photo of
 * the relatório in capture order with its provisional number, Photo stamp, caption and upload
 * pill -- the future section 7. Filter chips by cabine ("Todas" first), the Photo viewer on a
 * tile, "Legendar" on each row (Story 6.5), and the Sticky action bar with the Camera capture
 * button (a gallery shot is "Geral": no sheet, no caption) and "Adicionar fotos" (Story 6.4),
 * plus a drop zone on a computer. Numbers, counts, stamps and texts are the kernel's.
 *
 * Story 9.3 (FR-39): a photo with no context gets a vision caption on sync. It shows on its
 * tile as the Suggestion field's block variant with "Confirmar", in the composer with "Usar",
 * and the banner "N legendas sugeridas" offers "Confirmar todas" (one batch, every shown
 * suggestion of the relatório). A tile with no sheet (or already marked) carries the "Pessoas
 * na foto" chip: pressing it on writes the mark and discards the photo's pending caption in
 * one batch. Which suggestion shows is the kernel's (`captionSuggestions`).
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
  const snapshot: RelatorioSnapshot = useRelatorioSnapshot(state, relatorioId);
  const tiles = useRelatorioPhotoTiles(db, relatorioId);
  const all = tiles;
  // Numbered from the tiles this surface draws (one query), so every drawn tile has its number.
  const numbers = useMemo(
    () => numberPhotos(all.map((tile) => ({ id: tile.id, kind: 'photo', removed_at: null, captured_at: tile.captured_at, local_seq: tile.local_seq }))),
    [all],
  );
  // Story 7.2 (AC3): a revision froze these numbers until anything is edited after it.
  const latest = latestRevision(useRevisions(db, relatorioId));
  const edited = useEditedSince(db, relatorioId, latest?.snapshot_seq ?? null);
  const numbersStatus = photoNumbersStatusText(latest, edited);
  const provisional = photoNumbersProvisional(latest, edited);
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

  // --- Story 9.3: the vision captions ----------------------------------------------------------
  const pending = useMemo(() => pendingSuggestions(suggestionRowsOf(state, relatorioId)), [state, relatorioId]);
  const suggested = useMemo(
    () =>
      captionSuggestions(
        all.map((tile) => ({ id: tile.id, block_id: tile.block_id, caption: tile.caption, people_in_photo: tile.people_in_photo ?? false, removed_at: null })),
        pending,
      ),
    [all, pending],
  );
  const author = user === null ? null : { id: user.id, companyId: user.companyId };
  const confirmOne = (tile: PhotoTile, suggestion: SuggestionRow, toast: string) => {
    if (db === null || author === null) return;
    void confirmCaptionSuggestion(db, author, suggestion).then(() => showToast(toast));
  };
  const confirmAll = () => {
    if (db === null || author === null) return;
    const rows = [...suggested.values()];
    void confirmAllCaptionSuggestions(db, author, rows).then(() => {
      showToast(legendasConfirmadasText(rows.length));
      heading.current?.focus();
    });
  };
  const markPeople = (tile: PhotoTile, marked: boolean) => {
    if (db === null || author === null) return;
    void setPeopleInPhoto(db, author, relatorioId, tile.id, marked, pending);
  };

  // --- the header counter -------------------------------------------------------------------
  // E6-Q12: the counts are the kernel's.
  const counter = galleryCounterText(galleryCounts(all, suggested));

  // --- the viewer, the composer, the import ---------------------------------------------------
  const [viewing, setViewing] = useState<string | null>(null);
  const [captioning, setCaptioning] = useState<PhotoTile | null>(null);
  const [importing, setImporting] = useState<{ files: readonly File[] | null } | null>(null);
  const camera = useSheetCamera(relatorioId, () => GERAL_TARGET);
  // A drop of pictures opens straight on "De qual equipamento?"; a drop with none only says so.
  const dragging = useDropZone(
    surface,
    useCallback(
      (files: File[]) => {
        const { images, skipped } = splitImportable(files);
        if (images.length === 0) showToast(skippedFilesText(skipped));
        else setImporting({ files });
      },
      [showToast],
    ),
  );

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
    void setPhotoCaption(db, { id: user.id, companyId: user.companyId }, relatorioId, tile.id, text, pending).then(() => showToast(captionSavedText(numbers.get(tile.id) ?? null)));
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
          {numbersStatus === null ? null : (
            <p className="section-note" data-testid="photo-numbers-status">
              {numbersStatus}
            </p>
          )}
          {suggested.size === 0 ? null : (
            <div className="banner sug-banner" data-variant="info" role="status">
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-sparkles" />
              </svg>
              <span className="banner-text">
                <strong>{legendasSugeridasText(suggested.size)}</strong>
                {t.suggestedTail}
              </span>
              <span className="banner-actions">
                <AriaButton className="btn btn-text fotos-confirm-all" onPress={confirmAll}>
                  <svg className="ico" aria-hidden="true">
                    <use href="/sprite.svg#i-check-all" />
                  </svg>
                  {t.confirmAll}
                </AriaButton>
              </span>
            </div>
          )}
          {options.length > 1 ? <FilterChipGroup aria-label={t.filterLabel} options={options} selectedId={filter} onChange={setPicked} /> : null}
          <p className="visually-hidden" role="status" data-testid="gallery-filter-status">
            {filterText}
          </p>
          {all.length === 0 ? <p className="section-note gallery-empty">{t.empty}</p> : null}
          <div className="gallery-grid" role="list" aria-label={t.listLabel}>
            {shown.map((tile) => {
              const number = numbers.get(tile.id) ?? 0;
              const suggestion = suggested.get(tile.id);
              const suggestionText = suggestion === undefined ? null : String(suggestion.value);
              const marked = tile.people_in_photo === true;
              return (
                <div key={tile.id} role="listitem" className="gallery-item" data-photo-id={tile.id}>
                  <PhotoRow
                    label={photoTileLabel(number, { suggested: suggestion !== undefined })}
                    suggestion={
                      suggestion === undefined || suggestionText === null ? undefined : (
                        <SuggestionBlock
                          label={t.suggestedCaption}
                          text={suggestionText}
                          confirmLabel={ui.suggestionField.confirm}
                          announcement={captionConfirmAnnouncement(suggestionText)}
                          onConfirm={() => confirmOne(tile, suggestion, legendaConfirmadaText(numbers.get(tile.id) ?? null))}
                        />
                      )
                    }
                    people={
                      tile.block_id === null || marked ? (
                        <div className="chip-row photo-people">
                          <Chip isSelected={marked} onSelectedChange={(on) => markPeople(tile, on)}>
                            {t.peopleInPhoto}
                          </Chip>
                        </div>
                      ) : undefined
                    }
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
          <span className="btn-reason drag-reason">{copy.photos.dragReason}</span>
        </div>
        {camera.note}
      </div>

      <PhotoViewer
        snapshot={snapshot}
        tiles={shown}
        numbers={numbers}
        provisional={provisional}
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
          photo={{ thumb: captioning.thumb, number: numbers.get(captioning.id) ?? null, capturedAt: captioning.captured_at }}
          prefill={contextCaptionParts(captioning, snapshot, composerMeta)}
          stored={captioning.caption}
          sources={sources}
          onSave={(text) => saveCaption(captioning, text)}
          {...(() => {
            const suggestion = suggested.get(captioning.id);
            if (suggestion === undefined) return {};
            const tile = captioning;
            return {
              suggestion: {
                text: String(suggestion.value),
                onUse: () => confirmOne(tile, suggestion, captionSavedText(numbers.get(tile.id) ?? null)),
              },
            };
          })()}
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
