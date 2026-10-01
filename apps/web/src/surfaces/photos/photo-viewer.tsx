import { photoCitedByText, photoItemLine, photoStampFull, pointsCitingPhoto, toIso, viewerCountText, viewerLabel, type RelatorioSnapshot } from '@app/domain';
import { useEffect, useId, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, ConfirmDialog, PhotoStamp } from '../../components/index.ts';
import { useObjectUrl } from '../../components/photo-row.tsx';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { ensureLocalBlob, readLocalBlob } from '../../db/file-store.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { useSession } from '../../state/session.tsx';
import { useSyncActions } from '../../state/sync-actions.ts';
import './photos.css';

/*
 * Story 6.3 (`70-fotos.html` "Photo viewer", DESIGN.md › Photo viewer, EXPERIENCE.md ›
 * Photo viewer): one photo full screen on the dark surface. The top bar closes it ("Fechar")
 * and shows the number badge and "4 de 20 · nº provisório"; the photo is this device's
 * original, else the server's print copy (the thumb meanwhile); under it the full Photo
 * stamp, the checklist item line for a photo taken on a row, the caption, "Editar legenda",
 * "Remover" (a Confirm dialog first) and "Anterior / Próxima" walking the order the gallery
 * shows. Esc and "Fechar" hand the focus back to the tile (the gallery's `onClose`).
 */

export interface PhotoViewerProps {
  snapshot: RelatorioSnapshot;
  /** The photos in the order the gallery shows them (its filter applied). */
  tiles: readonly PhotoTile[];
  numbers: ReadonlyMap<string, number>;
  /** Story 7.2 (AC3): false while an issued revision froze the numbers (no "nº provisório"). */
  provisional?: boolean;
  /** The photo on screen. */
  photoId: string;
  onNavigate: (photoId: string) => void;
  onClose: () => void;
  onEditCaption: (tile: PhotoTile) => void;
  onRemove: (tile: PhotoTile) => void;
  /**
   * Story 8.1: a normalized region `[x0, y0, x1, y1]` of the photo on screen (a suggestion's
   * source `bbox`): the picture is scaled and centred on it and the region outlined.
   */
  zoom?: readonly [number, number, number, number] | null;
}

/** The best picture this device can show: its original, else the server's print copy, the thumb meanwhile. */
function useViewerPicture(tile: PhotoTile): Blob | null {
  const db = useSession().database;
  const { fetchFile } = useSyncActions();
  const [picture, setPicture] = useState<{ id: string; blob: Blob } | null>(null);
  useEffect(() => {
    if (db === null) return;
    let live = true;
    void (async () => {
      const local = await readLocalBlob(db, tile.id);
      const blob = local !== null && local.variant === 'original' ? local.blob : await ensureLocalBlob(db, tile.id, 'print', { fetchFile, nowIso: toIso(now()) });
      if (live && blob !== null) setPicture({ id: tile.id, blob });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [db, fetchFile, tile.id]);
  return picture !== null && picture.id === tile.id ? picture.blob : tile.thumb;
}

export function PhotoViewer(props: PhotoViewerProps) {
  const titleId = useId();
  const index = props.tiles.findIndex((tile) => tile.id === props.photoId);
  const tile = index < 0 ? null : props.tiles[index]!;
  return (
    <DialogShell className="photo-viewer" overlayClassName="scrim-viewer" isOpen={tile !== null} onOpenChange={(open) => (open ? undefined : props.onClose())} aria-labelledby={titleId}>
      {tile === null ? null : <ViewerBody {...props} tile={tile} index={index} titleId={titleId} />}
    </DialogShell>
  );
}

function ViewerBody({
  snapshot,
  tiles,
  numbers,
  provisional = true,
  tile,
  index,
  titleId,
  onNavigate,
  onClose,
  onEditCaption,
  onRemove,
  zoom = null,
}: PhotoViewerProps & { tile: PhotoTile; index: number; titleId: string }) {
  const t = copy.viewer;
  const countId = useId();
  const [confirming, setConfirming] = useState(false);
  const number = numbers.get(tile.id) ?? index + 1;
  const total = numbers.size;
  const src = useObjectUrl(useViewerPicture(tile));
  const item = photoItemLine(tile, snapshot);
  // E6-Q11: the Remover confirm names the points that cite this photo.
  const cited = photoCitedByText(pointsCitingPhoto(snapshot.points, tile.id));
  const previous = index > 0 ? tiles[index - 1]! : null;
  const next = index < tiles.length - 1 ? tiles[index + 1]! : null;

  return (
    <>
      <h2 className="visually-hidden" id={titleId}>
        {viewerLabel(number, total)}
      </h2>
      <div className="viewer-top">
        <AriaButton className="icon-btn" aria-label={t.close} onPress={onClose}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-close" />
          </svg>
        </AriaButton>
        <span className="number-badge" aria-hidden="true">
          {number}
        </span>
        <span className="viewer-count" id={countId}>
          {viewerCountText(number, total, provisional)}
        </span>
      </div>
      <div className="viewer-photo">
        {src === null ? (
          <span className="thumb-fake" />
        ) : zoom === null ? (
          <img className="viewer-img" src={src} alt={tile.caption ?? viewerLabel(number, total)} />
        ) : (
          <ZoomedPicture key={src} src={src} zoom={zoom} alt={tile.caption ?? viewerLabel(number, total)} />
        )}
      </div>
      <div className="viewer-bottom">
        <PhotoStamp text={photoStampFull(tile)} gps={tile.coords !== null} className="photo-stamp is-full viewer-stamp" />
        {item === null ? null : (
          <p className="photo-stamp is-full viewer-item">
            {item.result === null ? (
              item.head
            ) : (
              <>
                {item.head} · <span className={item.nc ? 'stamp-nc' : undefined}>{item.result}</span>
              </>
            )}
          </p>
        )}
        {tile.caption === null ? null : <p className="viewer-caption-text">{tile.caption}</p>}
        <div className="viewer-actions">
          <Button variant="secondary" block onPress={() => onEditCaption(tile)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-pencil" />
            </svg>
            {t.editCaption}
          </Button>
          <Button variant="destructive" block onPress={() => setConfirming(true)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-trash" />
            </svg>
            {t.remove}
          </Button>
        </div>
        <div className="viewer-nav">
          <Button variant="secondary" isDisabled={previous === null} disabledReasonId={countId} onPress={() => previous !== null && onNavigate(previous.id)}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-left" />
            </svg>
            {t.previous}
          </Button>
          <Button variant="secondary" isDisabled={next === null} disabledReasonId={countId} onPress={() => next !== null && onNavigate(next.id)}>
            {t.next}
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-chev-right" />
            </svg>
          </Button>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t.removeTitle(number)}
        description={
          cited === null ? (
            t.removeDescription
          ) : (
            <>
              {t.removeDescription} <span className="viewer-cited">{cited}</span>
            </>
          )
        }
        confirmLabel={t.removeConfirm}
        isDestructive
        onConfirm={() => onRemove(tile)}
      />
    </>
  );
}

/**
 * Story 8.1: the picture scaled and centred on a region, the region outlined. The picture's
 * own size is read from the image first (drawn whole meanwhile); then an SVG whose viewBox
 * is the region with a margin around it draws the picture and the outline in its pixels.
 */
function ZoomedPicture({ src, zoom, alt }: { src: string; zoom: readonly [number, number, number, number]; alt: string }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (size === null) {
    return <img className="viewer-img" src={src} alt={alt} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />;
  }
  const [x0, y0, x1, y1] = zoom;
  const x = x0 * size.width;
  const y = y0 * size.height;
  const w = Math.max((x1 - x0) * size.width, 1);
  const h = Math.max((y1 - y0) * size.height, 1);
  const margin = Math.max(w, h) * 0.5;
  const viewBox = `${x - margin} ${y - margin} ${w + 2 * margin} ${h + 2 * margin}`;
  return (
    <svg className="viewer-img viewer-zoom" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={alt} data-zoom={zoom.join(',')}>
      <image href={src} x={0} y={0} width={size.width} height={size.height} />
      <rect className="viewer-zoom-region" x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
