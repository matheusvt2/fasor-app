import { burstCountText, cameraContextText, cameraZoomText } from '@app/domain';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { Button as AriaButton, Dialog, Modal, ModalOverlay, ToggleButton } from 'react-aria-components';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';
import { copy } from '../../copy/pt-br.ts';
import { sessionCaptureRescue } from '../../files/capture-rescue.ts';
import { useCaptureRefused } from '../../state/storage-reading.ts';
import { useServerReachable } from '../../state/sync.tsx';
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
 *
 * Story 13.1 (CAP-1): every session asks for the camera's full resolution (ideal 3840x2160)
 * and logs the track's settings once; a single shot is the camera's own photo
 * (`ImageCapture.takePhoto()`) where the browser has it, the frame grab otherwise or when
 * the photo fails or takes too long. Story 13.2 (CAP-2): torch, zoom (visible "-"/"+" and a
 * two-finger pinch on the finder) and tap-to-focus render only when the track offers them,
 * and the torch starts off in every session. Story 13.6 (CAP-4): while a refused shot is
 * held in memory the shutter is disabled with the reason in `.cam-hint`, and the opener
 * retries the held shot before it opens the camera again.
 */

const DENIED_ERRORS = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);

/**
 * Story 13.1: the stream every capture surface asks for. `zoom: true` is the non-required
 * pan-tilt-zoom request Chrome needs before it lists `zoom` in the track's capabilities; a
 * camera without PTZ falls back to the plain camera prompt, and a browser that does not know
 * the constraint ignores it (Spec Change Log, 2026-10-07).
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 }, zoom: true } as MediaTrackConstraints,
  audio: false,
};

/** Story 13.1: how long a single shot waits for `takePhoto()` before it grabs a frame instead. */
export const TAKE_PHOTO_TIMEOUT_MS = 2000;

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
  /**
   * Review fixes 2026-10-06 (F-26): the camera was asked for and has not answered (the browser's
   * permission prompt may be open): the opener reads "Abrindo câmera…" and a press does nothing.
   */
  opening: boolean;
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
  // Story 13.6: a refused shot is held in this tab; the camera takes no other shot until it is stored.
  const refused = useCaptureRefused();
  const { showToast } = useToast();
  // F-13: with the server reachable the toast does not speak of a queue.
  const reachable = useServerReachable();
  const [session, setSession] = useState<CameraSession | null>(null);
  const [denied, setDenied] = useState(false);
  const [burst, setBurst] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fallbackTarget = useRef<CaptureTarget | null>(null);
  // The session as the async callbacks see it (a state value in a closure can be stale).
  const sessionRef = useRef<CameraSession | null>(null);
  // A `getUserMedia` in flight: a second press waits for it instead of asking twice. F-26:
  // mirrored into state (`isOpening`) so the opener shows it; the ref stays the guard.
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);
  const setOpening = (value: boolean) => {
    opening.current = value;
    if (mounted.current) setIsOpening(value);
  };
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

  /** Asks for the stream (the opening state is already on) and opens the view on it. */
  const startStream = (media: MediaDevices, context: CaptureTarget) => {
    let request: Promise<MediaStream>;
    try {
      request = media.getUserMedia(CAMERA_CONSTRAINTS);
    } catch {
      // F-26: a camera API that throws at once (an old or broken one) is no camera: the
      // opening state ends and the system camera takes the shot, as with no API.
      setOpening(false);
      fallbackTarget.current = context;
      fileInput.current?.click();
      return;
    }
    request.then(
      (stream) => {
        setOpening(false);
        // Resolved after the sheet went, or over a session already open: never left live.
        if (!mounted.current || sessionRef.current !== null) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        logTrackSettings(stream);
        startSession({ stream, target: context });
      },
      (error: unknown) => {
        setOpening(false);
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

  const open = () => {
    if (!capture.ready || sessionRef.current !== null || opening.current) return;
    const context = target();
    setDenied(false);
    void capture.prepare();
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    const live = media !== undefined && typeof media.getUserMedia === 'function';
    // Story 13.6: a shot this tab could not store is still held. The system picker must open
    // inside the press, so it stays shut and the retry runs behind the toast; the live camera
    // tries the held shot first and opens only once it is stored or sent.
    if (sessionCaptureRescue.heldCount() > 0) {
      if (!live) {
        showToast(copy.photos.refusalToast);
        void capture.retry().catch(() => undefined);
        return;
      }
      setOpening(true);
      void capture.retry().then(
        (still) => {
          if (still > 0) {
            setOpening(false);
            if (mounted.current) showToast(copy.photos.refusalToast);
            return;
          }
          if (!mounted.current || sessionRef.current !== null) {
            setOpening(false);
            return;
          }
          startStream(media, context);
        },
        () => {
          setOpening(false);
          if (mounted.current) showToast(copy.photos.refusalToast);
        },
      );
      return;
    }
    if (!live) {
      // No camera API: the system camera, one shot. Clicked inside the press, so the
      // browser still counts the user's gesture.
      fallbackTarget.current = context;
      fileInput.current?.click();
      return;
    }
    setOpening(true);
    startStream(media, context);
  };

  /** One grab of the shutter: tracked until it resolves, then saved (or reported). */
  const grab = (frame: Promise<Blob | ImageBitmap>) => {
    const target = tapTarget.current ?? sessionRef.current?.target ?? null;
    tapTarget.current = null;
    // The index this tap's target was taken at (`shutter` counted it just before).
    const shot = taken.current - 1;
    const done: Promise<void> = frame.then(
      (photo) => {
        if (target === null) {
          if (!(photo instanceof Blob)) photo.close();
          return;
        }
        shotGrabbed.current = true;
        capture.shoot(photo, target);
      },
      () => {
        setBurst((n) => Math.max(0, n - 1));
        // E9-Q7: no photo for this tap, so the next shutter retries its row (a later tap that
        // already moved on keeps its own row).
        if (taken.current === shot + 1) {
          taken.current = shot;
          setTakenCount(shot);
        }
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
    // W-13: whatever happens to the settle (a refused commit that rejects), the view closes,
    // the stream stops and the next "Concluir fotos" is not swallowed by a stuck flag.
    let allSaved = false;
    void Promise.allSettled([...grabs.current])
      .then(() => capture.settle())
      .then((saved) => {
        allSaved = saved;
      })
      .catch(() => undefined)
      .finally(() => {
        finishing.current = false;
        end(ending);
        setBurst(0);
        // A single shot whose frame could not be read already said so ("failedToast").
        if (!allSaved) return;
        if (!single) showToast(reachable ? copy.photos.doneToastOnline : copy.photos.doneToast);
        else if (shotGrabbed.current) showToast(reachable ? copy.photos.doneOneToastOnline : copy.photos.doneOneToast);
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
      if (allSaved) showToast(single ? (reachable ? copy.photos.doneOneToastOnline : copy.photos.doneOneToast) : reachable ? copy.photos.doneToastOnline : copy.photos.doneToast);
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
          refused={refused}
          single={single}
          doneLabel={options.doneLabel ?? null}
          onShutter={shutter}
          onGrab={grab}
          onDone={finish}
          onClose={close}
        />
      )}
    </>
  );

  return { open, denied, burst, opening: isOpening, element };
}

/** A view's stream stop, deferred one task (see `CameraView`); a remount with the same stream cancels it. */
const pendingStops = new WeakMap<MediaStream, ReturnType<typeof setTimeout>>();

/** The stream's video track, or null (a stand-in stream may have no `getVideoTracks`). */
function videoTrackOf(stream: MediaStream): MediaStreamTrack | null {
  const tracks = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : stream.getTracks();
  return tracks[0] ?? null;
}

/** Story 13.1: what the camera actually gave this session (the size it streams at), once. */
function logTrackSettings(stream: MediaStream): void {
  const track = videoTrackOf(stream);
  if (track === null || typeof track.getSettings !== 'function') return;
  console.info('camera track settings', track.getSettings());
}

/** The zoom range a track offers. */
export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

/** Story 13.2: what the track lets the camera view control; each control renders only when offered. */
export interface CameraCapabilities {
  torch: boolean;
  zoom: ZoomRange | null;
  /** The focus mode a tap applies with its point of interest; null when focus is not offered. */
  focusMode: 'single-shot' | 'continuous' | 'manual' | null;
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
  focusMode?: string[];
  pointsOfInterest?: unknown;
};

const NO_CAPABILITIES: CameraCapabilities = { torch: false, zoom: null, focusMode: null };

/** Reads the track's capabilities; a browser without `getCapabilities` (or one that throws) offers nothing. */
export function cameraCapabilities(track: MediaStreamTrack | null): CameraCapabilities {
  if (track === null || typeof track.getCapabilities !== 'function') return NO_CAPABILITIES;
  let caps: ExtendedCapabilities;
  let settings: Record<string, unknown> = {};
  try {
    caps = track.getCapabilities() as ExtendedCapabilities;
    if (typeof track.getSettings === 'function') settings = track.getSettings() as Record<string, unknown>;
  } catch {
    return NO_CAPABILITIES;
  }
  const z = caps.zoom;
  const zoom =
    z !== undefined && typeof z.min === 'number' && typeof z.max === 'number' && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min
      ? { min: z.min, max: z.max, step: typeof z.step === 'number' && z.step > 0 ? z.step : 0 }
      : null;
  const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
  const points = 'pointsOfInterest' in caps || 'pointsOfInterest' in settings;
  const focusMode = modes.includes('single-shot')
    ? 'single-shot'
    : points && modes.includes('continuous')
      ? 'continuous'
      : points && modes.includes('manual')
        ? 'manual'
        : null;
  return { torch: caps.torch === true, zoom, focusMode };
}

/** `value` inside the range, on its step. */
export function clampZoom(value: number, range: ZoomRange): number {
  const clamped = Math.min(range.max, Math.max(range.min, Number.isFinite(value) ? value : range.min));
  if (!(range.step > 0)) return clamped;
  const snapped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, Number(snapped.toFixed(6))));
}

/** One press of "-" or "+": a tenth of the range, at least one step. */
export function zoomIncrement(range: ZoomRange): number {
  return Math.max(range.step, (range.max - range.min) / 10);
}

/**
 * Where a tap on the finder lands in the frame, 0..1 on each axis. The preview fills the
 * finder (`object-fit: cover`), so the frame's overflow is taken out first.
 */
export function framePoint(
  tap: { x: number; y: number },
  box: { width: number; height: number },
  frame: { width: number; height: number },
): { x: number; y: number } {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  if (box.width <= 0 || box.height <= 0) return { x: 0.5, y: 0.5 };
  if (frame.width <= 0 || frame.height <= 0) return { x: clamp(tap.x / box.width), y: clamp(tap.y / box.height) };
  const scale = Math.max(box.width / frame.width, box.height / frame.height);
  const offsetX = (box.width - frame.width * scale) / 2;
  const offsetY = (box.height - frame.height * scale) / 2;
  return { x: clamp((tap.x - offsetX) / scale / frame.width), y: clamp((tap.y - offsetY) / scale / frame.height) };
}

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}

/**
 * Story 13.1: the camera's own photo (full sensor resolution where the browser has
 * `ImageCapture`), or the frame grab when there is none, when it fails or when it has not
 * answered in `TAKE_PHOTO_TIMEOUT_MS`.
 */
async function takePhotoOrGrab(track: MediaStreamTrack | null, video: HTMLVideoElement): Promise<Blob | ImageBitmap> {
  const Capture = (globalThis as { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (Capture !== undefined && track !== null && track.readyState !== 'ended') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const photo = await Promise.race([
        new Capture(track).takePhoto(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('takePhoto timed out')), TAKE_PHOTO_TIMEOUT_MS);
        }),
      ]);
      if (photo instanceof Blob && photo.size > 0) return photo;
    } catch {
      // The frame grab below takes the shot instead.
    } finally {
      clearTimeout(timer);
    }
  }
  return grabFrame(video);
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
  refused,
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
    onGrab(single ? takePhotoOrGrab(track, element) : grabFrame(element));
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
          <p className="cam-hint" aria-live="polite" data-state={refused ? 'refused' : undefined}>
            {refused ? t.refusedHint : (hint ?? t.hint)}
          </p>
          <div className="cam-bottom">
            <span className="cam-link" aria-hidden="true" />
            <AriaButton className="cam-shutter" aria-label={t.shutter} onPress={fire} isDisabled={shutterDisabled || refused} autoFocus>
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

/** The pointers down on the finder, by id. */
type Pointers = Map<number, { x: number; y: number }>;

function spread(pointers: Pointers): number {
  const [a, b] = [...pointers.values()];
  if (a === undefined || b === undefined) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A tap that moved further than this is a drag, not a focus tap. */
const TAP_SLOP_PX = 10;
/** How long the focus ring stays on the tapped point. */
const FOCUS_RING_MS = 900;

/**
 * Story 13.2 (CAP-2): torch, zoom and tap-to-focus on the session's track, each through
 * `applyConstraints`. A constraint the camera refuses leaves the state as it was. The torch
 * is set off when the session starts.
 */
function useCameraControls(track: MediaStreamTrack | null, capabilities: CameraCapabilities, video: RefObject<HTMLVideoElement | null>) {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const apply = useCallback(
    (constraints: Record<string, unknown>): Promise<void> => {
      if (track === null || typeof track.applyConstraints !== 'function') return Promise.reject(new Error('no track'));
      try {
        return track.applyConstraints({ advanced: [constraints as MediaTrackConstraintSet] });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('applyConstraints threw'));
      }
    },
    [track],
  );

  // Torch: off at the start of every session, whatever the camera kept from the last one.
  const [torch, setTorchState] = useState(false);
  useEffect(() => {
    if (capabilities.torch) void apply({ torch: false }).catch(() => undefined);
  }, [capabilities.torch, apply]);
  const setTorch = useCallback(
    (on: boolean) => {
      apply({ torch: on }).then(
        () => {
          if (live.current) setTorchState(on);
        },
        () => undefined,
      );
    },
    [apply],
  );

  // Zoom: one request in flight at a time; a pinch keeps only its latest wish.
  const range = capabilities.zoom;
  const initialZoom = useMemo(() => {
    if (range === null) return 1;
    const current = track !== null && typeof track.getSettings === 'function' ? (track.getSettings() as { zoom?: unknown }).zoom : undefined;
    return clampZoom(typeof current === 'number' ? current : range.min, range);
  }, [range, track]);
  const [zoom, setZoomState] = useState(initialZoom);
  const applied = useRef(initialZoom);
  const wanted = useRef(initialZoom);
  const busy = useRef(false);
  const pump = useCallback(() => {
    if (busy.current) return;
    const next = wanted.current;
    if (next === applied.current) return;
    busy.current = true;
    apply({ zoom: next })
      .then(
        () => {
          applied.current = next;
          if (live.current) setZoomState(next);
        },
        () => {
          // Refused: the camera stays where it was, and so does the wish.
          if (wanted.current === next) wanted.current = applied.current;
        },
      )
      .finally(() => {
        busy.current = false;
        pump();
      });
  }, [apply]);
  const zoomTo = useCallback(
    (value: number) => {
      if (range === null) return;
      wanted.current = clampZoom(value, range);
      pump();
    },
    [range, pump],
  );
  const zoomIn = useCallback(() => {
    if (range !== null) zoomTo(wanted.current + zoomIncrement(range));
  }, [range, zoomTo]);
  const zoomOut = useCallback(() => {
    if (range !== null) zoomTo(wanted.current - zoomIncrement(range));
  }, [range, zoomTo]);

  // Focus: a tap on the preview names the point; a brief ring marks it.
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(ringTimer.current), []);
  const focusAt = (element: HTMLElement, clientX: number, clientY: number) => {
    if (capabilities.focusMode === null) return;
    const box = element.getBoundingClientRect();
    const tap = { x: clientX - box.left, y: clientY - box.top };
    const frame = { width: video.current?.videoWidth ?? 0, height: video.current?.videoHeight ?? 0 };
    const point = framePoint(tap, { width: box.width, height: box.height }, frame);
    void apply({ pointsOfInterest: [point], focusMode: capabilities.focusMode }).catch(() => undefined);
    setFocusRing((ring) => ({ x: tap.x, y: tap.y, key: (ring?.key ?? 0) + 1 }));
    clearTimeout(ringTimer.current);
    ringTimer.current = setTimeout(() => {
      if (live.current) setFocusRing(null);
    }, FOCUS_RING_MS);
  };

  // Pointers on the finder: one that lifts where it went down is a focus tap; two pinch the zoom.
  const pointers = useRef<Pointers>(new Map());
  const pinch = useRef<{ spread: number; zoom: number } | null>(null);
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    tap.current = null;
    if (pointers.current.size === 2 && range !== null) pinch.current = { spread: spread(pointers.current), zoom: wanted.current };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const start = tap.current;
    if (start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) tap.current = null;
    const from = pinch.current;
    if (from !== null && from.spread > 0 && pointers.current.size >= 2) zoomTo(from.zoom * (spread(pointers.current) / from.spread));
  };
  const release = (event: ReactPointerEvent<HTMLElement>, lifted: boolean) => {
    const start = tap.current;
    if (lifted && start !== null && start.id === event.pointerId && pointers.current.size === 1) focusAt(event.currentTarget, event.clientX, event.clientY);
    pointers.current.delete(event.pointerId);
    tap.current = null;
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => release(event, true);
  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => release(event, false);

  return { torch, setTorch, zoom, zoomIn, zoomOut, focusRing, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
