import { photoUploadState } from '@app/domain';
import { PHOTO_ACCEPT } from '../../files/photo-import.ts';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
export function useSheetCamera(relatorioId: string, target: () => CaptureTarget): { button: ReactNode; note: ReactNode; denied: boolean } {
  const t = copy.photos;
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera(relatorioId, target, opener);
  const deniedId = useId();
  useAriaBusy(opener, camera.opening);
  return {
    button: (
      <>
        <AriaButton
          ref={opener}
          className="camera-capture-btn"
          aria-label={t.takePhoto}
          data-count={camera.burst > 0 ? String(camera.burst) : ''}
          aria-describedby={camera.denied ? deniedId : undefined}
          data-state={camera.opening ? 'opening' : undefined}
          onPress={camera.open}
        >
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-camera" />
          </svg>
          <span className="cam-word" aria-hidden="true">
            {t.camWord}
          </span>
        </AriaButton>
        <CameraOpeningStatus opening={camera.opening} />
        {camera.element}
      </>
    ),
    note: camera.denied ? (
      <p className="camera-denied" id={deniedId} role="status">
        {t.denied}
      </p>
    ) : null,
    // Story 11.11: "Adicionar fotos" opens the Photo capture sheet only once this camera was refused.
    denied: camera.denied,
  };
}

/**
 * Story 8.2 (`60-ficha.html` nameplate "empty" state): the "Fotografar placa" tile above the
 * nameplate fields. The camera opens straight away and closes by itself after one shot; the
 * shot is a normal sheet photo created with the plate reading (`target().reading`). A
 * refused camera shows its reason under the tile. No "Digitar" link (D-6: the fields are
 * always there). From the shutter until the photo's stored row replaces this group, the
 * plate row's pending variant (`pendingRow`, review 2026-10-08 CAPT-16) shows instead.
 */
export function PlateCaptureTile({ relatorioId, target, pendingRow }: { relatorioId: string; target: () => CaptureTarget; pendingRow: ReactNode }) {
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera(relatorioId, target, opener, { singleShot: true });
  const deniedId = useId();
  useAriaBusy(opener, camera.opening);
  // F-13: from the shutter on, the plate's row shows its reading state at once ("Lendo…", or
  // the queued words offline), before the photo's committed row replaces this group. A shot
  // that never lands gives the tile back.
  const [shot, setShot] = useState(false);
  if (camera.burst > 0 && !shot) setShot(true);
  useEffect(() => {
    if (!shot || camera.burst > 0) return;
    const timer = setTimeout(() => setShot(false), PLATE_SHOT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [shot, camera.burst]);
  // Review F-01: `camera.element` keeps one place in the tree whichever branch shows (the
  // pending shot's row or the tile), so the camera view and its `<video>` are never replaced
  // while the shot is being read.
  const t = copy.ficha.nameplate;
  const content = shot ? (
    pendingRow
  ) : (
    <>
      {/* F-26: while the camera is asked for, the tile says so and keeps its name ("never a silent no-op"). */}
      <AriaButton
        ref={opener}
        className="camera-capture-tile"
        aria-label={t.takePlate}
        aria-describedby={camera.denied ? deniedId : undefined}
        data-state={camera.opening ? 'opening' : undefined}
        onPress={camera.open}
      >
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-camera" />
        </svg>
        {t.takePlate}
        {camera.opening ? <span className="camera-opening">{t.opening}</span> : null}
      </AriaButton>
      <CameraOpeningStatus opening={camera.opening} />
      {camera.denied ? (
        <p className="camera-denied" id={deniedId} role="status">
          {copy.photos.denied}
        </p>
      ) : null}
    </>
  );
  return (
    <>
      {content}
      {camera.element}
    </>
  );
}

/**
 * F-26: `aria-busy` on an opener while its camera is being opened. React Aria's Button does not
 * forward `aria-busy` (its DOM prop filter), and its `isPending` would also disable the button,
 * which this state must not do; so the attribute is set on the element itself.
 */
function useAriaBusy(ref: RefObject<HTMLElement | null>, busy: boolean): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (busy) element.setAttribute('aria-busy', 'true');
    else element.removeAttribute('aria-busy');
  }, [ref, busy]);
}

/**
 * F-26: the visually hidden status line that says the camera is being opened (the permission
 * prompt may be up). Always mounted, empty when not opening, so a screen reader hears the text
 * when it appears in a live region it already knows.
 */
function CameraOpeningStatus({ opening }: { opening: boolean }) {
  return (
    <p className="visually-hidden camera-opening-status" role="status">
      {opening ? copy.ficha.nameplate.opening : ''}
    </p>
  );
}

/** F-13: how long a shot that has not landed as the plate's photo row keeps the pending row before the tile comes back. */
const PLATE_SHOT_GRACE_MS = 15_000;

/**
 * Story 11.11 (EXPERIENCE.md › Photo capture sheet): the system file picker, opened straight
 * from a press. `open` clicks a hidden `<input type=file multiple>` inside the press, so the
 * browser still counts the user's gesture; picked files go to `onFiles`, a cancelled picker
 * does nothing at all. `input` is rendered beside the opener.
 */
export function useDirectPicker(onFiles: (files: File[]) => void): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null);
  return {
    open: () => ref.current?.click(),
    input: (
      <input
        ref={ref}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-direct-input"
        onChange={(event) => {
          const list = [...(event.target.files ?? [])];
          event.target.value = '';
          if (list.length > 0) onFiles(list);
        }}
      />
    ),
  };
}

/**
 * Story 6.4: "Adicionar fotos" (`70-fotos.html` Sticky action bar, `btn btn-secondary` with
 * `i-image`), the import path beside the camera. Below 480 px its word is visually hidden so
 * the bar never runs wider than the phone (the button keeps its name). Story 11.11: with the
 * camera not refused it opens the system picker directly and hands the files on (`onFiles`);
 * with the camera denied it opens the Photo capture sheet (`onOpenSheet`).
 */
export function AddPhotosButton({ denied, onFiles, onOpenSheet }: { denied: boolean; onFiles?: (files: File[]) => void; onOpenSheet: () => void }) {
  const picker = useDirectPicker((files) => onFiles?.(files));
  const direct = !denied && onFiles !== undefined;
  return (
    <>
      <AriaButton className="btn btn-secondary add-photos-btn" onPress={direct ? picker.open : onOpenSheet}>
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-image" />
        </svg>
        <span className="add-photos-word">{copy.photos.addPhotos}</span>
      </AriaButton>
      {onFiles === undefined ? null : picker.input}
    </>
  );
}

/** The NC row's "Adicionar foto" with its reason, and the denied reason under it (then "Adicionar fotos", Story 6.4). */
export function RowPhotoAction({
  relatorioId,
  target,
  onAddPhotos,
  before,
}: {
  relatorioId: string;
  target: () => CaptureTarget;
  onAddPhotos?: () => void;
  /** Story 9.4 (`60-ficha.html` 384): the row's Dictation button, first on the same `.row-wrap`. */
  before?: ReactNode;
}) {
  const t = copy.photos;
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera(relatorioId, target, opener);
  const reasonId = useId();
  const deniedId = useId();
  return (
    <>
      <div className="row-wrap">
        {before}
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
          {/* Story 11.11: reached only from this denied camera, so it opens the Photo capture sheet. */}
          {onAddPhotos === undefined ? null : <AddPhotosButton denied onOpenSheet={onAddPhotos} />}
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
