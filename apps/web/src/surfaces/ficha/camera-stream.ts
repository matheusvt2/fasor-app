import { useRef, useState, type RefObject } from 'react';
import { copy } from '../../copy/pt-br.ts';
import { sessionCaptureRescue } from '../../files/capture-rescue.ts';
import type { CaptureTarget, PhotoCapture } from './use-photo-capture.ts';

/*
 * E13-A6: the camera's stream (`camera-view.tsx` says what the camera does): the constraints
 * every capture surface asks for, the helpers on the session's stream, and the opener's press
 * (`useCameraOpen`), which asks for the stream or hands the shot to the system picker.
 *
 * Story 17.2: on a phone or a tablet the device's camera app is the first path ("Câmera do
 * aparelho", on by default where the device has touch points): the press treats it as no live
 * camera, so the hidden `capture` input opens the camera app inside the press, one photo per
 * tap, and the viewfinder is the switch's off state and the desktop's path.
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

/** The basic constraints of `CAMERA_CONSTRAINTS` (without the PTZ request), repeated by every `applyConstraints`. */
export const BASIC_CONSTRAINTS: MediaTrackConstraints = { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } };

export interface CameraSession {
  stream: MediaStream;
  target: CaptureTarget;
}

/** A view's stream stop, deferred one task (see `CameraView`); a remount with the same stream cancels it. */
export const pendingStops = new WeakMap<MediaStream, ReturnType<typeof setTimeout>>();

/** The stream's video track, or null (a stand-in stream may have no `getVideoTracks`). */
export function videoTrackOf(stream: MediaStream): MediaStreamTrack | null {
  const tracks = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : stream.getTracks();
  return tracks[0] ?? null;
}

/** Story 13.1: what the camera actually gave this session (the size it streams at), once. */
export function logTrackSettings(stream: MediaStream): void {
  const track = videoTrackOf(stream);
  if (track === null || typeof track.getSettings !== 'function') return;
  console.info('camera track settings', track.getSettings());
}

export interface CameraOpenHost {
  capture: PhotoCapture;
  /** The opener's target, read at the press. */
  target: () => CaptureTarget;
  /** The session as the async callbacks see it. */
  sessionRef: RefObject<CameraSession | null>;
  mounted: RefObject<boolean>;
  startSession: (next: CameraSession | null) => void;
  setDenied: (denied: boolean) => void;
  showToast: (message: string) => void;
  /** The system picker takes the shot (only inside the press, where the browser counts the gesture). */
  pick: (context: CaptureTarget) => void;
  /** Story 17.2: "Câmera do aparelho" on this device (read once, in `useCamera`): the camera app takes the shot. */
  cameraApp: boolean;
}

/**
 * The opener's press: the held shot first (Story 13.6), then the device's camera app (Story
 * 17.2) or the stream, or the system picker when there is no camera. `opening` is true while
 * `getUserMedia` has not answered.
 */
export function useCameraOpen({ capture, target, sessionRef, mounted, startSession, setDenied, showToast, pick, cameraApp }: CameraOpenHost): { open: () => void; opening: boolean } {
  // A `getUserMedia` in flight: a second press waits for it instead of asking twice. F-26:
  // mirrored into state (`isOpening`) so the opener shows it; the ref stays the guard.
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);
  const setOpening = (value: boolean) => {
    opening.current = value;
    if (mounted.current) setIsOpening(value);
  };

  /**
   * Asks for the stream (the opening state is already on) and opens the view on it. Without a
   * camera the system picker takes the shot, but only inside the press (`inGesture`): after an
   * async step the browser would block the picker, so the press says it failed instead.
   */
  const startStream = (media: MediaDevices, context: CaptureTarget, inGesture: boolean) => {
    const noCamera = () => {
      if (inGesture) {
        pick(context);
      } else if (mounted.current) {
        showToast(copy.photos.failedToast);
      }
    };
    let request: Promise<MediaStream>;
    try {
      request = media.getUserMedia(CAMERA_CONSTRAINTS);
    } catch {
      // F-26: a camera API that throws at once (an old or broken one) is no camera: the
      // opening state ends and the system camera takes the shot, as with no API.
      setOpening(false);
      noCamera();
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
        noCamera();
      },
    );
  };

  const open = () => {
    if (!capture.ready || sessionRef.current !== null || opening.current) return;
    const context = target();
    setDenied(false);
    void capture.prepare();
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    // Story 17.2: with "Câmera do aparelho" on, the camera app is the path, exactly as with no
    // camera API: `getUserMedia` is never asked and the `capture` input opens inside the press.
    const live = !cameraApp && media !== undefined && typeof media.getUserMedia === 'function';
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
          startStream(media, context, false);
        },
        () => {
          setOpening(false);
          if (mounted.current) showToast(copy.photos.refusalToast);
        },
      );
      return;
    }
    if (!live) {
      // The device's camera app (Story 17.2) or no camera API: the system camera, one shot.
      // Clicked inside the press, so the browser still counts the user's gesture.
      pick(context);
      return;
    }
    setOpening(true);
    startStream(media, context, true);
  };

  return { open, opening: isOpening };
}
