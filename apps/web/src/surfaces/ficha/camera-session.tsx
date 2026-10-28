import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { LIST_FOCUS_WATCH_FRAMES, restoreFocus } from '../../input/focus-restore.ts';
import { copy } from '../../copy/pt-br.ts';
import { useCameraApp } from '../../input/use-camera-app.ts';
import { useCaptureRefused } from '../../state/storage-reading.ts';
import { useServerReachable } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { CameraView } from './camera-dialog.tsx';
import { useCameraPicker } from './camera-single-shot.tsx';
import { useCameraOpen, type CameraSession } from './camera-stream.ts';
import { usePhotoCapture, type CaptureTarget } from './use-photo-capture.ts';

/*
 * E13-A6: the camera session behind one opener (`camera-view.tsx` says what the camera does):
 * the burst's shots, their saves, "Concluir" and the close, and the focus back to the opener.
 */

export interface CameraOptions {
  /** Story 8.2: the first shutter tap is the only one, and the view closes once it is saved. */
  singleShot?: boolean;
  /** Story 9.1: the target of the `shot`-th shot of the burst (0-based); null when nothing is left to shoot. */
  shotTarget?: (shot: number) => CaptureTarget | null;
  /** Story 9.1: the hint line before the `shot`-th shot ("Próxima leitura: …"). */
  shotHint?: (shot: number) => string;
  /** Story 9.1: the closing button's word ("Concluir"); default "Concluir fotos". */
  doneLabel?: string;
  /** Review 2026-10-08 (CAPT-V1): a shot's frame was read and handed to the capture, with the target it saves under. */
  onShot?: (target: CaptureTarget) => void;
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

/** The host's `onShot` for a stored shot; a throw there never makes the stored shot a failure. */
function shotStored(onShot: CameraOptions['onShot'], target: CaptureTarget): void {
  try {
    onShot?.(target);
  } catch (error) {
    console.error('camera onShot failed', error);
  }
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
  // Story 17.2: the one read of "Câmera do aparelho"; every opener's press follows it.
  const cameraApp = useCameraApp();
  const [session, setSession] = useState<CameraSession | null>(null);
  const [denied, setDenied] = useState(false);
  const [burst, setBurst] = useState(0);
  // The session as the async callbacks see it (a state value in a closure can be stale).
  const sessionRef = useRef<CameraSession | null>(null);
  const mounted = useRef(true);
  // Frame grabs not yet resolved: "Concluir fotos" waits for them before stopping the stream.
  const grabs = useRef(new Set<Promise<void>>());
  // Review 2026-10-08 (FLD-V1): the last shot of the open burst could not be read or saved;
  // `.cam-hint` says so until the next shot saves.
  const [shotFailed, setShotFailed] = useState(false);
  // Review 2026-10-08 (DB-4): "Concluir" (or a single shot) is waiting for the saves.
  const [saving, setSaving] = useState(false);

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
      setShotFailed(false);
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
  // and takes the focus back whenever it was lost, until the rows have settled. E14-A7: or
  // until the focus was moved elsewhere on purpose (a point dialog opened from the same row
  // within the watch): that dialog's own restore is then left alone.
  const returnFocus = useCallback(() => {
    restoreFocus(
      () => {
        const target = opener.current;
        return target === null || document.querySelector('.camera-view') !== null ? null : target;
      },
      // DE-2: the opener may sit in the Sticky action bar, which the sheet's scroll padding
      // counts as covered; a plain focus scrolled the sheet by half a screen.
      { frames: LIST_FOCUS_WATCH_FRAMES, preventScroll: true, until: 'moved' },
    );
  }, [opener]);

  // The device's camera app (Story 17.2), or no camera API (or no camera): the system camera
  // behind a hidden file input, one shot.
  const picker = useCameraPicker({ capture, reachable, onStored: (stored) => shotStored(options.onShot, stored), setBurst, showToast, returnFocus });
  // Story 17.2: a burst with targets ("Ler visor") whose first target is gone (every cell read)
  // opens no camera app, as the viewfinder disables its shutter: the caller's hint says why, and
  // with no hint the no-target sentence does (fx17r, R11; never the save-failure toast). `target()`
  // already ran (it sets the burst's start), so `shotTarget(0)` reads this press.
  const pick = (context: CaptureTarget) => {
    if (cameraApp && shotTarget !== undefined && shotTarget(0) === null) {
      showToast(shotHint?.(0) ?? copy.photos.noTargetToast);
      return;
    }
    picker.pick(context);
  };
  const { open, opening } = useCameraOpen({ capture, target, sessionRef, mounted, startSession, setDenied, showToast, pick, cameraApp });

  /**
   * FLD-V1: whether a shot's failure (or success) is said by the open camera itself: true while
   * the view is open and not closing, so the toast stays for a closed or closing camera.
   */
  const cameraSays =
    (session: CameraSession | null) =>
    (outcome: 'saved' | 'failed'): boolean => {
      // Only the session the shot was taken in, while it is open and not closing.
      if (!mounted.current || session === null || sessionRef.current !== session || finishing.current === session) {
        // A failure the view did not say: its close says the failure, never "Fotos salvas".
        if (outcome === 'failed' && session !== null) unsaidFailures.current.add(session);
        return false;
      }
      setShotFailed(outcome === 'failed');
      return true;
    };

  /** One grab of the shutter: tracked until it resolves, then saved (or reported). */
  const grab = (frame: Promise<Blob | ImageBitmap>) => {
    const target = tapTarget.current ?? sessionRef.current?.target ?? null;
    tapTarget.current = null;
    const says = cameraSays(sessionRef.current);
    // The index this tap's target was taken at (`shutter` counted it just before).
    const shot = taken.current - 1;
    const done: Promise<void> = frame.then(
      (photo) => {
        if (target === null) {
          if (!(photo instanceof Blob)) photo.close();
          return;
        }
        shotGrabbed.current = true;
        const onShot = options.onShot;
        // CAPT-V1: the shot counts once it is stored, never at the hand-over.
        capture.shoot(photo, target, (outcome) => {
          if (outcome === 'saved') shotStored(onShot, target);
          return says(outcome);
        });
      },
      () => {
        setBurst((n) => Math.max(0, n - 1));
        // E9-Q7: no photo for this tap, so the next shutter retries its row (a later tap that
        // already moved on keeps its own row).
        if (taken.current === shot + 1) {
          taken.current = shot;
          setTakenCount(shot);
        }
        if (!says('failed')) showToast(copy.photos.failedToast);
      },
    );
    grabs.current.add(done);
    void done.finally(() => grabs.current.delete(done));
    // Story 8.2: a single shot closes the camera by itself once it is saved.
    if (single) finish();
  };

  /** The session "Concluir" (or a single shot) is closing, while its saves are awaited; null when none. */
  const finishing = useRef<CameraSession | null>(null);
  /** The sessions with a shot that failed while the view could not say it (closing or closed). */
  const unsaidFailures = useRef(new WeakSet<CameraSession>());

  const end = (ending: CameraSession | null) => {
    setSaving(false);
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
    const ending = sessionRef.current;
    if (ending === null || finishing.current === ending) return;
    finishing.current = ending;
    setSaving(true);
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
        if (finishing.current === ending) finishing.current = null;
        // Closed by its close button meanwhile, maybe reopened: only the session this started
        // closes; a newer one stays open with its own count.
        const current = sessionRef.current;
        if (current === ending) end(ending);
        if (current === ending || current === null) setBurst(0);
        // A shot of this session failed while it was closing: the failure is what is said.
        if (unsaidFailures.current.has(ending)) {
          showToast(copy.photos.failedToast);
          return;
        }
        if (!allSaved) return;
        if (!single) showToast(reachable ? copy.photos.doneToastOnline : copy.photos.doneToast);
        else if (shotGrabbed.current) showToast(reachable ? copy.photos.doneOneToastOnline : copy.photos.doneOneToast);
      });
  };

  const element = (
    <>
      {picker.input}
      {session === null ? null : (
        <CameraView
          stream={session.stream}
          caption={session.target.caption}
          count={burst}
          hint={shotHint === undefined ? null : shotHint(takenCount)}
          shutterDisabled={shotTarget !== undefined && shotTarget(takenCount) === null}
          refused={refused}
          failed={shotFailed}
          saving={saving}
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

  return { open, denied, burst, opening, element };
}
