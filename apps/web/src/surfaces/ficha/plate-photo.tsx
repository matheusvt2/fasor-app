import { captionPhotoMetaText, plateCropView, PLATE_CAPTION, readingNeedsAi, readingWaitStart, regionWithin, type NormalizedBox, type PlateReadingView } from '@app/domain';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useCropSource } from '../../components/crop-thumb.tsx';
import { useObjectUrl } from '../../components/photo-row.tsx';
import { copy } from '../../copy/pt-br.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { usePinchZoom } from '../../input/use-pinch-zoom.ts';
import { useAiFeatures } from '../../state/ai-features.tsx';
import { useServerReachable } from '../../state/sync.tsx';
import { useCamera } from './camera-view.tsx';
import { PlateCaptureTile } from './photo-openers.tsx';
import { CancelledReading, EmptyReading, FailedReading, ReadingWaitLine, useReadingCancelled, useRereadAt } from './reading-line.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Stories 8.2 and 8.6 (`60-ficha.html` nameplate states "empty", "queued", "ready" and
 * "fail", lines ~313-341; EXPERIENCE.md › Nameplate states): the plate photo above the
 * nameplate fields, which stay typeable whatever happens here.
 *
 * - no plate photo: `.camera-group`, the copy chips then the "Fotografar placa" tile;
 * - a plate photo whose reading is queued, running, failed or done: its `.photo-row` with
 *   the reading line ("Foto guardada — leitura quando houver sinal", "Lendo…", "Não foi
 *   possível ler" with "Tentar novamente" and "Preencher manualmente");
 * - suggestions read from it waiting for a tap: the `.plate-crop` of the read region, the
 *   focused field's own region outlined, which opens the Photo viewer zoomed on it.
 *
 * Which photo, which state and which region are the kernel's (`platePhotoOf`,
 * `plateReadingView`, `plateCropRegion`, `regionWithin`); this only draws them.
 *
 * Review 2026-10-08: a reading that ended with nothing read is "Nada foi lido nesta foto" with
 * "Fotografar de novo" (one shot, the plate target; the row hosts its camera, so the view is
 * never replaced when the new photo takes the row) and "Preencher manualmente" (CAPT-V1). The
 * pending shot's row, before its photo is stored, is this row's pending variant
 * (`PlatePendingRow`), on the same server-reachability rule (CAPT-V2, CAPT-16). The wait counts
 * only once the server holds the bytes (DG-4, `readingWaitStart`).
 */

/** No plate photo yet: the copy chips (if any) and the tile under them. */
export function PlateCameraGroup({ relatorioId, target, chips }: { relatorioId: string; target: () => CaptureTarget; chips: ReactNode }) {
  return (
    <div className="camera-group">
      {chips}
      <PlateCaptureTile relatorioId={relatorioId} target={target} pendingRow={<PlatePendingRow />} />
    </div>
  );
}

/** The thumbnail box of a plate row: the stored thumb, else the placeholder. */
function PlateThumb({ src, number }: { src: string | null; number: number | null }) {
  return (
    <span className="thumb">
      {src === null ? <span className="thumb-fake" /> : <img className="thumb-img" src={src} alt="" />}
      {number === null ? null : (
        <span className="number-badge" aria-hidden="true">
          {number}
        </span>
      )}
    </span>
  );
}

/**
 * F-13, CAPT-16: the pending variant of the plate row, from the shutter until the photo's
 * stored row replaces it: the placeholder, the caption and the reading state at once. CAPT-V2:
 * the same rule as the stored row (`useServerReachable`): "Lendo…" only with the server
 * reachable, the waiting words otherwise (a captive network reads `navigator.onLine` true).
 */
export function PlatePendingRow() {
  const t = copy.ficha.nameplate;
  const reachable = useServerReachable();
  return (
    <div className="photo-row ficha-np-photo" data-reading={reachable ? 'running' : 'queued'} data-pending-shot="">
      <span className="photo-tile">
        <PlateThumb src={null} number={null} />
      </span>
      <div className="photo-text">
        <p className="photo-caption">{PLATE_CAPTION}</p>
        {reachable ? (
          <p className="reading-line" role="status">
            {t.reading}
          </p>
        ) : (
          <span className="queued-banner" role="status">
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {t.queued}
          </span>
        )}
      </div>
    </div>
  );
}

/** CAPT-V1: what "Fotografar de novo" on an empty plate reading needs: the camera's relatório, the plate's shot target, and what a taken shot does to the older plate photos. */
export interface PlateRetake {
  relatorioId: string;
  target: () => CaptureTarget;
  /** The shot is stored (with `target`, whose `fileId` is the new photo's): the older plate photos' readings are cancelled here. */
  onShot: (target: CaptureTarget) => void;
}

/** The plate photo's row: the tile (opens the viewer), its caption and meta, and the reading line. */
export function PlatePhotoRow({
  tile,
  number,
  view,
  onOpen,
  onFillManually,
  retake,
}: {
  tile: PhotoTile;
  number: number | null;
  view: Exclude<PlateReadingView, 'ready'>;
  onOpen: () => void;
  /** The failure's actions ("Tentar novamente", "Preencher manualmente"); none on a read-only sheet. */
  onFillManually: (() => void) | null;
  /** CAPT-V1: the empty reading's "Fotografar de novo"; null (or absent) where it is not offered. */
  retake?: PlateRetake | null;
}) {
  const t = copy.ficha.nameplate;
  const aiFeatures = useAiFeatures();
  const src = useObjectUrl(tile.thumb);
  // CAPT-V1: the retake camera lives here, in the row that stays mounted while the new shot
  // replaces the photo (review F-01's precedent): its view and `<video>` are never replaced.
  // The focus goes back to "Fotografar de novo", or to the row's tile once the line is gone.
  const row = useRef<HTMLDivElement>(null);
  const opener = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const element = row.current;
        return element?.querySelector<HTMLElement>('[data-retake]') ?? element?.querySelector<HTMLElement>('.photo-tile') ?? null;
      },
    }),
    [],
  );
  const latestRetake = useRef(retake ?? null);
  latestRetake.current = retake ?? null;
  const camera = useCamera(
    retake?.relatorioId ?? '',
    () => latestRetake.current?.target() ?? { blockId: tile.block_id, itemKey: null, caption: PLATE_CAPTION },
    opener,
    { singleShot: true, onShot: (target) => latestRetake.current?.onShot(target) },
  );
  // F-13: with the server reachable a queued reading is about to run: "Lendo…", never the
  // waiting words, which are for a device without signal, or a photo whose upload failed
  // (its reading cannot start until the bytes are on the server).
  const reachable = useServerReachable();
  const shown = view === 'queued' && reachable && !tile.upload_error ? 'running' : view;
  // Story 13.5: a reading cancelled on this device shows no waiting line (the photo stays);
  // review F-07: it offers "Ler de novo" instead.
  const cancelled = useReadingCancelled(tile.id);
  // Epic 13 re-check N-1: after "Ler de novo" the wait counts from the press.
  const rereadAt = useRereadAt(tile.id);
  const canRetry = aiFeatures || tile.reading_kind === null || !readingNeedsAi(tile.reading_kind);
  // DG-4: "Lendo…" with no age and no "Cancelar" until the server holds the bytes.
  const startedAt = readingWaitStart({
    captured_at: tile.captured_at,
    bytes_acked_at: tile.bytes_acked_at ?? null,
    uploaded_at: tile.uploaded_at,
    reading_status_at: tile.reading_status_at ?? null,
    reread_at: rereadAt,
  });
  return (
    <div className="photo-row ficha-np-photo" data-reading={shown} ref={row}>
      <AriaButton className="photo-tile" aria-label={t.plateTileLabel(number)} onPress={onOpen} data-photo-id={tile.id}>
        <PlateThumb src={src} number={number} />
      </AriaButton>
      <div className="photo-text">
        <p className="photo-caption">{tile.caption ?? PLATE_CAPTION}</p>
        <p className="photo-meta">{captionPhotoMetaText(number, tile.captured_at)}</p>
        {shown === 'queued' && cancelled !== true ? (
          <span className="queued-banner">
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {t.queued}
          </span>
        ) : null}
        {/* Story 13.5: the age from 10 s, "Cancelar" and, past 120 s, the still-reading note. */}
        {cancelled === true && view !== 'failed' && onFillManually !== null ? <CancelledReading photoId={tile.id} canRetry={canRetry} /> : null}
        {shown === 'running' && cancelled !== true ? <ReadingWaitLine photoId={tile.id} startedAt={startedAt} variant="plate" /> : null}
        {/* CAPT-V1: nothing was read. A reading cancelled here keeps its "Ler de novo" alone. */}
        {view === 'empty' && cancelled === false && onFillManually === null ? (
          <p className="reading-line" role="status">
            {copy.readingWait.empty}
          </p>
        ) : null}
        {view === 'empty' && cancelled === false && onFillManually !== null ? (
          <EmptyReading
            onRetake={retake == null || !aiFeatures ? null : camera.open}
            retakeOpening={camera.opening}
            onFallback={onFillManually}
            fallbackLabel={t.fillManually}
          />
        ) : null}
        {camera.denied ? (
          <p className="camera-denied" role="status">
            {copy.photos.denied}
          </p>
        ) : null}
        {view === 'failed' && onFillManually === null ? (
          <p className="reading-line" role="status">
            {t.readFailed}
          </p>
        ) : null}
        {/* E78-Q5: keyed by the newest status op, so a tap waits for the next one (a `failed` over `failed` included). */}
        {view === 'failed' && onFillManually !== null ? (
          <FailedReading
            key={tile.reading_status_op_id ?? 'create'}
            photoId={tile.id}
            statusOpId={tile.reading_status_op_id}
            canRetry={canRetry}
            onFallback={onFillManually}
            fallbackLabel={t.fillManually}
          />
        ) : null}
      </div>
      {camera.element}
    </div>
  );
}

/** A percentage for a style, to a thousandth (no floating-point tail in the DOM). */
const pct = (n: number): string => `${Math.round(n * 1000) / 1000}%`;

/**
 * The plate crop (`60-ficha.html` `.plate-crop`, at most 160 px high, full width): the read
 * region of the plate photo fitted in the box with its aspect kept, zoomed to the focused
 * field's own region while one is focused (E78-R1), which is outlined as one `.region`. The picture is this device's original, else the
 * server's original kept as a `crop` blob; `.thumb-fake` meanwhile. A tap opens the Photo
 * viewer zoomed on the read region.
 *
 * Story 13.3 (CAP-3): two fingers pinch the crop and one pans it while zoomed, inside its box
 * (`usePinchZoom`, the focus view above as fit); a tap still opens the viewer, which carries
 * the zoom buttons. At fit a one-finger vertical drag scrolls the sheet (`touch-action: pan-y`);
 * another focused field returns to its own view.
 */
export function PlateCrop({ photoId, region, focused, onOpen }: { photoId: string; region: NormalizedBox; focused: NormalizedBox | null; onOpen: () => void }) {
  const src = useObjectUrl(useCropSource(photoId));
  const [size, setSize] = useState<{ src: string; width: number; height: number; boxRatio: number } | null>(null);
  const loaded = size !== null && size.src === src;
  // E78-R1: while a field is focused the crop zooms to that field's region (with a margin);
  // E78-Q14: once the picture's size is known, what is shown is widened to the box's own
  // aspect, so a tall narrow region fills the width (the kernel's `plateCropView`).
  const shown = plateCropView(region, focused, loaded ? size : null, loaded ? size.boxRatio : 0);
  const [x0, y0, x1, y1] = shown;
  const w = x1 - x0;
  const h = y1 - y0;
  // The region's own aspect, in pixels of the picture: the view keeps it inside the box.
  const ratio = loaded ? (w * size.width) / Math.max(h * size.height, 1) : null;
  const outline = focused === null ? null : regionWithin(shown, focused);
  const viewStyle = ratio === null ? undefined : ({ '--plate-crop-ratio': String(ratio) } as CSSProperties);
  // What is drawn at fit, in pixels of the picture: the zoom's maximum is its native resolution.
  const pinch = usePinchZoom({ content: loaded ? { width: w * size.width, height: h * size.height } : null, resetKey: `${photoId}|${focused?.join(',') ?? ''}` });
  const box = pinch.stageRef as RefObject<HTMLSpanElement | null>;
  return (
    <button
      type="button"
      className="plate-crop-open"
      onClick={(event) => {
        // The click that ends a pinch or a pan is not a tap; a keyboard press (no pointer, `detail` 0) always opens.
        const gesture = pinch.takeGesture();
        if (event.detail === 0 || !gesture) onOpen();
      }}
      data-photo-id={photoId}
    >
      <span
        className="plate-crop"
        role="img"
        aria-label={copy.ficha.nameplate.cropLabel}
        ref={box}
        {...pinch.handlers}
        data-zoom-scale={String(Math.round(pinch.scale * 1000) / 1000)}
        style={{ touchAction: pinch.scale > 1 ? 'none' : 'pan-y' }}
      >
        <span className="plate-crop-zoom" style={pinch.pictureStyle}>
        {/* Until the picture is drawn the view fills the box over the placeholder, outline included. */}
        <span className="plate-crop-view" style={viewStyle} data-fitted={ratio === null ? undefined : ''}>
          {loaded ? null : <i className="thumb-fake" />}
          {src === null ? null : (
            <img
              src={src}
              alt=""
              hidden={!loaded}
              style={{ width: pct(100 / w), height: pct(100 / h), left: pct((-x0 / w) * 100), top: pct((-y0 / h) * 100) }}
              onLoad={(event) => {
                const frame = box.current;
                const boxRatio = frame !== null && frame.clientHeight > 0 ? frame.clientWidth / frame.clientHeight : 0;
                setSize({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight, boxRatio });
              }}
            />
          )}
          {outline === null ? null : (
            <span className="region" data-testid="plate-crop-region" style={{ left: pct(outline.left), top: pct(outline.top), width: pct(outline.width), height: pct(outline.height) }} />
          )}
        </span>
        </span>
      </span>
    </button>
  );
}
