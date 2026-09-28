import { burstCountText, cameraContextText } from '@app/domain';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button as AriaButton, Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';
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
 *
 * Story 9.1 ("Ler visor"): a burst may give each shot its own target (`shotTarget`, the
 * Measurement row the shot reads), the hint line naming the next one (`shotHint`); when there
 * is no next target the shutter is disabled and only "Concluir" is left.
 */

const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);

interface CameraSession {
  stream: MediaStream;
  target: CaptureTarget;
}

export interface CameraOptions {
  /** Story 8.2: the first shutter tap is the only one, and the view closes once it is saved. */
  singleShot?: boolean;
  /** Story 9.1: the target of the `shot`-th shot of the burst (0-based); null when nothing is left to shoot. */
  shotTarget?: (shot: number) => CaptureTarget | null;
  /** Story 9.1: the hint line before the `shot`-th shot ("Próxima leitura: …"). */
  shotHint?: (shot: number) => string;
  /** Story 9.1: the closing button's word ("Concluir"); default "Concluir fotos". */
  doneLabel?: string;
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
export function useCamera(
  relatorioId: string,
  target: () => CaptureTarget,
  opener: RefObject<HTMLElement | null>,
  options: CameraOptions = {},
): CameraControl {
  const single = options.singleShot === true;
  const { shotTarget, shotHint } = options;
  const capture = usePhotoCapture(relatorioId);
  const { showToast } = useToast();
  const [session, setSession] = useState<CameraSession | null>(null);
  const [denied, setDenied] = useState(false);
  const [burst, setBurst] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fallbackTarget = useRef<CaptureTarget | null>(null);
  // The session as the async callbacks see it (a state value in a closure can be stale).
  const sessionRef = useRef<CameraSession | null>(null);
  // A `getUserMedia` in flight: a second press waits for it instead of asking twice.
  const opening = useRef(false);
  const mounted = useRef(true);
  // Frame grabs not yet resolved: "Concluir fotos" waits for them before stopping the stream.
  const grabs = useRef(new Set<Promise<void>>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Story 8.2: in single-shot mode (the plate tile) the first shutter tap is the only one.
  const shotTaken = useRef(false);
  // ...and whether its frame was actually read and handed to the capture (its done toast).
  const shotGrabbed = useRef(false);
  // Story 9.1: the taps of this session (the index of the next shot's target) and the target
  // the tap in progress took, which its grab saves the frame with.
  const taken = useRef(0);
  const [takenCount, setTakenCount] = useState(0);
  const tapTarget = useRef<CaptureTarget | null>(null);

  const startSession = (next: CameraSession | null) => {
    sessionRef.current = next;
    if (next !== null) {
      shotTaken.current = false;
      shotGrabbed.current = false;
      taken.current = 0;
      setTakenCount(0);
    }
    setSession(next);
  };

  /** The shutter's tap: counted, unless a single-shot session already has its shot or no target is left. */
  const shutter = (): boolean => {
    if (single && shotTaken.current) return false;
    if (shotTarget !== undefined) {
      const target = shotTarget(taken.current);
      if (target === null) return false;
      tapTarget.current = target;
    }
    shotTaken.current = true;
    taken.current += 1;
    setTakenCount(taken.current);
    setBurst((n) => n + 1);
    return true;
  };

  // The opener takes the focus back once the view is gone, after React Aria's own restore
  // (which a re-render of the sheet during the burst -- the new tiles -- can leave on the
  // page body). E6-Q6: the new tiles' rows commit after the view closes, on the live query's
  // own schedule (later still on a loaded device), and that re-render can drop the focus
  // again once it was returned; so the opener is watched, as a list's focus is after a write,
  // and takes the focus back whenever it was lost, until the rows have settled.
  const returnFocus = useCallback(() => {
    restoreFocus(
      () => {
        const target = opener.current;
        return target === null || document.querySelector('.camera-view') !== null ? null : target;
      },
      { frames: LIST_FOCUS_WATCH_FRAMES },
    );
  }, [opener]);

  const open = () => {
    if (!capture.ready || sessionRef.current !== null || opening.current) return;
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
    opening.current = true;
    media.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(
      (stream) => {
        opening.current = false;
        // Resolved after the sheet went, or over a session already open: never left live.
        if (!mounted.current || sessionRef.current !== null) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        startSession({ stream, target: context });
      },
      (error: unknown) => {
        opening.current = false;
        if (!mounted.current) return;
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

  /** One grab of the shutter: tracked until it resolves, then saved (or reported). */
  const grab = (frame: Promise<ImageBitmap>) => {
    const target = tapTarget.current ?? sessionRef.current?.target ?? null;
    tapTarget.current = null;
    const done: Promise<void> = frame.then(
      (bitmap) => {
        if (target === null) {
          bitmap.close();
          return;
        }
        shotGrabbed.current = true;
        capture.shoot(bitmap, target);
      },
      () => {
        setBurst((n) => Math.max(0, n - 1));
        showToast(copy.photos.failedToast);
      },
    );
    grabs.current.add(done);
    void done.finally(() => grabs.current.delete(done));
    // Story 8.2: a single shot closes the camera by itself once it is saved.
    if (single) finish();
  };

  const finishing = useRef(false);

  const end = (ending: CameraSession | null) => {
    startSession(null);
    ending?.stream.getTracks().forEach((track) => track.stop());
    returnFocus();
  };

  /** "Fechar a câmera sem concluir": the shots already taken keep saving behind it. */
  const close = () => {
    end(sessionRef.current);
    void capture.settle().then(() => setBurst(0));
  };

  /** "Concluir fotos" waits for every pending commit, then closes and says so. */
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    const ending = sessionRef.current;
    // A shot whose frame is still being read joins the commit queue before it is awaited,
    // and the stream stays live until then.
    void Promise.allSettled([...grabs.current])
      .then(() => capture.settle())
      .then((allSaved) => {
        finishing.current = false;
        end(ending);
        setBurst(0);
        // A single shot whose frame could not be read already said so ("failedToast").
        if (!allSaved) return;
        if (!single) showToast(copy.photos.doneToast);
        else if (shotGrabbed.current) showToast(copy.photos.doneOneToast);
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
      if (allSaved) showToast(single ? copy.photos.doneOneToast : copy.photos.doneToast);
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
          hint={shotHint === undefined ? null : shotHint(takenCount)}
          shutterDisabled={shotTarget !== undefined && shotTarget(takenCount) === null}
          doneLabel={options.doneLabel ?? null}
          onShutter={shutter}
          onGrab={grab}
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
  hint,
  shutterDisabled,
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
  doneLabel: string | null;
  /** Counts the tap; false when the tap takes no shot (a single-shot view already has it). */
  onShutter: () => boolean;
  /** The frame being read for this tap (rejects when there is none). */
  onGrab: (frame: Promise<ImageBitmap>) => void;
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
    if (!onShutter()) return;
    const element = video.current;
    onGrab(element === null ? Promise.reject(new Error('no viewfinder')) : grabFrame(element));
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
          <p className="cam-hint" aria-live="polite">
            {hint ?? t.hint}
          </p>
          <div className="cam-bottom">
            <span className="cam-link" aria-hidden="true" />
            <AriaButton className="cam-shutter" aria-label={t.shutter} onPress={fire} isDisabled={shutterDisabled} autoFocus>
              <span aria-hidden="true" />
            </AriaButton>
            <AriaButton className="btn btn-secondary cam-done" onPress={onDone}>
              {doneLabel ?? t.done}
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
