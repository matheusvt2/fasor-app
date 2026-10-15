import { burstCountText, cameraContextText, cameraSavingText, cameraZoomText } from '@app/domain';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button as AriaButton, Dialog, Modal, ModalOverlay, ToggleButton } from 'react-aria-components';
import { useScreenWakeLock } from '../../input/use-screen-wake-lock.ts';
import { copy } from '../../copy/pt-br.ts';
import { cameraCapabilities, useCameraControls } from './camera-controls.ts';
import { frameAtTap, grabFrame, takePhotoOrGrab } from './camera-single-shot.tsx';
import { pendingStops, videoTrackOf } from './camera-stream.ts';

/*
 * E13-A6: the camera view itself (`camera-view.tsx` says what the camera does): the finder on
 * the session's stream, its controls, the hint and count lines, the shutter and "Concluir".
 */

export function CameraView({
  stream,
  caption,
  count,
  hint,
  shutterDisabled,
  refused,
  failed,
  saving,
  single,
  doneLabel,
  onShutter,
  onGrab,
  onDone,
  onClose,
}: {
  stream: MediaStream;
  caption: string | null;
  count: number;
  /** Story 9.1: the hint line in place of the default one. */
  hint: string | null;
  /** Story 9.1: nothing is left to shoot ("Nada mais a ler nesta ficha"). */
  shutterDisabled: boolean;
  /** Story 13.6: a refused shot is held; no other shot until it is stored. */
  refused: boolean;
  /** Review 2026-10-08 (FLD-V1): the last shot could not be read or saved; said in `.cam-hint` until the next one saves. */
  failed: boolean;
  /** Review 2026-10-08 (DB-4): the view waits for the shots to be saved before it closes. */
  saving: boolean;
  /** Story 13.1: the single shot is the camera's own photo where the browser can take one. */
  single: boolean;
  doneLabel: string | null;
  /** Counts the tap; false when the tap takes no shot (a single-shot view already has it). */
  onShutter: () => boolean;
  /** The shot being read for this tap (rejects when there is none). */
  onGrab: (frame: Promise<Blob | ImageBitmap>) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = copy.photos;
  const video = useRef<HTMLVideoElement>(null);
  // FLD-1: the screen stays awake while the camera is open.
  useScreenWakeLock(true);

  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  // The stream stops whenever the view goes, however it goes. Story 13.1: one task later, so
  // a development build's StrictMode remount (unmount and mount again in the same commit, the
  // e2e bundle's case) keeps the live stream instead of stopping it under the new view.
  useEffect(() => {
    clearTimeout(pendingStops.get(stream));
    pendingStops.delete(stream);
    return () => {
      pendingStops.set(
        stream,
        setTimeout(() => {
          pendingStops.delete(stream);
          stream.getTracks().forEach((track) => track.stop());
        }, 0),
      );
    };
  }, [stream]);

  const markModal = useCallback((element: HTMLElement | null) => {
    element?.setAttribute('aria-modal', 'true');
  }, []);

  const track = useMemo(() => videoTrackOf(stream), [stream]);
  const capabilities = useMemo(() => cameraCapabilities(track), [track]);
  const controls = useCameraControls(track, capabilities, video);

  const fire = () => {
    if (refused) return;
    // The count moves at the tap (the badge and the status line); the shot saves behind it.
    if (!onShutter()) return;
    const element = video.current;
    if (element === null) {
      onGrab(Promise.reject(new Error('no viewfinder')));
      return;
    }
    // Review F-01: a single shot reads the frame of the tap now, before `takePhoto()` is awaited.
    onGrab(single ? takePhotoOrGrab(track, element, frameAtTap(element)) : grabFrame(element));
  };

  return (
    <ModalOverlay className="dialog-scrim scrim-camera" isOpen isDismissable={false} onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}>
      <Modal className="dialog-modal">
        <Dialog className="camera-view" aria-label={t.cameraLabel} ref={markModal}>
          <div className="cam-top">
            <AriaButton className="icon-btn" aria-label={t.closeCamera} onPress={onClose}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-close" />
              </svg>
            </AriaButton>
            <span className="cam-context">
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-layers" />
              </svg>
              <span className="cam-context-text">{cameraContextText(caption)}</span>
            </span>
            {capabilities.torch ? (
              <ToggleButton className="icon-btn cam-torch" aria-label={t.torch} isSelected={controls.torch} onChange={controls.setTorch}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-flash" />
                </svg>
              </ToggleButton>
            ) : null}
          </div>
          <div
            className="cam-finder"
            role="img"
            aria-label={t.finderLabel}
            onPointerDown={controls.onPointerDown}
            onPointerMove={controls.onPointerMove}
            onPointerUp={controls.onPointerUp}
            onPointerCancel={controls.onPointerCancel}
          >
            <video ref={video} className="cam-video" autoPlay playsInline muted />
            <span className="cam-corner tl" aria-hidden="true" />
            <span className="cam-corner tr" aria-hidden="true" />
            <span className="cam-corner bl" aria-hidden="true" />
            <span className="cam-corner br" aria-hidden="true" />
            {controls.focusRing === null ? null : (
              <span key={controls.focusRing.key} className="cam-focus-ring" style={{ left: controls.focusRing.x, top: controls.focusRing.y }} aria-hidden="true" />
            )}
          </div>
          {capabilities.zoom === null ? null : (
            <div className="cam-zoom" role="group" aria-label={t.zoomGroup}>
              <AriaButton className="icon-btn cam-zoom-out" aria-label={t.zoomOut} onPress={controls.zoomOut} isDisabled={controls.zoom <= capabilities.zoom.min}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-minus" />
                </svg>
              </AriaButton>
              <span className="cam-zoom-value">{cameraZoomText(controls.zoom)}</span>
              <AriaButton className="icon-btn cam-zoom-in" aria-label={t.zoomIn} onPress={controls.zoomIn} isDisabled={controls.zoom >= capabilities.zoom.max}>
                <svg className="ico" aria-hidden="true">
                  <use href="/sprite.svg#i-plus" />
                </svg>
              </AriaButton>
            </div>
          )}
          <p className="cam-hint" aria-live="polite" data-state={refused ? 'refused' : failed ? 'failed' : undefined}>
            {refused ? (
              t.refusedHint
            ) : failed ? (
              <>
                {t.failedToast}
                {/* E9-Q7: the row the next shot fills stays named after the failure. */}
                {hint === null ? null : <> {hint}</>}
              </>
            ) : (
              (hint ?? t.hint)
            )}
          </p>
          <div className="cam-bottom">
            <span className="cam-link" aria-hidden="true" />
            <AriaButton className="cam-shutter" aria-label={t.shutter} onPress={fire} isDisabled={shutterDisabled || refused || saving} autoFocus>
              <span aria-hidden="true" />
            </AriaButton>
            <AriaButton className="btn btn-secondary cam-done" onPress={onDone} isDisabled={saving}>
              {doneLabel ?? t.done}
            </AriaButton>
          </div>
          <p className="cam-count" role="status" data-state={saving ? 'saving' : undefined}>
            {/* DB-4: the kernel names the shots being stored; none, the line keeps its words. */}
            {(saving ? cameraSavingText(count) : null) ?? (count === 0 ? t.burstIdle : burstCountText(count, refused))}
          </p>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
