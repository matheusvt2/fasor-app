import { numberPhotos, photosOfBlock, photoStampShort, photoTileLabel, photoUploadState, sheetPhotosHeading, type RelatorioSnapshot } from '@app/domain';
import { useId, useMemo } from 'react';
import { PhotoRow } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { useSync } from '../../state/sync.tsx';
import type { FichaApi } from './ficha-api.ts';
import { useCropViewer } from './nameplate-suggestions.tsx';

/*
 * Story 11.11 (`60-ficha.html` 779-795, DESIGN.md › Photo tile): "Fotos da ficha (n)" at the
 * end of an equipment sheet, the sheet's photos as inline Photo tiles. The list, its order
 * and the numbers are the kernel's (`photosOfBlock`, `numberPhotos` over the relatório,
 * AD-1); the device store only adds what it alone holds -- the thumb and a local upload
 * error -- joined by id. A tap opens the Photo viewer on that photo, walking the relatório's
 * photos. No "Legendar" and no second "Adicionar fotos" here: the viewer edits the caption
 * and the Sticky action bar adds photos. A sheet with no live photo shows no section.
 */

export interface SheetPhotosSectionProps {
  snapshot: Pick<RelatorioSnapshot, 'files'>;
  blockId: string;
  /** The device's photo tiles of the relatório (any order): the thumbs and local errors, by id. */
  tiles: readonly PhotoTile[];
  onOpen: (photoId: string) => void;
  onRetry: (photoId: string) => void;
}

export function SheetPhotosSection({ snapshot, blockId, tiles, onOpen, onRetry }: SheetPhotosSectionProps) {
  const headingId = useId();
  const photos = useMemo(() => photosOfBlock(snapshot, blockId), [snapshot, blockId]);
  const numbers = useMemo(() => numberPhotos(snapshot.files), [snapshot.files]);
  const tileOf = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);
  if (photos.length === 0) return null;
  return (
    <section className="section sheet-photos" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{sheetPhotosHeading(photos.length)}</h2>
      </div>
      <p className="section-note">{copy.ficha.photosNote}</p>
      <div className="photo-list">
        {photos.map((photo) => {
          const tile = tileOf.get(photo.id);
          const number = numbers.get(photo.id) ?? 0;
          return (
            <PhotoRow
              key={photo.id}
              label={photoTileLabel(number)}
              number={number}
              stamp={{ text: photoStampShort(photo.captured_at), gps: photo.coords !== null }}
              caption={photo.caption}
              thumb={tile?.thumb ?? null}
              state={photoUploadState({ uploaded_at: photo.uploaded_at, localError: tile?.upload_error ?? null })}
              onRetry={() => onRetry(photo.id)}
              onOpen={() => onOpen(photo.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

/** The strip on a sheet: the relatório's tiles and the Photo viewer the sheet's crops already use (`useCropViewer`). */
export function SheetPhotos({
  api,
  snapshot,
  blockId,
  onCaptionPhoto,
}: {
  api: FichaApi;
  snapshot: RelatorioSnapshot;
  blockId: string;
  onCaptionPhoto: (tile: PhotoTile) => void;
}) {
  const { retryUpload } = useSync();
  const { tiles, openPhoto, viewer } = useCropViewer({ api, snapshot, onCaptionPhoto });
  return (
    <>
      <SheetPhotosSection snapshot={snapshot} blockId={blockId} tiles={tiles} onOpen={(photoId) => openPhoto(photoId)} onRetry={(photoId) => void retryUpload?.(photoId)} />
      {viewer}
    </>
  );
}
