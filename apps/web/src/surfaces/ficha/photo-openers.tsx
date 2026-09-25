import { photoUploadState } from '@app/domain';
import { useId, useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { PhotoRow } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { useCamera } from './camera-view.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Story 6.1: the two openers of the burst camera on a sheet -- the 56 px Camera capture
 * button of the Sticky action bar and the NC row's "Adicionar foto" (`60-ficha.html`) --
 * and the NC row's Photo tile rows under its buttons (`key-equipment-sheet.html`
 * `.photo-list`), each with its upload pill (Story 6.2).
 */

/** The Sticky action bar's Camera capture button, and the denied reason under the row. */
export function useSheetCamera(relatorioId: string, target: () => CaptureTarget): { button: ReactNode; note: ReactNode } {
  const t = copy.photos;
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera(relatorioId, target, opener);
  const deniedId = useId();
  return {
    button: (
      <>
        <AriaButton
          ref={opener}
          className="camera-capture-btn"
          aria-label={t.takePhoto}
          data-count={camera.burst > 0 ? String(camera.burst) : ''}
          aria-describedby={camera.denied ? deniedId : undefined}
          onPress={camera.open}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-camera" />
          </svg>
          <span className="cam-word" aria-hidden="true">
            {t.camWord}
          </span>
        </AriaButton>
        {camera.element}
      </>
    ),
    note: camera.denied ? (
      <p className="camera-denied" id={deniedId} role="status">
        {t.denied}
      </p>
    ) : null,
  };
}

/**
 * Story 6.4: "Adicionar fotos" (`70-fotos.html` Sticky action bar, `btn btn-secondary` with
 * `i-image`), the import path beside the camera. Below 480 px its word is visually hidden so
 * the bar never runs wider than the phone (the button keeps its name).
 */
export function AddPhotosButton({ onPress }: { onPress: () => void }) {
  return (
    <AriaButton className="btn btn-secondary add-photos-btn" onPress={onPress}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-image" />
      </svg>
      <span className="add-photos-word">{copy.photos.addPhotos}</span>
    </AriaButton>
  );
}

/** The NC row's "Adicionar foto" with its reason, and the denied reason under it (then "Adicionar fotos", Story 6.4). */
export function RowPhotoAction({ relatorioId, target, onAddPhotos }: { relatorioId: string; target: () => CaptureTarget; onAddPhotos?: () => void }) {
  const t = copy.photos;
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera(relatorioId, target, opener);
  const reasonId = useId();
  const deniedId = useId();
  return (
    <>
      <div className="row-wrap">
        <AriaButton
          ref={opener}
          className="btn btn-secondary"
          aria-describedby={camera.denied ? `${reasonId} ${deniedId}` : reasonId}
          onPress={camera.open}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-camera" />
          </svg>
          {t.addPhoto}
        </AriaButton>
        <span className="btn-reason" id={reasonId}>
          {t.addPhotoReason}
        </span>
      </div>
      {camera.denied ? (
        <>
          <p className="camera-denied" id={deniedId} role="status">
            {t.denied}
          </p>
          {onAddPhotos === undefined ? null : <AddPhotosButton onPress={onAddPhotos} />}
        </>
      ) : null}
      {camera.element}
    </>
  );
}

/** The Photo tile rows of one checklist item, in capture order. */
export function RowPhotoList({
  tiles,
  number,
  onRetry,
  onCaption,
}: {
  tiles: readonly PhotoTile[];
  number: number;
  onRetry: (fileId: string) => void;
  /** Story 6.5: "Legendar" on each tile opens the Caption composer. */
  onCaption?: (tile: PhotoTile) => void;
}) {
  const t = copy.photos;
  if (tiles.length === 0) return null;
  return (
    <div className="photo-list" role="group" aria-label={t.rowPhotosLabel(number)}>
      {tiles.map((tile, index) => (
        <PhotoRow
          key={tile.id}
          label={t.tileLabel(index + 1)}
          caption={tile.caption}
          thumb={tile.thumb}
          state={photoUploadState({ uploaded_at: tile.uploaded_at, localError: tile.upload_error })}
          onRetry={() => onRetry(tile.id)}
          {...(onCaption === undefined ? {} : { onCaption: () => onCaption(tile) })}
        />
      ))}
    </div>
  );
}
