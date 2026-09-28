import { captionPhotoMetaText, plateCropView, PLATE_CAPTION, regionWithin, type NormalizedBox, type PlateReadingView } from '@app/domain';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { TextButton } from '../../components/index.ts';
import { useCropSource } from '../../components/crop-thumb.tsx';
import { useObjectUrl } from '../../components/photo-row.tsx';
import { copy } from '../../copy/pt-br.ts';
import type { PhotoTile } from '../../db/photo-store.ts';
import { useSession } from '../../state/session.tsx';
import { requestSyncCycle, useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { PlateCaptureTile } from './photo-openers.tsx';
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
 */

/** No plate photo yet: the copy chips (if any) and the tile under them. */
export function PlateCameraGroup({ relatorioId, target, chips }: { relatorioId: string; target: () => CaptureTarget; chips: ReactNode }) {
  return (
    <div className="camera-group">
      {chips}
      <PlateCaptureTile relatorioId={relatorioId} target={target} />
    </div>
  );
}

/** The plate photo's row: the tile (opens the viewer), its caption and meta, and the reading line. */
export function PlatePhotoRow({
  tile,
  number,
  view,
  onOpen,
  onFillManually,
}: {
  tile: PhotoTile;
  number: number | null;
  view: Exclude<PlateReadingView, 'ready'>;
  onOpen: () => void;
  /** The failure's actions ("Tentar novamente", "Preencher manualmente"); none on a read-only sheet. */
  onFillManually: (() => void) | null;
}) {
  const t = copy.ficha.nameplate;
  const src = useObjectUrl(tile.thumb);
  return (
    <div className="photo-row ficha-np-photo" data-reading={view}>
      <AriaButton className="photo-tile" aria-label={t.plateTileLabel(number)} onPress={onOpen} data-photo-id={tile.id}>
        <span className="thumb">
          {src === null ? <span className="thumb-fake" /> : <img className="thumb-img" src={src} alt="" />}
          {number === null ? null : (
            <span className="number-badge" aria-hidden="true">
              {number}
            </span>
          )}
        </span>
      </AriaButton>
      <div className="photo-text">
        <p className="photo-caption">{tile.caption ?? PLATE_CAPTION}</p>
        <p className="photo-meta">{captionPhotoMetaText(number, tile.captured_at)}</p>
        {view === 'queued' ? (
          <span className="queued-banner">
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-image" />
            </svg>
            {t.queued}
          </span>
        ) : null}
        {view === 'running' ? (
          <p className="reading-line" role="status">
            {t.reading}
          </p>
        ) : null}
        {view === 'failed' && onFillManually === null ? (
          <p className="reading-line" role="status">
            {t.readFailed}
          </p>
        ) : null}
        {/* E78-Q5: keyed by the newest status op, so a tap waits for the next one (a `failed` over `failed` included). */}
        {view === 'failed' && onFillManually !== null ? (
          <FailedReading key={tile.reading_status_op_id ?? 'create'} photoId={tile.id} onFillManually={onFillManually} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Não foi possível ler": the photo stays and nothing was written. "Tentar novamente" asks the
 * server for a new reading (offline it is disabled with its reason); "Preencher manualmente"
 * takes the engineer to the first empty field. E78-Q5: from the tap the button stays disabled
 * until the photo's reading status moves (the caller remounts this on every status op) or the
 * request fails, so a second tap never starts a second run.
 */
function FailedReading({ photoId, onFillManually }: { photoId: string; onFillManually: () => void }) {
  const t = copy.ficha.nameplate;
  const sync = useSync();
  const online = useSession().online;
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const retry = () => {
    if (asking || sync.rereadPhoto === undefined) return;
    setAsking(true);
    void sync
      .rereadPhoto(photoId)
      // The server moves the reading on (`running`, then suggestions or `failed` again); the
      // next pull brings it, now.
      .then(() => requestSyncCycle())
      .catch(() => {
        setAsking(false);
        showToast(t.retryFailed);
      });
  };
  return (
    <>
      <p className="reading-line" role="status">
        {t.readFailed}
      </p>
      <div className="row-wrap">
        <TextButton isDisabled={!online || asking} disabledReason={!online ? t.retryOffline : asking ? t.retryAsked : undefined} onPress={retry}>
          {t.retryRead}
        </TextButton>
        <TextButton onPress={onFillManually}>{t.fillManually}</TextButton>
      </div>
    </>
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
 */
export function PlateCrop({ photoId, region, focused, onOpen }: { photoId: string; region: NormalizedBox; focused: NormalizedBox | null; onOpen: () => void }) {
  const src = useObjectUrl(useCropSource(photoId));
  const box = useRef<HTMLSpanElement>(null);
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
  return (
    <button type="button" className="plate-crop-open" onClick={onOpen} data-photo-id={photoId}>
      <span className="plate-crop" role="img" aria-label={copy.ficha.nameplate.cropLabel} ref={box}>
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
    </button>
  );
}
