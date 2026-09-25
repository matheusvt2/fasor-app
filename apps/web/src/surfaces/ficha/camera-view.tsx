import { burstCountText, cameraContextText } from '@app/domain';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button as AriaButton, Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';
import { useToast } from '../../state/toast.tsx';
import { usePhotoCapture, type CaptureTarget } from './use-photo-capture.ts';

/*
 * Story 6.1 (FR-43, UX-DR17; `70-fotos.html` "Direct camera"): the in-app burst camera. The
 * opener goes straight to the viewfinder -- no chooser, no caption composer -- and the view
 * stays open after each "Disparar" until "Concluir fotos", counting the burst on the
 * opener's badge and in the status line. Each shot is saved at once with the context
 * caption fixed when the camera opened. A denied camera shows its reason and the OS path
 * under the opener (never a dialog, never a silent no-op); a browser with no camera API
 * falls back to the system camera through a hidden `capture` file input, one shot.
 */

const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);

interface CameraSession {
  stream: MediaStream;
  target: CaptureTarget;
}

export interface CameraControl {
  /** Opens the camera for the target the caller computes now (the section on screen). */
  open: () => void;
  /** The camera was refused: the opener shows `.camera-denied` under itself. */
  denied: boolean;
  /** Shots of the burst in progress (the opener's `data-count` badge); 0 when none. */
  burst: number;
  /** The camera view and the fallback input; render it beside the opener. */
  element: ReactNode;
}

/**
 * The camera behind one opener. `target` is read when the opener is pressed, so the caption
 * follows the section on screen at that moment; `opener` gets the focus back on close.
 */
export function useCamera(relatorioId: string, target: () => CaptureTarget, opener: RefObject<HTMLElement | null>): CameraControl {
  const capture = usePhotoCapture(relatorioId);
  const { showToast } = useToast();
  const [session, setSession] = useState<CameraSession | null>(null);
  const [denied, setDenied] = useState(false);
  const [burst, setBurst] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fallbackTarget = useRef<CaptureTarget | null>(null);

  // The opener takes the focus back once the view is gone, after React Aria's own restore
  // (which a re-render of the sheet during the burst -- the new tiles -- can leave on the
  // page body). A few frames, so the overlay has unmounted first.
  const returnFocus = useCallback(() => {
    let frames = 0;
    const tick = () => {
      if (++frames < 3) {
        requestAnimationFrame(tick);
        return;
      }
      const target = opener.current;
      if (target === null || !target.isConnected || document.querySelector('.camera-view') !== null) return;
      if (document.activeElement !== target) target.focus();
    };
    requestAnimationFrame(tick);
  }, [opener]);

  const open = () => {
    if (!capture.ready || session !== null) return;
    const context = target();
    setDenied(false);
    void capture.prepare();
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media === undefined || typeof media.getUserMedia !== 'function') {
      // No camera API: the system camera, one shot. Clicked inside the press, so the
      // browser still counts the user's gesture.
      fallbackTarget.current = context;
      fileInput.current?.click();
      return;
    }
    media.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(
      (stream) => setSession({ stream, target: context }),
      (error: unknown) => {
        const name = (error as { name?: unknown } | null)?.name;
        if (typeof name === 'string' && DENIED_ERRORS.has(name)) {
          setDenied(true);
          return;
        }
        // No camera on this device (NotFoundError and the like): the system picker.
        fallbackTarget.current = context;
        fileInput.current?.click();
      },
    );
  };

  const shoot = (bitmap: ImageBitmap) => {
    if (session === null) {
      bitmap.close();
      return;
    }
    capture.shoot(bitmap, session.target);
  };

  const finishing = useRef(false);

  const end = (ending: CameraSession | null) => {
    setSession(null);
    ending?.stream.getTracks().forEach((track) => track.stop());
    returnFocus();
  };

  /** "Fechar a câmera sem concluir": the shots already taken keep saving behind it. */
  const close = () => {
    end(session);
    void capture.settle().then(() => setBurst(0));
  };

  /** "Concluir fotos" waits for every pending commit, then closes and says so. */
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    const ending = session;
    void capture.settle().then((allSaved) => {
      finishing.current = false;
      end(ending);
      setBurst(0);
      if (allSaved) showToast(copy.photos.doneToast);
    });
  };

  const onFallbackFile = (file: File | undefined) => {
    const context = fallbackTarget.current;
    fallbackTarget.current = null;
    if (file === undefined || context === null) return;
    setBurst(1);
    capture.shoot(file, context);
    void capture.settle().then((allSaved) => {
      setBurst(0);
      if (allSaved) showToast(copy.photos.doneToast);
      returnFocus();
    });
  };

  const element = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        data-testid="camera-fallback-input"
        onChange={(event) => {
          onFallbackFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {session === null ? null : (
        <CameraView
          stream={session.stream}
          caption={session.target.caption}
          count={burst}
          onShutter={() => setBurst((n) => n + 1)}
          onFrame={shoot}
          onFrameFailed={() => {
            setBurst((n) => Math.max(0, n - 1));
            showToast(copy.photos.failedToast);
          }}
          onDone={finish}
          onClose={close}
        />
      )}
    </>
  );

  return { open, denied, burst, element };
}

/** One frame of the live stream, decoded; waits for the first frame when the stream has none yet. */
async function grabFrame(video: HTMLVideoElement): Promise<ImageBitmap> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no video frame')), 3000);
      video.addEventListener(
        'loadeddata',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
  return createImageBitmap(video);
}

function CameraView({
  stream,
  caption,
  count,
  onShutter,
  onFrame,
  onFrameFailed,
  onDone,
  onClose,
}: {
  stream: MediaStream;
  caption: string | null;
  count: number;
  onShutter: () => void;
  onFrame: (bitmap: ImageBitmap) => void;
  onFrameFailed: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = copy.photos;
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  // The stream stops whenever the view goes, however it goes.
  useEffect(() => () => stream.getTracks().forEach((track) => track.stop()), [stream]);

  const markModal = useCallback((element: HTMLElement | null) => {
    element?.setAttribute('aria-modal', 'true');
  }, []);

  const fire = () => {
    // The count moves at the tap (the badge and the status line); the shot saves behind it.
    onShutter();
    const element = video.current;
    if (element === null) {
      onFrameFailed();
      return;
    }
    grabFrame(element).then(onFrame, onFrameFailed);
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
              {cameraContextText(caption)}
            </span>
          </div>
          <div className="cam-finder" role="img" aria-label={t.finderLabel}>
            <video ref={video} className="cam-video" autoPlay playsInline muted />
            <span className="cam-corner tl" aria-hidden="true" />
            <span className="cam-corner tr" aria-hidden="true" />
            <span className="cam-corner bl" aria-hidden="true" />
            <span className="cam-corner br" aria-hidden="true" />
          </div>
          <p className="cam-hint">{t.hint}</p>
          <div className="cam-bottom">
            <span className="cam-link" aria-hidden="true" />
            <AriaButton className="cam-shutter" aria-label={t.shutter} onPress={fire} autoFocus>
              <span aria-hidden="true" />
            </AriaButton>
            <AriaButton className="btn btn-secondary cam-done" onPress={onDone}>
              {t.done}
            </AriaButton>
          </div>
          <p className="cam-count" role="status">
            {count === 0 ? t.burstIdle : burstCountText(count)}
          </p>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
